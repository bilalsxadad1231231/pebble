from __future__ import annotations

from typing import Any

from app.models.schemas import DeliveryMode, MediaKind

# Protocols with no addressable byte ranges - they must be remuxed server-side.
SEGMENTED_PROTOCOLS = {"m3u8", "m3u8_native", "http_dash_segments"}


def track_presence(fmt: dict[str, Any], key: str) -> bool | None:
    """Whether a track exists: True, False, or None when the extractor didn't say.

    Lightweight extractors (Instagram, Twitter, the generic one) often omit codec
    fields entirely for a single complete file, which is not the same as declaring
    the track absent.
    """
    value = fmt.get(key)
    if value is None:
        return None
    return value != "none"


def decide(
    fmt: dict[str, Any],
    kind: MediaKind,
    audio_format: str = "m4a",
    processing: bool = False,
) -> DeliveryMode:
    """The one hybrid rule: hand over a CDN url when we can, mux when we must.

    Both the format listing and the prepare endpoint call this, so the picker can
    never promise a delivery mode that prepare then contradicts.

    `processing` covers the Tier 1 options - a trimmed, size-budgeted or retagged
    file is a new file by definition, so it can never be a CDN handoff.
    """
    if processing:
        return DeliveryMode.MUXED

    if fmt.get("protocol") in SEGMENTED_PROTOCOLS:
        return DeliveryMode.MUXED

    has_video = track_presence(fmt, "vcodec")
    has_audio = track_presence(fmt, "acodec")

    if kind is MediaKind.AUDIO:
        # An existing audio stream is a straight handoff; a transcode is ffmpeg work.
        if has_audio is False:
            return DeliveryMode.MUXED
        if audio_format == "mp3" and fmt.get("ext") != "mp3":
            return DeliveryMode.MUXED
        return DeliveryMode.DIRECT

    if has_video is False:
        return DeliveryMode.MUXED
    if has_audio is False:
        # Video-only DASH: needs merging with a separate audio stream.
        return DeliveryMode.MUXED

    # Both tracks present, or codecs unreported for a single complete file.
    return DeliveryMode.DIRECT
