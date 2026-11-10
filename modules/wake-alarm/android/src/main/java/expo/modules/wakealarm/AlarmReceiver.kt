package expo.modules.wakealarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

// Fired by AlarmManager at the alarm time: start ringing and line up tomorrow's alarm.
class AlarmReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_RING = "expo.modules.wakealarm.RING"
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_RING) return
    AlarmStore.scheduleNextDaily(context)
    val start = Intent(context, AlarmService::class.java).setAction(AlarmService.ACTION_START)
    ContextCompat.startForegroundService(context, start)
  }
}

// Alarms are cleared on reboot, so set the next one again.
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    AlarmStore.scheduleNextDaily(context)
  }
}
