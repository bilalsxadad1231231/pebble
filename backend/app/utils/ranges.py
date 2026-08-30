from __future__ import annotations

import os
from pathlib import Path
from typing import AsyncIterator

from starlette.responses import Response, StreamingResponse

CHUNK_SIZE = 1024 * 256


def parse_range(header: str | None, file_size: int) -> tuple[int, int] | None:
    """Parse a single-range `bytes=start-end` header.

    Returns an inclusive (start, end) pair, or None when the header is absent or
    unusable. Multi-range requests are deliberately ignored — clients fall back
    to a normal 200 and no resume logic depends on them.
    """
    if not header or not header.strip().lower().startswith("bytes="):
        return None

    spec = header.split("=", 1)[1].strip()
    if "," in spec:
        return None

    raw_start, _, raw_end = spec.partition("-")
    try:
        if not raw_start:                      # suffix form: bytes=-500
            length = int(raw_end)
            if length <= 0:
                return None
            start = max(file_size - length, 0)
            end = file_size - 1
        else:
            start = int(raw_start)
            end = int(raw_end) if raw_end else file_size - 1
    except ValueError:
        return None

    if start > end or start >= file_size:
        return None

    return start, min(end, file_size - 1)


async def _iter_file(path: Path, start: int, end: int) -> AsyncIterator[bytes]:
    remaining = end - start + 1
    with path.open("rb") as handle:
        handle.seek(start)
        while remaining > 0:
            chunk = handle.read(min(CHUNK_SIZE, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def ranged_file_response(
    path: Path,
    range_header: str | None,
    media_type: str,
    filename: str,
) -> Response:
    """Serve `path` honouring Range so the mobile client can pause/resume."""
    file_size = path.stat().st_size
    disposition = f'attachment; filename="{os.path.basename(filename)}"'
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=3600",
    }

    parsed = parse_range(range_header, file_size)
    if parsed is None:
        if range_header and range_header.strip().lower().startswith("bytes="):
            # Syntactically a range but unsatisfiable for this file.
            return Response(
                status_code=416,
                headers={**headers, "Content-Range": f"bytes */{file_size}"},
            )
        headers["Content-Length"] = str(file_size)
        return StreamingResponse(
            _iter_file(path, 0, file_size - 1),
            status_code=200,
            media_type=media_type,
            headers=headers,
        )

    start, end = parsed
    headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
    headers["Content-Length"] = str(end - start + 1)
    return StreamingResponse(
        _iter_file(path, start, end),
        status_code=206,
        media_type=media_type,
        headers=headers,
    )
