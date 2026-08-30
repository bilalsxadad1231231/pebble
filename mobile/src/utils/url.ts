/**
 * Link handling shared by every entry point - paste, share intent, quick
 * settings tile and clipboard. Everything normalises to a url string here so
 * nothing downstream needs to know how the link arrived.
 */

const SUPPORTED = [
  'youtube.com', 'youtu.be', 'instagram.com', 'facebook.com', 'fb.watch',
  'tiktok.com', 'twitter.com', 'x.com', 'reddit.com', 'pinterest.com',
  'vimeo.com', 'dailymotion.com', 'soundcloud.com',
];

/** Pull the first url out of shared text, which often carries a caption too. */
export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0] : null;
}

export function isSupported(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return SUPPORTED.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

/** Best-effort platform name for a badge, before the backend has resolved it. */
export function platformOf(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('youtu')) return 'youtube';
    if (host.includes('instagram')) return 'instagram';
    if (host.includes('tiktok')) return 'tiktok';
    if (host.includes('facebook') || host.includes('fb.watch')) return 'facebook';
    if (host.includes('twitter') || host === 'x.com') return 'x';
    return host.split('.')[0];
  } catch {
    return 'link';
  }
}

/** Trim a url to something that fits one line without hiding which post it is. */
export function prettyUrl(url: string, max = 42): string {
  const bare = url.replace(/^https?:\/\/(www\.)?/, '');
  return bare.length <= max ? bare : `${bare.slice(0, max - 1)}…`;
}
