import type { FormatOption } from '../api/types';

/**
 * Turn a raw format list into the quality ladder a user expects.
 *
 * YouTube returns dozens of renditions - the same 1080p encoded as avc1, vp9 and
 * av01, plus HDR and high-fps variants. Listing them verbatim gives five rows
 * that all read "1080p · MP4". People think in resolutions, so this collapses to
 * one row per resolution and picks the best rendition behind it.
 */

/** Lower sorts first: mp4/avc1 plays everywhere on Android, av01 often does not. */
function containerRank(format: FormatOption): number {
  if (format.ext === 'mp4') return 0;
  if (format.ext === 'webm') return 1;
  return 2;
}

/** Bytes implied by the bitrate when the extractor reports no filesize. */
export function estimateSize(
  format: FormatOption,
  durationSeconds: number | null,
): number | null {
  if (format.filesize) return format.filesize;
  if (!durationSeconds || !format.tbr) return null;
  // tbr is kbps; a video-only stream still needs an audio track merged in.
  const kbps = format.tbr + (format.has_audio ? 0 : 128);
  return Math.round((kbps * 1000 * durationSeconds) / 8);
}

/**
 * One entry per resolution, best rendition first.
 *
 * Within a resolution, prefer a playable container over a marginally smaller
 * exotic one - a 20% saving is worth nothing if the file will not open.
 */
export function qualityLadder(
  formats: FormatOption[],
  durationSeconds: number | null,
  limit = 6,
): FormatOption[] {
  const byHeight = new Map<number, FormatOption>();

  for (const format of formats) {
    if (format.kind !== 'video' || !format.height) continue;

    const current = byHeight.get(format.height);
    if (!current) {
      byHeight.set(format.height, format);
      continue;
    }

    const better =
      containerRank(format) - containerRank(current) ||
      // Same container: the higher bitrate is the better rendition.
      (current.tbr ?? 0) - (format.tbr ?? 0);
    if (better < 0) byHeight.set(format.height, format);
  }

  return [...byHeight.values()]
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
    .slice(0, limit)
    .map((format) => ({
      ...format,
      // Fill the gap so the picker never shows an em dash where a size belongs.
      filesize: estimateSize(format, durationSeconds),
    }));
}

/** Best audio stream, preferring a container that carries tags cleanly. */
export function bestAudio(
  formats: FormatOption[],
  durationSeconds: number | null,
): FormatOption | null {
  const audio = formats.filter((f) => f.kind === 'audio');
  if (audio.length === 0) return null;

  const best = audio.slice().sort((a, b) => {
    // m4a first: it is what an mp3/m4a export transcodes from most cleanly.
    const rank = (f: FormatOption) => (f.ext === 'm4a' ? 0 : f.ext === 'webm' ? 1 : 2);
    return rank(a) - rank(b) || (b.abr ?? 0) - (a.abr ?? 0);
  })[0];

  return { ...best, filesize: estimateSize(best, durationSeconds) };
}
