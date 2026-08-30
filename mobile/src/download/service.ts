import PebbleDownloads from '../../modules/pebble-downloads';

import type { DownloadRecord } from './types';
import { formatBytes } from '../utils/format';

/**
 * Mirrors the queue's state into the Android foreground service.
 *
 * Android stops an app's work shortly after it leaves the foreground, so
 * without this a transfer dies the moment the user switches apps. The service
 * is only alive while something is actually in flight - an ongoing notification
 * with nothing behind it is just noise.
 */

let running = false;
let lastSummary = '';

/** Records that justify keeping the process alive. */
function inFlight(records: DownloadRecord[]): DownloadRecord[] {
  return records.filter(
    (r) => r.status === 'downloading' || r.status === 'preparing' || r.status === 'queued',
  );
}

export function syncForegroundService(records: DownloadRecord[]): void {
  // Null in Expo Go, where no native module exists. The app still works, it
  // just cannot survive backgrounding.
  if (!PebbleDownloads) return;

  const active = inFlight(records);

  if (active.length === 0) {
    if (running) {
      running = false;
      lastSummary = '';
      void PebbleDownloads.stop();
    }
    return;
  }

  const lead = active[0];
  const others = active.length - 1;

  const title = others > 0 ? `Downloading ${active.length} files` : lead.title;
  const body = describe(lead) + (others > 0 ? ` · +${others} more` : '');

  // Server-side preparation has no byte count to report against.
  const indeterminate = lead.status !== 'downloading' || !lead.totalBytes;
  const progress = indeterminate
    ? 0
    : Math.round((lead.bytesWritten / (lead.totalBytes || 1)) * 100);

  // The notification is rate-limited by content, not by time: progress events
  // fire far more often than the percentage actually changes.
  const summary = `${title}|${body}|${progress}|${indeterminate}`;
  if (summary === lastSummary) return;
  lastSummary = summary;
  running = true;

  void PebbleDownloads.start(title, body, progress, indeterminate);
}

function describe(record: DownloadRecord): string {
  switch (record.status) {
    case 'preparing':
      return record.prepareProgress > 0
        ? `Preparing ${Math.round(record.prepareProgress * 100)}%`
        : 'Preparing on server…';
    case 'queued':
      return 'Queued';
    default:
      return record.totalBytes
        ? `${formatBytes(record.bytesWritten)} of ${formatBytes(record.totalBytes)}`
        : formatBytes(record.bytesWritten);
  }
}
