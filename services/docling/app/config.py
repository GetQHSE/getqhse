from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DOCLING_", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 8000
    max_upload_bytes: int = 20 * 1024 * 1024
    allowed_types: str = (
        "application/pdf,"
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    # Tesseract language packs, as installed in the image. Docling's automatic engine selection
    # defers to whichever engine it picks and every one of those defaults to European languages
    # only, so Arabic sources were being OCR'd as if they were French.
    ocr_languages: str = "fra+ara"
    # Docling's converter holds model state that is not safe to drive from several threads at
    # once, and FastAPI's threadpool is happy to do exactly that. Conversions are serialized
    # unless an operator raises this deliberately after giving the container the memory for it.
    max_concurrent_conversions: int = 1
    # A PDF whose text layer decodes to nothing usable is re-converted with full-page OCR.
    # Turning this off restores the previous single-pass behaviour.
    repair_degenerate_text_layer: bool = True
    # Docling can infer section-header levels from PDF bookmarks, numbering and font size
    # rather than leaving every heading at level 1.
    infer_heading_hierarchy: bool = True
    # Small legal print at 200 dpi loses accents and digits; 300 is the usual floor for
    # Tesseract on body text.
    fallback_ocr_dpi: int = 300

    @property
    def allowed_type_set(self) -> set[str]:
        return {item.strip() for item in self.allowed_types.split(",")}

    @property
    def ocr_language_list(self) -> list[str]:
        return [item.strip() for item in self.ocr_languages.replace(",", "+").split("+") if item.strip()]


settings = Settings()
