from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="VAD_", extra="ignore")

    app_name: str = "video-audio-downloader-api"
    api_prefix: str = "/api/v1"
    debug: bool = False

    # Public base URL used to build absolute download links handed to the app.
    public_base_url: str = "http://127.0.0.1:8000"

    # Secret used to sign refresh tokens. MUST be overridden in production.
    secret_key: str = "dev-insecure-change-me"

    # Where muxed artifacts live.
    storage_dir: Path = Path("storage")

    # Lifetimes (seconds)
    direct_url_ttl: int = 60 * 30       # how long we claim a CDN url stays valid
    refresh_token_ttl: int = 60 * 60 * 24 * 7
    job_ttl: int = 60 * 60 * 6          # keep muxed files this long
    prepare_timeout: int = 60           # v1: block on mux, then fail over to polling

    # Extraction
    ytdlp_socket_timeout: int = 15
    max_concurrent_muxes: int = 2

    ffmpeg_binary: str = "ffmpeg"

    # --- Tier 1: clip trimming + fit-to-size ---
    # Two-pass encoding a long source on a small VPS is hours of CPU; long
    # sources must be trimmed first.
    max_transcode_seconds: int = 1200
    # Transcodes are far heavier than stream-copy merges, so they get their own
    # tighter budget rather than sharing the merge semaphore.
    max_concurrent_transcodes: int = 1
    transcode_audio_bitrate: int = 128_000
    # Below this, H.264 at any usable resolution is unwatchable - refusing with
    # a number the user can act on beats shipping a file they delete on sight.
    min_video_bitrate: int = 200_000
    # Container and muxing slack, so the result lands under the stated budget.
    transcode_overhead_factor: float = 0.95

    @property
    def storage_path(self) -> Path:
        p = self.storage_dir if self.storage_dir.is_absolute() else Path.cwd() / self.storage_dir
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache
def get_settings() -> Settings:
    return Settings()
