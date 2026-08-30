from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from app.models.schemas import ClipRange, JobStatus, MediaKind


@dataclass
class Job:
    """A muxing unit of work plus everything needed to serve or re-issue it."""

    source_url: str
    format_id: str
    kind: MediaKind
    audio_format: str
    filename: str
    mime_type: str

    # --- Tier 1 ---
    clip: ClipRange | None = None
    target_size_mb: int | None = None
    embed_metadata: bool = True
    # Source duration, needed for the fit-to-size bitrate calculation.
    duration: float | None = None

    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    status: JobStatus = JobStatus.PENDING
    progress: float = 0.0
    error: str | None = None
    path: Path | None = None
    size: int | None = None
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None

    def is_expired(self, ttl: int) -> bool:
        return (time.time() - self.created_at) > ttl

    def mark_running(self) -> None:
        self.status = JobStatus.RUNNING

    def mark_ready(self, path: Path) -> None:
        self.path = path
        self.size = path.stat().st_size
        self.progress = 1.0
        self.status = JobStatus.READY
        self.finished_at = time.time()

    def mark_failed(self, error: str) -> None:
        self.error = error
        self.status = JobStatus.FAILED
        self.finished_at = time.time()
