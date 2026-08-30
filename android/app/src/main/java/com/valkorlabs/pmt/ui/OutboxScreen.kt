package com.valkorlabs.pmt.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.valkorlabs.pmt.data.db.OutboxMessage
import com.valkorlabs.pmt.data.db.OutboxStatus
import java.text.SimpleDateFormat
import java.util.*

private val FILTERS = listOf("ALL", OutboxStatus.PENDING.name, OutboxStatus.SENT.name, OutboxStatus.DEAD_LETTER.name)

@Composable
fun OutboxScreen(vm: GatewayViewModel) {
    val all by vm.outbox.collectAsState()
    var filter by remember { mutableStateOf("ALL") }
    val fmt = remember { SimpleDateFormat("MM/dd HH:mm", Locale.getDefault()) }
    var showConfirm by remember { mutableStateOf(false) }

    val displayed = if (filter == "ALL") all else all.filter { it.status == filter }
    val sentCount = remember(all) { all.count { it.status == OutboxStatus.SENT.name } }

    if (showConfirm) {
        AlertDialog(
            onDismissRequest = { showConfirm = false },
            title = { Text("Clear sent messages?") },
            text = { Text("Removes $sentCount sent messages from this device.") },
            confirmButton = {
                TextButton(onClick = { vm.clearSentOutbox(); showConfirm = false }) { Text("Clear") }
            },
            dismissButton = {
                TextButton(onClick = { showConfirm = false }) { Text("Cancel") }
            }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.weight(1f)
            ) {
                items(FILTERS) { f ->
                    FilterChip(selected = f == filter, onClick = { filter = f }, label = { Text(f) })
                }
            }
            if (sentCount > 0) {
                OutlinedButton(
                    onClick = { showConfirm = true },
                    modifier = Modifier.padding(start = 8.dp)
                ) { Text("Clear sent") }
            }
        }

        if (displayed.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No messages", style = MaterialTheme.typography.bodyLarge)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(displayed, key = { it.id }) { msg ->
                    OutboxCard(msg, fmt)
                }
            }
        }
    }
}

@Composable
private fun OutboxCard(msg: OutboxMessage, fmt: SimpleDateFormat) {
    val chipColor = when (msg.status) {
        OutboxStatus.SENT.name -> Color(0xFF4CAF50)
        OutboxStatus.DEAD_LETTER.name -> Color(0xFFF44336)
        OutboxStatus.PENDING.name -> Color(0xFFFF9800)
        else -> Color(0xFF9E9E9E)
    }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(msg.recipient, style = MaterialTheme.typography.labelLarge)
                Badge(containerColor = chipColor) {
                    Text(msg.status, color = Color.White)
                }
            }
            Text(msg.body, style = MaterialTheme.typography.bodyMedium, maxLines = 2)
            Text(
                "Attempts: ${msg.attempts} · ${fmt.format(Date(msg.createdAt))}",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}