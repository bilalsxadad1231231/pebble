/**
 * The store's row mapping.
 *
 * COLUMNS and toValues() are two parallel lists, and the INSERT binds them by
 * position. If they ever drift, every field after the drift point is written
 * into the wrong column - silently, with no type error and no runtime throw.
 * That is what these lock down.
 */

jest.mock('expo-sqlite', () => ({}), { virtual: true });
jest.mock('expo-file-system', () => ({}), { virtual: true });
jest.mock('@react-native-async-storage/async-storage', () => ({}), { virtual: true });

import { COLUMNS, toRecord, toValues } from '../src/download/store';
import type { DownloadRecord } from '../src/download/types';

const full: DownloadRecord = {
  id: 'abc',
  title: 'A video',
  platform: 'youtube',
  qualityLabel: '1080p · MP4',
  sourceUrl: 'https://youtu.be/xyz',
  formatId: '137',
  kind: 'video',
  filename: 'a-video.mp4',
  mimeType: 'video/mp4',
  fileUri: 'file:///data/a.mp4',
  refreshToken: 'tok.sig',
  prepareProgress: 0.5,
  downloadUrl: 'https://cdn/x',
  headers: { 'User-Agent': 'test', Referer: 'https://youtube.com' },
  expiresAt: 1_700_000_000,
  jobId: 'job-1',
  delivery: 'muxed',
  totalBytes: 1024,
  bytesWritten: 512,
  status: 'downloading',
  error: undefined,
  createdAt: 1_600_000_000,
  completedAt: undefined,
  lastOpenedAt: undefined,
  galleryAssetId: undefined,
  galleryError: undefined,
  thumbnailUrl: 'https://img/x.jpg',
  thumbnailUri: 'file:///thumb.img',
  clip: { start: 10, end: 25 },
  targetSizeMb: 50,
};

/** What SQLite would hand back, given what toValues writes. */
function asRow(record: DownloadRecord): Record<string, unknown> {
  const values = toValues(record);
  return Object.fromEntries(COLUMNS.map((column, i) => [column, values[i]]));
}

describe('store row mapping', () => {
  it('binds one value per column', () => {
    expect(toValues(full)).toHaveLength(COLUMNS.length);
  });

  it('round-trips a full record', () => {
    expect(toRecord(asRow(full))).toEqual(full);
  });

  it('round-trips a record with no clip, no gallery and no file', () => {
    const bare: DownloadRecord = {
      ...full,
      fileUri: undefined,
      clip: null,
      targetSizeMb: null,
      totalBytes: null,
      jobId: null,
      status: 'completed',
      galleryAssetId: 'content://media/external/video/media/42',
    };
    expect(toRecord(asRow(bare))).toEqual(bare);
  });

  it('keeps headers intact through json', () => {
    // Without these most CDNs answer 403, so a lossy round-trip here breaks
    // resume in a way that only shows up hours later.
    expect(toRecord(asRow(full)).headers).toEqual(full.headers);
  });

  it('survives headers that are not valid json', () => {
    const row = { ...asRow(full), headers: '{not json' };
    expect(toRecord(row).headers).toEqual({});
  });

  it('treats a half-specified clip as no clip', () => {
    const row = { ...asRow(full), clip_end: null };
    expect(toRecord(row).clip).toBeNull();
  });
});
