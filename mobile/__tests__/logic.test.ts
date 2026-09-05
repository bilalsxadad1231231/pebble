import { bestAudio, qualityLadder } from '../src/utils/formats';
import { dayBucket, formatBytes, formatDuration } from '../src/utils/format';
import { extractUrl, isSupported, platformOf, prettyUrl } from '../src/utils/url';
import * as inbound from '../src/links/inbound';

/**
 * The app mirrors the backend's fit-to-size guard rails so an impossible budget
 * is never offered in the UI. If the two drift, the user gets a chip that always
 * 422s - which is exactly the kind of silent divergence that already bit us once
 * when the delivery rule was duplicated.
 *
 * These constants are the ones in app/(tabs)/index.tsx.
 */
const MIN_VIDEO_BITRATE = 200_000;
const AUDIO_BITRATE = 128_000;
const OVERHEAD = 0.95;

function minimumBudgetMb(durationSeconds: number): number {
  const floorBits = (MIN_VIDEO_BITRATE + AUDIO_BITRATE) * durationSeconds;
  return Math.ceil(floorBits / (8 * 1_000_000 * OVERHEAD));
}

function videoBitrateFor(targetMb: number, duration: number): number {
  return Math.trunc((targetMb * 1_000_000 * 8 * OVERHEAD) / duration) - AUDIO_BITRATE;
}

describe('fit-to-size guard rails mirror the backend', () => {
  it('matches the backend worked example: 100 MB over 300 s', () => {
    // backend: tests/test_tier1.py::test_bitrate_matches_the_worked_example
    expect(videoBitrateFor(100, 300)).toBeCloseTo(2_405_333, -1);
  });

  it('agrees with the backend that 13 MB is the floor for 300 s', () => {
    expect(minimumBudgetMb(300)).toBe(13);
  });

  it('never suggests a size that would itself be refused', () => {
    for (const duration of [10, 30, 60, 300, 600, 1200]) {
      const smallest = minimumBudgetMb(duration);
      expect(videoBitrateFor(smallest, duration)).toBeGreaterThanOrEqual(MIN_VIDEO_BITRATE);
    }
  });

  it('makes a short clip affordable where the full source is not', () => {
    // The Tier 1 combination: 5 MB is impossible over 300 s, easy over 30 s.
    expect(videoBitrateFor(5, 300)).toBeLessThan(MIN_VIDEO_BITRATE);
    expect(videoBitrateFor(5, 30)).toBeGreaterThan(MIN_VIDEO_BITRATE);
  });
});

describe('url handling', () => {
  it('pulls a link out of shared text with a caption', () => {
    expect(
      extractUrl('Check this out! https://www.instagram.com/reel/C8xK2mQp4Rd/ so good'),
    ).toBe('https://www.instagram.com/reel/C8xK2mQp4Rd/');
  });

  it('returns null when there is no link', () => {
    expect(extractUrl('just some text')).toBeNull();
  });

  it.each([
    ['https://www.youtube.com/watch?v=abc', true],
    ['https://youtu.be/abc', true],
    ['https://m.tiktok.com/v/123', true],
    ['https://x.com/user/status/1', true],
    ['https://example.com/video.mp4', false],
    ['not-a-url', false],
  ])('recognises %s as supported=%s', (url, expected) => {
    expect(isSupported(url)).toBe(expected);
  });

  it('does not treat a lookalike domain as supported', () => {
    // `youtube.com.evil.test` must not match on a naive substring check.
    expect(isSupported('https://youtube.com.evil.test/watch?v=1')).toBe(false);
  });

  it('names the platform for a badge before the backend resolves it', () => {
    expect(platformOf('https://youtu.be/x')).toBe('youtube');
    expect(platformOf('https://www.instagram.com/reel/x')).toBe('instagram');
    expect(platformOf('https://x.com/u/status/1')).toBe('x');
  });

  it('shortens a long url without hiding which post it is', () => {
    const long = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ&list=very-long-playlist-id';
    expect(prettyUrl(long).length).toBeLessThanOrEqual(42);
    expect(prettyUrl('https://youtu.be/abc')).toBe('youtu.be/abc');
  });
});

describe('formatting', () => {
  it('formats bytes in decimal MB, matching the size budget', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(42_800_000)).toBe('42.8 MB');
    expect(formatBytes(2_100_000_000)).toBe('2.10 GB');
    expect(formatBytes(null)).toBe('—');
  });

  it('formats durations the way the clip filename does', () => {
    expect(formatDuration(45)).toBe('0:45');
    expect(formatDuration(80)).toBe('1:20');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(null)).toBe('—');
  });

  it('buckets library rows by day', () => {
    expect(dayBucket(Date.now())).toBe('TODAY');
    expect(dayBucket(Date.now() - 26 * 3600_000)).toBe('YESTERDAY');
  });
});

