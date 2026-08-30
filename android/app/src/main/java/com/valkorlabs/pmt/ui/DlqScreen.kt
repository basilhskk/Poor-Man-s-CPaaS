package com.valkorlabs.pmt.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.valkorlabs.pmt.data.db.OutboxMessage
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun DlqScreen(vm: GatewayViewModel) {
    val messages by vm.dlq.collectAsState()
    val fmt = remember { SimpleDateFormat("MM/dd HH:mm", Locale.getDefault()) }
    var showConfirm by remember { mutableStateOf(false) }

    if (showConfirm) {
        AlertDialog(
            onDismissRequest = { showConfirm = false },
            title = { Text("Clear dead letter queue?") },
            text = { Text("Permanently deletes all ${messages.size} failed messages. This cannot be undone.") },
            confirmButton = {
                TextButton(onClick = { vm.clearDlq(); showConfirm = false }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { showConfirm = false }) { Text("Cancel") }
            }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        if (messages.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)
            ) {
                OutlinedButton(
                    onClick = { showConfirm = true },
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Clear all")
                }
                Button(onClick = { vm.requeueAll() }) {
                    Text("Requeue all (${messages.size})")
                }
            }
        }

        if (messages.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Dead letter queue is empty", style = MaterialTheme.typography.bodyLarge)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(messages, key = { it.id }) { msg ->
                    DlqCard(msg, fmt, onRequeue = { vm.requeueMessage(msg.id) })
                }
            }
        }
    }
}

@Composable
private fun DlqCard(msg: OutboxMessage, fmt: SimpleDateFormat, onRequeue: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    msg.recipient,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
                TextButton(onClick = onRequeue) { Text("Requeue") }
            }
            Text(
                msg.body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onErrorContainer,
                maxLines = 2
            )
            Text(
                "Failed after ${msg.attempts} attempt(s) · ${fmt.format(Date(msg.createdAt))}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onErrorContainer
            )
        }
    }
}