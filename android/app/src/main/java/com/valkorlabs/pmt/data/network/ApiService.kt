package com.valkorlabs.pmt.data.network

import com.valkorlabs.pmt.data.model.ReceivedMessage
import com.valkorlabs.pmt.data.model.SentAck
import com.valkorlabs.pmt.data.model.SmsCommand
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface ApiService {
    @GET("device/ping")
    suspend fun ping(): Response<Unit>

    @GET("device/sms/outbound")
    suspend fun getOutbound(): List<SmsCommand>

    @POST("device/sms/ack")
    suspend fun ackMessages(@Body acks: List<SentAck>): Response<Unit>

    @POST("device/sms/received")
    suspend fun uploadReceived(@Body messages: List<ReceivedMessage>): Response<Unit>
}
