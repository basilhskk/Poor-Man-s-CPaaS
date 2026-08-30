package com.valkorlabs.pmt.data.network

import com.valkorlabs.pmt.Config
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object NetworkClient {
    @Volatile private var api: ApiService? = null
    @Volatile private var lastUrl: String = ""
    @Volatile private var lastKey: String = ""

    fun getApi(config: Config): ApiService {
        val url = config.serverUrl.trimEnd('/') + "/"
        val key = config.apiKey
        return if (api != null && url == lastUrl && key == lastKey) {
            api!!
        } else {
            synchronized(this) {
                if (api != null && url == lastUrl && key == lastKey) return api!!
                buildApi(url, key).also {
                    api = it
                    lastUrl = url
                    lastKey = key
                }
            }
        }
    }

    fun buildTestApi(serverUrl: String, apiKey: String): ApiService =
        buildApi(serverUrl.trimEnd('/') + "/", apiKey)

    private fun buildApi(baseUrl: String, apiKey: String): ApiService {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                chain.proceed(
                    chain.request().newBuilder()
                        .addHeader("X-Api-Key", apiKey)
                        .build()
                )
            }
            .addInterceptor(logging)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}