import shutil

from fastapi import APIRouter

from app.config import get_settings
from app.services.job_store import store

router = APIRouter(tags=["system"])


@router.get("/health", summary="Liveness and dependency check")
async def health() -> dict[str, object]:
    settings = get_settings()
    ffmpeg = shutil.which(settings.ffmpeg_binary)
    return {
        "status": "ok" if ffmpeg else "degraded",
        "ffmpeg": ffmpeg,
        "jobs": store.size,
        "storage": str(settings.storage_path),
    }
