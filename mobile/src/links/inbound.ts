/**
 * The one door every entry point comes through.
 *
 * Share sheet, quick-settings tile, launcher shortcut and clipboard all end up
 * calling `offer()` with a raw string. Everything entry-point-specific stops
 * here: nothing downstream knows or cares how the link arrived.
 *
 * Deliberately free of React and React Native imports so the rules stay
 * testable in a plain node environment.
 */

import { extractUrl, isSupported } from '../utils/url';

export type EntrySource = 'paste' | 'share' | 'tile' | 'shortcut' | 'clipboard';

export type InboundLink = {
  url: string;
  source: EntrySource;
  /** Distinguishes two arrivals of the same url, so a repeat share re-fires. */
  at: number;
};

export type RejectionReason = 'empty' | 'no-url' | 'unsupported';

export type OfferResult =
  | { accepted: true; link: InboundLink }
  | { accepted: false; reason: RejectionReason };

type Listener = (link: InboundLink) => void;

const listeners = new Set<Listener>();

/**
 * The most recent accepted link, kept so an entry point that fires during a
 * cold start is not lost. The app is launched *by* the share intent, which
 * means the intent can arrive before any screen has mounted to hear it.
 */
let pending: InboundLink | null = null;

/**
 * Urls the user has already acted on or dismissed. Only the clipboard consults
 * this - an explicit share of the same link twice is a deliberate repeat and
 * must still work.
 */
const handled = new Set<string>();

/** Bounded so a long session cannot grow this without limit. */
const HANDLED_LIMIT = 50;

/**
 * The url, or why this string cannot become one. One rule, two callers.
 *
 * Tagged rather than returning `string | RejectionReason`, because both arms of
 * that union are strings and nothing at the call site can tell them apart.
 */
function validate(
  raw: string | null | undefined,
): { ok: true; url: string } | { ok: false; reason: RejectionReason } {
  if (!raw || !raw.trim()) return { ok: false, reason: 'empty' };
  const url = extractUrl(raw) ?? (raw.trim().startsWith('http') ? raw.trim() : null);
  if (!url) return { ok: false, reason: 'no-url' };
  if (!isSupported(url)) return { ok: false, reason: 'unsupported' };
  return { ok: true, url };
}

/**
 * Validate a raw string and, if it holds a supported link, broadcast it.
 *
 * Returns why it was rejected rather than throwing, because the tile and the
 * shortcut need to show a toast and exit rather than surface an error screen.
 */
export function offer(raw: string | null | undefined, source: EntrySource): OfferResult {
  const checked = validate(raw);
  if (!checked.ok) return { accepted: false, reason: checked.reason };

  const link: InboundLink = { url: checked.url, source, at: Date.now() };
  pending = link;
  listeners.forEach((listener) => listener(link));
  return { accepted: true, link };
}

/**
 * Take the link waiting from a cold start, if any.
 *
 * Claiming clears it: a link should open the format picker once, not again on
 * every remount.
 */
export function claimPending(): InboundLink | null {
  const link = pending;
  pending = null;
  return link;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Record that a url was downloaded or dismissed, so it is not offered again. */
export function markHandled(url: string): void {
  if (handled.size >= HANDLED_LIMIT) {
    // Sets iterate in insertion order, so this drops the oldest.
    const oldest = handled.values().next();
    if (!oldest.done) handled.delete(oldest.value);
  }
  handled.add(url);
}

export function wasHandled(url: string): boolean {
  return handled.has(url);
}

/**
 * The validation half of `offer`, without the broadcast.
 *
 * The clipboard needs to know whether a string *could* be offered before it
 * shows anything, since reading the clipboard and then silently doing nothing
 * leaves the Android 12 paste toast unexplained.
 */
export function offerable(raw: string | null | undefined): string | null {
  const checked = validate(raw);
  return checked.ok ? checked.url : null;
}

/** Test seam. */
export function reset(): void {
  listeners.clear();
  handled.clear();
  pending = null;
}
