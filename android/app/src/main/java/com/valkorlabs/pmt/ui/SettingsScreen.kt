package com.valkorlabs.pmt.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun SettingsScreen(vm: GatewayViewModel) {
    val config = vm.config
    var serverUrl by remember { mutableStateOf(config.serverUrl) }
    var apiKey by remember { mutableStateOf(config.apiKey) }
    var pollInterval by remember { mutableStateOf(config.pollIntervalSeconds.toString()) }
    var rateLimit by remember { mutableStateOf(config.rateLimitPerMinute.toString()) }
    var maxRetries by remember { mutableStateOf(config.maxRetries.toString()) }
    var retryBaseDelay by remember { mutableStateOf(config.retryBaseDelaySeconds.toString()) }
    var retryMaxDelay by remember { mutableStateOf(config.retryMaxDelaySeconds.toString()) }
    var saved by remember { mutableStateOf(false) }
    val testResult by vm.connectionTestResult.collectAsState()
    val deeplinkApplied by vm.deeplinkApplied.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (deeplinkApplied) {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        "Configured from QR scan — tap Save to confirm",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }
        }

        Text("Server", style = MaterialTheme.typography.titleMedium)

        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it; saved = false; vm.resetConnectionTest() },
            label = { Text("Server URL") },
            placeholder = { Text("https://your-server.com/api/") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        OutlinedTextField(
            value = apiKey,
            onValueChange = { apiKey = it; saved = false; vm.resetConnectionTest() },
            label = { Text("API Key") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        OutlinedButton(
            modifier = Modifier.fillMaxWidth(),
            enabled = testResult != ConnectionTestResult.Testing,
            onClick = { vm.testConnection(serverUrl, apiKey) }
        ) {
            if (testResult == ConnectionTestResult.Testing) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                Spacer(modifier = Modifier.width(8.dp))
            }
            Text("Test Connection")
        }

        when (val result = testResult) {
            is ConnectionTestResult.Success -> Text(
                result.message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary
            )
            is ConnectionTestResult.Failure -> Text(
                result.message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error
            )
            else -> {}
        }

        HorizontalDivider()
        Text("Polling", style = MaterialTheme.typography.titleMedium)

        OutlinedTextField(
            value = pollInterval,
            onValueChange = { pollInterval = it; saved = false },
            label = { Text("Poll Interval (seconds)") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        OutlinedTextField(
            value = rateLimit,
            onValueChange = { rateLimit = it; saved = false },
            label = { Text("Rate Limit (messages / minute)") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        OutlinedTextField(
            value = maxRetries,
            onValueChange = { maxRetries = it; saved = false },
            label = { Text("Max Retries before DLQ") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        OutlinedTextField(
            value = retryBaseDelay,
            onValueChange = { retryBaseDelay = it; saved = false },
            label = { Text("Retry Base Delay (seconds)") },
            supportingText = { Text("Delay before 2nd attempt; doubles each retry up to max") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        OutlinedTextField(
            value = retryMaxDelay,
            onValueChange = { retryMaxDelay = it; saved = false },
            label = { Text("Retry Max Delay (seconds)") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                config.serverUrl = serverUrl.trim()
                config.apiKey = apiKey.trim()
                config.pollIntervalSeconds = pollInterval.toIntOrNull()?.coerceAtLeast(5) ?: 30
                config.rateLimitPerMinute = rateLimit.toIntOrNull()?.coerceAtLeast(1) ?: 10
                config.maxRetries = maxRetries.toIntOrNull()?.coerceAtLeast(1) ?: 3
                config.retryBaseDelaySeconds = retryBaseDelay.toIntOrNull()?.coerceAtLeast(1) ?: 300
                config.retryMaxDelaySeconds = retryMaxDelay.toIntOrNull()?.coerceAtLeast(1) ?: 900
                vm.clearDeeplinkFlag()
                saved = true
            }
        ) {
            Text("Save Settings")
        }

        if (saved) {
            Text(
                "Saved. Changes apply on next poll cycle.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}