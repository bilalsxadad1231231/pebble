from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.models.schemas import DeliveryMode, MediaKind
from app.services import delivery, extractor

PROGRESSIVE = {"vcodec": "avc1", "acodec": "mp4a", "ext": "mp4", "protocol": "https"}
VIDEO_ONLY = {"vcodec": "avc1", "acodec": "none", "ext": "mp4", "protocol": "https"}
AUDIO_ONLY = {"vcodec": "none", "acodec": "mp4a", "ext": "m4a", "protocol": "https"}
UNREPORTED = {"ext": "mp4", "protocol": "https"}  # generic/Instagram-style single file
HLS = {"vcodec": "avc1", "acodec": "mp4a", "ext": "mp4", "protocol": "m3u8_native"}


@pytest.mark.parametrize(
    ("fmt", "kind", "audio_format", "expected"),
    [
        (PROGRESSIVE, MediaKind.VIDEO, "m4a", DeliveryMode.DIRECT),
        (VIDEO_ONLY, MediaKind.VIDEO, "m4a", DeliveryMode.MUXED),
        (AUDIO_ONLY, MediaKind.AUDIO, "m4a", DeliveryMode.DIRECT),
        (AUDIO_ONLY, MediaKind.AUDIO, "mp3", DeliveryMode.MUXED),   # transcode
        (HLS, MediaKind.VIDEO, "m4a", DeliveryMode.MUXED),          # no byte ranges
        # Codecs unreported on a complete file is NOT the same as "no audio track".
        (UNREPORTED, MediaKind.VIDEO, "m4a", DeliveryMode.DIRECT),
    ],
)
def test_decide(fmt: dict[str, Any], kind: MediaKind, audio_format: str, expected: DeliveryMode) -> None:
    assert delivery.decide(fmt, kind, audio_format) is expected


def test_track_presence_distinguishes_absent_from_unreported() -> None:
    assert delivery.track_presence({"vcodec": "avc1"}, "vcodec") is True
    assert delivery.track_presence({"vcodec": "none"}, "vcodec") is False
    assert delivery.track_presence({}, "vcodec") is None


def test_single_file_source_without_codecs_is_listed_as_direct() -> None:
    """A generic-extractor result must not be advertised as needing a mux."""
    info = {"id": "x", "title": "clip", "url": "https://cdn.test/clip.mp4", "ext": "mp4"}

    options = extractor.to_format_options(info)

    assert len(options) == 1
    assert options[0].delivery is DeliveryMode.DIRECT


def test_resolve_and_prepare_never_disagree(client: TestClient, monkeypatch) -> None:
    """Regression: the picker promised `direct` while prepare started a mux job."""
    info = {
        "id": "x",
        "title": "clip",
        "extractor_key": "Generic",
        "url": "https://cdn.test/clip.mp4",
        "ext": "mp4",
    }

    async def fake_extract(url: str) -> dict[str, Any]:
        return info

    monkeypatch.setattr(extractor, "extract", fake_extract)

    listed = client.post("/api/v1/resolve", json={"url": "https://cdn.test/clip.mp4"}).json()

    for fmt in listed["formats"]:
        prepared = client.post(
            "/api/v1/prepare",
            json={"url": "https://cdn.test/clip.mp4", "format_id": fmt["id"], "kind": fmt["kind"]},
        ).json()
        assert prepared["ticket"]["delivery"] == fmt["delivery"], fmt["id"]
