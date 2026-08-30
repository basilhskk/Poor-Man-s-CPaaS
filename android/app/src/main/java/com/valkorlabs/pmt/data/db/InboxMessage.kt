package com.valkorlabs.pmt.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "inbox")
data class InboxMessage(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val from: String,
    val body: String,
    val receivedAt: Long = System.currentTimeMillis(),
    val synced: Boolean = false
)