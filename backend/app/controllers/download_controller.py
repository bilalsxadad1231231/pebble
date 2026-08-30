from __future__ import annotations

import asyncio
import time
from typing import Any

from app.config import get_settings
from app.models.job import Job
from app.models.schemas import (
    MIN_CLIP_SECONDS,
    ClipRange,
    DeliveryMode,
    DownloadTicket,
    JobResponse,
    JobStatus,
    MediaKind,
    PrepareRequest,
)
from app.services import delivery as delivery_rules
from app.services import extractor, muxer, transcode
from app.services.job_store import store
from app.utils import tokens
from app.utils.errors import (
    InvalidClipError,
    InvalidTokenError,
    JobNotFoundError,
    MuxError,
)
from app.utils.naming import clip_suffix, mime_for, safe_filename

# ------------------------------------------------------------------ helpers


def _output_ext(fmt: dict[str, Any], kind: MediaKind, audio_format: str, delivery: DeliveryMode) -> str:
    if kind is MediaKind.AUDIO:
        return audio_format if delivery is DeliveryMode.MUXED else (fmt.get("ext") or audio_format)
    return "mp4" if delivery is DeliveryMode.MUXED else (fmt.get("ext") or "mp4")


def _titled(title: str, clip: ClipRange | None) -> str:
    """Clip bounds ride in the title so two clips of one source never collide.

    Takes the *clamped* clip, never the requested one - otherwise a clip trimmed
    back to the source duration gets a filename claiming bounds it does not have.
    """
    if clip is None:
        return title
    return f"{title} {clip_suffix(clip.start, clip.end)}"


def _refresh_token(
    req: PrepareRequest,
    delivery: DeliveryMode,
    title: str,
    job_id: str | None = None,
) -> str:
    settings = get_settings()
    payload = {
        "u": str(req.url),
        "f": req.format_id,
        "k": req.kind.value,
        "a": req.audio_format,
        "d": delivery.value,
        "t": title,
        "m": req.embed_metadata,
    }
    # Without these a refresh would silently re-prepare a *different* file than
    # the one the user asked for.
    if req.clip is not None:
        payload["c"] = [req.clip.start, req.clip.end]
    if req.target_size_mb is not None:
        payload["z"] = req.target_size_mb
    if job_id is not None:
        payload["j"] = job_id
    return tokens.sign(payload, settings.secret_key, settings.refresh_token_ttl)


def _direct_headers(fmt: dict[str, Any], info: dict[str, Any]) -> dict[str, str]:
    """The headers the platform expects, minus anything the client must own itself."""
    raw = {**(info.get("http_headers") or {}), **(fmt.get("http_headers") or {})}
    return {
        key: str(value)
        for key, value in raw.items()
        # Range is set per-request by the downloader; Accept-Encoding must stay
        # unset so the CDN returns raw bytes and byte offsets line up on resume.
        if key.lower() not in {"range", "accept-encoding"}
    }


def _direct_ticket(
    fmt: dict[str, Any], req: PrepareRequest, title: str, info: dict[str, Any]
) -> DownloadTicket:
    settings = get_settings()
    ext = _output_ext(fmt, req.kind, req.audio_format, DeliveryMode.DIRECT)
    return DownloadTicket(
        delivery=DeliveryMode.DIRECT,
        download_url=fmt["url"],
        size=fmt.get("filesize") or fmt.get("filesize_approx"),
        mime_type=mime_for(ext),
        filename=safe_filename(title, ext),
        headers=_direct_headers(fmt, info),
        resumable=True,
        expires_at=int(time.time()) + settings.direct_url_ttl,
        refresh_token=_refresh_token(req, DeliveryMode.DIRECT, title),
    )


def _job_ticket(job: Job, refresh_token: str, content_stable: bool = True) -> DownloadTicket:
    settings = get_settings()
    base = settings.public_base_url.rstrip("/") + settings.api_prefix
    return DownloadTicket(
        job_id=job.id,
        delivery=DeliveryMode.MUXED,
        download_url=f"{base}/files/{job.id}",
        size=job.size,
        mime_type=job.mime_type,
        filename=job.filename,
        resumable=True,
        content_stable=content_stable,
        expires_at=int(job.created_at) + settings.job_ttl,
        refresh_token=refresh_token,
    )


def job_response(job: Job, req: PrepareRequest, title: str, content_stable: bool = True) -> JobResponse:
    ready = job.status is JobStatus.READY
    token = _refresh_token(req, DeliveryMode.MUXED, title, job_id=job.id)
    return JobResponse(
        job_id=job.id,
        status=job.status,
        progress=job.progress,
        error=job.error,
        ticket=_job_ticket(job, token, content_stable) if ready else None,
    )


# ------------------------------------------------------------------ actions


