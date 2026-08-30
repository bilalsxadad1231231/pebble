from fastapi import APIRouter, Header
from starlette.responses import Response

from app.controllers import job_controller
from app.models.schemas import JobResponse

router = APIRouter(tags=["jobs"])


@router.get("/jobs/{job_id}", response_model=JobResponse, summary="Poll a mux job")
async def status(job_id: str) -> JobResponse:
    return await job_controller.status(job_id)


@router.delete("/jobs/{job_id}", response_model=JobResponse, summary="Cancel and clean up")
async def cancel(job_id: str) -> JobResponse:
    return await job_controller.cancel(job_id)


@router.get("/files/{job_id}", summary="Download a muxed artifact (Range-capable)")
async def download(job_id: str, range: str | None = Header(default=None)) -> Response:
    return await job_controller.serve(job_id, range)


@router.head("/files/{job_id}", summary="Probe size and range support")
async def probe(job_id: str) -> Response:
    response = await job_controller.serve(job_id, None)
    return Response(status_code=200, headers=dict(response.headers))
