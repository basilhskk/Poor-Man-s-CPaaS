# Android Gateway App

The Android half of Poor Man's CPaaS. Runs as a persistent foreground service, polls the server for outbound SMS jobs, sends them via the device radio, and syncs inbound messages back to the server.

---

## Requirements

- Android 10+ (API 29)
- Physical device with an active SIM card and an SMS plan
- A running CPaaS server (see the root README)

Emulators cannot send or receive real SMS -- use a physical device.

---

## Build

Open the `android/` directory as the project root in Android Studio (not the monorepo root).

```bash
# or from command line
cd android
./gradlew assembleDebug
./gradlew installDebug    # install directly to connected device
```

Release build (requires a signing config in `app/build.gradle`):

```bash
./gradlew assembleRelease
```

---

## Setup

### Via QR code (recommended)

1. In the web UI, go to **Devices** and click **Add Device**
2. Give the device a name and confirm
3. Scan the QR code with your phone -- the app opens automatically, pre-fills the server URL and API key, and shows a confirmation banner
4. Tap **Save** in the Settings screen

### Manual

1. Open the app and go to **Settings**
2. Set **Server URL** to your server's base URL (e.g. `http://192.168.1.10:3000`)
3. Set **API Key** to the UUID shown when you registered the device in the web UI
4. Tap **Save**

After saving, tap **Start Gateway** on the Dashboard tab. Grant SMS and notification permissions when prompted.

Battery optimisation exemption prompt will appear -- tap **Allow**. Without it, Android suspends polling in Doze mode.

---

## Permissions

| Permission | Why |
|---|---|
| `SEND_SMS` | Send outbound messages via `SmsManager` |
| `RECEIVE_SMS` | Capture incoming SMS via broadcast receiver |
| `READ_SMS` | Read PDU data from incoming SMS broadcasts |
| `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_DATA_SYNC` | Keep service alive while screen is off |
| `RECEIVE_BOOT_COMPLETED` | Auto-restart after reboot |
| `WAKE_LOCK` | Keep CPU awake during poll cycle |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Request Doze exemption from user |
| `INTERNET` / `ACCESS_NETWORK_STATE` | Communicate with the server |
| `POST_NOTIFICATIONS` | Show persistent foreground notification (Android 13+) |

---

## Architecture

```
MainActivity
 └── GatewayViewModel
      ├── SmsGatewayService (ForegroundService)
      │    ├── polls GET /device/sms/outbound every ~30s
      │    ├── sends SMS via SmsSender (SmsManager + PendingIntent)
      │    ├── acks results via POST /device/sms/ack
      │    └── syncs inbox via POST /device/sms/received
      ├── SmsReceiver (BroadcastReceiver, priority 999)
      │    └── captures SMS_RECEIVED -> Room inbox table
      ├── BootReceiver (BroadcastReceiver)
      │    └── restarts SmsGatewayService after reboot
      └── WatchdogWorker (WorkManager, every 15 min)
           └── restarts service if OS killed it
```

### Outbox state machine

```
PENDING --[send ok]-----------> SMS_SENT --[ack ok]--> SENT
        --[fail, retry]-------> PENDING (+ exponential backoff, base 5m, cap 15m)
        --[retries exhausted]--> DLQ_ACK_PENDING --[ack ok]--> DEAD_LETTER
```

All state is written to Room **before** any network call. If the connection drops between sending a message and ACKing the server, the intermediate state (`SMS_SENT` or `DLQ_ACK_PENDING`) persists across restarts and flushes on the next poll or network restore.

### Inbox flow

```
SMS arrives -> SmsReceiver (goAsync) -> Room (synced=false)
                                              |
                              SmsGatewayService detects unsynced rows
                                              |
                              POST /device/sms/received -> Room (synced=true)
```

---

## Rate limiting

`RateLimiter` enforces a sliding-window cap on outbound SMS to avoid exceeding carrier limits. Default: 10 messages per minute. Configurable in `RateLimiter.kt`.

---

## Deeplink

The app registers the `pmcpaas://setup` URI scheme. When the web UI generates a QR code for device onboarding, it encodes:

```
pmcpaas://setup?url=<server-url>&key=<device-uuid>
```

`MainActivity.handleDeeplink()` parses this and calls `GatewayViewModel.applyDeeplink()`, which writes the config and sets a state flag that triggers the confirmation banner in `SettingsScreen`.

---

## Tests

```bash
cd android

# JVM unit tests (RateLimiter logic)
./gradlew test

# Instrumented tests -- requires connected device or emulator
# (Room DAO tests, gateway flow tests)
./gradlew connectedAndroidTest
```
