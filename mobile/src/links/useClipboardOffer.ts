import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import * as inbound from './inbound';

/**
 * The safety net entry point: the user copies a link elsewhere, opens Pebble
 * normally, and finds it already waiting.
 *
 * Since Android 10 an app may read the clipboard only while it is the focused
 * foreground app, so this can only run on the `active` transition - a
 * background service reading the clipboard is not a thing that exists. Android
 * 12+ also shows a system toast on every read, which is why this never
 * auto-starts a download: the toast has to be explained by something the user
 * can see appear on screen.
 */
export function useClipboardOffer(): {
  url: string | null;
  dismiss: () => void;
  accept: () => void;
} {
  const [url, setUrl] = useState<string | null>(null);

  /** The last value read, so returning to the app does not re-read needlessly. */
  const lastSeen = useRef<string | null>(null);

  const check = useCallback(async () => {
    let text: string;
    try {
      text = await Clipboard.getStringAsync();
    } catch {
      // A denied or empty clipboard is not an error worth surfacing.
      return;
    }

    if (text === lastSeen.current) return;
    lastSeen.current = text;

    const found = inbound.offerable(text);
    // Already downloaded or already dismissed - offering it again is nagging.
    setUrl(found && !inbound.wasHandled(found) ? found : null);
  }, []);

  useEffect(() => {
    void check();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void check();
    });
    return () => subscription.remove();
  }, [check]);

  const dismiss = useCallback(() => {
    if (url) inbound.markHandled(url);
    setUrl(null);
  }, [url]);

  const accept = useCallback(() => {
    if (!url) return;
    setUrl(null);
    inbound.offer(url, 'clipboard');
  }, [url]);

  return { url, dismiss, accept };
}
