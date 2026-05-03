from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3307
    mysql_user: str = "linkedin_user"
    mysql_password: str = "linkedin_pass"
    mysql_database: str = "linkedin_db"

    redis_url: str = "redis://127.0.0.1:6380"
    mongo_url: str = "mongodb://127.0.0.1:27017"
    mongo_db: str = "linkedin_sim"

    kafka_brokers: str = "localhost:29092"

    jwt_secret: str = "linkedin-sim-dev-secret"
    auth_token_ttl_hours: int = 24

    ai_service_url: str = "http://127.0.0.1:8001"

    @property
    def kafka_broker_list(self) -> list[str]:
        return [b.strip() for b in self.kafka_brokers.split(",") if b.strip()]


settings = Settings()
