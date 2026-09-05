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

  /**
   * What was asked for. Together with `formatId` and the clip bounds this is
   * the identity of a download - the same post has many url forms, so nothing
   * downstream should key on the url alone.
   */
  sourceUrl: string;
  formatId: string;

  filename: string;
  mimeType: string;
  /**
   * The staging file in app-private storage. Cleared once the download has
   * been published to the gallery, which is a copy - keeping both would cost
   * the user twice the space for every download.
   */
  fileUri?: string;

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
  /** Last time the file was opened, so storage reclaim can find dead weight. */
  lastOpenedAt?: number;

  /**
   * Asset id once published to the device gallery (a `content://` uri on
   * Android). Until this is set the file is only reachable inside the app.
   */
  galleryAssetId?: string;
  /** Set when publishing failed, so the Library can offer to retry it. */
  galleryError?: string;

  /** Poster image from the platform. Expires, so it is only a starting point. */
  thumbnailUrl?: string;
  /** Local copy of the poster, which is what the Library actually renders. */
  thumbnailUri?: string;

  /** Tier 1 provenance, so the Library can show what was actually asked for. */
  clip?: ClipRange | null;
  targetSizeMb?: number | null;
  kind: 'video' | 'audio';
};

export type DownloadListener = (records: DownloadRecord[]) => void;
