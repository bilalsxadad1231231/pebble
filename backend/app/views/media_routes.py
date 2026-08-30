from fastapi import APIRouter

from app.controllers import media_controller
from app.models.schemas import PlatformInfo, ResolveRequest, ResolveResponse

router = APIRouter(tags=["media"])


@router.post("/resolve", response_model=ResolveResponse, summary="Inspect a post url")
async def resolve(payload: ResolveRequest) -> ResolveResponse:
    return await media_controller.resolve(str(payload.url))


@router.get("/platforms", response_model=list[PlatformInfo], summary="Supported platforms")
async def platforms() -> list[PlatformInfo]:
    return media_controller.platforms()
