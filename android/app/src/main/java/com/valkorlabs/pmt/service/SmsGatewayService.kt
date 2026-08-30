package com.valkorlabs.pmt.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.valkorlabs.pmt.Config
import com.valkorlabs.pmt.R
import com.valkorlabs.pmt.data.db.AppDatabase
import com.valkorlabs.pmt.data.db.OutboxMessage
import com.valkorlabs.pmt.data.db.OutboxStatus
import com.valkorlabs.pmt.data.model.ReceivedMessage
import com.valkorlabs.pmt.data.model.SentAck
import com.valkorlabs.pmt.data.network.NetworkClient
import com.valkorlabs.pmt.sms.RateLimiter
import com.valkorlabs.pmt.sms.SmsSender
import com.valkorlabs.pmt.sms.SmsResult
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.time.Duration.Companion.milliseconds

class SmsGatewayService : Service() {

    companion object {
        const val ACTION_SYNC_INBOX = "com.valkorlabs.pmt.SYNC_INBOX"
        const val ACTION_PROCESS_OUTBOX = "com.valkorlabs.pmt.PROCESS_OUTBOX"

        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "sms_gateway"

        // Exponential backoff: baseDelay * 2^(attempt-1), capped at maxDelay. attempt=0 -> no delay.
        fun backoffMs(attempt: Int, baseDelaySeconds: Int, maxDelaySeconds: Int): Long {
            if (attempt <= 0) return 0L
            val baseMs = baseDelaySeconds * 1000L
            val maxMs = maxOf(baseMs, maxDelaySeconds * 1000L)
            val scaled = baseMs * (1L shl (attempt - 1).coerceAtMost(20))
            return scaled.coerceAtMost(maxMs)
        }

        private val _isRunning = MutableStateFlow(false)
        val isRunning: StateFlow<Boolean> = _isRunning.asStateFlow()

        fun start(context: Context) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, SmsGatewayService::class.java)
            )
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, SmsGatewayService::class.java))
        }
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var db: AppDatabase
    private lateinit var config: Config
    private lateinit var smsSender: SmsSender
    private lateinit var rateLimiter: RateLimiter
    private lateinit var wakeLock: PowerManager.WakeLock
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var pollingJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        db = AppDatabase.getInstance(this)
        config = Config.getInstance(this)
        smsSender = SmsSender(this)
        rateLimiter = RateLimiter(config)
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PoorMansCPaaS:poll")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            createNotificationChannel()
        }

        startForeground(NOTIFICATION_ID, buildNotification())
        _isRunning.value = true

        startPolling()
        registerNetworkCallback()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SYNC_INBOX -> serviceScope.launch { syncInbox() }
            ACTION_PROCESS_OUTBOX -> serviceScope.launch { processOutbox() }
        }
        return START_STICKY
    }

    private fun startPolling() {
        pollingJob?.cancel()
        pollingJob = serviceScope.launch {
            while (isActive) {
                pollAndProcess()
                delay((config.pollIntervalSeconds * 1000L).milliseconds)
            }
        }
    }

    private suspend fun pollAndProcess() {
        if (!wakeLock.isHeld) wakeLock.acquire(60_000L)
        try {
            fetchOutbound()
            processOutbox()
            syncAcks()
            syncInbox()
        } finally {
            if (wakeLock.isHeld) wakeLock.release()
        }
    }

    private suspend fun fetchOutbound() {
        if (config.serverUrl.isBlank()) return
        try {
            val commands = NetworkClient.getApi(config).getOutbound()
            if (commands.isNotEmpty()) {
                db.outboxDao().insertAll(commands.map { cmd ->
                    OutboxMessage(id = cmd.id, recipient = cmd.to, body = cmd.body)
                })
                try {
                    NetworkClient.getApi(config).ackMessages(
                        commands.map { SentAck(id = it.id, status = "in_progress") }
                    )
                } catch (_: Exception) {}
            }
        } catch (_: Exception) {}
    }

    private suspend fun processOutbox() {
        val pending = db.outboxDao().getPendingReady()

        for (msg in pending) {
            if (!rateLimiter.acquire()) break

            val result = smsSender.send(msg.recipient, msg.body)
            val now = System.currentTimeMillis()

            when (result) {
                is SmsResult.Success -> {
                    db.outboxDao().updateStatusWithError(
                        msg.id, OutboxStatus.SMS_SENT.name, msg.attempts, 0L, null
                    )
                }
                is SmsResult.Failure -> {
                    val nextAttempts = msg.attempts + 1
                    if (nextAttempts >= config.maxRetries) {
                        db.outboxDao().updateStatusWithError(
                            msg.id, OutboxStatus.DLQ_ACK_PENDING.name, nextAttempts, 0L, result.errorCode
                        )
                    } else {
                        val delayMs = backoffMs(nextAttempts, config.retryBaseDelaySeconds, config.retryMaxDelaySeconds)
                        db.outboxDao().updateStatusWithError(
                            msg.id, OutboxStatus.PENDING.name, nextAttempts, now + delayMs, result.errorCode
                        )
                    }
                }
            }
        }
    }

    private suspend fun syncAcks() {
        if (config.serverUrl.isBlank()) return

        val smsSent = db.outboxDao().getSmsSentForAck()
        val dlqPending = db.outboxDao().getDlqAckPending()
        if (smsSent.isEmpty() && dlqPending.isEmpty()) return

        val now = System.currentTimeMillis()
        val acks = buildList {
            smsSent.forEach { add(SentAck(id = it.id, status = "sent", sentAt = now)) }
            dlqPending.forEach { add(SentAck(id = it.id, status = "dead_letter", reason = it.smsError)) }
        }

        try {
            val response = NetworkClient.getApi(config).ackMessages(acks)
            if (response.isSuccessful) {
                smsSent.forEach { db.outboxDao().updateStatusAcked(it.id, OutboxStatus.SENT.name, it.attempts) }
                dlqPending.forEach { db.outboxDao().updateStatusAcked(it.id, OutboxStatus.DEAD_LETTER.name, it.attempts) }
            }
            // Non-2xx: stays SMS_SENT/DLQ_ACK_PENDING, retried next poll
        } catch (_: Exception) {
            // Network unavailable, retried next poll or on network restore
        }
    }

    private suspend fun syncInbox() {
        if (config.serverUrl.isBlank()) return
        val unsynced = db.inboxDao().getUnsynced()
        if (unsynced.isEmpty()) return
        try {
            val payload = unsynced.map { ReceivedMessage(it.from, it.body, it.receivedAt) }
            val response = NetworkClient.getApi(config).uploadReceived(payload)
            if (response.isSuccessful) {
                db.inboxDao().markSynced(unsynced.map { it.id })
            }
        } catch (_: Exception) {}
    }

    private fun registerNetworkCallback() {
        val cm = getSystemService(ConnectivityManager::class.java)
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                serviceScope.launch {
                    fetchOutbound()
                    processOutbox()
                    syncAcks()
                    syncInbox()
                }
            }
        }
        cm.registerNetworkCallback(request, networkCallback!!)
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID, "SMS Gateway", NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Polling for SMS commands in background"
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SMS Gateway")
            .setContentText("Running — polling for messages")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        _isRunning.value = false
        serviceScope.cancel()
        if (wakeLock.isHeld) wakeLock.release()
        networkCallback?.let {
            getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it)
        }
    }
}