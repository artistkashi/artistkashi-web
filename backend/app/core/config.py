import json
from typing import Literal

from pydantic import computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ==================== APPLICATION ====================

    APP_NAME: str = "ArtistKashi"
    APP_DESCRIPTION: str = "Cinematic luxury LMS + commerce backend"
    APP_VERSION: str = "0.1.0"

    ENVIRONMENT: Literal[
        "development",
        "staging",
        "production",
    ] = "development"

    DEBUG: bool = True

    API_V1_PREFIX: str = "/api"

    FRONTEND_URL: str = "http://localhost:3000"

    # ==================== SECURITY ====================

    ACCESS_SECRET_KEY: str
    REFRESH_SECRET_KEY: str
    RESET_PASSWORD_SECRET_KEY: str
    VERIFICATION_SECRET_KEY: str

    ALGORITHM: str = "HS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ==================== DATABASE ====================

    DATABASE_URL: str
    TEST_DATABASE_URL: str | None = None

    EXPIRE_ON_COMMIT: bool = False

    # ==================== REDIS ====================

    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str | None = None

    @computed_field
    @property
    def REDIS_URL(self) -> str:
        if self.REDIS_PASSWORD:
            return (
                f"redis://:{self.REDIS_PASSWORD}"
                f"@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
            )

        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    ENABLE_REDIS: bool = False
    ENABLE_QUEUE: bool = False
    # ==================== EMAIL ====================

    MAIL_USERNAME: str | None = None
    MAIL_PASSWORD: str | None = None
    MAIL_FROM: str | None = None
    MAIL_SERVER: str | None = None
    MAIL_PORT: int | None = None

    MAIL_FROM_NAME: str = "ArtistKashi"

    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False

    USE_CREDENTIALS: bool = True
    VALIDATE_CERTS: bool = True

    TEMPLATE_DIR: str = "templates"

    # ==================== ADMIN BOOTSTRAP ====================

    ADMIN_EMAIL: str | None = None
    ADMIN_PASSWORD: str | None = None
    ADMIN_FULL_NAME: str | None = None
    ADMIN_UPDATE_PASSWORD: bool = False

    # ==================== OPENAPI ====================

    ENABLE_DOCS: bool = True

    OPENAPI_URL: str | None = "/openapi.json"

    OPENAPI_OUTPUT_FILE: str | None = None

    # ==================== CORS ====================

    CORS_ORIGINS: set[str]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, value: object) -> set[str]:
        if isinstance(value, str) and not value.startswith("["):
            return {item.strip() for item in value.split(",") if item.strip()}

        if isinstance(value, str):
            return set(json.loads(value))

        if isinstance(value, list):
            return set(value)

        raise ValueError("Invalid CORS_ORIGINS value")

    # ==================== EXTERNAL ====================

    S3_ENDPOINT_URL: str
    S3_ACCESS_KEY: str
    S3_SECRET_KEY: str
    S3_BUCKET_NAME: str
    S3_REGION: str = "us-east-1"
    S3_USE_SSL: bool = False
    S3_PUBLIC_URL: str

    S3_FOLDER_PRODUCTS: str = "products"
    S3_FOLDER_PAINTINGS: str = "paintings"
    S3_FOLDER_COURSES: str = "courses"
    S3_FOLDER_AVATARS: str = "avatars"

    RAZORPAY_KEY_ID: str | None = None
    RAZORPAY_KEY_SECRET: str | None = None

    # ==================== TRANSCODING ====================

    FFMPEG_PATH: str = "ffmpeg"
    FFPROBE_PATH: str = "ffprobe"

    # ==================== UPLOAD ====================

    MAX_UPLOAD_SIZE_MB: int = 100

    # ==================== GOOGLE OAUTH ====================

    GOOGLE_CLIENT_ID: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
