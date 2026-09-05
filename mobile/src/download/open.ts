import { Alert } from 'react-native';

import PebbleDownloads from '../../modules/pebble-downloads';
import type { DownloadRecord } from './types';

/**
 * Opening a finished download in another app.
 *
 * The Library is otherwise a dead end: a file you cannot play is not really
 * saved. Pebble has no player of its own yet, so this hands the file to
 * whatever the user already uses, which is the honest interim answer.
 */
export async function openDownload(record: DownloadRecord): Promise<void> {
  // Prefer the gallery asset: once published it is the only copy, and its
  // content:// uri is directly viewable. The staging file is the fallback for
  // downloads that never made it into the gallery.
  const uri = record.galleryAssetId ?? record.fileUri;

  if (!uri) {
    Alert.alert('Nothing to open', 'This download has no file on the device.');
    return;
  }

  // Null in Expo Go, where the native module does not exist.
  if (!PebbleDownloads?.openFile) {
    Alert.alert(
      'Not available here',
      'Opening files needs a development build rather than Expo Go.',
    );
    return;
  }

  const opened = await PebbleDownloads.openFile(uri).catch(() => false);
  if (!opened) {
    Alert.alert(
      'No app can open this',
      'Nothing on this phone is registered to play this file type.',
    );
  }
}
