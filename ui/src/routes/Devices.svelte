<script lang="ts">
  import { onMount, tick, createEventDispatcher } from 'svelte';
  import { devices, deviceStatus, reltime } from '../lib/stores.js';
  import { api } from '../lib/api.js';
  import type { Device, DeviceStat } from '../lib/types.js';

  const serverUrl = window.location.origin;

  export let deviceStats: DeviceStat[] = [];

  const dispatch = createEventDispatcher();

  let showModal = false;
  let devName = '';
  let newApiKey = '';
  let registering = false;
  let toast = '';
  let toastOk = true;
  let qrEl: HTMLDivElement | undefined;

  function showToast(msg: string, ok = true) {
    toast = msg; toastOk = ok;
    setTimeout(() => (toast = ''), 2500);
  }

  async function load() {
    try { devices.set(await api.get<Device[]>('/devices')); }
    catch { showToast('Failed to load devices', false); }
  }

  onMount(load);

  async function openModal() {
    devName = ''; newApiKey = ''; showModal = true;
  }

  async function renderQr() {
    await tick();
    if (!qrEl || !newApiKey) return;
    const deeplink = `pmcpaas://setup?url=${encodeURIComponent(serverUrl)}&key=${encodeURIComponent(newApiKey)}`;
    if (!(window as any).QRCode) {
      await new Promise<void>((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
      });
    }
    if (!(window as any).QRCode || !qrEl) return;
    qrEl.innerHTML = '';
    new (window as any).QRCode(qrEl, {
      text: deeplink,
      width: 168,
      height: 168,
    });
  }

  async function registerDevice() {
    if (!devName.trim() || registering) return;
    registering = true;
    try {
      const d = await api.post<Device & { apiKey: string }>('/devices', { name: devName.trim() });
      newApiKey = d.apiKey;
      await load();
      dispatch('refresh');
      await renderQr();
    } catch (e: unknown) {
      showToast((e as { error?: string }).error ?? 'Failed', false);
      showModal = false;
    } finally { registering = false; }
  }

  async function setPrimary(id: string) {
    try { await api.post(`/devices/${id}/primary`); await load(); showToast('Primary updated'); dispatch('refresh'); }
    catch { showToast('Failed', false); }
  }

  async function removeDevice(d: Device) {
    if (!confirm(`Remove "${d.name}"? Pending messages assigned to it won't be sent.`)) return;
    try { await api.del(`/devices/${d.id}`); await load(); showToast('Device removed'); dispatch('refresh'); }
    catch { showToast('Failed', false); }
  }

  function copy(text: string, label = 'Copied!') {
    navigator.clipboard.writeText(text)
      .then(() => showToast(label))
      .catch(() => showToast('Copy failed', false));
  }
</script>

<div class="section-header">
  <h2>Devices</h2>
  <button class="btn btn-primary btn-sm" on:click={openModal}>+ Register device</button>
</div>

