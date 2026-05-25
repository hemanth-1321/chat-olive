from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://ollive:ollive@localhost:5432/ollive"
    redis_url: str = "redis://localhost:6379"
    groq_api_key: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
