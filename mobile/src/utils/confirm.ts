import { Alert } from 'react-native';

/**
 * A yes/no gate in front of anything that destroys work.
 *
 * Every destructive action in this app is one tap on a small icon, and none of
 * them can be undone - a cancelled transfer discards its partial file, a
 * deleted download is gone from disk. Asking first is the only thing standing
 * between a mis-tap and losing a finished file.
 */
export function confirmDestructive({
  title,
  message,
  confirmLabel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}): void {
  Alert.alert(title, message, [
    // Cancel first so it is the one under the thumb, and the default on a
    // back-gesture dismissal.
    { text: 'Keep', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
