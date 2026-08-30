from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Keep every test's artifacts out of the real storage dir."""
    get_settings.cache_clear()
    monkeypatch.setenv("VAD_STORAGE_DIR", str(tmp_path / "storage"))
    monkeypatch.setenv("VAD_SECRET_KEY", "test-secret")
    monkeypatch.setenv("VAD_PUBLIC_BASE_URL", "http://testserver")
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client
