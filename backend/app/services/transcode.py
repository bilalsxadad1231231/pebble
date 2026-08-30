from __future__ import annotations

import asyncio
import math
import os
import shutil
from pathlib import Path
from typing import Callable

from app.config import Settings, get_settings
from app.utils.errors import (
    DurationUnknownError,
    MuxError,
    SourceTooLongError,
    TargetTooSmallError,
)

ProgressFn = Callable[[float], None]

BYTES_PER_MB = 1_000_000  # 10^6, matching what a file manager shows the user

_semaphore: asyncio.Semaphore | None = None


def limiter() -> asyncio.Semaphore:
    """Transcodes are CPU-bound, so they get a tighter budget than merges."""
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(get_settings().max_concurrent_transcodes)
    return _semaphore


def _null_sink() -> str:
    return "NUL" if os.name == "nt" else "/dev/null"


def ffmpeg_binary() -> str:
    settings = get_settings()
    resolved = shutil.which(settings.ffmpeg_binary)
    return resolved or settings.ffmpeg_binary


# ------------------------------------------------------------------ planning


def video_bitrate_for(target_size_mb: int, duration: float, settings: Settings) -> int:
    """Bits per second of video that lands `duration` seconds under the budget.

    Pure arithmetic so the guard rails can be tested without touching ffmpeg.
    """
    budget_bits = target_size_mb * BYTES_PER_MB * 8 * settings.transcode_overhead_factor
    return int(budget_bits / duration) - settings.transcode_audio_bitrate


def minimum_size_mb(duration: float, settings: Settings) -> int:
    """Smallest budget that still clears the video-bitrate floor.

    Returned to the client so the UI can suggest a workable number instead of
    just refusing.
    """
    floor_bits = (settings.min_video_bitrate + settings.transcode_audio_bitrate) * duration
    return math.ceil(floor_bits / (8 * BYTES_PER_MB * settings.transcode_overhead_factor))


def plan(target_size_mb: int, duration: float | None) -> int:
    """Validate a size budget and return the video bitrate to encode at."""
    settings = get_settings()

    if not duration or duration <= 0:
        raise DurationUnknownError(
            "this source reports no duration, so a size budget cannot be calculated"
        )

    if duration > settings.max_transcode_seconds:
        limit = settings.max_transcode_seconds // 60
        raise SourceTooLongError(
            f"fit-to-size is limited to {limit} minutes of source; "
            "trim a clip first, then apply a size budget"
        )

    bitrate = video_bitrate_for(target_size_mb, duration, settings)
    if bitrate < settings.min_video_bitrate:
        smallest = minimum_size_mb(duration, settings)
        raise TargetTooSmallError(
            f"{target_size_mb} MB is too small for {round(duration)}s of video; "
            f"the smallest workable size is {smallest} MB"
        )

    return bitrate


# ------------------------------------------------------------------ encoding


async def _run_pass(args: list[str], duration: float, on_progress: ProgressFn | None) -> None:
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    assert proc.stdout is not None
    async for raw in proc.stdout:
        if on_progress is None:
            continue
        line = raw.decode("utf-8", "replace").strip()
        if line.startswith("out_time_us=") and duration > 0:
            value = line.split("=", 1)[1]
            if value.isdigit():
                on_progress(min(int(value) / 1_000_000 / duration, 1.0))

    stderr = await proc.stderr.read() if proc.stderr else b""
    if await proc.wait() != 0:
        tail = stderr.decode("utf-8", "replace").strip().splitlines()[-4:]
        raise MuxError("ffmpeg transcode failed: " + " / ".join(tail))


async def to_size(
    source: Path,
    destination: Path,
    video_bitrate: int,
    duration: float,
    workdir: Path,
    on_progress: Callable[[str, float], None] | None = None,
) -> Path:
    """Two-pass encode `source` into `destination` at the planned bitrate.

    Single-pass VBR overshoots a hard budget badly; two passes let x264 spend the
    bits where they matter and still land under the target.
    """
    settings = get_settings()
    binary = ffmpeg_binary()
    passlog = workdir / f"{destination.stem}-2pass"

    common = [
        binary, "-y", "-hide_banner", "-loglevel", "error",
        "-progress", "pipe:1", "-nostats",
        "-i", str(source),
        "-c:v", "libx264", "-b:v", str(video_bitrate),
        "-passlogfile", str(passlog),
    ]

    phase = (lambda name: (lambda p: on_progress(name, p))) if on_progress else (lambda _: None)

    async with limiter():
        await _run_pass(
            [*common, "-pass", "1", "-an", "-f", "mp4", _null_sink()],
            duration,
            phase("pass1"),
        )
        await _run_pass(
            [
                *common, "-pass", "2",
                "-c:a", "aac", "-b:a", str(settings.transcode_audio_bitrate),
                "-movflags", "+faststart",
                str(destination),
            ],
            duration,
            phase("pass2"),
        )

    for leftover in workdir.glob(f"{passlog.name}*"):
        leftover.unlink(missing_ok=True)

    if not destination.exists():
        raise MuxError("transcode produced no output file")

    return destination
