package expo.modules.councilaudio

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/**
 * «المجالس» foreground service: keeps the process (and the Agora engine running in it)
 * alive while the user listens/speaks with the app in the background or the screen off.
 *
 * Type follows actual use (Play policy): mediaPlayback for listening, plus microphone
 * only while the user is on stage and has granted RECORD_AUDIO. Android 14+ refuses a
 * microphone-type start from the background — we fall back to mediaPlayback then and
 * upgrade again when the app returns to the foreground (JS re-syncs on resume).
 */
class CouncilAudioService : Service() {
  data class Session(
    val councilId: String,
    val title: String,
    val text: String,
    val onStage: Boolean,
    val url: String
  )

  companion object {
    const val CHANNEL_ID = "sarh_council_audio"
    const val NOTIFICATION_ID = 47021
    const val ACTION_START = "expo.modules.councilaudio.START"
    const val ACTION_LEAVE = "expo.modules.councilaudio.LEAVE"
    private const val EXTRA_ID = "councilId"
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"
    private const val EXTRA_STAGE = "onStage"
    private const val EXTRA_URL = "url"

    @Volatile
    var instance: CouncilAudioService? = null
      private set

    /** Set by the JS module: (councilId, reason) → JS runs the same flow as «مغادرة». */
    @Volatile
    var leaveListener: ((String, String) -> Unit)? = null

    private val main = Handler(Looper.getMainLooper())

    fun startIntent(context: Context, s: Session): Intent =
      Intent(context, CouncilAudioService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_ID, s.councilId)
        putExtra(EXTRA_TITLE, s.title)
        putExtra(EXTRA_TEXT, s.text)
        putExtra(EXTRA_STAGE, s.onStage)
        putExtra(EXTRA_URL, s.url)
      }

    /** Starts the service, or updates the running one in place (no new start from background). */
    fun sync(context: Context, s: Session): Boolean {
      val running = instance
      if (running != null) {
        main.post { running.apply(s) }
        return true
      }
      return try {
        val intent = startIntent(context, s)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
        else context.startService(intent)
        true
      } catch (e: Exception) {
        // e.g. ForegroundServiceStartNotAllowedException when started from the background.
        false
      }
    }

    fun stop(context: Context) {
      val running = instance
      if (running != null) {
        main.post { running.shutdown() }
      } else {
        try {
          context.stopService(Intent(context, CouncilAudioService::class.java))
        } catch (_: Exception) {
        }
      }
    }

    fun micCaptureAllowed(): Boolean = instance?.micActive == true
  }

  private var session: Session? = null

  @Volatile
  var micActive = false
    private set

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        val s = Session(
          councilId = intent.getStringExtra(EXTRA_ID) ?: "",
          title = intent.getStringExtra(EXTRA_TITLE) ?: "",
          text = intent.getStringExtra(EXTRA_TEXT) ?: "",
          onStage = intent.getBooleanExtra(EXTRA_STAGE, false),
          url = intent.getStringExtra(EXTRA_URL) ?: ""
        )
        apply(s)
      }
      ACTION_LEAVE -> requestLeave("notification")
      else -> {
        // Restarted without a session (should not happen with START_NOT_STICKY).
        if (session == null) shutdown()
      }
    }
    return START_NOT_STICKY
  }

  /** User swiped the app away from recents: leave the council instead of playing on. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    requestLeave("task_removed")
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    if (instance === this) instance = null
    micActive = false
    super.onDestroy()
  }

  fun apply(s: Session) {
    session = s
    ensureChannel()
    val notification = buildNotification(s)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val playback = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      val wantMic = s.onStage && hasMicPermission() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
      if (wantMic) {
        try {
          startForeground(NOTIFICATION_ID, notification, playback or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
          micActive = true
          return
        } catch (_: Exception) {
          // Android 14+: microphone type not allowed from the background → playback only.
        }
      }
      try {
        startForeground(NOTIFICATION_ID, notification, playback)
        // Below Android 11 there is no microphone type: any foreground service keeps capture.
        micActive = s.onStage && Build.VERSION.SDK_INT < Build.VERSION_CODES.R
      } catch (_: Exception) {
        micActive = false
        shutdown()
      }
    } else {
      try {
        startForeground(NOTIFICATION_ID, notification)
        micActive = s.onStage
      } catch (_: Exception) {
        micActive = false
        shutdown()
      }
    }
  }

  fun shutdown() {
    micActive = false
    session = null
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE)
      else @Suppress("DEPRECATION") stopForeground(true)
    } catch (_: Exception) {
    }
    stopSelf()
  }

  private fun requestLeave(reason: String) {
    val id = session?.councilId ?: ""
    val listener = leaveListener
    if (listener != null) {
      try {
        listener(id, reason)
      } catch (_: Exception) {
      }
    }
    shutdown()
  }

  private fun hasMicPermission(): Boolean =
    checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "المجالس الصوتية", NotificationManager.IMPORTANCE_LOW).apply {
      description = "يبقي صوت المجلس يعمل أثناء تصفح التطبيق أو إطفاء الشاشة"
      setShowBadge(false)
      setSound(null, null)
      enableVibration(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun smallIcon(): Int {
    val id = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (id != 0) id else applicationInfo.icon
  }

  private fun immutable(flags: Int): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags or PendingIntent.FLAG_IMMUTABLE else flags

  private fun buildNotification(s: Session): Notification {
    val open = if (s.url.isNotEmpty()) {
      Intent(Intent.ACTION_VIEW, Uri.parse(s.url)).setPackage(packageName)
    } else {
      packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val openPending = PendingIntent.getActivity(this, 1, open, immutable(PendingIntent.FLAG_UPDATE_CURRENT))

    val leave = Intent(this, CouncilAudioService::class.java).setAction(ACTION_LEAVE)
    val leavePending = PendingIntent.getService(this, 2, leave, immutable(PendingIntent.FLAG_UPDATE_CURRENT))

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this).setPriority(Notification.PRIORITY_LOW)
    }
    builder
      .setSmallIcon(smallIcon())
      .setContentTitle(s.title.ifEmpty { "مجلس صوتي" })
      .setContentText(s.text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setContentIntent(openPending)
      .addAction(
        Notification.Action.Builder(Icon.createWithResource(this, smallIcon()), "مغادرة", leavePending).build()
      )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    }
    return builder.build()
  }
}
