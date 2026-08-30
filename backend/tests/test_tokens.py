from __future__ import annotations

import time

import pytest

from app.utils import tokens
from app.utils.errors import InvalidTokenError

SECRET = "test-secret"


def test_roundtrip_preserves_payload() -> None:
    token = tokens.sign({"u": "https://x.test/1", "f": "137"}, SECRET, ttl=60)
    payload = tokens.verify(token, SECRET)

    assert payload["u"] == "https://x.test/1"
    assert payload["f"] == "137"
    assert payload["exp"] > time.time()


def test_tampered_payload_is_rejected() -> None:
    token = tokens.sign({"u": "https://x.test/1"}, SECRET, ttl=60)
    forged = "eyJ1IjogImh0dHBzOi8vZXZpbC50ZXN0In0." + token.split(".", 1)[1]

    with pytest.raises(InvalidTokenError):
        tokens.verify(forged, SECRET)


def test_wrong_secret_is_rejected() -> None:
    token = tokens.sign({"u": "https://x.test/1"}, SECRET, ttl=60)

    with pytest.raises(InvalidTokenError):
        tokens.verify(token, "other-secret")


def test_expired_token_is_rejected() -> None:
    token = tokens.sign({"u": "https://x.test/1"}, SECRET, ttl=-1)

    with pytest.raises(InvalidTokenError, match="expired"):
        tokens.verify(token, SECRET)


def test_malformed_token_is_rejected() -> None:
    with pytest.raises(InvalidTokenError):
        tokens.verify("not-a-token", SECRET)
