from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.models.job import Job
from app.services import extractor, muxer

SOURCE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

FAKE_INFO: dict[str, Any] = {
    "http_headers": {"User-Agent": "yt-dlp/test", "Accept-Encoding": "gzip"},
    "id": "dQw4w9WgXcQ",
    "title": 'Rick Astley - Never Gonna Give You Up <official>',
    "extractor_key": "Youtube",
    "duration": 213.0,
    "thumbnail": "https://cdn.test/thumb.jpg",
    "uploader": "Rick Astley",
    "formats": [
        {
            "format_id": "18",
            "url": "https://cdn.test/progressive.mp4?exp=1",
            "ext": "mp4",
            "vcodec": "avc1.42001E",
            "acodec": "mp4a.40.2",
            "height": 360,
            "fps": 30,
            "filesize": 5_000_000,
            "protocol": "https",
            "http_headers": {"Referer": "https://www.youtube.com/"},
        },
        {
            "format_id": "137",
            "url": "https://cdn.test/video-only.mp4?exp=1",
            "ext": "mp4",
            "vcodec": "avc1.640028",
            "acodec": "none",
            "height": 1080,
            "fps": 60,
            "filesize": 40_000_000,
            "protocol": "https",
        },
        {
            "format_id": "140",
            "url": "https://cdn.test/audio.m4a?exp=1",
            "ext": "m4a",
            "vcodec": "none",
            "acodec": "mp4a.40.2",
            "abr": 128.0,
            "filesize": 3_000_000,
            "protocol": "https",
        },
        {
            "format_id": "hls-720",
            "url": "https://cdn.test/stream.m3u8",
            "ext": "mp4",
            "vcodec": "avc1.4d401f",
            "acodec": "mp4a.40.2",
            "height": 720,
            "protocol": "m3u8_native",
        },
    ],
}


