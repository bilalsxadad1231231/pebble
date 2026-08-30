import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';

/**
 * Publishing finished downloads to the device gallery.
 *
 * Without this a download exists only inside the app's private storage - not in
 * the Gallery, not in a music player, not in any other app's file picker. For a
 * downloader that makes the file effectively unreachable.
 */

export const ALBUM_NAME = 'Pebble';

/** Cached so a batch of downloads does not re-resolve the album each time. */
let albumPromise: Promise<Album | null> | null = null;

export class GalleryPermissionError extends Error {
  constructor() {
    super('Pebble needs permission to save files to your gallery.');
    this.name = 'GalleryPermissionError';
  }
}

/**
 * Ask for gallery write access.
 *
 * Android 13+ replaced the single storage permission with per-type grants, so
 * the request names exactly the media kinds this app writes.
 */
export async function ensurePermission(): Promise<boolean> {
  const { granted } = await requestPermissionsAsync(false, ['photo', 'video', 'audio']);
  return granted;
}

async function resolveAlbum(firstAsset: Asset): Promise<Album | null> {
  const existing = await Album.get(ALBUM_NAME);
  if (existing) return existing;
  // An album cannot be created empty, so the first saved file seeds it.
  return Album.create(ALBUM_NAME, [firstAsset], false);
}

/**
 * Copy a finished download into the gallery.
 *
 * Returns the asset id (a `content://` uri on Android) so the record can prove
 * it was published, or throws so the caller can surface a real reason.
 */
export async function publish(fileUri: string): Promise<string> {
  if (!(await ensurePermission())) throw new GalleryPermissionError();

  const asset = await Asset.create(fileUri);

  // Album placement is a nicety - a failure here must not lose the asset, which
  // is already in the gallery by this point.
  try {
    if (!albumPromise) {
      albumPromise = resolveAlbum(asset);
      await albumPromise;
    } else {
      const album = await albumPromise;
      if (album) await album.add(asset);
    }
  } catch {
    albumPromise = null;
  }

  return asset.id;
}
