package com.valkorlabs.pmt.ui

import android.app.Application
import android.os.PowerManager
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.valkorlabs.pmt.Config
import com.valkorlabs.pmt.data.db.AppDatabase
import com.valkorlabs.pmt.data.db.InboxMessage
import com.valkorlabs.pmt.data.db.OutboxMessage
import com.valkorlabs.pmt.data.network.NetworkClient
import com.valkorlabs.pmt.service.SmsGatewayService
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import android.content.Intent
import androidx.core.content.ContextCompat
import java.io.IOException

sealed class ConnectionTestResult {
    object Idle : ConnectionTestResult()
    object Testing : ConnectionTestResult()
    data class Success(val message: String) : ConnectionTestResult()
    data class Failure(val message: String) : ConnectionTestResult()
}

class GatewayViewModel(app: Application) : AndroidViewModel(app) {
    private val db = AppDatabase.getInstance(app)
    val config = Config.getInstance(app)

    val inbox: StateFlow<List<InboxMessage>> = db.inboxDao().getAllFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val outbox: StateFlow<List<OutboxMessage>> = db.outboxDao().getAllFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val dlq: StateFlow<List<OutboxMessage>> = db.outboxDao().getDlqFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val inboxTotal: StateFlow<Int> = db.inboxDao().getTotalCountFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val outboxPending: StateFlow<Int> = db.outboxDao().getPendingCountFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val outboxSent: StateFlow<Int> = db.outboxDao().getSentCountFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val dlqCount: StateFlow<Int> = db.outboxDao().getDlqCountFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    fun requeueMessage(id: String) = viewModelScope.launch {
        db.outboxDao().requeueMessage(id)
        triggerProcessOutbox()
    }

    fun requeueAll() = viewModelScope.launch {
        db.outboxDao().requeueAll()
        triggerProcessOutbox()
    }

    fun clearInbox() = viewModelScope.launch { db.inboxDao().deleteAll() }
    fun clearSentOutbox() = viewModelScope.launch { db.outboxDao().deleteSent() }
    fun clearDlq() = viewModelScope.launch { db.outboxDao().deleteDlq() }

    private val _connectionTestResult = MutableStateFlow<ConnectionTestResult>(ConnectionTestResult.Idle)
    val connectionTestResult: StateFlow<ConnectionTestResult> = _connectionTestResult

    fun testConnection(serverUrl: String, apiKey: String) = viewModelScope.launch {
        val url = serverUrl.trim()
        val key = apiKey.trim()
        if (url.isEmpty() || key.isEmpty()) {
            _connectionTestResult.value = ConnectionTestResult.Failure("Server URL and API key required")
            return@launch
        }
        _connectionTestResult.value = ConnectionTestResult.Testing
        _connectionTestResult.value = withContext(Dispatchers.IO) {
            try {
                val api = NetworkClient.buildTestApi(url, key)
                val response = api.ping()
                if (response.isSuccessful) {
                    ConnectionTestResult.Success("Connected")
                } else if (response.code() == 401) {
                    ConnectionTestResult.Failure("Invalid API key")
                } else {
                    ConnectionTestResult.Failure("Server returned ${response.code()}")
                }
            } catch (e: IOException) {
                ConnectionTestResult.Failure("Could not reach server: ${e.message}")
            } catch (e: Exception) {
                ConnectionTestResult.Failure("Failed: ${e.message}")
            }
        }
    }

    fun resetConnectionTest() {
        _connectionTestResult.value = ConnectionTestResult.Idle
    }

    private val _deeplinkApplied = MutableStateFlow(false)
    val deeplinkApplied: StateFlow<Boolean> = _deeplinkApplied

    fun applyDeeplink(serverUrl: String, apiKey: String) {
        config.serverUrl = serverUrl.trim()
        config.apiKey = apiKey.trim()
        _deeplinkApplied.value = true
    }

    fun clearDeeplinkFlag() {
        _deeplinkApplied.value = false
    }

    fun isBatteryOptimizationExempt(): Boolean {
        val pm = getApplication<Application>().getSystemService(PowerManager::class.java)
        return pm.isIgnoringBatteryOptimizations(getApplication<Application>().packageName)
    }

    private fun triggerProcessOutbox() {
        val ctx = getApplication<Application>()
        ContextCompat.startForegroundService(
            ctx,
            Intent(ctx, SmsGatewayService::class.java).apply {
                action = SmsGatewayService.ACTION_PROCESS_OUTBOX
            }
        )
    }
}