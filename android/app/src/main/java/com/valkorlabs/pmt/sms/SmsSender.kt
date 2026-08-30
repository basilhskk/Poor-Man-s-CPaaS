package com.valkorlabs.pmt.sms

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.telephony.SmsManager
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import kotlin.coroutines.resume

sealed class SmsResult {
    object Success : SmsResult()
    data class Failure(val errorCode: String) : SmsResult()
}

class SmsSender(private val context: Context) {

    private val smsManager: SmsManager
        get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }

    suspend fun send(to: String, body: String): SmsResult = withTimeout(30_000L) {
        suspendCancellableCoroutine { cont ->
            val parts = try {
                smsManager.divideMessage(body)
            } catch (e: Exception) {
                cont.resume(SmsResult.Failure("DIVIDE_FAILED:${e.javaClass.simpleName}"))
                return@suspendCancellableCoroutine
            }

            val action = "com.valkorlabs.pmt.SMS_SENT.${System.nanoTime()}"
            var remaining = parts.size
            var firstError: String? = null

            val receiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context, intent: Intent) {
                    if (resultCode != Activity.RESULT_OK && firstError == null) {
                        firstError = smsErrorCode(resultCode)
                    }
                    remaining--
                    if (remaining == 0) {
                        try { context.unregisterReceiver(this) } catch (_: Exception) {}
                        if (!cont.isCompleted) {
                            val err = firstError
                            if (err == null) cont.resume(SmsResult.Success)
                            else cont.resume(SmsResult.Failure(err))
                        }
                    }
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, IntentFilter(action), Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                context.registerReceiver(receiver, IntentFilter(action))
            }

            cont.invokeOnCancellation {
                try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
            }

            try {
                val sentIntents = parts.indices.map { i ->
                    PendingIntent.getBroadcast(
                        context, i, Intent(action),
                        PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
                    )
                }
                if (parts.size == 1) {
                    smsManager.sendTextMessage(to, null, body, sentIntents[0], null)
                } else {
                    smsManager.sendMultipartTextMessage(to, null, parts, ArrayList(sentIntents), null)
                }
            } catch (e: Exception) {
                try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
                if (!cont.isCompleted) {
                    cont.resume(SmsResult.Failure("EXCEPTION:${e.javaClass.simpleName}"))
                }
            }
        }
    }

    private fun smsErrorCode(resultCode: Int): String = when (resultCode) {
        SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "GENERIC_FAILURE"
        SmsManager.RESULT_ERROR_RADIO_OFF -> "RADIO_OFF"
        SmsManager.RESULT_ERROR_NULL_PDU -> "NULL_PDU"
        SmsManager.RESULT_ERROR_NO_SERVICE -> "NO_SERVICE"
        SmsManager.RESULT_ERROR_LIMIT_EXCEEDED -> "LIMIT_EXCEEDED"
        SmsManager.RESULT_ERROR_FDN_CHECK_FAILURE -> "FDN_CHECK_FAILURE"
        SmsManager.RESULT_ERROR_SHORT_CODE_NOT_ALLOWED -> "SHORT_CODE_NOT_ALLOWED"
        SmsManager.RESULT_ERROR_SHORT_CODE_NEVER_ALLOWED -> "SHORT_CODE_NEVER_ALLOWED"
        else -> "UNKNOWN_$resultCode"
    }
}
