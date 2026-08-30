/** Formatting helpers. Shared so a byte count never renders two ways. */

/** MB is 10^6 here, matching the backend budget maths and what file managers show. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

/** `M:SS`, or `H:MM:SS` past an hour. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds)) return '—';
  const total = Math.max(0, Math.round(seconds));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/** Day buckets for the Library's section headers. */
export function dayBucket(timestamp: number): string {
  const then = new Date(timestamp);
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (timestamp >= midnight) return 'TODAY';
  if (timestamp >= midnight - 86_400_000) return 'YESTERDAY';
  return then
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    .toUpperCase();
}
