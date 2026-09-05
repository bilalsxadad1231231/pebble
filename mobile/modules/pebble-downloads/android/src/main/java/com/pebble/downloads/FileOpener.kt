package com.pebble.downloads

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import java.io.File

/**
 * Hands a downloaded file to whatever app the user wants to view it in.
 *
 * A finished download lives in app-private storage, and a `file://` uri
 * pointing there is useless to any other app - Android has thrown
 * FileUriExposedException for that since API 24. It has to be re-exposed as a
 * `content://` uri with a temporary read grant, which is what FileProvider
 * does. expo-file-system already registers one for this package, so this
 * borrows that authority rather than declaring a second.
 */
object FileOpener {

  private const val AUTHORITY_SUFFIX = ".FileSystemFileProvider"

  fun open(context: Context, rawUri: String): Boolean {
    val file = File(Uri.parse(rawUri).path ?: return false)
    if (!file.exists()) return false

    val content = FileProvider.getUriForFile(
      context,
      context.packageName + AUTHORITY_SUFFIX,
      file,
    )

    val intent = Intent(Intent.ACTION_VIEW).apply {
      // Without a type the chooser has nothing to match on and Android offers
      // the user nothing at all.
      setDataAndType(content, mimeOf(file))
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    // A chooser rather than a bare ACTION_VIEW: it stops one default player
    // silently owning every file the app ever produces.
    val chooser = Intent.createChooser(intent, "Open with").apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    return try {
      context.startActivity(chooser)
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun mimeOf(file: File): String {
    val extension = file.extension.lowercase()
    return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
      ?: if (extension in setOf("mp3", "m4a", "opus", "ogg", "aac")) "audio/*" else "video/*"
  }
}
