package com.valkorlabs.pmt.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.valkorlabs.pmt.data.db.InboxMessage
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun InboxScreen(vm: GatewayViewModel) {
    val messages by vm.inbox.collectAsState()
    val fmt = remember { SimpleDateFormat("MM/dd HH:mm", Locale.getDefault()) }
    var showConfirm by remember { mutableStateOf(false) }

    if (showConfirm) {
        AlertDialog(
            onDismissRequest = { showConfirm = false },
            title = { Text("Clear inbox?") },
            text = { Text("Deletes all ${messages.size} messages from this device. Messages already synced to the server are not affected.") },
            confirmButton = {
                TextButton(onClick = { vm.clearInbox(); showConfirm = false }) { Text("Clear") }
            },
            dismissButton = {
                TextButton(onClick = { showConfirm = false }) { Text("Cancel") }
            }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        if (messages.isNotEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.End
            ) {
                OutlinedButton(onClick = { showConfirm = true }) { Text("Clear all") }
            }
        }

        if (messages.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No messages received yet", style = MaterialTheme.typography.bodyLarge)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(messages, key = { it.id }) { msg ->
                    InboxCard(msg, fmt)
                }
            }
        }
    }
}

@Composable
private fun InboxCard(msg: InboxMessage, fmt: SimpleDateFormat) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(msg.from, style = MaterialTheme.typography.labelLarge)
                Badge(
                    containerColor = if (msg.synced)
                        MaterialTheme.colorScheme.primary
                    else
                        MaterialTheme.colorScheme.tertiary
                ) {
                    Text(if (msg.synced) "synced" else "pending upload")
                }
            }
            Text(msg.body, style = MaterialTheme.typography.bodyMedium, maxLines = 3)
            Text(fmt.format(Date(msg.receivedAt)), style = MaterialTheme.typography.bodySmall)
        }
    }
}