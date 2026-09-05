import type * as MediaLibraryTypes from 'expo-media-library';

/**
 * Publishing finished downloads to the device gallery.
 *
 * Without this a download exists only inside the app's private storage - not in
 * the Gallery, not in a music player, not in any other app's file picker. For a
 * downloader that makes the file effectively unreachable.
 *
 * The module is loaded lazily and defensively. `expo-media-library` throws at
 * *import* time when its native module is absent (Expo Go, or a dev build made
 * before the dependency was added), and a top-level import of it would take the
 * whole app down at startup rather than costing us one optional feature.
 */

export const ALBUM_NAME = 'Pebble';

type MediaLibrary = typeof MediaLibraryTypes;

/** `undefined` = not yet attempted, `null` = unavailable on this build. */
let cachedLib: MediaLibrary | null | undefined;

/** Cached so a batch of downloads does not re-resolve the album each time. */
let albumPromise: Promise<MediaLibraryTypes.Album | null> | null = null;

export class GalleryUnavailableError extends Error {
  constructor() {
    super('Saving to the gallery needs a development build, not Expo Go.');
    this.name = 'GalleryUnavailableError';
  }
}

export class GalleryPermissionError extends Error {
  constructor() {
    super('Pebble needs permission to save files to your gallery.');
    this.name = 'GalleryPermissionError';
  }
}

function mediaLibrary(): MediaLibrary | null {
  if (cachedLib !== undefined) return cachedLib;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedLib = require('expo-media-library') as MediaLibrary;
  } catch {
    cachedLib = null;
  }
  return cachedLib;
}

/** Whether this build can publish to the gallery at all. */
export function isAvailable(): boolean {
  return mediaLibrary() !== null;
}

/**
 * Ask for gallery write access.
 *
 * Android 13+ replaced the single storage permission with per-type grants, so
 * the request names exactly the media kinds this app writes.
 */
export async function ensurePermission(): Promise<boolean> {
  const lib = mediaLibrary();
  if (!lib) return false;
  const { granted } = await lib.requestPermissionsAsync(false, ['photo', 'video', 'audio']);
  return granted;
}

async function resolveAlbum(
  lib: MediaLibrary,
  firstAsset: MediaLibraryTypes.Asset,
): Promise<MediaLibraryTypes.Album | null> {
  const existing = await lib.Album.get(ALBUM_NAME);
  if (existing) return existing;
  // An album cannot be created empty, so the first saved file seeds it.
  //
  // moveAssets must be true: with false, Android *copies* the asset into the
  // album and leaves the original sitting outside it, so the first download of
  // every install would occupy two slots in the gallery instead of one.
  return lib.Album.create(ALBUM_NAME, [firstAsset], true);
}

/**
 * Copy a finished download into the gallery.
 *
 * Returns the asset id (a `content://` uri on Android) so the record can prove
 * it was published, or throws so the caller can surface a real reason.
 */
export async function publish(fileUri: string): Promise<string> {
  const lib = mediaLibrary();
  if (!lib) throw new GalleryUnavailableError();
  if (!(await ensurePermission())) throw new GalleryPermissionError();

  const asset = await lib.Asset.create(fileUri);

  // Album placement is a nicety - a failure here must not lose the asset, which
  // is already in the gallery by this point.
  try {
    if (!albumPromise) {
      albumPromise = resolveAlbum(lib, asset);
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

/**
 * Remove a published asset from the device's media store.
 *
 * Needed because the gallery copy is the *only* copy once a download has been
 * published - the staging file in app storage is deleted at that point - so
 * deleting a download that skipped this would delete nothing at all.
 *
 * On Android 11+ the system shows its own confirmation dialog before removing
 * anything from shared storage; that prompt is the platform's, not ours.
 */
export async function unpublish(assetId: string): Promise<void> {
  const lib = mediaLibrary();
  if (!lib) throw new GalleryUnavailableError();
  await new lib.Asset(assetId).delete();
}
