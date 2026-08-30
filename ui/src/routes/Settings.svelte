<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';

  interface UserSettings {
    routingStrategy: 'least_load' | 'round_robin';
    healthCheckEnabled: boolean;
    webhookUrl: string | null;
    webhookSecretSet: boolean;
    apiKeySet: boolean;
  }

  let settings: UserSettings | null = null;
  let webhookUrl = '';
  let routingStrategy: 'least_load' | 'round_robin' = 'least_load';
  let healthCheckEnabled = true;
  let saving = false;
  let generatedKey = '';
  let generatingKey = false;
  let generatedWebhookSecret = '';
  let generatingWebhookSecret = false;
  let toast = '';
  let toastOk = true;

  function showToast(msg: string, ok = true) {
    toast = msg; toastOk = ok;
    setTimeout(() => (toast = ''), 3000);
  }

  async function load() {
    try {
      settings = await api.get<UserSettings>('/api/settings');
      webhookUrl = settings.webhookUrl ?? '';
      routingStrategy = settings.routingStrategy;
      healthCheckEnabled = settings.healthCheckEnabled;
    } catch { showToast('Failed to load settings', false); }
  }

  async function save() {
    saving = true;
    try {
      await api.put('/api/settings', { webhookUrl: webhookUrl || null, routingStrategy, healthCheckEnabled });
      showToast('Saved');
    } catch { showToast('Failed to save', false); }
    saving = false;
  }

  async function generateWebhookSecret() {
    if (!confirm('Replace existing webhook secret?')) return;
    generatingWebhookSecret = true;
    try {
      const { webhookSecret } = await api.post<{ webhookSecret: string }>('/api/settings/webhook-secret');
      generatedWebhookSecret = webhookSecret;
      if (settings) settings.webhookSecretSet = true;
    } catch { showToast('Failed', false); }
    generatingWebhookSecret = false;
  }

  async function generateKey() {
    if (!confirm('Old API key will stop working immediately.')) return;
    generatingKey = true;
    try {
      const { apiKey } = await api.post<{ apiKey: string }>('/api/settings/api-key');
      generatedKey = apiKey;
    } catch { showToast('Failed', false); }
    generatingKey = false;
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied!')).catch(() => showToast('Copy failed', false));
  }

  onMount(load);
</script>

<div class="page-header">
  <h2>Settings</h2>
  <button class="btn btn-primary btn-sm" on:click={save} disabled={saving}>
    {saving ? 'Saving…' : 'Save changes'}
  </button>
</div>

