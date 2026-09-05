package com.pebble.downloads

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * The quick-settings tile: copy a link, swipe down, tap.
 *
 * Almost nothing in this category uses this. It gets the same moment a floating
 * bubble would - the user has just copied a link and wants it saved - with none
 * of the overlay permission, the battery cost, or the "draw over other apps"
 * dialog that makes users bounce.
 *
 * The tile itself cannot read the clipboard (no focus), so all it does is
 * launch the activity that can.
 */
class PebbleTileService : TileService() {

  override fun onStartListening() {
    super.onStartListening()
    qsTile?.apply {
      state = Tile.STATE_INACTIVE
      label = "Paste & Download"
      updateTile()
    }
  }

  override fun onClick() {
    super.onClick()

    val intent = Intent(this, PasteAndDownloadActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      // Android 14 removed the Intent overload; it takes a PendingIntent now.
      startActivityAndCollapse(
        PendingIntent.getActivity(
          this,
          0,
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }
}
