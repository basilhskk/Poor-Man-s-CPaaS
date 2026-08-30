package com.valkorlabs.pmt.data.db

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface InboxDao {

    @Insert
    suspend fun insert(message: InboxMessage): Long

    @Query("SELECT * FROM inbox WHERE synced = 0 ORDER BY receivedAt ASC")
    suspend fun getUnsynced(): List<InboxMessage>

    @Query("SELECT * FROM inbox ORDER BY receivedAt DESC")
    fun getAllFlow(): Flow<List<InboxMessage>>

    @Query("UPDATE inbox SET synced = 1 WHERE id IN (:ids)")
    suspend fun markSynced(ids: List<Long>)

    @Query("SELECT COUNT(*) FROM inbox")
    fun getTotalCountFlow(): Flow<Int>

    @Query("DELETE FROM inbox")
    suspend fun deleteAll()
}