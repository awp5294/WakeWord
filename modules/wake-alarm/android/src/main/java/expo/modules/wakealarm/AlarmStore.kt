package expo.modules.wakealarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.util.Calendar

// Saved alarm settings, and the rule for when a mission is still owed.
// Mirrors WakeWordStore in the iOS backend.
object AlarmStore {
  private const val PREFS = "wakeword.alarm"
  const val NAG_WINDOW_MS = 60L * 60L * 1000L
  private const val REQ_DAILY = 4100
  private const val REQ_TEST = 4101

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun hour(ctx: Context) = prefs(ctx).getInt("hour", -1)

  // Path of the alarm song or the user's own audio file; empty means the phone's alarm sound.
  fun soundPath(ctx: Context): String = prefs(ctx).getString("soundPath", "") ?: ""
  fun setSoundPath(ctx: Context, path: String) = prefs(ctx).edit().putString("soundPath", path).apply()
  fun minute(ctx: Context) = prefs(ctx).getInt("minute", 0)
  fun title(ctx: Context) = prefs(ctx).getString("title", "Wake Word") ?: "Wake Word"
  fun lastComplete(ctx: Context) = prefs(ctx).getLong("lastComplete", 0L)
  fun testRingAt(ctx: Context) = prefs(ctx).getLong("testRingAt", 0L)

  fun saveDaily(ctx: Context, hour: Int, minute: Int, title: String) {
    prefs(ctx).edit().putInt("hour", hour).putInt("minute", minute).putString("title", title).apply()
  }
  fun saveTest(ctx: Context, at: Long) = prefs(ctx).edit().putLong("testRingAt", at).apply()
  fun markComplete(ctx: Context) = prefs(ctx).edit().putLong("lastComplete", System.currentTimeMillis()).apply()
  fun clear(ctx: Context) = prefs(ctx).edit().remove("hour").remove("minute").remove("testRingAt").apply()

  // Most recent ring at or before now: the daily time or a test ring.
  fun lastRing(ctx: Context, now: Long): Long? {
    var best: Long? = null
    val h = hour(ctx)
    if (h >= 0) {
      val c = Calendar.getInstance().apply {
        timeInMillis = now
        set(Calendar.HOUR_OF_DAY, h)
        set(Calendar.MINUTE, minute(ctx))
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }
      if (c.timeInMillis > now) c.add(Calendar.DAY_OF_YEAR, -1)
      best = c.timeInMillis
    }
    val t = testRingAt(ctx)
    if (t in 1..now && (best == null || t > best)) best = t
    return best
  }

  // The ring that still needs a finished mission, if it was within the last hour.
  fun owed(ctx: Context, now: Long = System.currentTimeMillis()): Long? {
    val ring = lastRing(ctx, now) ?: return null
    if (now - ring >= NAG_WINDOW_MS) return null
    if (lastComplete(ctx) >= ring) return null
    return ring
  }

  fun nextDaily(ctx: Context, now: Long = System.currentTimeMillis()): Long? {
    val h = hour(ctx)
    if (h < 0) return null
    val c = Calendar.getInstance().apply {
      timeInMillis = now
      set(Calendar.HOUR_OF_DAY, h)
      set(Calendar.MINUTE, minute(ctx))
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    if (c.timeInMillis <= now) c.add(Calendar.DAY_OF_YEAR, 1)
    return c.timeInMillis
  }

  private fun ringIntent(ctx: Context, req: Int): PendingIntent {
    val i = Intent(ctx, AlarmReceiver::class.java).setAction(AlarmReceiver.ACTION_RING)
    return PendingIntent.getBroadcast(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun showIntent(ctx: Context): PendingIntent? {
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
    return PendingIntent.getActivity(ctx, 4102, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  fun canScheduleExact(ctx: Context): Boolean {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
  }

  private fun setAt(ctx: Context, at: Long, req: Int) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    // setAlarmClock rings exactly, wakes the phone and shows the alarm icon in the status bar.
    am.setAlarmClock(AlarmManager.AlarmClockInfo(at, showIntent(ctx)), ringIntent(ctx, req))
  }

  // Schedule the next daily ring from the saved time. Called after saving, after each ring and after a reboot.
  fun scheduleNextDaily(ctx: Context) {
    val at = nextDaily(ctx) ?: return
    if (canScheduleExact(ctx)) setAt(ctx, at, REQ_DAILY)
  }

  fun scheduleTest(ctx: Context, at: Long) {
    saveTest(ctx, at)
    setAt(ctx, at, REQ_TEST)
  }

  fun cancelAll(ctx: Context) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(ringIntent(ctx, REQ_DAILY))
    am.cancel(ringIntent(ctx, REQ_TEST))
    clear(ctx)
  }
}
