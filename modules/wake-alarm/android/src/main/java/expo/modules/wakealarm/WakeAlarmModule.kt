package expo.modules.wakealarm

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Same JS API as the iOS module. Notification permission itself is asked from JS
// (PermissionsAndroid), so this reports what's missing and opens the right settings page.
class WakeAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun fullScreenAllowed(): Boolean {
    if (Build.VERSION.SDK_INT < 34) return true
    return context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
  }

  private fun permission(): String {
    val notifs = NotificationManagerCompat.from(context).areNotificationsEnabled()
    return when {
      !notifs -> "denied"
      !AlarmStore.canScheduleExact(context) -> "needsExactAlarms"
      !fullScreenAllowed() -> "needsFullScreen"
      else -> "granted"
    }
  }

  override fun definition() = ModuleDefinition {
    Name("WakeAlarm")

    Function("isSupported") { true }

    // "granted" | "denied" | "needsExactAlarms" | "needsFullScreen"
    Function("getPermission") { permission() }

    AsyncFunction("requestPermission") { permission() }

    AsyncFunction("scheduleDaily") { hour: Int, minute: Int, title: String ->
      AlarmStore.saveDaily(context, hour, minute, title)
      AlarmStore.scheduleNextDaily(context)
    }

    AsyncFunction("scheduleTest") { seconds: Int, title: String ->
      AlarmStore.saveDaily(context, AlarmStore.hour(context), AlarmStore.minute(context), title)
      AlarmStore.scheduleTest(context, System.currentTimeMillis() + seconds * 1000L)
    }

    AsyncFunction("cancelAll") {
      AlarmStore.cancelAll(context)
      AlarmService.send(context, AlarmService.ACTION_COMPLETE)
    }

    Function("getOwedRing") { (AlarmStore.owed(context) ?: 0L).toDouble() }

    Function("missionStarted") { AlarmService.send(context, AlarmService.ACTION_SILENCE) }
    Function("missionHeartbeat") { AlarmService.send(context, AlarmService.ACTION_SILENCE) }
    Function("missionComplete") {
      AlarmStore.markComplete(context)
      AlarmService.send(context, AlarmService.ACTION_COMPLETE)
    }

    Function("openSettings") {
      val pkg = Uri.parse("package:" + context.packageName)
      val intent = when {
        !AlarmStore.canScheduleExact(context) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
          Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg)
        !fullScreenAllowed() && Build.VERSION.SDK_INT >= 34 ->
          Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg)
        else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
      }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