describe('quality ladder', () => {
  // Shaped like the real YouTube response: five renditions of the same 1080p in
  // different codecs, which is what produced five identical picker rows.
  const yt = [
    { id: '312', kind: 'video', ext: 'mp4', label: '1080p60', height: 1080, tbr: 7417, filesize: null, has_audio: false, has_video: true },
    { id: '299', kind: 'video', ext: 'mp4', label: '1080p60', height: 1080, tbr: 3247, filesize: 257_619_653, has_audio: false, has_video: true },
    { id: '303', kind: 'video', ext: 'webm', label: '1080p60', height: 1080, tbr: 2127, filesize: 168_736_189, has_audio: false, has_video: true },
    { id: '298', kind: 'video', ext: 'mp4', label: '720p60', height: 720, tbr: 1800, filesize: null, has_audio: false, has_video: true },
    { id: '302', kind: 'video', ext: 'webm', label: '720p60', height: 720, tbr: 1500, filesize: null, has_audio: false, has_video: true },
    { id: '134', kind: 'video', ext: 'mp4', label: '360p', height: 360, tbr: 600, filesize: null, has_audio: false, has_video: true },
    { id: '140', kind: 'audio', ext: 'm4a', label: '129kbps m4a', height: null, tbr: 129, abr: 129, filesize: null, has_audio: true, has_video: false },
    { id: '251', kind: 'audio', ext: 'webm', label: '160kbps webm', height: null, tbr: 160, abr: 160, filesize: null, has_audio: true, has_video: false },
  ] as any[];

  it('shows one row per resolution, not one per codec', () => {
    const ladder = qualityLadder(yt, 600);
    expect(ladder.map((f) => f.height)).toEqual([1080, 720, 360]);
  });

  it('prefers mp4 over webm so the file actually plays', () => {
    const ladder = qualityLadder(yt, 600);
    expect(ladder.every((f) => f.ext === 'mp4')).toBe(true);
    expect(ladder.find((f) => f.height === 720)?.id).toBe('298');
  });

  it('picks the best rendition within a resolution', () => {
    expect(qualityLadder(yt, 600).find((f) => f.height === 1080)?.id).toBe('312');
  });

  it('fills in a size where the extractor reported none', () => {
    // 1800 kbps video + 128 kbps merged audio over 600 s.
    const size = qualityLadder(yt, 600).find((f) => f.height === 720)?.filesize;
    expect(size).toBe(Math.round(((1800 + 128) * 1000 * 600) / 8));
  });

  it('leaves size null when duration is unknown', () => {
    expect(qualityLadder(yt, null).find((f) => f.height === 720)?.filesize).toBeNull();
  });

  it('keeps a real filesize rather than estimating over it', () => {
    const only = [yt[1]] as any[];
    expect(qualityLadder(only, 600)[0].filesize).toBe(257_619_653);
  });

  it('prefers m4a audio, which tags most cleanly', () => {
    expect(bestAudio(yt, 600)?.id).toBe('140');
  });

  it('returns null when a source has no audio stream', () => {
    expect(bestAudio(yt.filter((f) => f.kind === 'video'), 600)).toBeNull();
  });
});

// --- Inbound links -----------------------------------------------------------

describe('inbound links', () => {
  beforeEach(() => inbound.reset());

  it('accepts a bare supported url', () => {
    const result = inbound.offer('https://youtu.be/abc123', 'share');
    expect(result.accepted).toBe(true);
    if (result.accepted) expect(result.link.url).toBe('https://youtu.be/abc123');
  });

  it('pulls the url out of shared text that carries a caption', () => {
    const result = inbound.offer(
      'Check this out https://www.instagram.com/reel/xyz/ so good',
      'share',
    );
    expect(result.accepted).toBe(true);
    if (result.accepted) expect(result.link.url).toBe('https://www.instagram.com/reel/xyz/');
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['just some copied words', 'no-url'],
    ['https://example.com/video', 'unsupported'],
  ])('rejects %j as %s', (raw, reason) => {
    const result = inbound.offer(raw, 'clipboard');
    expect(result).toEqual({ accepted: false, reason });
  });

  it('notifies subscribers and holds the link for a cold start', () => {
    const seen: string[] = [];
    inbound.subscribe((link) => seen.push(link.url));

    inbound.offer('https://youtu.be/abc123', 'tile');

    expect(seen).toEqual(['https://youtu.be/abc123']);
    expect(inbound.claimPending()?.url).toBe('https://youtu.be/abc123');
    // Claiming clears it, so a remount does not reopen the same link.
    expect(inbound.claimPending()).toBeNull();
  });

  it('stops notifying after unsubscribe', () => {
    const seen: string[] = [];
    const off = inbound.subscribe((link) => seen.push(link.url));
    off();
    inbound.offer('https://youtu.be/abc123', 'share');
    expect(seen).toEqual([]);
  });

  it('remembers handled urls and forgets the oldest past the cap', () => {
    inbound.markHandled('https://youtu.be/keep');
    expect(inbound.wasHandled('https://youtu.be/keep')).toBe(true);
    expect(inbound.wasHandled('https://youtu.be/other')).toBe(false);

    for (let i = 0; i < 60; i += 1) inbound.markHandled(`https://youtu.be/v${i}`);
    expect(inbound.wasHandled('https://youtu.be/keep')).toBe(false);
    expect(inbound.wasHandled('https://youtu.be/v59')).toBe(true);
  });
});
