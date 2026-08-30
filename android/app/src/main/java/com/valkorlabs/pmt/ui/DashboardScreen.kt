package com.valkorlabs.pmt.ui

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.valkorlabs.pmt.service.SmsGatewayService

@Composable
fun DashboardScreen(vm: GatewayViewModel, serviceRunning: Boolean) {
    val context = LocalContext.current
    val inboxTotal by vm.inboxTotal.collectAsState()
    val pending by vm.outboxPending.collectAsState()
    val sent by vm.outboxSent.collectAsState()
    val dlq by vm.dlqCount.collectAsState()
    val batteryExempt = remember { vm.isBatteryOptimizationExempt() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Service status
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(
                        Icons.Filled.Circle,
                        contentDescription = null,
                        tint = if (serviceRunning) Color(0xFF4CAF50) else Color(0xFFF44336),
                        modifier = Modifier.size(12.dp)
                    )
                    Text(
                        if (serviceRunning) "Service running" else "Service stopped",
                        style = MaterialTheme.typography.titleMedium
                    )
                }
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        if (serviceRunning) SmsGatewayService.stop(context)
                        else SmsGatewayService.start(context)
                    }
                ) {
                    Text(if (serviceRunning) "Stop Service" else "Start Service")
                }
            }
        }

        // Stats
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Statistics", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(4.dp))
                StatRow("Inbox received", inboxTotal)
                StatRow("Outbox pending", pending)
                StatRow("Outbox sent", sent)
                StatRow("Dead letter queue", dlq)
            }
        }

        // Battery optimization warning
        if (!batteryExempt) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Battery optimization active",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                    Text(
                        "Doze mode will block network polling after ~1 h idle. Tap below to exempt this app.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                    Button(onClick = {
                        context.startActivity(
                            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                data = Uri.parse("package:${context.packageName}")
                            }
                        )
                    }) { Text("Disable Battery Optimization") }
                }
            }
        }
    }
}

@Composable
private fun StatRow(label: String, value: Int) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Text(value.toString(), style = MaterialTheme.typography.bodyMedium)
    }
}