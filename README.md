# Poor Man's CPaaS

> Send and receive SMS from your own server using an Android phone as the gateway. No Twilio, no carrier API contracts, no per-message fees.

You run a cheap Node.js server. You plug in an Android phone with a SIM card. Your backend calls one HTTP endpoint to send an SMS, and gets a webhook when messages arrive.

---

## How it works

```
┌──────────────────────────────────────────────────────────┐
│           Your Backend / App                             │
│                                                          │
│  POST /api/sms/send   Authorization: Bearer pmk_...      │
│  GET  /api/sms/inbox  Authorization: Bearer pmk_...      │
└────────────────┬─────────────────────────┬───────────────┘
                 │                         |
                 v                         |
┌──────────────────────────────────────────────────────────┐
│                    CPaaS Server                          │
│          (Express + PostgreSQL + Svelte UI)              │
│                                                          │
│  /auth/*    -- register / login / logout                 │
│  /devices/* -- manage Android gateways (JWT cookie)      │
│  /api/*     -- send, inbox, stats, settings              │
│  /device/*  -- Android device protocol (X-Api-Key: UUID) │
│  /health    -- liveness + last device heartbeat          │
└────────────────┬─────────────────────────┬───────────────┘
                 | poll / ack              | received batch
                 v                         |
┌──────────────────────────────────────────────────────────┐
│                  Android App                             │
│          (ForegroundService + Room + WorkManager)        │
│                                                          │
│  Outbox: PENDING -> SMS_SENT -> SENT                     │
│  Inbox:  received -> buffered -> synced                  │
└────────────────┬─────────────────────────^───────────────┘
                 | SmsManager              | SmsReceiver
                 v                         |
            Mobile Network <───────────────┘
```

---

## Architecture

### Auth model

Three distinct credential types, each with a different transport and scope:

| Credential     | Format         | Transport               | Scope                     |
| -------------- | -------------- | ----------------------- | ------------------------- |
| Session cookie | Signed JWT     | `HttpOnly` cookie       | Web UI only               |
| User API key   | `pmk_<64 hex>` | `Authorization: Bearer` | `/api/*` and `/devices/*` |
| Device key     | UUID           | `X-Api-Key` header      | `/device/*` only          |

Session cookies and API keys are completely separate. Losing an API key does not compromise your login session, and vice versa. Rotate either independently from the Settings page.

### Outbound flow (sending an SMS)

```mermaid
sequenceDiagram
    participant App as Your App
    participant Srv as CPaaS Server
    participant DB as PostgreSQL
    participant Droid as Android Device
    participant Radio as Mobile Radio

    App->>Srv: POST /api/sms/send {to, body, webhookUrl?}
    Note over App,Srv: Authorization: Bearer pmk_...
    Srv->>DB: INSERT status=pending, device_id=<routed>
    Srv-->>App: 201 {id, status: "pending", deviceId}

    loop Every poll interval (default 30s)
        Droid->>Srv: GET /device/sms/outbound
        Note over Droid,Srv: X-Api-Key: <device-uuid>
        Srv->>DB: SELECT WHERE device_id=<this> AND status=pending
        Srv-->>Droid: [{id, to, body}]
        Droid->>Srv: POST /device/sms/ack [{id, status: "in_progress"}]
    end

    Droid->>Radio: sendTextMessage

    alt SMS sent
        Radio-->>Droid: RESULT_OK
        Droid->>Srv: POST /device/sms/ack [{id, status: "sent"}]
        Srv-->>App: POST webhookUrl {event: "sms.sent", ...}
    else Retries exhausted
        Radio-->>Droid: RESULT_ERROR_*
        Droid->>Srv: POST /device/sms/ack [{id, status: "dead_letter", reason: "NO_SERVICE"}]
        Srv-->>App: POST webhookUrl {event: "sms.failed", ...}
    end
```

### Inbound flow (receiving an SMS)

```mermaid
sequenceDiagram
    participant Sender
    participant Radio as Mobile Network
    participant Droid as Android Device
    participant Srv as CPaaS Server
    participant App as Your App

    Sender->>Radio: SMS to your SIM
    Radio->>Droid: SMS_RECEIVED broadcast (priority 999)
    Droid->>Droid: SmsReceiver (goAsync) -> Room DB synced=false
    Droid->>Srv: POST /device/sms/received [{from, body, receivedAt}]
    Srv->>Srv: INSERT sms_received
    Srv-->>App: POST webhookUrl {event: "sms.received", ...}
    Droid->>Droid: mark inbox synced=true
```

### Device routing

When `POST /api/sms/send` receives a request, the server assigns a device at INSERT time using this algorithm:

