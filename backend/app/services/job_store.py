from __future__ import annotations

import asyncio
import contextlib
import time

from app.config import get_settings
from app.models.job import Job
from app.models.schemas import JobStatus
from app.utils.errors import JobNotFoundError


class JobStore:
    """In-memory job registry with TTL sweeping.

    Deliberately process-local for v1: swap this class for Redis + a shared
    volume when the API runs on more than one worker.
    """

    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._lock = asyncio.Lock()
        self._sweeper: asyncio.Task[None] | None = None

    async def add(self, job: Job) -> Job:
        async with self._lock:
            self._jobs[job.id] = job
        return job

    async def get(self, job_id: str) -> Job:
        job = self._jobs.get(job_id)
        if job is None:
            raise JobNotFoundError(f"no job '{job_id}'")
        if job.is_expired(get_settings().job_ttl):
            job.status = JobStatus.EXPIRED
        return job

    async def track(self, job_id: str, task: asyncio.Task[None]) -> None:
        async with self._lock:
            self._tasks[job_id] = task
        task.add_done_callback(lambda _: self._tasks.pop(job_id, None))

    async def wait(self, job_id: str, timeout: float) -> Job:
        """Block until the job settles, or return it still running on timeout."""
        task = self._tasks.get(job_id)
        if task is not None:
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(asyncio.shield(task), timeout=timeout)
        return await self.get(job_id)

    async def cancel(self, job_id: str) -> Job:
        job = await self.get(job_id)
        task = self._tasks.get(job_id)
        if task is not None and not task.done():
            task.cancel()
        await self._discard(job)
        return job

    async def _discard(self, job: Job) -> None:
        if job.path is not None:
            with contextlib.suppress(OSError):
                job.path.unlink(missing_ok=True)
        async with self._lock:
            self._jobs.pop(job.id, None)

    async def sweep(self) -> int:
        ttl = get_settings().job_ttl
        stale = [job for job in list(self._jobs.values()) if job.is_expired(ttl)]
        for job in stale:
            await self._discard(job)
        return len(stale)

    async def _sweep_loop(self, interval: float) -> None:
        while True:
            await asyncio.sleep(interval)
            with contextlib.suppress(Exception):
                await self.sweep()

    def start_sweeper(self, interval: float = 600.0) -> None:
        if self._sweeper is None:
            self._sweeper = asyncio.create_task(self._sweep_loop(interval))

    async def shutdown(self) -> None:
        if self._sweeper is not None:
            self._sweeper.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._sweeper
            self._sweeper = None
        for task in list(self._tasks.values()):
            task.cancel()

    @property
    def size(self) -> int:
        return len(self._jobs)


store = JobStore()
