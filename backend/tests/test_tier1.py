from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.models.job import Job
from app.models.schemas import ClipRange, DeliveryMode, MediaKind
from app.controllers import download_controller
from app.services import delivery, extractor, muxer, transcode
from app.utils.errors import DurationUnknownError, SourceTooLongError, TargetTooSmallError
from app.utils.naming import clip_suffix

SOURCE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

FAKE_INFO: dict[str, Any] = {
    "id": "vid",
    "title": "Sunset timelapse",
    "extractor_key": "Youtube",
    "duration": 300.0,
    "uploader": "nadia.films",
    "formats": [
        {
            "format_id": "18",
            "url": "https://cdn.test/progressive.mp4",
            "ext": "mp4",
            "vcodec": "avc1",
            "acodec": "mp4a",
            "height": 360,
            "filesize": 60_000_000,
            "protocol": "https",
        },
        {
            "format_id": "140",
            "url": "https://cdn.test/audio.m4a",
            "ext": "m4a",
            "vcodec": "none",
            "acodec": "mp4a",
            "filesize": 3_000_000,
            "protocol": "https",
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
    """Keep every test off the network — see the note in test_api.py."""

    async def fake_run_job(job: Job) -> Path:
        path = tmp_path / f"{job.id}.mp4"
        path.write_bytes(b"CLIP" * 1000)
        return path

    monkeypatch.setattr(muxer, "run_job", fake_run_job)
    return fake_run_job


def prepare(client: TestClient, **body: Any):
    return client.post("/api/v1/prepare", json={"url": SOURCE, **body})


# ================================================================ clip trimming


@pytest.mark.parametrize(
    ("start", "end"),
    [
        (-1.0, 10.0),   # negative start
        (10.0, 10.0),   # zero span
        (10.0, 5.0),    # inverted
        (10.0, 10.5),   # sub-second span is a UI bug, not a request
    ],
)
def test_invalid_clip_is_rejected(client: TestClient, start: float, end: float) -> None:
    response = prepare(
        client, format_id="18", kind="video", clip={"start": start, "end": end}
    )
    assert response.status_code == 422


def test_clip_forces_muxed_on_an_otherwise_direct_format(client: TestClient) -> None:
    """Format 18 is progressive, so without a clip it would be a CDN handoff."""
    plain = prepare(client, format_id="18", kind="video").json()
    assert plain["ticket"]["delivery"] == "direct"

    clipped = prepare(
        client, format_id="18", kind="video", clip={"start": 45.0, "end": 80.5}
    ).json()
    assert clipped["ticket"]["delivery"] == "muxed"
    assert clipped["job_id"] is not None


def test_clip_bounds_ride_in_the_filename(client: TestClient) -> None:
    body = prepare(
        client, format_id="18", kind="video", clip={"start": 45.0, "end": 80.0}
    ).json()

    assert "[0-45 to 1-20]" in body["ticket"]["filename"]


def test_clip_suffix_avoids_illegal_characters() -> None:
    suffix = clip_suffix(45.0, 80.0)

    assert suffix == "[0-45 to 1-20]"
    assert ":" not in suffix  # illegal on Windows and awkward in Content-Disposition


def test_clip_end_is_clamped_to_source_duration(client: TestClient) -> None:
    """A live stream or an over-long out-point should not hard-fail."""
    body = prepare(
        client, format_id="18", kind="video", clip={"start": 280.0, "end": 9999.0}
    ).json()

    # Source is 300s, so the clip becomes 280 -> 300 = [4-40 to 5-00].
    assert "[4-40 to 5-00]" in body["ticket"]["filename"]


def test_clip_starting_past_the_end_is_rejected(client: TestClient) -> None:
    response = prepare(
        client, format_id="18", kind="video", clip={"start": 299.8, "end": 400.0}
    )

    assert response.status_code == 422
    assert response.json()["error"] == "invalid_clip"


def test_clip_size_estimate_is_proportional() -> None:
    """60 MB over 300 s, taking 30 s, should estimate about 6 MB."""
    fmt = {"filesize": 60_000_000}
    job = Job(
        source_url=SOURCE, format_id="18", kind=MediaKind.VIDEO, audio_format="m4a",
        filename="x.mp4", mime_type="video/mp4",
        clip=ClipRange(start=0.0, end=30.0), duration=300.0,
    )

    assert download_controller._estimated_size(fmt, job) == 6_000_000


def test_size_estimate_falls_back_to_source_bytes_without_a_clip() -> None:
    fmt = {"filesize": 60_000_000}
    job = Job(
        source_url=SOURCE, format_id="18", kind=MediaKind.VIDEO, audio_format="m4a",
        filename="x.mp4", mime_type="video/mp4", duration=300.0,
    )

    assert download_controller._estimated_size(fmt, job) == 60_000_000


def test_completed_job_reports_real_bytes_not_the_estimate(client: TestClient) -> None:
    """Once ready, `size` must be exact — the estimate is only a pre-flight hint."""
    body = prepare(
        client, format_id="18", kind="video", clip={"start": 0.0, "end": 30.0}
    ).json()

    assert body["status"] == "ready"
    assert body["ticket"]["size"] == 4000  # what the stubbed mux actually wrote


# ================================================================ fit-to-size


def test_bitrate_matches_the_worked_example() -> None:
    """100 MB / 300 s, minus 128 kbps of audio, at a 0.95 overhead factor."""
    settings = get_settings()

    bitrate = transcode.video_bitrate_for(100, 300.0, settings)

    assert bitrate == pytest.approx(2_405_333, abs=2)


def test_plan_rejects_a_budget_below_the_bitrate_floor() -> None:
    with pytest.raises(TargetTooSmallError) as excinfo:
        transcode.plan(target_size_mb=1, duration=300.0)

    # The message must name a size the UI can actually offer the user.
    assert "smallest workable size" in str(excinfo.value.detail)
    assert str(transcode.minimum_size_mb(300.0, get_settings())) in str(excinfo.value.detail)


def test_minimum_size_is_actually_accepted() -> None:
    """The number we suggest must itself clear the floor — off-by-one guard."""
    smallest = transcode.minimum_size_mb(300.0, get_settings())

    assert transcode.plan(target_size_mb=smallest, duration=300.0) >= get_settings().min_video_bitrate


def test_plan_rejects_an_unknown_duration() -> None:
    with pytest.raises(DurationUnknownError):
        transcode.plan(target_size_mb=100, duration=None)


def test_plan_rejects_a_source_longer_than_the_ceiling() -> None:
    over = get_settings().max_transcode_seconds + 1

    with pytest.raises(SourceTooLongError) as excinfo:
        transcode.plan(target_size_mb=500, duration=float(over))

    assert "trim a clip first" in str(excinfo.value.detail)


def test_impossible_budget_fails_fast_as_422(client: TestClient) -> None:
    """Validated before the job spawns, so the UI gets a synchronous error."""
    response = prepare(client, format_id="18", kind="video", target_size_mb=1)

    assert response.status_code == 422
    assert response.json()["error"] == "target_too_small"


def test_target_size_forces_muxed(client: TestClient) -> None:
    body = prepare(client, format_id="18", kind="video", target_size_mb=100).json()

    assert body["ticket"]["delivery"] == "muxed"
    assert body["job_id"] is not None


def test_pending_budget_estimate_is_the_budget_itself() -> None:
    job = Job(
        source_url=SOURCE, format_id="18", kind=MediaKind.VIDEO, audio_format="m4a",
        filename="x.mp4", mime_type="video/mp4", target_size_mb=100, duration=300.0,
    )

    assert download_controller._estimated_size({"filesize": 60_000_000}, job) == (
        100 * transcode.BYTES_PER_MB
    )


def test_budget_is_computed_from_the_clip_not_the_source(client: TestClient) -> None:
    """5 MB over the full 300 s is impossible; over a 30 s clip it is easy.

    This is the combination that makes Tier 1 worth building: *this 30 seconds,
    under 5 MB*.
    """
    assert prepare(client, format_id="18", kind="video", target_size_mb=5).status_code == 422

    response = prepare(
        client,
        format_id="18",
        kind="video",
        target_size_mb=5,
        clip={"start": 0.0, "end": 30.0},
    )
    assert response.status_code == 200
    assert response.json()["ticket"]["delivery"] == "muxed"


def test_budget_larger_than_source_is_accepted() -> None:
    bitrate = transcode.plan(target_size_mb=5000, duration=300.0)

    assert bitrate > get_settings().min_video_bitrate


# ================================================================ audio metadata


def test_audio_postprocessor_order_converts_before_embedding() -> None:
    """The webp trap: ID3v2 cannot carry webp, and EmbedThumbnail no-ops on one.

    YouTube serves webp thumbnails, so without the convertor running first the
    user gets a correctly tagged file with no artwork — silently.
    """
    job = Job(
        source_url=SOURCE, format_id="140", kind=MediaKind.AUDIO, audio_format="mp3",
        filename="x.mp3", mime_type="audio/mpeg", embed_metadata=True,
    )

    keys = [step["key"] for step in muxer._audio_postprocessors(job)]

    assert keys.index("FFmpegThumbnailsConvertor") < keys.index("EmbedThumbnail")
    assert keys.index("FFmpegExtractAudio") < keys.index("FFmpegMetadata")


def test_metadata_opt_out_skips_the_tagging_steps() -> None:
    job = Job(
        source_url=SOURCE, format_id="140", kind=MediaKind.AUDIO, audio_format="mp3",
        filename="x.mp3", mime_type="audio/mpeg", embed_metadata=False,
    )

    keys = [step["key"] for step in muxer._audio_postprocessors(job)]

    assert keys == ["FFmpegExtractAudio"]


def test_thumbnail_is_requested_only_when_embedding(tmp_path: Path) -> None:
    tagged = Job(
        source_url=SOURCE, format_id="140", kind=MediaKind.AUDIO, audio_format="mp3",
        filename="x.mp3", mime_type="audio/mpeg", embed_metadata=True,
    )
    plain = Job(
        source_url=SOURCE, format_id="140", kind=MediaKind.AUDIO, audio_format="mp3",
        filename="x.mp3", mime_type="audio/mpeg", embed_metadata=False,
    )

    assert muxer._build_opts(tagged, tmp_path).get("writethumbnail") is True
    assert "writethumbnail" not in muxer._build_opts(plain, tmp_path)


# ================================================================ delivery + tokens


def test_processing_short_circuits_the_delivery_rule() -> None:
    progressive = {"vcodec": "avc1", "acodec": "mp4a", "ext": "mp4", "protocol": "https"}

    assert delivery.decide(progressive, MediaKind.VIDEO) is DeliveryMode.DIRECT
    assert (
        delivery.decide(progressive, MediaKind.VIDEO, processing=True) is DeliveryMode.MUXED
    )


def test_refresh_round_trips_every_tier1_option(client: TestClient) -> None:
    """A refresh must re-prepare the *same* file, not a default one."""
    original = prepare(
        client,
        format_id="18",
        kind="video",
        clip={"start": 45.0, "end": 80.0},
        target_size_mb=100,
    ).json()

    token = original["ticket"]["refresh_token"]
    refreshed = client.post("/api/v1/refresh", json={"refresh_token": token}).json()

    assert refreshed["ticket"]["filename"] == original["ticket"]["filename"]
    assert "[0-45 to 1-20]" in refreshed["ticket"]["filename"]
    assert refreshed["ticket"]["size"] == original["ticket"]["size"]
    assert refreshed["ticket"]["delivery"] == "muxed"


def test_clip_job_survives_a_status_poll(client: TestClient) -> None:
    """job_controller rebuilds a PrepareRequest from the Job; it must keep the clip."""
    body = prepare(
        client, format_id="18", kind="video", clip={"start": 45.0, "end": 80.0}
    ).json()

    polled = client.get(f"/api/v1/jobs/{body['job_id']}").json()

    assert polled["ticket"]["filename"] == body["ticket"]["filename"]


# ================================================================ muxer wiring


def test_clip_sets_download_ranges_and_forces_keyframes(tmp_path: Path) -> None:
    """Without force_keyframes_at_cuts the boundary lands on the nearest keyframe,
    which can be seconds from where the user placed it."""
    job = Job(
        source_url=SOURCE, format_id="18", kind=MediaKind.VIDEO, audio_format="m4a",
        filename="x.mp4", mime_type="video/mp4",
        clip=ClipRange(start=45.0, end=80.0),
    )

    opts = muxer._build_opts(job, tmp_path)

    assert callable(opts["download_ranges"])
    assert opts["force_keyframes_at_cuts"] is True


def test_no_clip_leaves_download_ranges_unset(tmp_path: Path) -> None:
    job = Job(
        source_url=SOURCE, format_id="18", kind=MediaKind.VIDEO, audio_format="m4a",
        filename="x.mp4", mime_type="video/mp4",
    )

    assert "download_ranges" not in muxer._build_opts(job, tmp_path)


def test_download_phase_is_capped_when_a_transcode_follows() -> None:
    """Progress must leave room for the two encoding passes."""
    assert muxer.PHASE_DOWNLOAD_END < muxer.PHASE_PASS1_END < 1.0


def test_output_duration_prefers_the_clip() -> None:
    job = Job(
        source_url=SOURCE, format_id="18", kind=MediaKind.VIDEO, audio_format="m4a",
        filename="x.mp4", mime_type="video/mp4",
        clip=ClipRange(start=10.0, end=40.0), duration=300.0,
    )

    assert muxer._output_duration(job) == 30.0

    job.clip = None
    assert muxer._output_duration(job) == 300.0
