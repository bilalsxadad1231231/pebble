from __future__ import annotations

import asyncio
from typing import Any

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError, ExtractorError, UnsupportedError

from app.config import get_settings
from app.models.schemas import FormatOption, MediaInfo, MediaKind
from app.services import delivery as delivery_rules
from app.utils.errors import ExtractionError, FormatNotFoundError, UnsupportedUrlError

_BASE_OPTS: dict[str, Any] = {
    "quiet": True,
    "no_warnings": True,
    "noplaylist": True,
    "skip_download": True,
    "extract_flat": False,
}


def _ydl_opts() -> dict[str, Any]:
    settings = get_settings()
    return {**_BASE_OPTS, "socket_timeout": settings.ytdlp_socket_timeout}


def _extract_sync(url: str) -> dict[str, Any]:
    try:
        with YoutubeDL(_ydl_opts()) as ydl:
            info = ydl.extract_info(url, download=False)
    except UnsupportedError as exc:
        raise UnsupportedUrlError(str(exc)) from exc
    except (DownloadError, ExtractorError) as exc:
        message = str(exc)
        if "Unsupported URL" in message:
            raise UnsupportedUrlError(message) from exc
        raise ExtractionError(message) from exc
    except Exception as exc:  # noqa: BLE001 - yt-dlp raises a wide surface
        raise ExtractionError(str(exc)) from exc

    if info is None:
        raise ExtractionError("extractor returned no data")

    # A playlist/multi-post url (e.g. an Instagram carousel) - take the first item.
    if info.get("_type") == "playlist":
        entries = [entry for entry in (info.get("entries") or []) if entry]
        if not entries:
            raise ExtractionError("no downloadable entries at that url")
        info = entries[0]

    return info


async def extract(url: str) -> dict[str, Any]:
    """Resolve a post url to yt-dlp's info dict, off the event loop."""
    return await asyncio.to_thread(_extract_sync, url)


# ------------------------------------------------------------------ mapping


def _label(fmt: dict[str, Any], kind: MediaKind) -> str:
    if kind is MediaKind.AUDIO:
        abr = fmt.get("abr")
        return f"{round(abr)}kbps {fmt.get('ext', '')}".strip() if abr else fmt.get("ext", "audio")

    height = fmt.get("height")
    if not height:
        return fmt.get("format_note") or fmt.get("ext", "video")
    fps = fmt.get("fps")
    suffix = f"{round(fps)}" if fps and fps > 30 else ""
    return f"{height}p{suffix}"


def _filesize(fmt: dict[str, Any]) -> int | None:
    return fmt.get("filesize") or fmt.get("filesize_approx")


def to_format_options(info: dict[str, Any]) -> list[FormatOption]:
    """Flatten yt-dlp formats into the picker list the app renders.

    `delivery` is decided here and nowhere else: a stream that already carries
    both tracks is handed to the device as a plain CDN url, anything that needs
    ffmpeg becomes a server-side job.
    """
    options: list[FormatOption] = []

    for fmt in info.get("formats") or []:
        if fmt.get("format_id") is None or not fmt.get("url"):
            continue

        has_video = delivery_rules.track_presence(fmt, "vcodec")
        has_audio = delivery_rules.track_presence(fmt, "acodec")
        if has_video is False and has_audio is False:
            continue

        kind = MediaKind.AUDIO if has_video is False else MediaKind.VIDEO
        delivery = delivery_rules.decide(fmt, kind)

        options.append(
            FormatOption(
                id=str(fmt["format_id"]),
                kind=kind,
                ext=fmt.get("ext") or "mp4",
                label=_label(fmt, kind),
                width=fmt.get("width"),
                height=fmt.get("height"),
                fps=fmt.get("fps"),
                tbr=fmt.get("tbr"),
                abr=fmt.get("abr"),
                filesize=_filesize(fmt),
                delivery=delivery,
                has_audio=has_audio is not False,
                has_video=has_video is not False,
            )
        )

    if not options and info.get("url"):
        # Single-file extractors (many Instagram/Twitter posts) expose no format list.
        options.append(
            FormatOption(
                id=str(info.get("format_id") or "source"),
                kind=MediaKind.VIDEO,
                ext=info.get("ext") or "mp4",
                label=_label(info, MediaKind.VIDEO),
                width=info.get("width"),
                height=info.get("height"),
                fps=info.get("fps"),
                filesize=_filesize(info),
                delivery=delivery_rules.decide(info, MediaKind.VIDEO),
            )
        )

    options.sort(
        key=lambda o: (o.kind is MediaKind.AUDIO, -(o.height or 0), -(o.tbr or 0)),
    )
    return options


def to_media_info(url: str, info: dict[str, Any]) -> MediaInfo:
    extractor = info.get("extractor_key") or info.get("extractor") or "generic"
    return MediaInfo(
        source_url=url,
        extractor=extractor,
        platform=extractor.split(":")[0].lower(),
        id=str(info.get("id") or ""),
        title=info.get("title") or "untitled",
        duration=info.get("duration"),
        thumbnail=info.get("thumbnail"),
        uploader=info.get("uploader") or info.get("channel"),
        is_live=bool(info.get("is_live")),
    )


def find_format(info: dict[str, Any], format_id: str) -> dict[str, Any]:
    for fmt in info.get("formats") or []:
        if str(fmt.get("format_id")) == format_id:
            return fmt
    if str(info.get("format_id") or "source") == format_id and info.get("url"):
        return info
    raise FormatNotFoundError(f"format '{format_id}' is not available for this url")
