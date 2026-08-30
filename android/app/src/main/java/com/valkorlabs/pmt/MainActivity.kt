package com.valkorlabs.pmt

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.valkorlabs.pmt.service.SmsGatewayService
import com.valkorlabs.pmt.ui.*
import com.valkorlabs.pmt.ui.theme.PoorMansCPaaSTheme

class MainActivity : ComponentActivity() {
    private val vm: GatewayViewModel by viewModels()

    private val permissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* handled reactively in UI */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestMissingPermissions()
        handleDeeplink()
        enableEdgeToEdge()
        setContent {
            PoorMansCPaaSTheme {
                val serviceRunning by SmsGatewayService.isRunning.collectAsState()
                val deeplinkApplied by vm.deeplinkApplied.collectAsState()
                GatewayApp(vm, serviceRunning, openSettings = deeplinkApplied)
            }
        }
    }

    private fun handleDeeplink() {
        val uri = intent?.data ?: return
        if (uri.scheme != "pmcpaas" || uri.host != "setup") return
        val url = uri.getQueryParameter("url") ?: return
        val key = uri.getQueryParameter("key") ?: return
        vm.applyDeeplink(url, key)
    }

    private fun requestMissingPermissions() {
        val needed = buildList {
            if (!has(Manifest.permission.RECEIVE_SMS)) add(Manifest.permission.RECEIVE_SMS)
            if (!has(Manifest.permission.SEND_SMS)) add(Manifest.permission.SEND_SMS)
            if (!has(Manifest.permission.READ_SMS)) add(Manifest.permission.READ_SMS)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (!has(Manifest.permission.POST_NOTIFICATIONS)) {
                    add(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
        }
        if (needed.isNotEmpty()) permissionsLauncher.launch(needed.toTypedArray())
    }

    private fun has(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED
}

@Composable
fun GatewayApp(vm: GatewayViewModel, serviceRunning: Boolean, openSettings: Boolean = false) {
    var selectedTab by remember { mutableIntStateOf(0) }
    var showSettings by remember { mutableStateOf(openSettings) }

    if (showSettings) {
        Scaffold(
            topBar = {
                @OptIn(ExperimentalMaterial3Api::class)
                TopAppBar(
                    title = { Text("Settings") },
                    navigationIcon = {
                        IconButton(onClick = { showSettings = false }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                )
            }
        ) { padding ->
            Box(Modifier.padding(padding)) { SettingsScreen(vm) }
        }
        return
    }

    val tabLabels = listOf("Dashboard", "Inbox", "Outbox", "DLQ")
    val tabIcons = listOf(
        Icons.Filled.Home,
        Icons.Filled.Email,
        Icons.Filled.Send,
        Icons.Filled.Warning
    )

    Scaffold(
        topBar = {
            @OptIn(ExperimentalMaterial3Api::class)
            TopAppBar(
                title = { Text("SMS Gateway") },
                actions = {
                    IconButton(onClick = { showSettings = true }) {
                        Icon(Icons.Filled.Settings, contentDescription = "Settings")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                tabLabels.forEachIndexed { index, label ->
                    NavigationBarItem(
                        icon = { Icon(tabIcons[index], contentDescription = label) },
                        label = { Text(label) },
                        selected = selectedTab == index,
                        onClick = { selectedTab = index }
                    )
                }
            }
        }
    ) { padding ->
        Box(Modifier.padding(padding)) {
            when (selectedTab) {
                0 -> DashboardScreen(vm, serviceRunning)
                1 -> InboxScreen(vm)
                2 -> OutboxScreen(vm)
                3 -> DlqScreen(vm)
            }
        }
    }
}