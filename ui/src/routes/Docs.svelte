<script lang="ts">
  const base = window.location.origin;
</script>

<div class="docs-layout">

  <!-- sidebar -->
  <nav class="sidebar">
    <a href="#auth">Authentication</a>
    <a href="#send">Send SMS</a>
    <a href="#outbox">Outbox</a>
    <a href="#inbox">Inbox</a>
    <a href="#device">Device (Android)</a>
    <a href="#webhook">Webhooks</a>
  </nav>

  <!-- content -->
  <div class="content">

    <div class="page-title">
      <h2>API Reference</h2>
      <code class="base-url">{base}</code>
    </div>

    <!-- ── Auth ── -->
    <section id="auth">
      <h3>Authentication</h3>
      <p>Three distinct credentials — never interchangeable:</p>
      <ul>
        <li><strong>Session cookie</strong> — httpOnly JWT set by <code>POST /auth/login</code>. Web UI only.</li>
        <li><strong>API key</strong> — opaque <code>pmk_…</code> token from Settings → API Key. Send as <code>Authorization: Bearer &lt;key&gt;</code> on <code>/api/*</code> requests. Separate from your session; revocable without logging out.</li>
        <li><strong>Device key</strong> — per-device UUID from the Devices tab. Sent as <code>X-Api-Key: &lt;key&gt;</code> on <code>/device/*</code> routes only.</li>
      </ul>

      <div class="ep">
        <div class="ep-head">
          <span class="method post">POST</span>
          <span class="path">/auth/register</span>
          <span class="ep-note">Open — no auth required</span>
        </div>
        <pre>{`curl -X POST ${base}/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"username":"alice","password":"s3cret"}'`}</pre>
      </div>

      <div class="ep">
        <div class="ep-head">
          <span class="method post">POST</span>
          <span class="path">/auth/login</span>
          <span class="ep-note">Sets httpOnly JWT cookie</span>
        </div>
        <pre>{`curl -c cookies.txt -X POST ${base}/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"alice","password":"s3cret"}'`}</pre>
      </div>

      <div class="ep">
        <div class="ep-head">
          <span class="method get">GET</span>
          <span class="path">/auth/me</span>
        </div>
        <pre>{`curl -b cookies.txt ${base}/auth/me
# → {"id":"…","username":"alice"}`}</pre>
      </div>
    </section>

    <!-- ── Send ── -->
    <section id="send">
      <h3>Send SMS</h3>

      <div class="ep">
        <div class="ep-head">
          <span class="method post">POST</span>
          <span class="path">/api/sms/send</span>
        </div>
        <table class="params-table">
          <tr><td><code>to</code></td><td><span class="badge-req">required</span></td><td>E.164 number — <code>+306970000000</code></td></tr>
          <tr><td><code>body</code></td><td><span class="badge-req">required</span></td><td>Message text</td></tr>
          <tr><td><code>deviceId</code></td><td><span class="badge-opt">optional</span></td><td>Pin to specific device; omit to auto-route</td></tr>
        </table>
        <pre>{`curl -b cookies.txt -X POST ${base}/api/sms/send \\
  -H "Content-Type: application/json" \\
  -d '{"to":"+306970000000","body":"Hello"}'
# → {"id":"uuid","status":"pending","deviceId":"uuid"}

# or with Bearer token
curl -H "Authorization: Bearer <key>" \\
     -H "Content-Type: application/json" \\
     -X POST ${base}/api/sms/send \\
     -d '{"to":"+306970000000","body":"Hello"}'`}</pre>
      </div>
    </section>

    <!-- ── Outbox ── -->
    <section id="outbox">
      <h3>Outbox</h3>

      <div class="ep">
        <div class="ep-head">
          <span class="method get">GET</span>
          <span class="path">/api/sms/outbox</span>
        </div>
        <table class="params-table">
          <tr><td><code>page</code></td><td><span class="badge-opt">optional</span></td><td>Default 1</td></tr>
          <tr><td><code>pageSize</code></td><td><span class="badge-opt">optional</span></td><td>Default 20, max 100</td></tr>
          <tr><td><code>status</code></td><td><span class="badge-opt">optional</span></td><td><code>pending</code> | <code>sent</code> | <code>failed</code> | <code>dead_letter</code></td></tr>
        </table>
        <pre>{`curl -b cookies.txt "${base}/api/sms/outbox?status=pending&pageSize=50"`}</pre>
      </div>

      <div class="ep">
        <div class="ep-head">
          <span class="method get">GET</span>
          <span class="path">/api/sms/:id</span>
        </div>
        <pre>{`curl -b cookies.txt ${base}/api/sms/<uuid>`}</pre>
      </div>

      <div class="ep">
        <div class="ep-head">
          <span class="method post">POST</span>
          <span class="path">/api/sms/:id/retry</span>
          <span class="ep-note">Re-queues a dead_letter message</span>
        </div>
        <pre>{`curl -b cookies.txt -X POST ${base}/api/sms/<uuid>/retry`}</pre>
      </div>
    </section>

    <!-- ── Inbox ── -->
    <section id="inbox">
      <h3>Inbox</h3>

      <div class="ep">
        <div class="ep-head">
          <span class="method get">GET</span>
          <span class="path">/api/sms/inbox</span>
        </div>
        <table class="params-table">
          <tr><td><code>page</code></td><td><span class="badge-opt">optional</span></td><td>Default 1</td></tr>
          <tr><td><code>pageSize</code></td><td><span class="badge-opt">optional</span></td><td>Default 20, max 100</td></tr>
        </table>
        <pre>{`curl -b cookies.txt "${base}/api/sms/inbox?pageSize=20"
# → [{"id":"…","fromNumber":"+30697…","body":"…","receivedAt":"…"}]`}</pre>
      </div>
    </section>

    <!-- ── Device ── -->
    <section id="device">
      <h3>Device endpoints (Android)</h3>
      <p>All require <code>X-Api-Key: &lt;device-key&gt;</code> from the Devices tab.</p>

      <div class="ep">
        <div class="ep-head">
          <span class="method get">GET</span>
          <span class="path">/device/sms/outbound</span>
          <span class="ep-note">Fetch pending messages + update last_seen</span>
        </div>
        <pre>{`curl -H "X-Api-Key: <key>" ${base}/device/sms/outbound
# → [{"id":"…","to":"+30…","body":"Hello"}]`}</pre>
      </div>

      <div class="ep">
        <div class="ep-head">
          <span class="method post">POST</span>
          <span class="path">/device/sms/outbound/ack</span>
          <span class="ep-note">Acknowledge delivery results</span>
        </div>
        <pre>{`curl -X POST -H "X-Api-Key: <key>" \\
  -H "Content-Type: application/json" \\
  ${base}/device/sms/outbound/ack \\
  -d '[{"id":"<uuid>","status":"sent"}]'
# status: "sent" | "failed"  (+ optional "failureReason")`}</pre>
      </div>

      <div class="ep">
        <div class="ep-head">
          <span class="method post">POST</span>
          <span class="path">/device/sms/received</span>
          <span class="ep-note">Push inbound SMS batch</span>
        </div>
        <pre>{`curl -X POST -H "X-Api-Key: <key>" \\
  -H "Content-Type: application/json" \\
  ${base}/device/sms/received \\
  -d '[{"from":"+30697…","body":"STOP","receivedAt":1750000000000}]'`}</pre>
      </div>
    </section>

    <!-- ── Webhook ── -->
    <section id="webhook">
      <h3>Webhooks</h3>
      <p>Configure your URL in <strong>Settings → Inbound Webhook</strong>. The server POSTs on every received SMS.</p>

      <div class="ep">
        <div class="ep-head">
          <span class="method post">POST</span>
          <span class="path">&lt;your-webhook-url&gt;</span>
        </div>
        <pre>{`Content-Type: application/json
X-Webhook-Signature: sha256=<hmac>   ← when secret is set

{
  "event": "sms.received",
  "data": {
    "id": "uuid",
    "from": "+306970000000",
    "body": "Hello",
    "receivedAt": "2026-08-31T10:00:00.000Z"
  }
}`}</pre>
      </div>

      <p>Verify the signature:</p>
      <pre>{`import { createHmac, timingSafeEqual } from 'crypto';

// use express.raw() so req.body is a Buffer
app.post('/webhook', express.raw({ type: '*/*' }), (req, res) => {
  const sig = req.headers['x-webhook-signature'] ?? '';
  const expected = 'sha256=' + createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(req.body).digest('hex');
  const ok = sig.length === expected.length &&
    timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return res.status(401).send('Bad signature');

  const { event, data } = JSON.parse(req.body.toString());
  // event === 'sms.received'
  res.sendStatus(200);
});`}</pre>
    </section>

  </div>
</div>

<style>
  .docs-layout {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 32px;
    align-items: start;
  }
  @media (max-width: 700px) { .docs-layout { grid-template-columns: 1fr; } }

  /* ── sidebar ── */
  .sidebar {
    position: sticky; top: 120px;
    display: flex; flex-direction: column; gap: 2px;
  }
  .sidebar a {
    display: block; padding: 6px 10px;
    font-size: 12px; color: var(--muted); text-decoration: none;
    border-radius: 6px; transition: color .1s, background .1s;
  }
  .sidebar a:hover { color: var(--text); background: var(--surface); }

  /* ── content ── */
  .content { display: flex; flex-direction: column; gap: 36px; max-width: 700px; }

  .page-title { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
  h2 { font-size: 16px; font-weight: 600; }
  .base-url { font-size: 11px; color: var(--muted); }

  section { display: flex; flex-direction: column; gap: 16px; }
  h3 {
    font-size: 14px; font-weight: 700;
    padding-bottom: 10px; border-bottom: 1px solid var(--border);
  }
  p { font-size: 13px; line-height: 1.6; color: var(--text); }
  ul { font-size: 13px; line-height: 1.8; padding-left: 18px; }
  code { font-family: var(--mono); font-size: 11px; background: var(--surface2); padding: 1px 6px; border-radius: 4px; }

  /* ── endpoint block ── */
  .ep { display: flex; flex-direction: column; gap: 8px; }
  .ep-head {
    display: flex; align-items: center; gap: 10px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px 8px 0 0; padding: 10px 14px;
    margin-bottom: -1px;
  }
  .method {
    font-family: var(--mono); font-size: 11px; font-weight: 700;
    padding: 2px 8px; border-radius: 4px; letter-spacing: .05em;
    flex-shrink: 0;
  }
  .method.get  { background: rgba(63,185,80,.15);  color: var(--success); }
  .method.post { background: rgba(124,58,237,.15); color: var(--accent); }
  .path { font-family: var(--mono); font-size: 13px; font-weight: 600; flex: 1; }
  .ep-note { font-size: 11px; color: var(--muted); }

  /* ── params table ── */
  .params-table {
    width: 100%; border-collapse: collapse;
    background: var(--surface); border: 1px solid var(--border);
    margin-bottom: -1px;
  }
  .params-table td { padding: 7px 14px; font-size: 12px; border-bottom: 1px solid var(--border); }
  .params-table tr:last-child td { border-bottom: none; }
  .params-table td:first-child { width: 100px; }
  .params-table td:nth-child(2) { width: 80px; }
  .badge-req { background: rgba(210,153,34,.15); color: var(--warning); font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
  .badge-opt { background: rgba(139,148,158,.12); color: var(--muted); font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; }

  pre {
    background: var(--bg); border: 1px solid var(--border); border-radius: 0 0 8px 8px;
    padding: 12px 14px; font-family: var(--mono); font-size: 11px;
    line-height: 1.7; overflow-x: auto; white-space: pre; margin: 0;
  }
  /* standalone pre (not under ep-head) */
  section > pre { border-radius: 8px; }
</style>
