import os
import subprocess
import tempfile
from pathlib import Path

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from .config import settings

app = FastAPI(title="QHSE Document Extractor", version="0.1.0")
pdf_options = PdfPipelineOptions()
pdf_options.do_ocr = False
converter = DocumentConverter(
    format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pdf_options)}
)


class ExtractedPage(BaseModel):
    page_number: int = Field(ge=1)
    text: str


class ExtractionResponse(BaseModel):
    text: str
    pages: list[ExtractedPage]
    metadata: dict[str, str]


@app.get("/health/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
def ready() -> dict[str, str]:
    return {"status": "ok", "converter": "ready"}


def extract_pdf_text(path: Path) -> str:
    text_result = subprocess.run(
        ["pdftotext", "-layout", str(path), "-"],
        capture_output=True,
        check=True,
        text=True,
        timeout=120,
    )
    text = text_result.stdout.strip()
    if len(text) >= 80:
        return text

    with tempfile.TemporaryDirectory() as image_directory:
        prefix = Path(image_directory) / "page"
        subprocess.run(
            ["pdftoppm", "-jpeg", "-r", "120", str(path), str(prefix)],
            capture_output=True,
            check=True,
            timeout=180,
        )
        pages = []
        for image in sorted(Path(image_directory).glob("page-*.jpg")):
            ocr = subprocess.run(
                ["tesseract", str(image), "stdout", "--psm", "3"],
                capture_output=True,
                check=True,
                text=True,
                timeout=120,
            )
            if ocr.stdout.strip():
                pages.append(ocr.stdout.strip())
        return "\n\n".join(pages)


def convert_document(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        return extract_pdf_text(path)
    result = converter.convert(path)
    return result.document.export_to_markdown()


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
        text = await run_in_threadpool(convert_document, Path(temporary_name))
    finally:
        Path(temporary_name).unlink(missing_ok=True)

    return ExtractionResponse(
        text=text,
        pages=[ExtractedPage(page_number=1, text=text)],
        metadata={
            "file_name": file.filename or "document",
            "content_type": file.content_type or "application/octet-stream",
            "correlation_id": x_correlation_id or "",
        },
    )