```
1. Fetch all registered devices for the user
2. Filter to active: last_seen > now() - 10 min
3. If health_check_enabled:
     compute failure_rate for each active device (last 50 messages)
     exclude devices with failure_rate >= 0.7
     if all degraded, route through all active anyway
4. Pick by routing_strategy:
     least_load   -> fewest pending messages
     round_robin  -> oldest last_assigned_at (NULL first)
5. No active devices: fallback to is_primary device (queues offline)
6. No devices at all: 422 "No devices registered"
```

Routing strategy and health checks are configurable per-user in Settings.

### Offline resilience

```mermaid
graph LR
    A[SMS sent via radio] -->|success| B[local: SMS_SENT]
    A -->|failure| C[local: PENDING + backoff]
    C -->|max retries| D[local: DLQ_ACK_PENDING]
    B --> E{Network?}
    D --> E
    E -->|yes, 200| F[terminal: SENT / DEAD_LETTER]
    E -->|no / non-200| G[wait for next poll or network restore]
    G --> E
```

State is written to the local Room DB **before** any network call. Nothing is lost if the connection drops mid-flow.

---

## Requirements

| Component       | Requirement                                  |
| --------------- | -------------------------------------------- |
| **Server**      | Node.js 20+, PostgreSQL 14+                  |
| **Android app** | Android 10+ (API 29), SIM card with SMS plan |

---

## Quick start

### Option A: Docker (recommended)

```bash
# clone and start
git clone ...
cd poor-mans-cpaas

# set a real JWT_SECRET before first run
export JWT_SECRET=some-long-random-string

npm run docker:up     # builds and starts server + postgres
npm run docker:logs   # tail server logs
```

Open `http://localhost:3000` and register an account.

To wipe all data and start fresh:

```bash
npm run docker:reset  # removes volumes
npm run docker:up
```

### Option B: Local dev

```bash
cd server
cp .env.example .env
# edit .env: set DATABASE_URL and JWT_SECRET
npm install
npm run db:migrate
npm run dev
```

Then in a second terminal:

```bash
cd ui
npm install
npm run dev   # Vite dev server at :5173, proxies API to :3000
```

**`.env` reference**

```env
DATABASE_URL=postgres://user:password@localhost:5432/cpaas

# Required: sign session cookies and JWTs
JWT_SECRET=change-me-local

PORT=3000
```

---

### Android app setup

1. Open `android/` in Android Studio (open this folder as the project root, not the monorepo root)
2. Build and run on your device, or `./gradlew installDebug` from `android/`
3. In the web UI, go to **Devices** and click **Add Device**
4. Scan the QR code with your phone
   - The app opens automatically, pre-fills Server URL and API Key, and shows a confirmation banner
   - Tap **Save** to confirm
5. Tap **Start Gateway** on the Dashboard tab
6. Grant SMS and notification permissions when prompted

The app will request battery optimisation exemption. Tap **Allow** -- without it Android may suspend polling in Doze mode.

> **Tip:** The app survives screen-off, reboots, and app swipes. A WorkManager watchdog restarts the service if the OS kills it.

---

## API reference

### Authentication

**Web UI (session):** Cookie is set automatically after login. Used only by the browser.

**Programmatic access:** Generate an API key from **Settings** in the web UI. Pass it as:

```
Authorization: Bearer pmk_<64-hex-chars>
```

**Device (Android only):** The UUID shown when registering a device. Pass it as:

```
X-Api-Key: <device-uuid>
```

---

### Auth endpoints

#### Register

```
POST /auth/register
```

```json
{ "username": "alice", "password": "hunter2hunter2" }
```

Response `201`:

```json
{ "id": "uuid", "username": "alice" }
```

#### Login

```
POST /auth/login
```

```json
{ "username": "alice", "password": "hunter2hunter2" }
```

Sets `token` cookie. Response `200`: same as register.

#### Logout

```
POST /auth/logout
```

Clears cookie.

#### Current user

```
GET /auth/me
```

---

### Devices endpoints

Requires session cookie or `Authorization: Bearer pmk_...`.

#### List devices

```
GET /devices
```

Returns array of `{ id, name, isPrimary, lastSeen, createdAt }`. API key is never returned after registration.

#### Register device

```
POST /devices
```

```json
{ "name": "Pixel 8 Pro" }
```

Response `201`:

```json
{
  "id": "uuid",
  "name": "Pixel 8 Pro",
  "isPrimary": true,
  "createdAt": "...",
  "apiKey": "uuid"
}
```

**The `apiKey` field is only returned once.** Copy it or scan the QR code from the web UI.

#### Delete device

```
DELETE /devices/:id
```

#### Set primary device

```
POST /devices/:id/primary
```

---

### SMS endpoints

Requires `Authorization: Bearer pmk_...` (or session cookie from web UI).

#### Send an SMS

```
POST /api/sms/send
```