<div class="grid">

  <!-- ── Routing ── -->
  <div class="panel">
    <div class="panel-label">Routing</div>

    <div class="row-field">
      <div class="field-meta">
        <span class="field-title">Strategy</span>
        <span class="field-sub">How messages are assigned to devices when multiple are online</span>
      </div>
      <select bind:value={routingStrategy}>
        <option value="least_load">Least load</option>
        <option value="round_robin">Round robin</option>
      </select>
    </div>

    <div class="divider"></div>

    <div class="row-field">
      <div class="field-meta">
        <span class="field-title">Health check</span>
        <span class="field-sub">Deprioritize devices with ≥70% failure rate in last 10 messages</span>
      </div>
      <label class="switch" aria-label="Health check">
        <input type="checkbox" bind:checked={healthCheckEnabled} />
        <span class="track"><span class="thumb"></span></span>
      </label>
    </div>
  </div>

  <!-- ── Webhook ── -->
  <div class="panel">
    <div class="panel-label">Inbound Webhook</div>

    <div class="field">
      <label for="wh-url">URL</label>
      <input id="wh-url" type="url" bind:value={webhookUrl} placeholder="https://your-server.com/webhook" />
    </div>

    <div class="payload-preview">
      <span class="payload-tag">POST payload</span>
      <pre>{`{ "event": "sms.received",
  "data": { "id": "uuid", "from": "+30697…",
            "body": "…", "receivedAt": "…" } }`}</pre>
    </div>
  </div>

  <!-- ── Webhook secret ── -->
  <div class="panel">
    <div class="panel-label">Webhook Secret</div>
    <p class="panel-desc">Signs every webhook request with <code>X-Webhook-Signature: sha256=…</code> so you can verify authenticity.</p>

    {#if generatedWebhookSecret}
      <div class="secret-reveal">
        <code class="secret-val">{generatedWebhookSecret}</code>
        <button class="btn btn-ghost btn-sm" on:click={() => copy(generatedWebhookSecret)}>Copy</button>
      </div>
      <p class="once-warn">Not stored — copy now.</p>
    {:else}
      <div class="row-between">
        {#if settings?.webhookSecretSet}
          <span class="status-ok">✓ Secret configured</span>
        {:else}
          <span class="status-none">No secret set</span>
        {/if}
        <button class="btn btn-ghost btn-sm" on:click={generateWebhookSecret} disabled={generatingWebhookSecret}>
          {generatingWebhookSecret ? '…' : settings?.webhookSecretSet ? 'Regenerate' : 'Generate'}
        </button>
      </div>
    {/if}
  </div>

  <!-- ── API key ── -->
  <div class="panel">
    <div class="panel-label">API Key</div>
    <p class="panel-desc">Use as <code>Authorization: Bearer &lt;key&gt;</code> for programmatic access. Separate from your login session — regenerating replaces the old key immediately.</p>

    {#if generatedKey}
      <div class="secret-reveal">
        <code class="secret-val">{generatedKey}</code>
        <button class="btn btn-ghost btn-sm" on:click={() => copy(generatedKey)}>Copy</button>
      </div>
      <p class="once-warn">Not stored — copy now.</p>
    {:else}
      <div class="row-between">
        {#if settings?.apiKeySet}
          <span class="status-ok">✓ Key configured</span>
        {:else}
          <span class="status-none">No key generated</span>
        {/if}
        <button class="btn btn-ghost btn-sm" on:click={generateKey} disabled={generatingKey}>
          {generatingKey ? '…' : settings?.apiKeySet ? 'Regenerate' : 'Generate API key'}
        </button>
      </div>
    {/if}
  </div>

</div>

{#if toast}
  <div class="toast" class:ok={toastOk} class:fail={!toastOk}>{toast}</div>
{/if}

<style>
  .page-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 24px;
  }
  h2 { font-size: 16px; font-weight: 600; }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    max-width: 900px;
  }
  @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }

  /* ── panel ── */
  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .panel-label {
    font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .08em;
    color: var(--muted);
  }
  .panel-desc { font-size: 12px; color: var(--muted); line-height: 1.55; margin: 0; }
  .panel-desc code { font-family: var(--mono); font-size: 11px; background: var(--bg); padding: 1px 5px; border-radius: 3px; }

  .divider { height: 1px; background: var(--border); margin: 2px 0; }

  /* ── row fields ── */
  .row-field {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }
  .field-meta { display: flex; flex-direction: column; gap: 2px; }
  .field-title { font-size: 13px; font-weight: 500; }
  .field-sub { font-size: 11px; color: var(--muted); }

  .row-field select { width: 140px; font-size: 12px; }

  /* ── toggle switch ── */
  .switch { position: relative; display: inline-block; cursor: pointer; flex-shrink: 0; }
  .switch input { opacity: 0; width: 0; height: 0; position: absolute; }
  .track {
    display: block; width: 40px; height: 22px;
    background: var(--surface2); border: 1px solid var(--border);
    border-radius: 11px; transition: background .2s, border-color .2s;
    position: relative;
  }
  .thumb {
    position: absolute; top: 3px; left: 3px;
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--muted); transition: transform .2s, background .2s;
  }
  .switch input:checked ~ .track { background: var(--accent); border-color: var(--accent-h); }
  .switch input:checked ~ .track .thumb { transform: translateX(18px); background: #fff; }

  /* ── webhook payload preview ── */
  .payload-preview {
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 6px; overflow: hidden;
  }
  .payload-tag {
    display: block; font-size: 10px; color: var(--muted);
    padding: 5px 10px; border-bottom: 1px solid var(--border);
    letter-spacing: .04em; text-transform: uppercase;
  }
  .payload-preview pre {
    margin: 0; padding: 10px 12px;
    font-family: var(--mono); font-size: 11px; line-height: 1.6;
    overflow-x: auto; white-space: pre;
  }

  /* ── secret / key reveal ── */
  .secret-reveal {
    display: flex; align-items: flex-start; gap: 8px;
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 6px; padding: 10px 12px;
  }
  .secret-val {
    font-family: var(--mono); font-size: 11px; color: var(--success);
    word-break: break-all; flex: 1;
  }
  .once-warn { font-size: 11px; color: var(--warning); }
  .row-between { display: flex; align-items: center; justify-content: space-between; }
  .status-ok   { font-size: 12px; color: var(--success); }
  .status-none { font-size: 12px; color: var(--muted); }

  /* ── toast ── */
  .toast {
    position: fixed; bottom: 24px; right: 24px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 16px; font-size: 13px; z-index: 300;
  }
  .toast.ok   { border-color: var(--success); color: var(--success); }
  .toast.fail { border-color: var(--danger);  color: var(--danger); }
</style>
