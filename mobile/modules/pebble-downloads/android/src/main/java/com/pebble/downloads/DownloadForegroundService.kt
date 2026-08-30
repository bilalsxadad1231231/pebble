package com.pebble.downloads

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Keeps the process alive while transfers are running.
 *
 * Android stops an app's work shortly after it leaves the foreground, which for
 * a downloader means a transfer dies the moment the user switches apps. A
 * foreground service with an ongoing notification is the only sanctioned way to
 * keep that work running, and the notification doubles as the progress readout.
 */
class DownloadForegroundService : Service() {

  companion object {
    const val CHANNEL_ID = "pebble.downloads"
    const val NOTIFICATION_ID = 4711

    const val ACTION_START = "com.pebble.downloads.START"
    const val ACTION_UPDATE = "com.pebble.downloads.UPDATE"
    const val ACTION_STOP = "com.pebble.downloads.STOP"

    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val EXTRA_PROGRESS = "progress"
    const val EXTRA_INDETERMINATE = "indeterminate"
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopForegroundCompat()
        stopSelf()
        return START_NOT_STICKY
      }
      else -> {
        val notification = buildNotification(
          title = intent?.getStringExtra(EXTRA_TITLE) ?: "Downloading",
          body = intent?.getStringExtra(EXTRA_BODY) ?: "",
          progress = intent?.getIntExtra(EXTRA_PROGRESS, 0) ?: 0,
          indeterminate = intent?.getBooleanExtra(EXTRA_INDETERMINATE, false) ?: false,
        )
        startForegroundCompat(notification)
      }
    }
    // Do not restart with a null intent: the JS side owns the queue and will
    // start the service again itself if there is still work to do.
    return START_NOT_STICKY
  }

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // Android 10+ requires the service type to be declared at start time, and
      // Android 14 rejects the call outright without it.
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  @Suppress("DEPRECATION")
  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      stopForeground(true)
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      "Downloads",
      // LOW keeps it silent - a progress bar should not buzz on every update.
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Shows download progress while Pebble is in the background"
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(
    title: String,
    body: String,
    progress: Int,
    indeterminate: Boolean,
  ): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    return builder
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setProgress(100, progress.coerceIn(0, 100), indeterminate)
      .apply { launch?.let { setContentIntent(it) } }
      .build()
  }
}
