package com.valkorlabs.pmt

import android.app.Application
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.valkorlabs.pmt.worker.WatchdogWorker
import java.util.concurrent.TimeUnit

class GatewayApp : Application() {
    override fun onCreate() {
        super.onCreate()
        scheduleWatchdog()
    }

    private fun scheduleWatchdog() {
        val request = PeriodicWorkRequestBuilder<WatchdogWorker>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "sms_gateway_watchdog",
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }
}