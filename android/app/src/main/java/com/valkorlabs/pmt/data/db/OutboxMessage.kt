package com.valkorlabs.pmt.data.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

enum class OutboxStatus {
    PENDING,           // waiting to be sent via SmsManager
    SMS_SENT,          // sent via SmsManager, ack not yet delivered to server
    SENT,              // server confirmed (terminal)
    DLQ_ACK_PENDING,   // max retries, ack not yet delivered to server
    DEAD_LETTER        // max retries, server confirmed (terminal)
}

@Entity(tableName = "outbox")
data class OutboxMessage(
    @PrimaryKey val id: String,
    val recipient: String,
    val body: String,
    val status: String = OutboxStatus.PENDING.name,
    val createdAt: Long = System.currentTimeMillis(),
    val attempts: Int = 0,
    val nextRetryAt: Long = 0L,
    @ColumnInfo(name = "smsError") val smsError: String? = null
)
