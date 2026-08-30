package com.valkorlabs.pmt.data.model

import com.google.gson.annotations.SerializedName

data class SmsCommand(
    val id: String,
    val to: String,
    val body: String
)

data class SentAck(
    val id: String,
    val status: String,   // in_progress | sent | failed | dead_letter
    @SerializedName("sent_at") val sentAt: Long? = null,
    val reason: String? = null
)

data class ReceivedMessage(
    val from: String,
    val body: String,
    @SerializedName("received_at") val receivedAt: Long
)
