from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from app.utils.errors import InvalidTokenError


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64d(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def sign(payload: dict[str, Any], secret: str, ttl: int) -> str:
    """Opaque, tamper-proof `payload.signature` token.

    The app persists this instead of a CDN url, so an expired media link can be
    re-resolved without the client knowing anything about the platform.
    """
    body = {**payload, "exp": int(time.time()) + ttl}
    encoded = _b64e(json.dumps(body, separators=(",", ":"), sort_keys=True).encode())
    mac = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).digest()
    return f"{encoded}.{_b64e(mac)}"


def verify(token: str, secret: str) -> dict[str, Any]:
    try:
        encoded, signature = token.split(".", 1)
    except ValueError as exc:
        raise InvalidTokenError("malformed token") from exc

    expected = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(_b64e(expected), signature):
        raise InvalidTokenError("bad signature")

    try:
        payload = json.loads(_b64d(encoded))
    except (ValueError, json.JSONDecodeError) as exc:
        raise InvalidTokenError("undecodable payload") from exc

    if payload.get("exp", 0) < time.time():
        raise InvalidTokenError("token expired")

    return payload
