/**
 * Mirrors the backend pydantic schemas. Field names are snake_case on purpose -
 * they are the wire format, and translating them would only add a layer where
 * the two can silently drift.
 */

export type DeliveryMode = 'direct' | 'muxed';
export type MediaKind = 'video' | 'audio';
export type AudioFormat = 'm4a' | 'mp3';
export type JobStatus = 'pending' | 'running' | 'ready' | 'failed' | 'expired';

export type ClipRange = {
  /** Float seconds from the start of the source. */
  start: number;
  end: number;
};

export type FormatOption = {
  id: string;
  kind: MediaKind;
  ext: string;
  /** Human string for the picker, e.g. "1080p60". */
  label: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  tbr: number | null;
  abr: number | null;
  filesize: number | null;
  delivery: DeliveryMode;
  has_audio: boolean;
  has_video: boolean;
};

export type MediaInfo = {
  source_url: string;
  extractor: string;
  platform: string;
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string | null;
  uploader: string | null;
  is_live: boolean;
};

export type ResolveResponse = {
  media: MediaInfo;
  formats: FormatOption[];
};

export type DownloadTicket = {
  job_id: string | null;
  delivery: DeliveryMode;
  download_url: string;
  size: number | null;
  mime_type: string;
  filename: string;
  /**
   * Must be replayed on every request, range resumes included. Most CDNs 403 a
   * bare GET without the extractor's User-Agent / Referer.
   */
  headers: Record<string, string>;
  resumable: boolean;
  /**
   * False means the bytes behind this url are NOT the ones a paused transfer
   * already holds - discard the partial file and start over.
   */
  content_stable: boolean;
  /** Unix seconds. */
  expires_at: number;
  refresh_token: string;
};

export type JobResponse = {
  /** Null on the direct path - there is no server-side work to track. */
  job_id: string | null;
  status: JobStatus;
  progress: number;
  error: string | null;
  ticket: DownloadTicket | null;
};

export type PrepareRequest = {
  url: string;
  format_id: string;
  kind: MediaKind;
  audio_format?: AudioFormat;
  /** Tier 1. Any of these forces `delivery: "muxed"`. */
  clip?: ClipRange | null;
  target_size_mb?: number | null;
  embed_metadata?: boolean;
};

export type ApiErrorBody = {
  error: string;
  detail: string | null;
};
