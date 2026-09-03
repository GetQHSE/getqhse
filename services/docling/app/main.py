import base64
import logging
import os
import subprocess
import tempfile
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    HeadingHierarchyOptions,
    OcrMode,
    PdfPipelineOptions,
    TesseractCliOcrOptions,
)
from docling.document_converter import DocumentConverter, PdfFormatOption
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from .config import settings
from .quality import assess_text_layer, prefers_replacement
from .segmentation import (
    ExtractedBlock,
    ExtractedPage,
    block_label,
    block_level,
    block_text,
    pages_from_blocks,
)

logger = logging.getLogger("docling.extractor")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    try:
        await run_in_threadpool(warm_converter)
    except Exception:
        # Readiness reports the failure; crashing the process would only restart the download.
        logger.exception("converter warm-up failed")
    yield


app = FastAPI(title="QHSE Document Extractor", version="0.1.0", lifespan=lifespan)


def build_pdf_options(ocr_mode: OcrMode) -> PdfPipelineOptions:
    """Pipeline options for one conversion pass.

    Two settings matter more than the rest here. The OCR engine is named explicitly because
    Docling's automatic selection defers to whichever engine it finds and every one of those
    defaults to European languages -- Arabic sources were being recognized as French. And
    heading hierarchy is switched on because the layout model otherwise leaves every heading at
    level 1, which is the nesting that downstream segmentation then has to guess at from the
    wording of the heading alone.
    """
    options = PdfPipelineOptions()
    options.do_ocr = True
    options.do_table_structure = True
    options.ocr_options = TesseractCliOcrOptions(
        lang=settings.ocr_language_list, mode=ocr_mode
    )
    if settings.infer_heading_hierarchy:
        # Font-size inference is switched off deliberately. Measured against a real Bulletin
        # officiel law it buckets headings by typography rather than structure -- "Chapitre
        # premier" and "Article 2" both come back at level 1, and a cover page's larger type
        # outranks the body that follows it. Bookmarks and outline numbering are the signals
        # worth having, and dropping style also drops the parsed-page retention it requires,
        # which the option's own documentation warns increases memory use.
        options.heading_hierarchy_options = HeadingHierarchyOptions(
            enabled=True, use_style=False
        )
    return options


def build_converter(ocr_mode: OcrMode) -> DocumentConverter:
    return DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=build_pdf_options(ocr_mode))
        }
    )


converter = build_converter(OcrMode.DEFAULT)
# Built lazily: a second converter doubles nothing but the pipeline wiring -- the models are
# shared -- yet most documents never need the forced pass at all.
_full_page_converter: DocumentConverter | None = None
_full_page_converter_lock = threading.Lock()
# Docling's converter carries model state that is not safe to drive concurrently, and FastAPI's
# threadpool will happily do so. Conversions past this limit queue instead of interleaving.
_conversion_slots = threading.BoundedSemaphore(max(1, settings.max_concurrent_conversions))


def full_page_converter() -> DocumentConverter:
    global _full_page_converter
    with _full_page_converter_lock:
        if _full_page_converter is None:
            _full_page_converter = build_converter(OcrMode.FULL_PAGE)
        return _full_page_converter


class ExtractionResponse(BaseModel):
    text: str
    pages: list[ExtractedPage]
    blocks: list[ExtractedBlock]
    metadata: dict[str, str]


