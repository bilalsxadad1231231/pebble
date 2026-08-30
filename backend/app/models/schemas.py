from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator


# A sub-second clip is a UI bug, not a request anyone means to make.
MIN_CLIP_SECONDS = 1.0


class DeliveryMode(str, Enum):
    """How the client will end up with bytes."""

    DIRECT = "direct"  # stream straight from the platform CDN
    MUXED = "muxed"    # we download + ffmpeg-merge, then serve it ourselves


class MediaKind(str, Enum):
    VIDEO = "video"
    AUDIO = "audio"


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    READY = "ready"
    FAILED = "failed"
    EXPIRED = "expired"


# ---------------------------------------------------------------- requests


class ResolveRequest(BaseModel):
    url: HttpUrl


class ClipRange(BaseModel):
    """An in/out point, in float seconds from the start of the source."""

    start: float = Field(..., ge=0)
    end: float = Field(..., gt=0)

    @model_validator(mode="after")
    def _check_span(self) -> "ClipRange":
        if self.end <= self.start:
            raise ValueError("clip end must be greater than start")
        if self.end - self.start < MIN_CLIP_SECONDS:
            raise ValueError(f"clip must be at least {MIN_CLIP_SECONDS}s long")
        return self

    @property
    def duration(self) -> float:
        return self.end - self.start


class PrepareRequest(BaseModel):
    url: HttpUrl
    format_id: str = Field(..., description="`id` from a ResolveResponse format entry")
    kind: MediaKind = MediaKind.VIDEO
    audio_format: Literal["m4a", "mp3"] = "m4a"

    # --- Tier 1 options. Any of these forces server-side delivery. ---
    clip: ClipRange | None = None
    target_size_mb: int | None = Field(default=None, gt=0)
    # Tag + cover-art embedding. Defaults on for audio, meaningless for video.
    embed_metadata: bool = True

    @property
    def has_processing(self) -> bool:
        """True when we must produce a new file rather than hand over a CDN url."""
        if self.clip is not None or self.target_size_mb is not None:
            return True
        return self.kind is MediaKind.AUDIO and self.embed_metadata


class RefreshRequest(BaseModel):
    refresh_token: str


# ---------------------------------------------------------------- responses


class FormatOption(BaseModel):
    id: str
    kind: MediaKind
    ext: str
    label: str                      # human string for the picker, e.g. "1080p60"
    width: int | None = None
    height: int | None = None
    fps: float | None = None
    tbr: float | None = None        # total bitrate, kbps
    abr: float | None = None        # audio bitrate, kbps
    filesize: int | None = None     # exact or estimated bytes
    delivery: DeliveryMode
    # True when the platform serves a single progressive file we can hand over as-is.
    has_audio: bool = True
    has_video: bool = True


class MediaInfo(BaseModel):
    source_url: HttpUrl
    extractor: str
    platform: str
    id: str
    title: str
    duration: float | None = None
    thumbnail: str | None = None
    uploader: str | None = None
    is_live: bool = False


class ResolveResponse(BaseModel):
    media: MediaInfo
    formats: list[FormatOption]


class DownloadTicket(BaseModel):
    """The single shape the app consumes, whatever path produced it."""

    job_id: str | None = None
    delivery: DeliveryMode
    download_url: str
    size: int | None = None
    mime_type: str
    filename: str
    # Headers the client MUST replay on every request (including range resumes).
    # Most CDNs 403 a bare GET without the extractor's User-Agent/Referer/Cookie.
    headers: dict[str, str] = Field(default_factory=dict)
    resumable: bool = True
    # False means the bytes behind this url are NOT the ones a paused transfer
    # already has, so the client must discard its partial file and start over.
    content_stable: bool = True
    expires_at: int          # unix seconds
    refresh_token: str


class JobResponse(BaseModel):
    # None on the direct path - there is no server-side work to track.
    job_id: str | None = None
    status: JobStatus
    progress: float = 0.0
    error: str | None = None
    ticket: DownloadTicket | None = None


class PlatformInfo(BaseModel):
    name: str
    extractor: str
    supports_audio_only: bool = True
    notes: str | None = None


class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None
