package expo.modules.wakealarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

// Rings until the mission is finished. There is no stop button on the notification:
// the only way to end it is to finish the mission in the app (or wait out the hour).
// While the mission is on screen the app keeps the sound off with heartbeats;
// leave the app for 90 seconds and it rings again.
class AlarmService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.wakealarm.START"
    const val ACTION_SILENCE = "expo.modules.wakealarm.SILENCE"
    const val ACTION_COMPLETE = "expo.modules.wakealarm.COMPLETE"
    private const val CHANNEL = "wakeword-alarm"
    private const val NOTIF_ID = 4103
    private const val SILENCE_MS = 90_000L
    private const val CHECK_MS = 15_000L

    @Volatile var running = false
      private set

    // Only touches a service that is already ringing; practice missions don't start one.
    fun send(ctx: Context, action: String) {
      if (!running) return
      ctx.startService(Intent(ctx, AlarmService::class.java).setAction(action))
    }
  }

  private var player: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var lastBeat = 0L
  private val handler = Handler(Looper.getMainLooper())
  private val check = object : Runnable {
    override fun run() {
      val now = System.currentTimeMillis()
      if (AlarmStore.owed(this@AlarmService, now) == null) {
        finish()
        return
      }
      if (player == null && now - lastBeat > SILENCE_MS) {
        startSound()
        postNotification()
      }
      handler.postDelayed(this, CHECK_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> start()
      ACTION_SILENCE -> {
        lastBeat = System.currentTimeMillis()
        stopSound()
      }
      ACTION_COMPLETE -> finish()
      else -> if (!running) stopSelf()
    }
    return START_NOT_STICKY
  }

  private fun start() {
    val notification = buildNotification()
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED else 0
    ServiceCompat.startForeground(this, NOTIF_ID, notification, type)
    running = true
    lastBeat = 0L
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "wakeword:alarm").apply { acquire(AlarmStore.NAG_WINDOW_MS) }
    startSound()
    handler.removeCallbacks(check)
    handler.postDelayed(check, CHECK_MS)
  }

  private fun channel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL) != null) return
    val ch = NotificationChannel(CHANNEL, "Alarm", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "The Wake Word alarm"
      setSound(null, null) // the service plays the sound itself
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    nm.createNotificationChannel(ch)
  }

  private fun buildNotification(): Notification {
    channel()
    val launch = (packageManager.getLaunchIntentForPackage(packageName) ?: Intent()).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra("wakeword_ring", true)
    }
    val pi = PendingIntent.getActivity(this, 4104, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(AlarmStore.title(this))
      .setContentText("Finish your mission to turn it off.")
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(pi)
      .setFullScreenIntent(pi, true)
      .build()
  }

  private fun postNotification() {
    getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification())
  }

  private fun startSound() {
    if (player != null) return
    val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    try {
      player = MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
        val custom = AlarmStore.soundPath(this@AlarmService).removePrefix("file://")
        if (custom.isNotEmpty() && java.io.File(custom).canRead()) setDataSource(custom)
        else setDataSource(this@AlarmService, uri)
        isLooping = true
        prepare()
        start()
      }
    } catch (e: Exception) {
      player?.release()
      player = null
      // The chosen file couldn't play: fall back to the phone's alarm sound.
      try {
        player = MediaPlayer().apply {
          setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
          setDataSource(this@AlarmService, uri)
          isLooping = true
          prepare()
          start()
        }
      } catch (e2: Exception) {
        player = null
      }
    }
    vibrator()?.let { v ->
      val pattern = longArrayOf(0, 800, 600)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) v.vibrate(VibrationEffect.createWaveform(pattern, 0))
      else @Suppress("DEPRECATION") v.vibrate(pattern, 0)
    }
  }

  private fun stopSound() {
    player?.let {
      try { it.stop() } catch (_: Exception) {}
      it.release()
    }
    player = null
    vibrator()?.cancel()
  }

  private fun vibrator(): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

  private fun finish() {
    handler.removeCallbacks(check)
    stopSound()
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    running = false
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    handler.removeCallbacks(check)
    stopSound()
    wakeLock?.let { if (it.isHeld) it.release() }
    running = false
    super.onDestroy()
  }
}