@app.get("/health/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


# A one-page PDF reading "Article premier", small enough to live in the source and real enough
# to make Docling load its layout, table and OCR models. Converting it once at startup is what
# turns "ready" into a claim the container can actually honour.
_WARMUP_PDF = base64.b64decode(
    "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoK"
    "PDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUg"
    "L1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMTIwXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8"
    "IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQg"
    "L1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGgg"
    "NDUgPj4Kc3RyZWFtCkJUIC9GMSAxMiBUZiAyMCA2MCBUZCAoQXJ0aWNsZSBwcmVtaWVyKSBUaiBFVAplbmRzdHJl"
    "YW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAw"
    "MDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzExIDAw"
    "MDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDA2CiUlRU9GCg=="
)


# Models are downloaded on first use, so a container that answers /health/ready before it has
# ever converted anything reports itself ready while the first real document is still waiting
# on a HuggingFace download -- and times out, or falls back to flat text, if that download is
# slow or blocked. One tiny conversion at startup moves that cost off the first request.
_warm_lock = threading.Lock()
_warmed = False


def warm_converter() -> None:
    global _warmed
    with _warm_lock:
        if _warmed:
            return
        descriptor, name = tempfile.mkstemp(suffix=".pdf")
        try:
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(_WARMUP_PDF)
            # The warm-up is a conversion like any other and takes its turn with the rest, so a
            # readiness probe arriving mid-document cannot drive the converter alongside it.
            with _conversion_slots:
                extract_with_docling(Path(name), converter)
        finally:
            Path(name).unlink(missing_ok=True)
        _warmed = True


@app.get("/health/ready")
def ready() -> dict[str, str]:
    try:
        warm_converter()
    except Exception as error:
        raise HTTPException(
            status_code=503, detail=f"Converter is not ready: {error}"
        ) from error
    return {"status": "ok", "converter": "ready"}


def pdf_page_count(path: Path) -> int:
    result = subprocess.run(
        ["pdfinfo", str(path)], capture_output=True, check=True, text=True, timeout=30
    )
    for line in result.stdout.splitlines():
        if line.lower().startswith("pages:"):
            return int(line.split(":", 1)[1].strip())
    return 1


def ocr_pdf_page(path: Path, page_number: int) -> str:
    with tempfile.TemporaryDirectory() as image_directory:
        image = Path(image_directory) / "page"
        subprocess.run(
            [
                "pdftoppm",
                "-f",
                str(page_number),
                "-l",
                str(page_number),
                "-singlefile",
                "-png",
                "-r",
                str(settings.fallback_ocr_dpi),
                str(path),
                str(image),
            ],
            capture_output=True,
            check=True,
            timeout=180,
        )
        result = subprocess.run(
            [
                "tesseract",
                f"{image}.png",
                "stdout",
                "-l",
                "+".join(settings.ocr_language_list),
                "--psm",
                "3",
            ],
            capture_output=True,
            check=True,
            text=True,
            timeout=180,
        )
        return result.stdout.strip()


def page_blocks(pages: list[ExtractedPage]) -> list[ExtractedBlock]:
    return [
        ExtractedBlock(block_type="paragraph", text=paragraph, page_number=page.page_number)
        for page in pages
        for paragraph in page.text.split("\n\n")
        if paragraph.strip()
    ]


class ConversionOutcome(BaseModel):
    pages: list[ExtractedPage]
    blocks: list[ExtractedBlock]
    provider: str
    metadata: dict[str, str] = {}

    @property
    def text(self) -> str:
        return "\n\n".join(page.text for page in self.pages)


def extract_pdf_fallback(path: Path) -> ConversionOutcome:
    pages: list[ExtractedPage] = []
    used_ocr = False
    for page_number in range(1, pdf_page_count(path) + 1):
        result = subprocess.run(
            [
                "pdftotext",
                "-layout",
                "-f",
                str(page_number),
                "-l",
                str(page_number),
                str(path),
                "-",
            ],
            capture_output=True,
            check=True,
            text=True,
            timeout=120,
        )
        text = result.stdout.strip()
        if len(text) < 80:
            ocr_text = ocr_pdf_page(path, page_number)
            if ocr_text:
                text = ocr_text
                used_ocr = True
        pages.append(ExtractedPage(page_number=page_number, text=text))
    return ConversionOutcome(
        pages=pages,
        blocks=page_blocks(pages),
        provider="pdftotext+ocr" if used_ocr else "pdftotext",
    )


def conversion_metadata(result) -> dict[str, str]:
    """Carries Docling's own verdict on the conversion out to the caller.

    Docling reports a status -- a PARTIAL_SUCCESS still returns a document -- and a per-page
    confidence report graded from its parse, layout, table and OCR stages. Both were being
    discarded, which left a badly converted document indistinguishable from a clean one until
    somebody read the provisions.
    """
    metadata = {"conversion_status": str(getattr(result.status, "value", result.status))}
    confidence = getattr(result, "confidence", None)
    if confidence is None:
        return metadata
    for name in ("mean_grade", "low_grade"):
        grade = getattr(confidence, name, None)
        if grade is not None:
            metadata[f"confidence_{name}"] = str(getattr(grade, "value", grade))
    for name in ("mean_score", "low_score"):
        score = getattr(confidence, name, None)
        if score is not None and score == score:  # NaN compares unequal to itself
            metadata[f"confidence_{name}"] = f"{float(score):.4f}"
    return metadata


def extract_with_docling(path: Path, document_converter: DocumentConverter) -> ConversionOutcome:
    result = document_converter.convert(path)
    blocks: list[ExtractedBlock] = []
    for item, _tree_depth in result.document.iterate_items():
        text = block_text(item, result.document)
        if not text:
            continue
        provenance = getattr(item, "prov", None) or []
        first = provenance[0] if provenance else None
        page_number = int(getattr(first, "page_no", 1))
        bbox = getattr(first, "bbox", None)
        coordinates = None
        if bbox is not None:
            coordinates = [
                float(getattr(bbox, name, 0)) for name in ("l", "t", "r", "b")
            ]
        blocks.append(
            ExtractedBlock(
                block_type=block_label(item),
                text=text,
                page_number=page_number,
                bounding_box=coordinates,
                heading_level=block_level(item),
            )
        )

    pages = pages_from_blocks(blocks)
    if not pages:
        page_numbers = sorted(int(number) for number in result.document.pages.keys())
        for page_number in page_numbers:
            try:
                text = result.document.export_to_text(page_no=page_number).strip()
            except (AttributeError, TypeError):
                text = ""
            pages.append(ExtractedPage(page_number=page_number, text=text))
        if not pages or not any(page.text for page in pages):
            text = result.document.export_to_text().strip()
            pages = [ExtractedPage(page_number=1, text=text)]

    return ConversionOutcome(
        pages=pages,
        blocks=blocks or page_blocks(pages),
        provider="docling",
        metadata=conversion_metadata(result),
    )


def repair_degenerate_text_layer(path: Path, outcome: ConversionOutcome) -> ConversionOutcome:
    """Re-converts with full-page OCR when the PDF's own text layer decoded to nothing usable.

    Docling's default OCR mode is PDF-aware: it skips any region that already holds text cells.
    That is the right default, and it is exactly why a PDF with a broken text layer is never
    OCR'd -- the cells are there, they simply decode to garbage. Forcing a full-page pass is
    the only way through, and it is expensive, so it runs only once the text has actually been
    measured and found unusable.
    """
    report = assess_text_layer(outcome.text)
    metadata = {**outcome.metadata, **report.as_metadata()}
    if not report.degenerate or not settings.repair_degenerate_text_layer:
        return outcome.model_copy(update={"metadata": metadata})

    logger.warning(
        "text layer unusable (%s); re-converting with full-page OCR", report.reason
    )
    try:
        repaired = extract_with_docling(path, full_page_converter())
    except Exception:
        logger.exception("full-page OCR pass failed; keeping the original conversion")
        return outcome.model_copy(
            update={"metadata": {**metadata, "text_layer_repair": "failed"}}
        )

    repaired_report = assess_text_layer(repaired.text)
    if not prefers_replacement(report, repaired_report):
        return outcome.model_copy(
            update={"metadata": {**metadata, "text_layer_repair": "rejected"}}
        )
    return repaired.model_copy(
        update={
            "provider": "docling+full_page_ocr",
            "metadata": {
                **repaired.metadata,
                **repaired_report.as_metadata(),
                "text_layer_repair": "applied",
                "text_layer_reason_before_repair": report.reason,
            },
        }
    )


def convert_document(path: Path) -> ConversionOutcome:
    with _conversion_slots:
        try:
            outcome = extract_with_docling(path, converter)
        except Exception:
            if path.suffix.lower() != ".pdf":
                raise
            logger.exception("docling conversion failed; falling back to flat text extraction")
            return extract_pdf_fallback(path)
        if path.suffix.lower() != ".pdf":
            return outcome
        return repair_degenerate_text_layer(path, outcome)


@app.post("/v1/extract", response_model=ExtractionResponse)
async def extract(
    file: UploadFile = File(...),
    x_correlation_id: str | None = Header(default=None),
) -> ExtractionResponse:
    if file.content_type not in settings.allowed_type_set:
        raise HTTPException(status_code=415, detail="Unsupported document type")

    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Document exceeds configured size limit")

    suffix = Path(file.filename or "document").suffix
    descriptor, temporary_name = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(descriptor, "wb") as temporary_file:
            temporary_file.write(content)
        outcome = await run_in_threadpool(convert_document, Path(temporary_name))
    finally:
        Path(temporary_name).unlink(missing_ok=True)

    return ExtractionResponse(
        text=outcome.text,
        pages=outcome.pages,
        blocks=outcome.blocks,
        metadata={
            **outcome.metadata,
            "file_name": file.filename or "document",
            "content_type": file.content_type or "application/octet-stream",
            "correlation_id": x_correlation_id or "",
            "provider": outcome.provider,
        },
    )