def _clamped_clip(req: PrepareRequest, duration: float | None) -> ClipRange | None:
    """Trim the out-point to the source length rather than rejecting the request.

    Live streams report no duration, so the check is simply skipped there.
    """
    if req.clip is None or not duration:
        return req.clip
    if req.clip.end <= duration:
        return req.clip
    if duration - req.clip.start < MIN_CLIP_SECONDS:
        raise InvalidClipError(
            f"clip starts at {req.clip.start:.1f}s but the source is only {duration:.1f}s long"
        )
    return ClipRange(start=req.clip.start, end=duration)


def _estimated_size(fmt: dict[str, Any], job: Job) -> int | None:
    """A hint for the UI before the job finishes - never a promise.

    Bitrate is not uniform across a video, so a clip's share of the total bytes
    is approximate. `ticket.size` is exact once the job reaches `ready`.
    """
    if job.target_size_mb is not None:
        return job.target_size_mb * transcode.BYTES_PER_MB

    source_bytes = fmt.get("filesize") or fmt.get("filesize_approx")
    if job.clip is None or not source_bytes or not job.duration:
        return source_bytes
    return int(source_bytes * (job.clip.duration / job.duration))


async def _spawn_mux(
    req: PrepareRequest,
    fmt: dict[str, Any],
    title: str,
    clip: ClipRange | None,
    duration: float | None,
) -> Job:
    ext = _output_ext(fmt, req.kind, req.audio_format, DeliveryMode.MUXED)
    job = Job(
        source_url=str(req.url),
        format_id=req.format_id,
        kind=req.kind,
        audio_format=req.audio_format,
        filename=safe_filename(title, ext),
        mime_type=mime_for(ext),
        clip=clip,
        target_size_mb=req.target_size_mb,
        embed_metadata=req.embed_metadata,
        duration=duration,
    )
    job.size = _estimated_size(fmt, job)
    await store.add(job)

    async def runner() -> None:
        try:
            path = await muxer.run_job(job)
            job.mark_ready(path)
        except asyncio.CancelledError:
            job.mark_failed("cancelled")
            raise
        except MuxError as exc:
            job.mark_failed(exc.detail or "mux failed")
        except Exception as exc:  # noqa: BLE001
            job.mark_failed(str(exc))

    await store.track(job.id, asyncio.create_task(runner()))
    return job


async def prepare(req: PrepareRequest, content_stable: bool = True) -> JobResponse:
    """Single entry point for both paths; the response shape never changes."""
    info = await extractor.extract(str(req.url))
    fmt = extractor.find_format(info, req.format_id)
    duration = info.get("duration")
    clip = _clamped_clip(req, duration)
    title = _titled(info.get("title") or "download", clip)

    delivery = delivery_rules.decide(
        fmt, req.kind, req.audio_format, processing=req.has_processing
    )
    if delivery is DeliveryMode.DIRECT:
        # CDN bytes are identical across re-resolves, so a paused transfer can
        # always range-resume onto a freshly issued url.
        return JobResponse(
            job_id=None,
            status=JobStatus.READY,
            progress=1.0,
            ticket=_direct_ticket(fmt, req, title, info),
        )

    if req.target_size_mb is not None:
        # Validate the budget before spawning anything, so an impossible target
        # is a synchronous 422 the UI can act on rather than a job that fails
        # minutes later.
        transcode.plan(req.target_size_mb, clip.duration if clip else duration)

    job = await _spawn_mux(req, fmt, title, clip, duration)
    settled = await store.wait(job.id, timeout=get_settings().prepare_timeout)
    return job_response(settled, req, title, content_stable)


async def refresh(refresh_token: str) -> JobResponse:
    """Re-issue a download url after the CDN link (or muxed artifact) expired.

    The client only ever persisted this token plus its byte offset, so the new
    url can be range-requested from exactly where the paused transfer stopped.
    """
    settings = get_settings()
    payload = tokens.verify(refresh_token, settings.secret_key)
    try:
        bounds = payload.get("c")
        req = PrepareRequest(
            url=payload["u"],
            format_id=payload["f"],
            kind=MediaKind(payload["k"]),
            audio_format=payload["a"],
            clip=ClipRange(start=bounds[0], end=bounds[1]) if bounds else None,
            target_size_mb=payload.get("z"),
            embed_metadata=payload.get("m", True),
        )
    except (KeyError, ValueError) as exc:
        raise InvalidTokenError("token payload is not a valid prepare request") from exc

    # A muxed artifact that is still on disk keeps its exact bytes - resume works.
    job_id = payload.get("j")
    if job_id:
        try:
            job = await store.get(job_id)
        except JobNotFoundError:
            job = None
        if job is not None and job.status is JobStatus.READY and job.path and job.path.exists():
            return job_response(job, req, payload.get("t") or job.filename)

    # Otherwise we must re-mux, and ffmpeg gives no byte-for-byte guarantee.
    return await prepare(req, content_stable=False)
