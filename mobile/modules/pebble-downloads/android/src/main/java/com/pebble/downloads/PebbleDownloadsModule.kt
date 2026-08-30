package com.pebble.downloads

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS bridge for the download foreground service.
 *
 * The download queue lives in JavaScript; this only mirrors "is there work in
 * flight" into a foreground service so Android keeps the process running.
 */
class PebbleDownloadsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PebbleDownloads")

    /** Start the service, or update its notification if already running. */
    AsyncFunction("start") { title: String, body: String, progress: Int, indeterminate: Boolean ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val intent = Intent(context, DownloadForegroundService::class.java).apply {
        action = DownloadForegroundService.ACTION_START
        putExtra(DownloadForegroundService.EXTRA_TITLE, title)
        putExtra(DownloadForegroundService.EXTRA_BODY, body)
        putExtra(DownloadForegroundService.EXTRA_PROGRESS, progress)
        putExtra(DownloadForegroundService.EXTRA_INDETERMINATE, indeterminate)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      true
    }

    /** Tear the service down once nothing is transferring. */
    AsyncFunction("stop") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      context.startService(
        Intent(context, DownloadForegroundService::class.java).apply {
          action = DownloadForegroundService.ACTION_STOP
        },
      )
      true
    }
  }
}
