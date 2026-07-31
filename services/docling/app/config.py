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

    @property
    def allowed_type_set(self) -> set[str]:
        return {item.strip() for item in self.allowed_types.split(",")}


settings = Settings()
