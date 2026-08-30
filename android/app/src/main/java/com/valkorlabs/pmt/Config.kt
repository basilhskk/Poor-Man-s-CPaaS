package com.valkorlabs.pmt

import android.content.Context
import android.content.SharedPreferences

class Config private constructor(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("gateway_config", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString("server_url", "") ?: ""
        set(v) = prefs.edit().putString("server_url", v).apply()

    var apiKey: String
        get() = prefs.getString("api_key", "") ?: ""
        set(v) = prefs.edit().putString("api_key", v).apply()

    var pollIntervalSeconds: Int
        get() = prefs.getInt("poll_interval", 30)
        set(v) = prefs.edit().putInt("poll_interval", v).apply()

    var rateLimitPerMinute: Int
        get() = prefs.getInt("rate_limit", 10)
        set(v) = prefs.edit().putInt("rate_limit", v).apply()

    var maxRetries: Int
        get() = prefs.getInt("max_retries", 3)
        set(v) = prefs.edit().putInt("max_retries", v).apply()

    var retryBaseDelaySeconds: Int
        get() = prefs.getInt("retry_base_delay", 300)
        set(v) = prefs.edit().putInt("retry_base_delay", v).apply()

    var retryMaxDelaySeconds: Int
        get() = prefs.getInt("retry_max_delay", 900)
        set(v) = prefs.edit().putInt("retry_max_delay", v).apply()

    companion object {
        @Volatile private var instance: Config? = null

        fun getInstance(context: Context): Config =
            instance ?: synchronized(this) {
                instance ?: Config(context.applicationContext).also { instance = it }
            }
    }
}