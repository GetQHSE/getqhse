import os
import tempfile
from pathlib import Path

from docling.document_converter import DocumentConverter
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from .config import settings

app = FastAPI(title="QHSE Document Extractor", version="0.1.0")
converter = DocumentConverter()


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


def convert_document(path: Path) -> str:
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
