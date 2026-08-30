from __future__ import annotations

from app.models.schemas import PlatformInfo, ResolveResponse
from app.services import extractor

SUPPORTED_PLATFORMS = [
    PlatformInfo(name="YouTube", extractor="Youtube", notes="1080p+ is DASH and needs server-side muxing"),
    PlatformInfo(name="Instagram", extractor="Instagram", notes="Reels/posts; private accounts need cookies"),
    PlatformInfo(name="Facebook", extractor="facebook", notes="Public videos and reels"),
    PlatformInfo(name="TikTok", extractor="TikTok", notes="Progressive mp4, usually a direct handoff"),
    PlatformInfo(name="X / Twitter", extractor="twitter"),
    PlatformInfo(name="Reddit", extractor="Reddit", notes="Video and audio are separate tracks"),
    PlatformInfo(name="Pinterest", extractor="Pinterest"),
    PlatformInfo(name="Vimeo", extractor="Vimeo"),
    PlatformInfo(name="Dailymotion", extractor="Dailymotion"),
    PlatformInfo(name="SoundCloud", extractor="soundcloud", supports_audio_only=True),
]


async def resolve(url: str) -> ResolveResponse:
    """Turn a shared post url into media metadata plus a format picker list."""
    info = await extractor.extract(url)
    return ResolveResponse(
        media=extractor.to_media_info(url, info),
        formats=extractor.to_format_options(info),
    )


def platforms() -> list[PlatformInfo]:
    return SUPPORTED_PLATFORMS
