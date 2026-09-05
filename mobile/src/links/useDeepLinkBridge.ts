import { useEffect } from 'react';
import * as Linking from 'expo-linking';

import * as inbound from './inbound';

/**
 * Receives links from the native entry points: the quick-settings tile and the
 * launcher shortcut.
 *
 * Both bounce through `PasteAndDownloadActivity`, which reads the clipboard on
 * their behalf (only a focused activity may) and re-launches the app with
 * `pebble://link?url=...`. Validation deliberately does not happen in Kotlin -
 * it happens here, next to every other entry point's, so there is one list of
 * supported hosts rather than two that can drift.
 */
export function useDeepLinkBridge(): void {
  useEffect(() => {
    const handle = (incoming: string | null) => {
      if (!incoming) return;
      const { hostname, queryParams } = Linking.parse(incoming);
      if (hostname !== 'link') return;

      const raw = queryParams?.url;
      inbound.offer(typeof raw === 'string' ? raw : null, 'tile');
    };

    // Cold start: the app was launched *by* the tile, so the url is already on
    // the initial intent and no event will ever fire for it.
    void Linking.getInitialURL().then(handle);

    const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => subscription.remove();
  }, []);
}
