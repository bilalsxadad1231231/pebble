from __future__ import annotations

import re

_MIME = {
    "mp4": "video/mp4",
    "m4v": "video/mp4",
    "webm": "video/webm",
    "mkv": "video/x-matroska",
    "mov": "video/quicktime",
    "m4a": "audio/mp4",
    "mp3": "audio/mpeg",
    "opus": "audio/opus",
    "ogg": "audio/ogg",
    "wav": "audio/wav",
}

_UNSAFE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def mime_for(ext: str) -> str:
    return _MIME.get(ext.lower().lstrip("."), "application/octet-stream")


def safe_filename(title: str, ext: str, max_length: int = 80) -> str:
    """A filesystem- and Content-Disposition-safe name derived from the title."""
    cleaned = _UNSAFE.sub("_", title).strip().strip(".") or "download"
    cleaned = re.sub(r"\s+", " ", cleaned)[:max_length].strip()
    return f"{cleaned}.{ext.lstrip('.')}"


def clip_suffix(start: float, end: float) -> str:
    """`[0-45 to 1-20]` - so two clips from one source never collide.

    Colons are illegal in Windows filenames and awkward in Content-Disposition,
    so M-SS is used rather than M:SS.
    """
    def stamp(seconds: float) -> str:
        total = int(seconds)
        return f"{total // 60}-{total % 60:02d}"

    return f"[{stamp(start)} to {stamp(end)}]"
