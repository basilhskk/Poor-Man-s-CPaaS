package com.valkorlabs.pmt.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.valkorlabs.pmt.service.SmsGatewayService

class WatchdogWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        SmsGatewayService.start(applicationContext)
        return Result.success()
    }
}