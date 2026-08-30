package com.valkorlabs.pmt.data.db

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface OutboxDao {

    @Query("SELECT * FROM outbox WHERE status = 'PENDING' AND nextRetryAt <= :now ORDER BY createdAt ASC")
    suspend fun getPendingReady(now: Long = System.currentTimeMillis()): List<OutboxMessage>

    @Query("SELECT * FROM outbox WHERE status = 'SMS_SENT' ORDER BY createdAt ASC")
    suspend fun getSmsSentForAck(): List<OutboxMessage>

    @Query("SELECT * FROM outbox WHERE status = 'DLQ_ACK_PENDING' ORDER BY createdAt ASC")
    suspend fun getDlqAckPending(): List<OutboxMessage>

    @Query("SELECT * FROM outbox ORDER BY createdAt DESC")
    fun getAllFlow(): Flow<List<OutboxMessage>>

    @Query("SELECT * FROM outbox WHERE status IN ('DLQ_ACK_PENDING', 'DEAD_LETTER') ORDER BY createdAt DESC")
    fun getDlqFlow(): Flow<List<OutboxMessage>>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAll(messages: List<OutboxMessage>)

    @Query("UPDATE outbox SET status = :status, attempts = :attempts, nextRetryAt = :nextRetryAt WHERE id = :id")
    suspend fun updateStatus(id: String, status: String, attempts: Int, nextRetryAt: Long)

    @Query("UPDATE outbox SET status = :status, attempts = :attempts, nextRetryAt = :nextRetryAt, smsError = :smsError WHERE id = :id")
    suspend fun updateStatusWithError(id: String, status: String, attempts: Int, nextRetryAt: Long, smsError: String?)

    @Query("UPDATE outbox SET status = :status, attempts = :attempts, nextRetryAt = 0 WHERE id = :id")
    suspend fun updateStatusAcked(id: String, status: String, attempts: Int)

    @Query("UPDATE outbox SET status = 'PENDING', attempts = 0, nextRetryAt = 0, smsError = NULL WHERE id = :id")
    suspend fun requeueMessage(id: String)

    @Query("UPDATE outbox SET status = 'PENDING', attempts = 0, nextRetryAt = 0, smsError = NULL WHERE status IN ('DEAD_LETTER', 'DLQ_ACK_PENDING')")
    suspend fun requeueAll()

    @Query("SELECT COUNT(*) FROM outbox WHERE status = 'PENDING'")
    fun getPendingCountFlow(): Flow<Int>

    @Query("SELECT COUNT(*) FROM outbox WHERE status IN ('SMS_SENT', 'SENT')")
    fun getSentCountFlow(): Flow<Int>

    @Query("SELECT COUNT(*) FROM outbox WHERE status IN ('DLQ_ACK_PENDING', 'DEAD_LETTER')")
    fun getDlqCountFlow(): Flow<Int>

    @Query("DELETE FROM outbox WHERE status IN ('SMS_SENT', 'SENT')")
    suspend fun deleteSent()

    @Query("DELETE FROM outbox WHERE status IN ('DLQ_ACK_PENDING', 'DEAD_LETTER')")
    suspend fun deleteDlq()
}
