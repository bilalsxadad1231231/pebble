from __future__ import annotations

from pathlib import Path

from starlette.responses import Response

from app.controllers.download_controller import job_response
from app.models.job import Job
from app.models.schemas import JobResponse, JobStatus, PrepareRequest
from app.services.job_store import store
from app.utils.errors import JobNotReadyError
from app.utils.ranges import ranged_file_response


def _as_request(job: Job) -> PrepareRequest:
    return PrepareRequest(
        url=job.source_url,
        format_id=job.format_id,
        kind=job.kind,
        audio_format=job.audio_format,
        clip=job.clip,
        target_size_mb=job.target_size_mb,
        embed_metadata=job.embed_metadata,
    )


async def status(job_id: str) -> JobResponse:
    job = await store.get(job_id)
    return job_response(job, _as_request(job), Path(job.filename).stem)


async def cancel(job_id: str) -> JobResponse:
    job = await store.cancel(job_id)
    return JobResponse(job_id=job.id, status=JobStatus.EXPIRED, progress=job.progress)


async def serve(job_id: str, range_header: str | None) -> Response:
    """Range-capable delivery of a finished mux - this is what makes resume work."""
    job = await store.get(job_id)

    if job.status is not JobStatus.READY or job.path is None:
        raise JobNotReadyError(f"job is '{job.status.value}'")
    if not job.path.exists():
        raise JobNotReadyError("artifact was swept from disk")

    return ranged_file_response(job.path, range_header, job.mime_type, job.filename)
