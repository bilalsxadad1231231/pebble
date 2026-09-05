import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Directory,
  DownloadPauseState,
  DownloadTask,
  File,
  Paths,
} from 'expo-file-system';

import { api, ApiError, pollJob } from '../api/client';
import type { DownloadTicket, MediaKind, PrepareRequest } from '../api/types';
import { GalleryPermissionError, GalleryUnavailableError, publish, unpublish } from './gallery';
import { syncForegroundService } from './service';
import type { DownloadListener, DownloadRecord, DownloadStatus } from './types';

const STORE_KEY = 'pebble.downloads.v1';
const PAUSE_KEY = 'pebble.pausestate.v1';

/** Concurrent transfers. Above this, records sit in `queued`. */
const MAX_ACTIVE = 2;

/** Re-resolve a little before the stated expiry rather than racing it. */
const EXPIRY_SKEW_SECONDS = 60;

export type StartMeta = {
  title: string;
  platform: string;
  qualityLabel: string;
  kind: MediaKind;
  /** Poster url from `/resolve`, cached locally on enqueue. */
  thumbnailUrl?: string | null;
  clip?: { start: number; end: number } | null;
  targetSizeMb?: number | null;
};

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function downloadsDir(): Directory {
  const dir = new Directory(Paths.document, 'Pebble');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Posters live beside the media but out of the way of the gallery scan. */
function thumbsDir(): Directory {
  const dir = new Directory(Paths.cache, 'pebble-thumbs');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Avoid clobbering an earlier download that happens to share a title. */
function uniqueFile(filename: string): File {
  const dir = downloadsDir();
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';

  let candidate = new File(dir, filename);
  let n = 2;
  while (candidate.exists) {
    candidate = new File(dir, `${stem} (${n})${ext}`);
    n += 1;
  }
  return candidate;
}

class DownloadManager {
  private records = new Map<string, DownloadRecord>();
  private tasks = new Map<string, DownloadTask>();
  private pauseStates = new Map<string, DownloadPauseState>();
  private listeners = new Set<DownloadListener>();
  private hydrated = false;

  // ------------------------------------------------------------ subscription

  subscribe(listener: DownloadListener): () => void {
    this.listeners.add(listener);
    listener(this.all());
    return () => this.listeners.delete(listener);
  }

  all(): DownloadRecord[] {
    return [...this.records.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string): DownloadRecord | undefined {
    return this.records.get(id);
  }

  private emit(): void {
    const snapshot = this.all();
    this.listeners.forEach((listener) => listener(snapshot));
    // Single choke point for queue state, so the service can never drift out of
    // step with what is actually running.
    syncForegroundService(snapshot);
  }

  private patch(id: string, changes: Partial<DownloadRecord>): void {
    const current = this.records.get(id);
    if (!current) return;
    this.records.set(id, { ...current, ...changes });
    this.emit();
    void this.persist();
  }

  // ------------------------------------------------------------ persistence

  private async persist(): Promise<void> {
    await AsyncStorage.multiSet([
      [STORE_KEY, JSON.stringify([...this.records.values()])],
      [PAUSE_KEY, JSON.stringify([...this.pauseStates.entries()])],
    ]);
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    const [[, rawRecords], [, rawPause]] = await AsyncStorage.multiGet([
      STORE_KEY,
      PAUSE_KEY,
    ]);

    if (rawRecords) {
      for (const record of JSON.parse(rawRecords) as DownloadRecord[]) {
        // Anything that claimed to be running when the process died is not
        // running now. There is no in-flight task to reattach to.
        const status: DownloadStatus =
          record.status === 'preparing'
            ? 'failed'
            : record.status === 'downloading' || record.status === 'queued'
              ? 'paused'
              : record.status;
        this.records.set(record.id, {
          ...record,
          status,
          prepareProgress: record.prepareProgress ?? 0,
          error:
            status === 'failed' && record.status === 'preparing'
              ? 'Interrupted while the server was preparing it'
              : record.error,
        });
      }
    }
    if (rawPause) {
      this.pauseStates = new Map(JSON.parse(rawPause) as [string, DownloadPauseState][]);
    }
    this.emit();
  }

  // ------------------------------------------------------------ queue

  private activeCount(): number {
    return [...this.records.values()].filter((r) => r.status === 'downloading').length;
  }

  private pumpQueue(): void {
    if (this.activeCount() >= MAX_ACTIVE) return;
    const next = this.all()
      .reverse()
      .find((r) => r.status === 'queued' && r.fileUri);
    if (next) void this.begin(next.id);
  }

  // ------------------------------------------------------------ lifecycle

  /**
   * Queue a download from a prepare request.
   *
   * The row appears in the Library immediately and moves through
   * `preparing -> downloading -> completed` there. `/prepare` can block for up
   * to a minute while the server merges, trims or encodes, so it is owned here
   * rather than by a screen the user might navigate away from.
   */
  async enqueue(request: PrepareRequest, meta: StartMeta): Promise<string> {
    await this.hydrate();
    const id = uid();

    this.records.set(id, {
      id,
      title: meta.title,
      platform: meta.platform,
      qualityLabel: meta.qualityLabel,
      filename: '',
      mimeType: '',
      fileUri: '',
      refreshToken: '',
      prepareProgress: 0,
      downloadUrl: '',
      headers: {},
      expiresAt: 0,
      jobId: null,
      delivery: 'muxed',
      totalBytes: null,
      bytesWritten: 0,
      status: 'preparing',
      createdAt: Date.now(),
      clip: meta.clip ?? null,
      targetSizeMb: meta.targetSizeMb ?? null,
      kind: meta.kind,
      thumbnailUrl: meta.thumbnailUrl ?? undefined,
    });
    this.emit();
    void this.persist();

    void this.cacheThumbnail(id);
    void this.prepareThenDownload(id, request);
    return id;
  }

  /**
   * Copy the platform's poster into local cache.
   *
   * The remote url carries the same expiry parameters the media links do, so a
   * Library row rendered from it would go blank after a few hours. Best-effort:
   * a missing poster falls back to an icon and is never worth failing over.
   */
  private async cacheThumbnail(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record?.thumbnailUrl || record.thumbnailUri) return;

    try {
      const target = new File(thumbsDir(), `${id}.img`);
      if (target.exists) target.delete();
      const saved = await File.downloadFileAsync(record.thumbnailUrl, target);
      this.patch(id, { thumbnailUri: saved.uri });
    } catch {
      // No poster is a cosmetic loss, not a failure.
    }
  }

  private async prepareThenDownload(id: string, request: PrepareRequest): Promise<void> {
    try {
      let job = await api.prepare(request);

      if (job.job_id && job.status !== 'ready') {
        this.patch(id, { jobId: job.job_id });
        job = await pollJob(job.job_id, (update) =>
          this.patch(id, { prepareProgress: update.progress }),
        );
      }

      if (job.status !== 'ready' || !job.ticket) {
        this.patch(id, {
          status: 'failed',
          error: job.error ?? 'Could not prepare that download.',
        });
        return;
      }

      this.attachTicket(id, job.ticket);
      if (this.activeCount() >= MAX_ACTIVE) {
        this.patch(id, { status: 'queued' });
      } else {
        await this.begin(id);
      }
    } catch (cause) {
      this.fail(id, cause);
    }
  }

  /** Fill in everything that only exists once the server has produced a file. */
  private attachTicket(id: string, ticket: DownloadTicket): void {
    const target = uniqueFile(ticket.filename);
    this.patch(id, {
      filename: target.name,
      mimeType: ticket.mime_type,
      fileUri: target.uri,
      refreshToken: ticket.refresh_token,
      downloadUrl: ticket.download_url,
      headers: ticket.headers ?? {},
      expiresAt: ticket.expires_at,
      jobId: ticket.job_id,
      delivery: ticket.delivery,
      totalBytes: ticket.size,
      prepareProgress: 1,
    });
  }

  private onProgress(id: string) {
    return ({ bytesWritten, totalBytes }: { bytesWritten: number; totalBytes: number }) => {
      const record = this.records.get(id);
      if (!record) return;
      this.records.set(id, {
        ...record,
        bytesWritten,
        // -1 means the server sent no Content-Length; keep whatever estimate we had.
        totalBytes: totalBytes > 0 ? totalBytes : record.totalBytes,
      });
      this.emit();
    };
  }

  private async begin(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) return;

    // No staging file means this record was already published and its sandbox
    // copy released, so there is nothing here to transfer into.
    if (!record.fileUri) {
      this.fail(id, new Error('This download has already been saved.'));
      return;
    }

    this.patch(id, { status: 'downloading', error: undefined });

    const task = File.createDownloadTask(
      record.downloadUrl,
      new File(record.fileUri),
      { headers: record.headers, onProgress: this.onProgress(id) },
    );
    this.tasks.set(id, task);

    try {
      const file = await task.downloadAsync();
      // A null result means the task was paused, not that it finished.
      if (file) this.complete(id, file);
    } catch (cause) {
      this.fail(id, cause);
    }
  }

  private complete(id: string, file: File): void {
    this.tasks.delete(id);
    this.pauseStates.delete(id);
    this.patch(id, {
      status: 'completed',
      completedAt: Date.now(),
      bytesWritten: file.size ?? this.records.get(id)?.bytesWritten ?? 0,
      totalBytes: file.size ?? this.records.get(id)?.totalBytes ?? null,
    });
    // The transfer is done either way; publishing is a separate step that may
    // fail on its own (permission denied) without losing the file.
    void this.publishToGallery(id);
    this.pumpQueue();
  }

  /**
   * Move a finished download into the device gallery.
   *
   * Until this runs the file lives in app-private storage, invisible to the
   * Gallery, music players and other apps' file pickers.
   *
   * Scoped storage means the file cannot be written there directly - a
   * download can only land in the app sandbox, and MediaStore *copies* it out.
   * So the sandbox file is a staging area, and it is deleted once the copy
   * exists. Keeping both would silently cost the user twice the disk space for
   * every download, and leave Delete freeing only half of it.
   */
  async publishToGallery(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record || record.galleryAssetId || !record.fileUri) return;

    try {
      const assetId = await publish(record.fileUri);

      // Drop the staging copy now that the gallery owns the bytes. Failing to
      // delete it is not worth surfacing - the download succeeded either way.
      let stagedRemoved = false;
      try {
        const staged = new File(record.fileUri);
        if (staged.exists) staged.delete();
        stagedRemoved = true;
      } catch {
        stagedRemoved = false;
      }

      this.patch(id, {
        galleryAssetId: assetId,
        galleryError: undefined,
        ...(stagedRemoved ? { fileUri: undefined } : {}),
      });
    } catch (cause) {
      const reason =
        cause instanceof GalleryPermissionError || cause instanceof GalleryUnavailableError
          ? cause.message
          : `Could not add to gallery: ${String((cause as Error)?.message ?? cause)}`;
      this.patch(id, { galleryError: reason });
    }
  }

  private fail(id: string, cause: unknown): void {
    this.tasks.delete(id);
    const message =
      cause instanceof ApiError ? cause.userMessage : String((cause as Error)?.message ?? cause);
    this.patch(id, { status: 'failed', error: message });
    this.pumpQueue();
  }

  async pause(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) {
      this.patch(id, { status: 'paused' });
      return;
    }

    await task.pauseAsync();
    try {
      // Persisted so the transfer survives an app kill, not just a backgrounding.
      this.pauseStates.set(id, task.savable());
    } catch {
      // No resume data available - resume will restart from zero.
      this.pauseStates.delete(id);
    }
    this.tasks.delete(id);
    this.patch(id, { status: 'paused' });
    this.pumpQueue();
  }

  /**
   * Resume a paused transfer, re-resolving the url first when it has expired.
   *
   * The three rules the backend contract sets out all live here: never trust a
   * stored url, always replay the ticket headers, and honour `content_stable` -
   * a re-muxed artifact is not byte-identical, so resuming onto one would
   * silently corrupt the file.
   */
  async resume(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) return;

    if (this.activeCount() >= MAX_ACTIVE) {
      this.patch(id, { status: 'queued' });
      return;
    }

    this.patch(id, { status: 'downloading', error: undefined });

    let url = record.downloadUrl;
    let headers = record.headers;
    let restart = false;

    const expired = record.expiresAt * 1000 - EXPIRY_SKEW_SECONDS * 1000 < Date.now();
    if (expired) {
      try {
        const job = await api.refresh(record.refreshToken);

        if (job.status !== 'ready' || !job.ticket) {
          // The artifact is being rebuilt; poll rather than fail outright.
          this.patch(id, { status: 'queued', jobId: job.job_id ?? record.jobId });
          return;
        }

        url = job.ticket.download_url;
        headers = job.ticket.headers ?? {};
        restart = !job.ticket.content_stable;

        this.patch(id, {
          downloadUrl: url,
          headers,
          expiresAt: job.ticket.expires_at,
          jobId: job.ticket.job_id,
          totalBytes: job.ticket.size ?? record.totalBytes,
        });
      } catch (cause) {
        this.fail(id, cause);
        return;
      }
    }

    if (restart) {
      // Different bytes behind the same request - the partial file is useless.
      if (record.fileUri) {
        const partial = new File(record.fileUri);
        if (partial.exists) partial.delete();
      }
      this.pauseStates.delete(id);
      this.patch(id, { bytesWritten: 0 });
      await this.begin(id);
      return;
    }

    const saved = this.pauseStates.get(id);
    if (!saved) {
      await this.begin(id);
      return;
    }

    // Restore the paused task onto the fresh url. New headers win over saved ones.
    const task = DownloadTask.fromSavable(
      { ...saved, url },
      { headers, onProgress: this.onProgress(id) },
    );
    this.tasks.set(id, task);

    try {
      const file = await task.resumeAsync();
      if (file) this.complete(id, file);
    } catch (cause) {
      this.fail(id, cause);
    }
  }

  async cancel(id: string): Promise<void> {
    const record = this.records.get(id);
    this.tasks.get(id)?.cancel();
    this.tasks.delete(id);
    this.pauseStates.delete(id);

    if (record) {
      if (record.fileUri) {
        const partial = new File(record.fileUri);
        if (partial.exists) partial.delete();
      }
      this.discardThumbnail(record);
      if (record.jobId) void api.cancelJob(record.jobId).catch(() => undefined);
    }

    this.records.delete(id);
    this.emit();
    void this.persist();
    this.pumpQueue();
  }

  /**
   * Delete a download and, unless told otherwise, the file behind it.
   *
   * Once published, the gallery copy is the only copy, so removing the record
   * without it would leave the file orphaned in the user's gallery while
   * telling them it had been deleted. On Android 11+ the system shows its own
   * confirmation before touching shared storage.
   */
  async remove(id: string, deleteFile = true): Promise<void> {
    const record = this.records.get(id);
    if (record) {
      if (deleteFile && record.fileUri) {
        const file = new File(record.fileUri);
        if (file.exists) file.delete();
      }
      if (deleteFile && record.galleryAssetId) {
        // A refusal at the system prompt must not strand the record: the user
        // asked for it gone from Pebble either way.
        try {
          await unpublish(record.galleryAssetId);
        } catch {
          // Left in the gallery; nothing more this side can do about it.
        }
      }
      this.discardThumbnail(record);
    }
    this.records.delete(id);
    this.emit();
    void this.persist();
  }

  private discardThumbnail(record: DownloadRecord): void {
    if (!record.thumbnailUri) return;
    try {
      const thumb = new File(record.thumbnailUri);
      if (thumb.exists) thumb.delete();
    } catch {
      /* cache file, nothing depends on it being gone */
    }
  }

  async retry(id: string): Promise<void> {
    this.patch(id, { status: 'paused', error: undefined });
    await this.resume(id);
  }
}

export const downloads = new DownloadManager();
