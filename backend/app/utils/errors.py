from __future__ import annotations


class AppError(Exception):
    """Base for errors we translate into a clean JSON body."""

    status_code = 500
    code = "internal_error"

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.code)
        self.detail = detail


class UnsupportedUrlError(AppError):
    status_code = 422
    code = "unsupported_url"


class ExtractionError(AppError):
    status_code = 502
    code = "extraction_failed"


class FormatNotFoundError(AppError):
    status_code = 404
    code = "format_not_found"


class JobNotFoundError(AppError):
    status_code = 404
    code = "job_not_found"


class JobNotReadyError(AppError):
    status_code = 409
    code = "job_not_ready"


class InvalidTokenError(AppError):
    status_code = 401
    code = "invalid_token"


class MuxError(AppError):
    status_code = 500
    code = "mux_failed"


class InvalidClipError(AppError):
    status_code = 422
    code = "invalid_clip"


class TargetTooSmallError(AppError):
    status_code = 422
    code = "target_too_small"


class DurationUnknownError(AppError):
    status_code = 422
    code = "duration_unknown"


class SourceTooLongError(AppError):
    status_code = 422
    code = "source_too_long"
