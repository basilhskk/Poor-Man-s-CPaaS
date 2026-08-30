package com.valkorlabs.pmt.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import androidx.core.content.ContextCompat
import com.valkorlabs.pmt.data.db.AppDatabase
import com.valkorlabs.pmt.data.db.InboxMessage
import com.valkorlabs.pmt.service.SmsGatewayService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val smsList = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val db = AppDatabase.getInstance(context)
                smsList.groupBy { it.originatingAddress }.forEach { (address, parts) ->
                    db.inboxDao().insert(
                        InboxMessage(
                            from = address ?: "unknown",
                            body = parts.joinToString("") { it.messageBody },
                            receivedAt = parts.first().timestampMillis
                        )
                    )
                }
                ContextCompat.startForegroundService(
                    context,
                    Intent(context, SmsGatewayService::class.java).apply {
                        action = SmsGatewayService.ACTION_SYNC_INBOX
                    }
                )
            } finally {
                pendingResult.finish()
            }
        }
    }
}