{#if $devices.length === 0}
  <div class="empty-state">
    <div class="empty-icon">◱</div>
    <p>No devices registered</p>
    <p class="sub">Register your Android device to start sending SMS</p>
    <button class="btn btn-primary" on:click={openModal} style="margin-top:16px">Register first device</button>
  </div>
{:else}
  <div class="grid">
    {#each $devices as d (d.id)}
      {@const st = deviceStatus(d.lastSeen)}
      {@const ds = deviceStats.find((s) => s.id === d.id)}
      <div class="card">
        <div class="card-top">
          <div>
            <div class="name">{d.name}</div>
            <div class="id mono">{d.id.slice(0, 8)}…</div>
          </div>
          <div class="badges">
            <span class="badge {st.cls}">{st.label}</span>
            {#if d.isPrimary}<span class="badge badge-purple">PRIMARY</span>{/if}
          </div>
        </div>
        {#if ds}
          <div class="dev-stats">
            <div class="ds-tile"><span class="ds-val">{ds.sent}</span><span class="ds-lbl">Sent</span></div>
            <div class="ds-tile"><span class="ds-val ds-pending">{ds.pending}</span><span class="ds-lbl">Pending</span></div>
            <div class="ds-tile"><span class="ds-val ds-fail">{ds.failed + ds.deadLetter}</span><span class="ds-lbl">Failed</span></div>
            <div class="ds-tile"><span class="ds-val ds-rx">{ds.received}</span><span class="ds-lbl">Received</span></div>
          </div>
        {/if}
        <div class="meta">
          Last seen: <strong>{reltime(d.lastSeen)}</strong>
        </div>
        <div class="actions">
          {#if !d.isPrimary}
            <button class="btn btn-ghost btn-sm" on:click={() => setPrimary(d.id)}>Set primary</button>
          {/if}
          <button class="btn btn-danger btn-sm" on:click={() => removeDevice(d)}>Remove</button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<!-- Register modal -->
{#if showModal}
  <div class="backdrop" on:click|self={() => { if (!newApiKey) showModal = false; }}>
    <div class="modal" role="dialog" aria-modal="true">
      {#if !newApiKey}
        <h2 style="margin-bottom:18px">Add a device</h2>
        <div class="field">
          <label for="dn">Device name</label>
          <input id="dn" type="text" bind:value={devName} placeholder="e.g. Pixel 7 Pro" autofocus
            on:keydown={(e) => e.key === 'Enter' && registerDevice()} />
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" on:click={() => (showModal = false)}>Cancel</button>
          <button class="btn btn-primary" on:click={registerDevice} disabled={registering || !devName.trim()}>
            {registering ? '…' : 'Register →'}
          </button>
        </div>
      {:else}
        <div class="success-head">
          <span class="success-icon">✓</span>
          <h2>Device ready</h2>
        </div>

        <div class="qr-wrap">
          <div bind:this={qrEl} class="qr-box"></div>
          <p class="qr-hint">Scan with the Android app to auto-configure</p>
        </div>

        <p class="or-divider"><span>or enter manually</span></p>

        <div class="cred-row">
          <span class="cred-label">Server</span>
          <code class="cred-val">{serverUrl}</code>
          <button class="btn btn-ghost btn-xs" on:click={() => copy(serverUrl, 'URL copied')}>Copy</button>
        </div>
        <div class="cred-row">
          <span class="cred-label">API Key</span>
          <code class="cred-val key-mono">{newApiKey}</code>
          <button class="btn btn-ghost btn-xs" on:click={() => copy(newApiKey, 'Key copied')}>Copy</button>
        </div>

        <p class="once-warn">Key shown once — save it now.</p>

        <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:8px" on:click={() => (showModal = false)}>
          Done
        </button>
      {/if}
    </div>
  </div>
{/if}

{#if toast}
  <div class="toast" class:ok={toastOk} class:fail={!toastOk}>{toast}</div>
{/if}

<style>
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  h2 { font-size: 16px; font-weight: 600; }

  .empty-state {
    text-align: center; padding: 60px 24px;
    border: 1px dashed var(--border); border-radius: 12px;
  }
  .empty-icon { font-size: 40px; color: var(--muted); margin-bottom: 12px; }
  .empty-state p { color: var(--muted); }
  .empty-state p.sub { font-size: 13px; margin-top: 4px; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }

  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 18px;
    display: flex; flex-direction: column;
  }
  .card-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
  .name { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
  .id { font-size: 11px; color: var(--muted); }
  .badges { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .dev-stats {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 1px; background: var(--border);
    border: 1px solid var(--border); border-radius: 8px;
    overflow: hidden; margin: 12px 0;
  }
  .ds-tile {
    display: flex; flex-direction: column; align-items: center;
    padding: 10px 4px; background: var(--surface);
    transition: background .1s;
  }
  .ds-val {
    font-family: var(--mono); font-size: 18px; font-weight: 700;
    font-variant-numeric: tabular-nums; line-height: 1;
  }
  .ds-val.ds-pending { color: var(--warning); }
  .ds-val.ds-fail    { color: var(--danger); }
  .ds-val.ds-rx      { color: #38bdf8; }
  .ds-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-top: 4px; }

  .meta { font-size: 12px; color: var(--muted); margin-bottom: 14px; }
  .meta strong { color: var(--text); }
  .actions { display: flex; gap: 8px; }

  /* modal */
  .backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.65);
    display: flex; align-items: center; justify-content: center; z-index: 200;
  }
  .modal {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 28px; width: 100%; max-width: 420px;
  }
  .modal h2 { font-size: 16px; font-weight: 600; }
  .modal-note { font-size: 13px; color: var(--muted); margin-bottom: 14px; }

  /* ── success state ── */
  .success-head { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
  .success-icon { font-size: 18px; color: var(--success); font-weight: 700; }

  .qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 16px; }
  .qr-box { width: 168px; height: 168px; background: #fff; border-radius: 8px; padding: 4px; display: flex; align-items: center; justify-content: center; }
  .qr-hint { font-size: 11px; color: var(--muted); }

  .or-divider {
    display: flex; align-items: center; gap: 10px;
    font-size: 11px; color: var(--muted); margin: 4px 0 12px;
  }
  .or-divider::before, .or-divider::after {
    content: ''; flex: 1; height: 1px; background: var(--border);
  }
  .or-divider span { flex-shrink: 0; }

  .cred-row {
    display: flex; align-items: center; gap: 8px;
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 6px; padding: 8px 10px; margin-bottom: 6px;
  }
  .cred-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; width: 44px; flex-shrink: 0; }
  .cred-val { font-family: var(--mono); font-size: 11px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .key-mono { color: var(--accent); }

  .btn-xs { padding: 3px 8px; font-size: 11px; flex-shrink: 0; }

  .once-warn { font-size: 11px; color: var(--warning); margin: 8px 0 0; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }

  /* toast */
  .toast {
    position: fixed; bottom: 24px; right: 24px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 16px; font-size: 13px; z-index: 300;
  }
  .toast.ok { border-color: var(--success); color: var(--success); }
  .toast.fail { border-color: var(--danger); color: var(--danger); }
</style>
