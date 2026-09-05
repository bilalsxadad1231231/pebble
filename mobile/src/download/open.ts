import { Alert } from 'react-native';

import PebbleDownloads from '../../modules/pebble-downloads';

/**
 * Opening a finished download in another app.
 *
 * The Library is otherwise a dead end: a file you cannot play is not really
 * saved. Pebble has no player of its own yet, so this hands the file to
 * whatever the user already uses, which is the honest interim answer.
 */
export async function openDownload(fileUri: string | undefined): Promise<void> {
  if (!fileUri) {
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

  const opened = await PebbleDownloads.openFile(fileUri).catch(() => false);
  if (!opened) {
    Alert.alert(
      'No app can open this',
      'Nothing on this phone is registered to play this file type.',
    );
  }
}