@pytest.fixture(autouse=True)
def fake_extractor(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_extract(url: str) -> dict[str, Any]:
        return FAKE_INFO

    monkeypatch.setattr(extractor, "extract", fake_extract)


@pytest.fixture(autouse=True)
def fake_mux(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    """Stand in for yt-dlp + ffmpeg, producing a real file on disk.

    Autouse on purpose: `muxer.run_job` drives yt-dlp with the source url and
    never touches the mocked extractor, so without this a test that triggers a
    mux would download from the live internet.
    """

    async def fake_run_job(job: Job) -> Path:
        path = tmp_path / f"{job.id}.mp4"
        path.write_bytes(b"MUXED" * 2000)
        return path

    monkeypatch.setattr(muxer, "run_job", fake_run_job)
    return fake_run_job


# ---------------------------------------------------------------- discovery


def test_health_reports_dependencies(client: TestClient) -> None:
    body = client.get("/health").json()

    assert body["status"] in {"ok", "degraded"}
    assert "storage" in body


def test_platforms_are_listed(client: TestClient) -> None:
    body = client.get("/api/v1/platforms").json()

    assert any(entry["name"] == "YouTube" for entry in body)


def test_resolve_returns_media_and_sorted_formats(client: TestClient) -> None:
    body = client.post("/api/v1/resolve", json={"url": SOURCE}).json()

    assert body["media"]["platform"] == "youtube"
    assert body["media"]["title"].startswith("Rick Astley")

    by_id = {fmt["id"]: fmt for fmt in body["formats"]}
    assert by_id["18"]["delivery"] == "direct"      # progressive - hand off the cdn url
    assert by_id["137"]["delivery"] == "muxed"      # video-only - needs ffmpeg
    assert by_id["140"]["delivery"] == "direct"     # audio-only m4a
    assert by_id["hls-720"]["delivery"] == "muxed"  # segmented - no byte ranges

    # Video first, highest resolution first.
    assert body["formats"][0]["height"] == 1080
    assert body["formats"][-1]["kind"] == "audio"


def test_resolve_rejects_a_non_url(client: TestClient) -> None:
    assert client.post("/api/v1/resolve", json={"url": "not-a-url"}).status_code == 422


# ---------------------------------------------------------------- direct path


def test_prepare_direct_hands_back_the_cdn_url(client: TestClient) -> None:
    body = client.post(
        "/api/v1/prepare", json={"url": SOURCE, "format_id": "18", "kind": "video"}
    ).json()

    assert body["status"] == "ready"
    assert body["job_id"] is None

    ticket = body["ticket"]
    assert ticket["delivery"] == "direct"
    assert ticket["download_url"] == "https://cdn.test/progressive.mp4?exp=1"
    assert ticket["size"] == 5_000_000
    assert ticket["resumable"] is True
    assert ticket["content_stable"] is True
    assert ticket["mime_type"] == "video/mp4"
    # The unsafe characters in the title never reach the filesystem.
    assert "<" not in ticket["filename"] and ticket["filename"].endswith(".mp4")
    assert ticket["refresh_token"]

    # The client has to replay these or the CDN 403s the download.
    assert ticket["headers"]["User-Agent"] == "yt-dlp/test"
    assert ticket["headers"]["Referer"] == "https://www.youtube.com/"
    # Compression would break byte-offset arithmetic on resume.
    assert "Accept-Encoding" not in ticket["headers"]


def test_prepare_audio_m4a_without_tagging_stays_direct(client: TestClient) -> None:
    """Opting out of metadata keeps the fast CDN handoff."""
    body = client.post(
        "/api/v1/prepare",
        json={
            "url": SOURCE, "format_id": "140", "kind": "audio",
            "audio_format": "m4a", "embed_metadata": False,
        },
    ).json()

    assert body["ticket"]["delivery"] == "direct"
    assert body["ticket"]["mime_type"] == "audio/mp4"


def test_prepare_audio_m4a_with_tagging_is_muxed(client: TestClient) -> None:
    """Tagging rewrites the file, so it can no longer be a CDN handoff."""
    body = client.post(
        "/api/v1/prepare",
        json={"url": SOURCE, "format_id": "140", "kind": "audio", "audio_format": "m4a"},
    ).json()

    assert body["ticket"]["delivery"] == "muxed"


def test_prepare_audio_mp3_needs_a_transcode(client: TestClient, fake_mux) -> None:
    body = client.post(
        "/api/v1/prepare",
        json={"url": SOURCE, "format_id": "140", "kind": "audio", "audio_format": "mp3"},
    ).json()

    assert body["ticket"]["delivery"] == "muxed"
    assert body["ticket"]["mime_type"] == "audio/mpeg"


def test_prepare_rejects_an_unknown_format(client: TestClient) -> None:
    response = client.post(
        "/api/v1/prepare", json={"url": SOURCE, "format_id": "999", "kind": "video"}
    )

    assert response.status_code == 404
    assert response.json()["error"] == "format_not_found"


# ---------------------------------------------------------------- muxed path


def test_prepare_muxed_completes_and_serves_a_file(client: TestClient, fake_mux) -> None:
    body = client.post(
        "/api/v1/prepare", json={"url": SOURCE, "format_id": "137", "kind": "video"}
    ).json()

    assert body["status"] == "ready"
    ticket = body["ticket"]
    assert ticket["delivery"] == "muxed"
    assert ticket["job_id"] == body["job_id"]
    assert ticket["download_url"].endswith(f"/api/v1/files/{body['job_id']}")
    assert ticket["size"] == 10_000

    served = client.get(f"/api/v1/files/{body['job_id']}")
    assert served.status_code == 200
    assert served.headers["accept-ranges"] == "bytes"
    assert len(served.content) == 10_000


def test_served_artifact_supports_range_resume(client: TestClient, fake_mux) -> None:
    job_id = client.post(
        "/api/v1/prepare", json={"url": SOURCE, "format_id": "137", "kind": "video"}
    ).json()["job_id"]

    head = client.request("HEAD", f"/api/v1/files/{job_id}")
    assert head.headers["accept-ranges"] == "bytes"

    first = client.get(f"/api/v1/files/{job_id}", headers={"Range": "bytes=0-4999"})
    assert first.status_code == 206
    assert first.headers["content-range"] == "bytes 0-4999/10000"

    # Resume exactly where the paused transfer stopped.
    rest = client.get(f"/api/v1/files/{job_id}", headers={"Range": "bytes=5000-"})
    assert rest.status_code == 206
    assert first.content + rest.content == client.get(f"/api/v1/files/{job_id}").content


def test_job_status_is_pollable(client: TestClient, fake_mux) -> None:
    job_id = client.post(
        "/api/v1/prepare", json={"url": SOURCE, "format_id": "137", "kind": "video"}
    ).json()["job_id"]

    body = client.get(f"/api/v1/jobs/{job_id}").json()
    assert body["status"] == "ready"
    assert body["progress"] == 1.0
    assert body["ticket"]["job_id"] == job_id


def test_cancel_removes_the_job_and_its_artifact(client: TestClient, fake_mux) -> None:
    job_id = client.post(
        "/api/v1/prepare", json={"url": SOURCE, "format_id": "137", "kind": "video"}
    ).json()["job_id"]

    assert client.delete(f"/api/v1/jobs/{job_id}").json()["status"] == "expired"
    assert client.get(f"/api/v1/jobs/{job_id}").status_code == 404


def test_unknown_job_is_404(client: TestClient) -> None:
    response = client.get("/api/v1/jobs/deadbeef")

    assert response.status_code == 404
    assert response.json()["error"] == "job_not_found"


# ---------------------------------------------------------------- refresh


def test_refresh_reissues_a_direct_url(client: TestClient) -> None:
    token = client.post(
        "/api/v1/prepare", json={"url": SOURCE, "format_id": "18", "kind": "video"}
    ).json()["ticket"]["refresh_token"]

    body = client.post("/api/v1/refresh", json={"refresh_token": token}).json()

    assert body["ticket"]["download_url"] == "https://cdn.test/progressive.mp4?exp=1"
    # Same bytes behind the new url, so the client keeps its partial file.
    assert body["ticket"]["content_stable"] is True


def test_refresh_reuses_a_live_muxed_artifact(client: TestClient, fake_mux) -> None:
    first = client.post(
        "/api/v1/prepare", json={"url": SOURCE, "format_id": "137", "kind": "video"}
    ).json()

    body = client.post(
        "/api/v1/refresh", json={"refresh_token": first["ticket"]["refresh_token"]}
    ).json()

    assert body["job_id"] == first["job_id"]
    assert body["ticket"]["content_stable"] is True


def test_refresh_after_sweep_forces_a_restart(client: TestClient, fake_mux) -> None:
    first = client.post(
        "/api/v1/prepare", json={"url": SOURCE, "format_id": "137", "kind": "video"}
    ).json()
    client.delete(f"/api/v1/jobs/{first['job_id']}")

    body = client.post(
        "/api/v1/refresh", json={"refresh_token": first["ticket"]["refresh_token"]}
    ).json()

    assert body["job_id"] != first["job_id"]
    # Re-muxing gives no byte-for-byte guarantee: the client must start over.
    assert body["ticket"]["content_stable"] is False


def test_refresh_rejects_a_forged_token(client: TestClient) -> None:
    response = client.post("/api/v1/refresh", json={"refresh_token": "abc.def"})

    assert response.status_code == 401
    assert response.json()["error"] == "invalid_token"
