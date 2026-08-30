import type {
  JobResponse,
  PrepareRequest,
  ResolveResponse,
} from './types';

/**
 * Backend base url.
 *
 * `localhost` is the device itself, so on a real handset this must be the LAN
 * address of the machine running the API - the same value the backend has in
 * VAD_PUBLIC_BASE_URL, since muxed download links are built from it.
 */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? 'http://192.168.1.10:8000';

const API = `${API_BASE}/api/v1`;

/** A backend error carrying the machine-readable code the UI branches on. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string | null,
    readonly status: number,
  ) {
    super(detail || code);
    this.name = 'ApiError';
  }

  /**
   * Copy the user should actually see. The backend already writes these to be
   * actionable - a too-small budget names the smallest size that works - so
   * they are surfaced rather than replaced with something generic.
   */
  get userMessage(): string {
    switch (this.code) {
      case 'unsupported_url':
        return 'That link is not from a supported platform.';
      case 'extraction_failed':
        return 'Could not read that post. It may be private or deleted.';
      case 'format_not_found':
        return 'That quality is no longer available. Try resolving again.';
      case 'network':
        return 'Cannot reach the server. Check that it is running and reachable.';
      default:
        return this.detail || 'Something went wrong.';
    }
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 90_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (cause) {
    throw new ApiError('network', String(cause), 0);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let code = 'http_error';
    let detail: string | null = null;
    try {
      const body = await response.json();
      // FastAPI validation failures come back shaped differently from ours.
      code = body.error ?? 'validation_error';
      detail =
        body.detail ??
        (Array.isArray(body.detail) ? body.detail[0]?.msg : null) ??
        null;
    } catch {
      /* non-JSON body - keep the defaults */
    }
    throw new ApiError(code, detail, response.status);
  }

  return (await response.json()) as T;
}

export const api = {
  resolve(url: string) {
    return request<ResolveResponse>('/resolve', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },

  prepare(payload: PrepareRequest) {
    return request<JobResponse>('/prepare', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Re-issue a download url after the CDN link (or muxed artifact) expired. */
  refresh(refreshToken: string) {
    return request<JobResponse>('/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  },

  job(jobId: string) {
    return request<JobResponse>(`/jobs/${jobId}`);
  },

  cancelJob(jobId: string) {
    return request<JobResponse>(`/jobs/${jobId}`, { method: 'DELETE' });
  },
};

/**
 * Poll a mux job to completion.
 *
 * `/prepare` blocks for up to VAD_PREPARE_TIMEOUT and then hands back a
 * pending/running job, so anything that is not already `ready` gets polled here.
 */
export async function pollJob(
  jobId: string,
  onProgress: (job: JobResponse) => void,
  intervalMs = 1500,
  signal?: AbortSignal,
): Promise<JobResponse> {
  for (;;) {
    if (signal?.aborted) throw new ApiError('cancelled', 'Cancelled', 0);

    const job = await api.job(jobId);
    onProgress(job);

    if (job.status === 'ready' || job.status === 'failed' || job.status === 'expired') {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
