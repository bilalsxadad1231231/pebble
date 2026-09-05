import { requireOptionalNativeModule } from 'expo';

type PebbleDownloadsModule = {
  start(title: string, body: string, progress: number, indeterminate: boolean): Promise<boolean>;
  stop(): Promise<boolean>;
  /** Opens a downloaded file in another app. False when nothing can show it. */
  openFile(uri: string): Promise<boolean>;
};

/**
 * Optional on purpose: the native module only exists in a development or
 * production build. In Expo Go this is null and the app runs without the
 * service rather than crashing.
 */
export default requireOptionalNativeModule<PebbleDownloadsModule>('PebbleDownloads');
