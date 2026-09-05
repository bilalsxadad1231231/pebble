package com.pebble.downloads

import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast

/**
 * Reads the clipboard and hands the link to the app.
 *
 * This exists because of a hard platform rule: since Android 10 only the
 * focused foreground app may read the clipboard. A TileService is not an
 * activity and has no focus, so it gets null. An activity does, which is why
 * the tile and the launcher shortcut both bounce through here.
 *
 * It has no UI and finishes immediately, so what the user sees is the tile
 * flash and the app open on the format picker.
 */
class PasteAndDownloadActivity : Activity() {

  companion object {
    /** Matches the app's `scheme` in app.json. */
    const val SCHEME = "pebble"
    const val HOST = "link"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val text = readClipboard()
    if (text.isNullOrBlank()) {
      // Nothing to act on. A toast is the whole response - launching the app
      // onto an empty Home screen would be a worse answer than saying so.
      Toast.makeText(this, "Copy a video link first", Toast.LENGTH_SHORT).show()
      finish()
      return
    }

    // Whether the text is a *supported* link is decided in JavaScript, next to
    // every other entry point's validation, rather than duplicated in Kotlin.
    val deepLink = Uri.Builder()
      .scheme(SCHEME)
      .authority(HOST)
      .appendQueryParameter("url", text)
      .build()

    startActivity(
      Intent(Intent.ACTION_VIEW, deepLink).apply {
        setPackage(packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      },
    )
    finish()
  }

  private fun readClipboard(): String? {
    val manager = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return null
    val clip = manager.primaryClip ?: return null
    if (clip.itemCount == 0) return null
    return clip.getItemAt(0).coerceToText(this)?.toString()
  }
}
