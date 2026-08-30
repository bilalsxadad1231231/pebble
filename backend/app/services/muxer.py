from __future__ import annotations

import asyncio
import shutil
from pathlib import Path
from typing import Any

from yt_dlp import YoutubeDL
from yt_dlp.utils import download_range_func

from app.config import get_settings
from app.models.job import Job
from app.models.schemas import MediaKind
from app.services import transcode
from app.utils.errors import MuxError

_semaphore: asyncio.Semaphore | None = None

# Progress is reported in weighted phases so the dial moves smoothly across a
# download that may be followed by a two-pass encode.
PHASE_DOWNLOAD_END = 0.50
PHASE_PASS1_END = 0.70


def _limiter() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(get_settings().max_concurrent_muxes)
    return _semaphore


def _format_selector(job: Job) -> str:
    if job.kind is MediaKind.AUDIO:
        return f"{job.format_id}/bestaudio/best"
    # Pair the chosen video-only stream with the best audio, falling back to a
    # progressive rendition if the platform has no separate audio track.
    return f"{job.format_id}+bestaudio/{job.format_id}/best"


def _ffmpeg_location() -> str | None:
    """yt-dlp wants a directory or an executable path, never a bare command name."""
    settings = get_settings()
    if Path(settings.ffmpeg_binary).is_absolute():
        return settings.ffmpeg_binary
    resolved = shutil.which(settings.ffmpeg_binary)
    return str(Path(resolved).parent) if resolved else None


def _audio_postprocessors(job: Job) -> list[dict[str, Any]]:
    """Extract audio, then tag it, then give it cover art.

    Order matters. The thumbnail convertor is not optional: YouTube serves webp,
    ID3v2 cannot carry webp, and EmbedThumbnail silently no-ops on one - which is
    exactly how everyone ships a tagged file with no artwork.
    """
    steps: list[dict[str, Any]] = [
        {
            "key": "FFmpegExtractAudio",
            "preferredcodec": job.audio_format,
            "preferredquality": "0",
        }
    ]
    if job.embed_metadata:
        steps.append({"key": "FFmpegMetadata", "add_metadata": True})
        steps.append({"key": "FFmpegThumbnailsConvertor", "format": "jpg"})
        steps.append({"key": "EmbedThumbnail", "already_have_thumbnail": False})
    return steps


def _build_opts(job: Job, workdir: Path) -> dict[str, Any]:
    settings = get_settings()
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": settings.ytdlp_socket_timeout,
        "format": _format_selector(job),
        "outtmpl": str(workdir / f"{job.id}.%(ext)s"),
        "retries": 3,
        "fragment_retries": 3,
        "concurrent_fragment_downloads": 4,
    }

    location = _ffmpeg_location()
    if location is not None:
        opts["ffmpeg_location"] = location

    if job.clip is not None:
        opts["download_ranges"] = download_range_func(None, [(job.clip.start, job.clip.end)])
        # Without this, ffmpeg cuts on the nearest keyframe and the boundary can
        # land seconds from where the user placed it.
        opts["force_keyframes_at_cuts"] = True

    if job.kind is MediaKind.AUDIO:
        opts["postprocessors"] = _audio_postprocessors(job)
        if job.embed_metadata:
            opts["writethumbnail"] = True
    else:
        opts["merge_output_format"] = "mp4"

    return opts


def _run_sync(job: Job, workdir: Path, loop: asyncio.AbstractEventLoop) -> Path:
    ceiling = PHASE_DOWNLOAD_END if job.target_size_mb else 0.98

    def hook(status: dict[str, Any]) -> None:
        if status.get("status") != "downloading":
            return
        total = status.get("total_bytes") or status.get("total_bytes_estimate")
        done = status.get("downloaded_bytes") or 0
        if total:
            # Cap below the phase end - the job is not complete until ffmpeg is.
            share = min(done / total, 1.0) * ceiling
            loop.call_soon_threadsafe(setattr, job, "progress", share)

    opts = _build_opts(job, workdir)
    opts["progress_hooks"] = [hook]

    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(job.source_url, download=True)
        resolved = ydl.prepare_filename(info)

    produced = Path(resolved)
    if not produced.exists():
        # Post-processing (merge, audio extraction, trimming) rewrote the extension.
        matches = sorted(
            p for p in workdir.glob(f"{job.id}.*") if p.suffix not in {".part", ".ytdl"}
        )
        if not matches:
            raise MuxError("ffmpeg produced no output file")
        produced = matches[0]

    return produced


def _output_duration(job: Job) -> float | None:
    """Fit-to-size budgets the *clip*, not the source, when both are requested."""
    if job.clip is not None:
        return job.clip.duration
    return job.duration


async def _apply_size_budget(job: Job, source: Path, workdir: Path) -> Path:
    duration = _output_duration(job)
    bitrate = transcode.plan(job.target_size_mb, duration)

    destination = workdir / f"{job.id}-fit.mp4"

    def on_progress(phase: str, fraction: float) -> None:
        if phase == "pass1":
            span, base = PHASE_PASS1_END - PHASE_DOWNLOAD_END, PHASE_DOWNLOAD_END
        else:
            span, base = 1.0 - PHASE_PASS1_END, PHASE_PASS1_END
        job.progress = min(base + fraction * span, 0.99)

    await transcode.to_size(
        source=source,
        destination=destination,
        video_bitrate=bitrate,
        duration=duration,
        workdir=workdir,
        on_progress=on_progress,
    )

    source.unlink(missing_ok=True)
    return destination


async def run_job(job: Job) -> Path:
    """Download, merge, and apply any Tier 1 processing into one seekable file."""
    settings = get_settings()
    workdir = settings.storage_path
    loop = asyncio.get_running_loop()

    async with _limiter():
        job.mark_running()
        try:
            produced = await asyncio.to_thread(_run_sync, job, workdir, loop)
        except MuxError:
            raise
        except Exception as exc:  # noqa: BLE001 - yt-dlp/ffmpeg surface is wide
            raise MuxError(str(exc)) from exc

    # The size budget runs outside the merge semaphore under its own tighter
    # limit, so a long encode does not block cheap stream-copy merges.
    if job.target_size_mb is not None:
        return await _apply_size_budget(job, produced, workdir)

    return produced
