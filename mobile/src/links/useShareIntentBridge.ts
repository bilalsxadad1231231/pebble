import { useEffect } from 'react';
import { useShareIntent } from 'expo-share-intent';

import * as inbound from './inbound';

/**
 * Instagram -> Share -> Pebble.
 *
 * The share sheet is the platform's intended mechanism and the shortest path in
 * this app: one tap, versus copy, switch apps, paste. It is the path the empty
 * state teaches.
 *
 * Shared text usually carries a caption alongside the link, which `offer`
 * already handles - it extracts the first url rather than requiring a bare one.
 *
 * Both launch modes are covered: the app may be started *by* the intent (the
 * hook reports it on first render, and the inbound handler holds it until Home
 * mounts) or receive one while already running.
 */
export function useShareIntentBridge(): void {
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntent({
    // Without this a warm share re-delivers the previous intent on every
    // resume, re-opening a link the user has already dealt with.
    resetOnBackground: true,
  });

  useEffect(() => {
    if (error) return;
    if (!hasShareIntent) return;

    const raw = shareIntent.webUrl ?? shareIntent.text ?? null;
    inbound.offer(raw, 'share');

    // Consume it either way. A shared link we cannot handle should leave the
    // app on a normal Home screen, not re-fire on the next resume.
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent, error]);
}
