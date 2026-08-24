import os
import subprocess
import tempfile
from pathlib import Path

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from .config import settings
from .segmentation import ExtractedBlock, ExtractedPage, pages_from_blocks

app = FastAPI(title="QHSE Document Extractor", version="0.1.0")
pdf_options = PdfPipelineOptions()
pdf_options.do_ocr = True
pdf_options.do_table_structure = True
converter = DocumentConverter(
    format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pdf_options)}
)


class ExtractionResponse(BaseModel):
    text: str
    pages: list[ExtractedPage]
    blocks: list[ExtractedBlock]
    metadata: dict[str, str]


@app.get("/health/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
def ready() -> dict[str, str]:
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
                "200",
                str(path),
                str(image),
            ],
            capture_output=True,
            check=True,
            timeout=180,
        )
        result = subprocess.run(
            ["tesseract", f"{image}.png", "stdout", "-l", "fra+ara", "--psm", "3"],
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


def extract_pdf_fallback(
    path: Path,
) -> tuple[list[ExtractedPage], list[ExtractedBlock], str]:
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
    return pages, page_blocks(pages), "pdftotext+ocr" if used_ocr else "pdftotext"


def extract_with_docling(
    path: Path,
) -> tuple[list[ExtractedPage], list[ExtractedBlock], str]:
    result = converter.convert(path)
    blocks: list[ExtractedBlock] = []
    for item, _level in result.document.iterate_items():
        text = str(getattr(item, "text", "")).strip()
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
        label = getattr(item, "label", None)
        blocks.append(
            ExtractedBlock(
                block_type=str(getattr(label, "value", label) or "text"),
                text=text,
                page_number=page_number,
                bounding_box=coordinates,
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

    return pages, blocks or page_blocks(pages), "docling"


def convert_document(
    path: Path,
) -> tuple[list[ExtractedPage], list[ExtractedBlock], str]:
    try:
        return extract_with_docling(path)
    except Exception:
        if path.suffix.lower() != ".pdf":
            raise
        return extract_pdf_fallback(path)


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
        pages, blocks, provider = await run_in_threadpool(convert_document, Path(temporary_name))
    finally:
        Path(temporary_name).unlink(missing_ok=True)

    return ExtractionResponse(
        text="\n\n".join(page.text for page in pages),
        pages=pages,
        blocks=blocks,
        metadata={
            "file_name": file.filename or "document",
            "content_type": file.content_type or "application/octet-stream",
            "correlation_id": x_correlation_id or "",
            "provider": provider,
        },
    )
