import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DownloadPauseState } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import type { DeliveryMode } from '../api/types';
import type { DownloadRecord, DownloadStatus } from './types';

/**
 * Durable storage for the download library.
 *
 * Replaces a single AsyncStorage key holding the whole list as JSON. That
 * worked, but it rewrote every record on every progress tick, could not be
 * queried, and had no schema - which is why duplicate detection and storage
 * reclaim were both blocked on "we need a real store first".
 *
 * The manager still keeps the working set in memory; this is what makes it
 * survive, one row at a time.
 */

const DB_NAME = 'pebble.db';
const SCHEMA_VERSION = 1;

/** Keys the old AsyncStorage implementation used, migrated then removed. */
const LEGACY_STORE_KEY = 'pebble.downloads.v1';
const LEGACY_PAUSE_KEY = 'pebble.pausestate.v1';

let database: SQLite.SQLiteDatabase | null = null;

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;
  database = await SQLite.openDatabaseAsync(DB_NAME);
  await migrate(database);
  return database;
}

async function migrate(connection: SQLite.SQLiteDatabase): Promise<void> {
  // WAL keeps frequent progress writes from blocking reads.
  await connection.execAsync('PRAGMA journal_mode = WAL;');

  const row = await connection.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  if ((row?.user_version ?? 0) >= SCHEMA_VERSION) return;

  await connection.execAsync(`
    CREATE TABLE IF NOT EXISTS downloads (
      id               TEXT PRIMARY KEY NOT NULL,
      title            TEXT NOT NULL,
      platform         TEXT NOT NULL,
      quality_label    TEXT NOT NULL,
      source_url       TEXT NOT NULL DEFAULT '',
      format_id        TEXT NOT NULL DEFAULT '',
      kind             TEXT NOT NULL,
      filename         TEXT NOT NULL,
      mime_type        TEXT NOT NULL,
      file_uri         TEXT,
      refresh_token    TEXT NOT NULL,
      prepare_progress REAL NOT NULL DEFAULT 0,
      download_url     TEXT NOT NULL,
      headers          TEXT NOT NULL DEFAULT '{}',
      expires_at       INTEGER NOT NULL DEFAULT 0,
      job_id           TEXT,
      delivery         TEXT NOT NULL,
      total_bytes      INTEGER,
      bytes_written    INTEGER NOT NULL DEFAULT 0,
      status           TEXT NOT NULL,
      error            TEXT,
      created_at       INTEGER NOT NULL,
      completed_at     INTEGER,
      last_opened_at   INTEGER,
      gallery_asset_id TEXT,
      gallery_error    TEXT,
      thumbnail_url    TEXT,
      thumbnail_uri    TEXT,
      clip_start       REAL,
      clip_end         REAL,
      target_size_mb   INTEGER
    );

    CREATE INDEX IF NOT EXISTS downloads_identity
      ON downloads (source_url, format_id, clip_start, clip_end);

    CREATE INDEX IF NOT EXISTS downloads_created ON downloads (created_at DESC);

    CREATE TABLE IF NOT EXISTS pause_states (
      id    TEXT PRIMARY KEY NOT NULL,
      state TEXT NOT NULL
    );
  `);

  await connection.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

// ---------------------------------------------------------------- row mapping

type Row = Record<string, unknown>;

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function toRecord(row: Row): DownloadRecord {
  const clipStart = (row.clip_start as number | null) ?? null;
  const clipEnd = (row.clip_end as number | null) ?? null;

  return {
    id: row.id as string,
    title: row.title as string,
    platform: row.platform as string,
    qualityLabel: row.quality_label as string,
    sourceUrl: (row.source_url as string) ?? '',
    formatId: (row.format_id as string) ?? '',
    kind: row.kind as 'video' | 'audio',
    filename: row.filename as string,
    mimeType: row.mime_type as string,
    fileUri: (row.file_uri as string | null) ?? undefined,
    refreshToken: row.refresh_token as string,
    prepareProgress: (row.prepare_progress as number) ?? 0,
    downloadUrl: row.download_url as string,
    headers: safeJson<Record<string, string>>(row.headers as string, {}),
    expiresAt: (row.expires_at as number) ?? 0,
    jobId: (row.job_id as string | null) ?? null,
    delivery: row.delivery as DeliveryMode,
    totalBytes: (row.total_bytes as number | null) ?? null,
    bytesWritten: (row.bytes_written as number) ?? 0,
    status: row.status as DownloadStatus,
    error: (row.error as string | null) ?? undefined,
    createdAt: row.created_at as number,
    completedAt: (row.completed_at as number | null) ?? undefined,
    lastOpenedAt: (row.last_opened_at as number | null) ?? undefined,
    galleryAssetId: (row.gallery_asset_id as string | null) ?? undefined,
    galleryError: (row.gallery_error as string | null) ?? undefined,
    thumbnailUrl: (row.thumbnail_url as string | null) ?? undefined,
    thumbnailUri: (row.thumbnail_uri as string | null) ?? undefined,
    clip: clipStart !== null && clipEnd !== null ? { start: clipStart, end: clipEnd } : null,
    targetSizeMb: (row.target_size_mb as number | null) ?? null,
  };
}

export function toValues(record: DownloadRecord): SQLite.SQLiteBindValue[] {
  return [
    record.id,
    record.title,
    record.platform,
    record.qualityLabel,
    record.sourceUrl ?? '',
    record.formatId ?? '',
    record.kind,
    record.filename,
    record.mimeType,
    record.fileUri ?? null,
    record.refreshToken,
    record.prepareProgress,
    record.downloadUrl,
    JSON.stringify(record.headers ?? {}),
    record.expiresAt,
    record.jobId,
    record.delivery,
    record.totalBytes,
    record.bytesWritten,
    record.status,
    record.error ?? null,
    record.createdAt,
    record.completedAt ?? null,
    record.lastOpenedAt ?? null,
    record.galleryAssetId ?? null,
    record.galleryError ?? null,
    record.thumbnailUrl ?? null,
    record.thumbnailUri ?? null,
    record.clip?.start ?? null,
    record.clip?.end ?? null,
    record.targetSizeMb ?? null,
  ];
}

export const COLUMNS = [
  'id', 'title', 'platform', 'quality_label', 'source_url', 'format_id', 'kind',
  'filename', 'mime_type', 'file_uri', 'refresh_token', 'prepare_progress',
  'download_url', 'headers', 'expires_at', 'job_id', 'delivery', 'total_bytes',
  'bytes_written', 'status', 'error', 'created_at', 'completed_at',
  'last_opened_at', 'gallery_asset_id', 'gallery_error', 'thumbnail_url',
  'thumbnail_uri', 'clip_start', 'clip_end', 'target_size_mb',
];

const UPSERT = `INSERT OR REPLACE INTO downloads (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(
  () => '?',
).join(', ')});`;

// --------------------------------------------------------------------- public

export async function loadRecords(): Promise<DownloadRecord[]> {
  const connection = await db();
  const rows = await connection.getAllAsync<Row>(
    'SELECT * FROM downloads ORDER BY created_at DESC;',
  );
  return rows.map(toRecord);
}

/** One row, not the whole library - which is the point of leaving JSON behind. */
export async function saveRecord(record: DownloadRecord): Promise<void> {
  const connection = await db();
  await connection.runAsync(UPSERT, toValues(record));
}

export async function deleteRecord(id: string): Promise<void> {
  const connection = await db();
  await connection.runAsync('DELETE FROM downloads WHERE id = ?;', id);
  await connection.runAsync('DELETE FROM pause_states WHERE id = ?;', id);
}

export async function loadPauseStates(): Promise<Map<string, DownloadPauseState>> {
  const connection = await db();
  const rows = await connection.getAllAsync<{ id: string; state: string }>(
    'SELECT id, state FROM pause_states;',
  );
  const out = new Map<string, DownloadPauseState>();
  for (const row of rows) {
    const parsed = safeJson<DownloadPauseState | null>(row.state, null);
    if (parsed) out.set(row.id, parsed);
  }
  return out;
}

export async function savePauseState(id: string, state: DownloadPauseState): Promise<void> {
  const connection = await db();
  await connection.runAsync(
    'INSERT OR REPLACE INTO pause_states (id, state) VALUES (?, ?);',
    id,
    JSON.stringify(state),
  );
}

export async function deletePauseState(id: string): Promise<void> {
  const connection = await db();
  await connection.runAsync('DELETE FROM pause_states WHERE id = ?;', id);
}

/**
 * An existing download of the same thing, if there is one.
 *
 * Keyed on what actually identifies a download rather than on the url, which
 * has many forms for the same post. Clip bounds are part of the key: a
 * thirty-second cut is not a duplicate of the full video.
 */
export async function findExisting(identity: {
  sourceUrl: string;
  formatId: string;
  clip?: { start: number; end: number } | null;
}): Promise<DownloadRecord | null> {
  const connection = await db();
  // `IS` rather than `=` so a null clip matches a null clip; `= NULL` is never
  // true in SQL and would make every un-clipped download look unique.
  const row = await connection.getFirstAsync<Row>(
    `SELECT * FROM downloads
      WHERE source_url = ? AND format_id = ?
        AND clip_start IS ? AND clip_end IS ?
      ORDER BY created_at DESC LIMIT 1;`,
    identity.sourceUrl,
    identity.formatId,
    identity.clip?.start ?? null,
    identity.clip?.end ?? null,
  );
  return row ? toRecord(row) : null;
}

/** What the library costs the user, for a storage screen. */
export async function usage(): Promise<{
  count: number;
  bytes: number;
  neverOpened: number;
}> {
  const connection = await db();
  const row = await connection.getFirstAsync<{
    count: number;
    bytes: number | null;
    never_opened: number;
  }>(
    `SELECT COUNT(*) AS count,
            SUM(COALESCE(total_bytes, bytes_written)) AS bytes,
            SUM(CASE WHEN last_opened_at IS NULL THEN 1 ELSE 0 END) AS never_opened
       FROM downloads WHERE status = 'completed';`,
  );
  return {
    count: row?.count ?? 0,
    bytes: row?.bytes ?? 0,
    neverOpened: row?.never_opened ?? 0,
  };
}

/**
 * Bring across anything the AsyncStorage version left behind.
 *
 * The legacy keys are removed only after every row is written, so an
 * interrupted migration retries on the next launch rather than half-completing.
 */
export async function migrateLegacy(): Promise<number> {
  const [[, rawRecords], [, rawPause]] = await AsyncStorage.multiGet([
    LEGACY_STORE_KEY,
    LEGACY_PAUSE_KEY,
  ]);
  if (!rawRecords && !rawPause) return 0;

  const records = safeJson<DownloadRecord[]>(rawRecords, []);
  for (const record of records) {
    await saveRecord({
      ...record,
      // Written before the schema knew about these.
      sourceUrl: record.sourceUrl ?? '',
      formatId: record.formatId ?? '',
      headers: record.headers ?? {},
    });
  }

  const pauses = safeJson<[string, DownloadPauseState][]>(rawPause, []);
  for (const [id, state] of pauses) await savePauseState(id, state);

  await AsyncStorage.multiRemove([LEGACY_STORE_KEY, LEGACY_PAUSE_KEY]);
  return records.length;
}
