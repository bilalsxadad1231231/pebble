from fastapi import APIRouter

from app.controllers import download_controller
from app.models.schemas import JobResponse, PrepareRequest, RefreshRequest

router = APIRouter(tags=["download"])


@router.post("/prepare", response_model=JobResponse, summary="Get a download ticket")
async def prepare(payload: PrepareRequest) -> JobResponse:
    """Direct-delivery formats come back READY with a CDN url; formats that need
    ffmpeg start a job and return PENDING/RUNNING for the client to poll."""
    return await download_controller.prepare(payload)


@router.post("/refresh", response_model=JobResponse, summary="Re-issue an expired url")
async def refresh(payload: RefreshRequest) -> JobResponse:
    return await download_controller.refresh(payload.refresh_token)
