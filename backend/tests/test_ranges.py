from __future__ import annotations

from pathlib import Path

import pytest
from starlette.responses import Response

from app.utils.ranges import parse_range, ranged_file_response

SIZE = 1000


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        (None, None),
        ("", None),
        ("bytes=0-99", (0, 99)),
        ("bytes=500-", (500, 999)),
        ("bytes=-200", (800, 999)),
        ("bytes=0-99999", (0, 999)),        # clamped to the last byte
        ("bytes=1000-", None),              # start past EOF
        ("bytes=900-100", None),            # inverted
        ("bytes=0-10,20-30", None),         # multi-range is not supported
        ("items=0-10", None),               # wrong unit
        ("bytes=abc-", None),
    ],
)
def test_parse_range(header: str | None, expected: tuple[int, int] | None) -> None:
    assert parse_range(header, SIZE) == expected


@pytest.fixture
def artifact(tmp_path: Path) -> Path:
    path = tmp_path / "clip.mp4"
    path.write_bytes(bytes(range(256)) * 4)
    return path


async def _body(response: Response) -> bytes:
    chunks = [chunk async for chunk in response.body_iterator]  # type: ignore[attr-defined]
    return b"".join(chunks)


@pytest.mark.asyncio
async def test_full_response_advertises_range_support(artifact: Path) -> None:
    response = ranged_file_response(artifact, None, "video/mp4", "clip.mp4")

    assert response.status_code == 200
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-length"] == "1024"
    assert await _body(response) == artifact.read_bytes()


@pytest.mark.asyncio
async def test_partial_response_returns_exact_slice(artifact: Path) -> None:
    response = ranged_file_response(artifact, "bytes=100-199", "video/mp4", "clip.mp4")

    assert response.status_code == 206
    assert response.headers["content-range"] == "bytes 100-199/1024"
    assert response.headers["content-length"] == "100"
    assert await _body(response) == artifact.read_bytes()[100:200]


@pytest.mark.asyncio
async def test_resume_from_offset_completes_the_file(artifact: Path) -> None:
    """The exact pause/resume path: take a prefix, then range the remainder."""
    first = ranged_file_response(artifact, "bytes=0-499", "video/mp4", "clip.mp4")
    second = ranged_file_response(artifact, "bytes=500-", "video/mp4", "clip.mp4")

    assert (await _body(first)) + (await _body(second)) == artifact.read_bytes()


def test_unsatisfiable_range_is_416(artifact: Path) -> None:
    response = ranged_file_response(artifact, "bytes=99999-", "video/mp4", "clip.mp4")

    assert response.status_code == 416
    assert response.headers["content-range"] == "bytes */1024"