```json
{
  "to": "+30210XXXXXXX",
  "body": "Your verification code is 482910",
  "deviceId": "uuid",
  "webhookUrl": "https://your-app.example.com/webhooks/sms-result"
}
```

`deviceId` and `webhookUrl` are optional. If `deviceId` is omitted, the server routes based on the active routing strategy.

Response `201`:

```json
{ "id": "uuid", "status": "pending", "deviceId": "uuid" }
```

#### Get message status

```
GET /api/sms/:id
```

#### List outbox

```
GET /api/sms/outbox?status=pending&page=1&pageSize=20
```

Status filter values: `pending` `sent` `failed` `dead_letter`

#### List inbox

```
GET /api/sms/inbox?page=1&pageSize=20
```

#### Requeue dead-letter message

```
POST /api/sms/:id/retry
```

Only works when `status` is `dead_letter`. Resets to `pending`.

---

### Settings endpoints

Requires `Authorization: Bearer pmk_...` (or session cookie).

#### Get settings

```
GET /api/settings
```

```json
{
  "routingStrategy": "least_load",
  "healthCheckEnabled": true,
  "webhookUrl": null,
  "webhookSecretSet": false,
  "apiKeySet": true
}
```

#### Update settings

```
PATCH /api/settings
```

```json
{
  "routingStrategy": "round_robin",
  "healthCheckEnabled": false,
  "webhookUrl": "https://your-app.example.com/webhooks/sms"
}
```

All fields optional. `webhookUrl` accepts `null` to clear.

#### Generate/rotate API key

```
POST /api/settings/api-key
```

Returns `{ "apiKey": "pmk_..." }`. Invalidates any previous key.

#### Generate/rotate webhook secret

```
POST /api/settings/webhook-secret
```

Returns `{ "webhookSecret": "<64-hex>" }`. Use to verify webhook payloads with HMAC.

---

### Health check

```
GET /health
```

```json
{ "db": true, "deviceLastSeen": "2024-11-15T14:32:01.000Z" }
```

Returns `503` if the database is unreachable.

---

## Webhooks

Fired server-side over HTTPS. The mobile device never sees webhook URLs.

Webhook URLs are validated at save time -- private IP ranges and loopback addresses are rejected.

### `sms.sent`

```json
{
  "event": "sms.sent",
  "data": {
    "id": "uuid",
    "to": "+30210XXXXXXX",
    "sentAt": "2024-11-15T14:32:00.000Z"
  }
}
```

### `sms.failed`

```json
{
  "event": "sms.failed",
  "data": {
    "id": "uuid",
    "to": "+30210XXXXXXX",
    "status": "dead_letter",
    "reason": "NO_SERVICE"
  }
}
```

Possible `reason` values: `GENERIC_FAILURE` `RADIO_OFF` `NO_SERVICE` `NULL_PDU` `LIMIT_EXCEEDED` `FDN_CHECK_FAILURE` `SHORT_CODE_NOT_ALLOWED` `SHORT_CODE_NEVER_ALLOWED`

### `sms.received`

Fired for every inbound message. Configure the webhook URL in **Settings** in the web UI.

```json
{
  "event": "sms.received",
  "data": {
    "id": "uuid",
    "from": "+30697XXXXXXX",
    "body": "STOP",
    "receivedAt": "2024-11-15T14:31:55.000Z"
  }
}
```

---

## Android app internals

| Component           | Role                                                                         |
| ------------------- | ---------------------------------------------------------------------------- |
| `SmsGatewayService` | Foreground service: polls server, sends SMS, syncs acks and inbox            |
| `SmsReceiver`       | Priority-999 broadcast receiver: captures incoming SMS, buffers to Room      |
| `BootReceiver`      | Restarts the service after device reboot                                     |
| `WatchdogWorker`    | WorkManager periodic task (every 15 min): resurrects service if OS killed it |
| Room (`outbox`)     | Local buffer for outbound messages and ack state                             |
| Room (`inbox`)      | Local buffer for received messages until synced                              |

**Outbox state machine**

```
PENDING --[send ok]----------> SMS_SENT --[ack ok]--> SENT
        --[fail, retry]------> PENDING (+ exponential backoff)
        --[retries exhausted]-> DLQ_ACK_PENDING --[ack ok]--> DEAD_LETTER
```

---

## Development

```bash
# from monorepo root

npm run server:dev     # server with hot reload (port 3000)
npm run ui:dev         # Svelte dev server (port 5173, proxied to server)

npm run db:generate    # generate Drizzle migrations after schema changes
npm run db:migrate     # apply migrations

npm run docker:up      # build and start with Docker Compose
npm run docker:logs    # tail server container logs
npm run docker:reset   # wipe volumes and stop
```

Android tests:

```bash
cd android
./gradlew test                    # JVM unit tests
./gradlew connectedAndroidTest    # instrumented tests (Room DAOs)
```

---

## License

MIT
