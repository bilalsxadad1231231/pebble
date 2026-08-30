import type { ClipRange, DeliveryMode } from '../api/types';

export type DownloadStatus =
  /** Server is resolving, merging, trimming or encoding - no bytes yet. */
  | 'preparing'
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed';

/**
 * Everything needed to resume a transfer across an app kill.
 *
 * Note what is *not* the source of truth here: `downloadUrl`. CDN links carry
 * expiry parameters and die in minutes to hours, so the durable handle is
 * `refreshToken` - the backend re-issues a fresh url from it.
 */
export type DownloadRecord = {
  id: string;
  title: string;
  platform: string;
  qualityLabel: string;

  filename: string;
  mimeType: string;
  fileUri: string;

  /** The durable handle. Survives url expiry. Empty until prepare returns. */
  refreshToken: string;
  /** Server-side progress during `preparing`, 0..1. */
  prepareProgress: number;
  /** Current, possibly expired. Re-resolved on resume when past `expiresAt`. */
  downloadUrl: string;
  /** Replayed on every request; without these most CDNs return 403. */
  headers: Record<string, string>;
  expiresAt: number;

  jobId: string | null;
  delivery: DeliveryMode;

  totalBytes: number | null;
  bytesWritten: number;

  status: DownloadStatus;
  error?: string;

  createdAt: number;
  completedAt?: number;

  /**
   * Asset id once published to the device gallery (a `content://` uri on
   * Android). Until this is set the file is only reachable inside the app.
   */
  galleryAssetId?: string;
  /** Set when publishing failed, so the Library can offer to retry it. */
  galleryError?: string;

  /** Tier 1 provenance, so the Library can show what was actually asked for. */
  clip?: ClipRange | null;
  targetSizeMb?: number | null;
  kind: 'video' | 'audio';
};

export type DownloadListener = (records: DownloadRecord[]) => void;
