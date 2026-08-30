<script lang="ts">
  import { onMount } from 'svelte';
  import { devices, reltime } from '../lib/stores.js';
  import { api } from '../lib/api.js';
  import type { ReceivedMessage, Device } from '../lib/types.js';

  let messages: ReceivedMessage[] = [];
  let page = 1;
  let hasMore = false;
  let loading = false;

  async function load(p = 1) {
    loading = true; page = p;
    try {
      const rows = await api.get<ReceivedMessage[]>(`/api/sms/inbox?page=${p}&pageSize=20`);
      messages = rows; hasMore = rows.length === 20;
    } catch { /* ignore */ }
    loading = false;
  }

  function deviceName(id: string) {
    return $devices.find((d: Device) => d.id === id)?.name ?? '—';
  }

  onMount(() => load(1));
</script>

<div class="section-header">
  <h2>Inbox</h2>
  <button class="btn btn-ghost btn-sm" on:click={() => load(page)}>↻ Refresh</button>
</div>

<div class="tbl-wrap">
  <table>
    <thead>
      <tr>
        <th>From</th><th>Message</th><th>Device</th><th>Received</th>
      </tr>
    </thead>
    <tbody>
      {#if loading}
        <tr class="empty-row"><td colspan="4">Loading…</td></tr>
      {:else if messages.length === 0}
        <tr class="empty-row"><td colspan="4">No messages received yet</td></tr>
      {:else}
        {#each messages as m (m.id)}
          <tr>
            <td class="mono">{m.fromNumber}</td>
            <td><span class="trunc" title={m.body}>{m.body}</span></td>
            <td class="muted-sm">{deviceName(m.deviceId)}</td>
            <td class="muted-sm">{reltime(m.receivedAt)}</td>
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

<style>
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  h2 { font-size: 16px; font-weight: 600; }
  .muted-sm { font-size: 12px; color: var(--muted); }
</style>
