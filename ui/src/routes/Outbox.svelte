<script lang="ts">
  import { onMount } from 'svelte';
  import { devices, statusBadge, reltime } from '../lib/stores.js';
  import { api } from '../lib/api.js';
  import type { OutboundMessage, Device } from '../lib/types.js';

  let messages: OutboundMessage[] = [];
  let page = 1;
  let hasMore = false;
  let statusFilter = '';
  let loading = false;
  let toast = '';
  let toastOk = true;

  // Send form
  let sendTo = '';
  let sendBody = '';
  let sendDeviceId = '';
  let sending = false;

  function showToast(msg: string, ok = true) {
    toast = msg; toastOk = ok;
    setTimeout(() => (toast = ''), 2500);
  }

  async function loadDevices() {
    try { devices.set(await api.get<Device[]>('/devices')); } catch { /* silent */ }
  }

  async function load(p = 1) {
    loading = true;
    page = p;
    const qs = new URLSearchParams({ page: String(p), pageSize: '20' });
    if (statusFilter) qs.set('status', statusFilter);
    try {
      const rows = await api.get<OutboundMessage[]>(`/api/sms/outbox?${qs}`);
      messages = rows;
      hasMore = rows.length === 20;
    } catch { showToast('Failed to load', false); }
    loading = false;
  }

  async function send() {
    if (!sendTo.trim() || !sendBody.trim() || sending) return;
    sending = true;
    try {
      await api.post('/api/sms/send', {
        to: sendTo.trim(), body: sendBody.trim(),
        ...(sendDeviceId ? { deviceId: sendDeviceId } : {}),
      });
      showToast('SMS queued');
      sendTo = ''; sendBody = '';
      await load(1);
    } catch (e: unknown) {
      showToast((e as { error?: string }).error ?? 'Failed to send', false);
    } finally { sending = false; }
  }

  async function retry(id: string) {
    try { await api.post(`/api/sms/${id}/retry`); showToast('Requeued'); await load(page); }
    catch { showToast('Retry failed', false); }
  }

  function deviceName(id: string) {
    return $devices.find((d) => d.id === id)?.name ?? '—';
  }

  onMount(() => { loadDevices(); load(1); });
</script>

<div class="section-header">
  <h2>Outbox</h2>
</div>

<!-- Send form -->
<div class="send-card">
  <h3>Send SMS</h3>
  <div class="send-grid">
    <div class="field">
      <label for="s-to">To</label>
      <input id="s-to" type="text" bind:value={sendTo} placeholder="+30697…" />
    </div>
    <div class="field">
      <label for="s-body">Message</label>
      <textarea id="s-body" bind:value={sendBody} rows="2" placeholder="Hello…"></textarea>
    </div>
    <div class="field">
      <label for="s-dev">Device</label>
      <select id="s-dev" bind:value={sendDeviceId}>
        <option value="">Auto-route</option>
        {#each $devices as d}
          <option value={d.id}>{d.name}{d.isPrimary ? ' (primary)' : ''}</option>
        {/each}
      </select>
    </div>
    <button class="btn btn-primary" on:click={send} disabled={sending || !sendTo || !sendBody}>
      {sending ? '…' : 'Send'}
    </button>
  </div>
</div>

<!-- Filter + table -->
<div class="filter-bar">
  <span class="filter-label">Filter:</span>
  <select bind:value={statusFilter} on:change={() => load(1)}>
    <option value="">All</option>
    <option value="pending">Pending</option>
    <option value="sent">Sent</option>
    <option value="failed">Failed</option>
    <option value="dead_letter">Dead letter</option>
  </select>
  <button class="btn btn-ghost btn-sm" on:click={() => load(page)}>↻ Refresh</button>
</div>

<div class="tbl-wrap">
  <table>
    <thead>
      <tr>
        <th>Status</th><th>To</th><th>Message</th>
        <th>Device</th><th>Created</th><th></th>
      </tr>
    </thead>
    <tbody>
      {#if loading}
        <tr class="empty-row"><td colspan="6">Loading…</td></tr>
      {:else if messages.length === 0}
        <tr class="empty-row"><td colspan="6">No messages</td></tr>
      {:else}
        {#each messages as m (m.id)}
          {@const sb = statusBadge(m.status)}
          <tr>
            <td><span class="badge {sb.cls}">{sb.label}</span></td>
            <td class="mono">{m.recipient}</td>
            <td class="msg-body">{m.body}</td>
            <td class="muted-sm">{deviceName(m.deviceId)}</td>
            <td class="muted-sm">{reltime(m.createdAt)}</td>
            <td>
              {#if m.status === 'dead_letter'}
                <button class="btn btn-ghost btn-sm" on:click={() => retry(m.id)}>Retry</button>
              {/if}
            </td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>

<div class="pager">
  <button class="btn btn-ghost btn-sm" on:click={() => load(page - 1)} disabled={page <= 1}>← Prev</button>
  <span>Page {page}</span>
  <button class="btn btn-ghost btn-sm" on:click={() => load(page + 1)} disabled={!hasMore}>Next →</button>
</div>

{#if toast}
  <div class="toast" class:ok={toastOk} class:fail={!toastOk}>{toast}</div>
{/if}

<style>
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  h2 { font-size: 16px; font-weight: 600; }

  .send-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 20px; margin-bottom: 20px;
  }
  h3 { font-size: 14px; font-weight: 600; margin-bottom: 14px; color: var(--muted); }
  .send-grid {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr auto;
    gap: 10px; align-items: end;
  }
  .send-grid .field { margin: 0; }
  .send-grid .btn { height: 38px; }

  .filter-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
  .filter-label { font-size: 12px; color: var(--muted); }
  .filter-bar select { padding: 5px 10px; font-size: 13px; }

  .muted-sm { font-size: 12px; color: var(--muted); }
  .msg-body { white-space: pre-wrap; word-break: break-word; max-width: 400px; }

  .toast {
    position: fixed; bottom: 24px; right: 24px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 16px; font-size: 13px; z-index: 300;
  }
  .toast.ok { border-color: var(--success); color: var(--success); }
  .toast.fail { border-color: var(--danger); color: var(--danger); }

  @media (max-width: 700px) {
    .send-grid { grid-template-columns: 1fr; }
  }
</style>
