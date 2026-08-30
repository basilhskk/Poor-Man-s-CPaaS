<script lang="ts">
  import { onMount } from 'svelte';
  import { me, devices } from '../lib/stores.js';
  import { api } from '../lib/api.js';
  import type { Stats } from '../lib/types.js';
  import Devices from './Devices.svelte';
  import Outbox from './Outbox.svelte';
  import Inbox from './Inbox.svelte';
  import Settings from './Settings.svelte';
  import Docs from './Docs.svelte';

  type Tab = 'devices' | 'outbox' | 'inbox' | 'settings' | 'docs';
  let tab: Tab = 'devices';
  let stats: Stats | null = null;

  async function loadStats() {
    try { stats = await api.get<Stats>('/api/stats'); } catch { /* silent */ }
  }

  async function logout() {
    await api.post('/auth/logout');
    me.set(null);
    devices.set([]);
  }

  onMount(loadStats);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'devices',  label: 'Devices' },
    { id: 'outbox',   label: 'Outbox' },
    { id: 'inbox',    label: 'Inbox' },
    { id: 'settings', label: 'Settings' },
    { id: 'docs',     label: 'API Docs' },
  ];
</script>

<div class="layout">
  <header>
    <div class="logo">◈ Poor Man's <span>CPaaS</span></div>
    <div class="right">
      <span class="username">{$me?.username}</span>
      <button class="btn btn-ghost btn-sm" on:click={logout}>Sign out</button>
    </div>
  </header>

  <nav>
    {#each tabs as t}
      <button class:active={tab === t.id} on:click={() => (tab = t.id)}>{t.label}</button>
    {/each}
  </nav>

  <main>
    {#if stats && (tab === 'devices' || tab === 'outbox' || tab === 'inbox')}
      <div class="stat-cards">
        <div class="stat-card sent">
          <span class="sc-num">{stats.totals.sent}</span>
          <span class="sc-lbl">Sent</span>
        </div>
        <div class="stat-card pending">
          <span class="sc-num">{stats.totals.pending}</span>
          <span class="sc-lbl">Pending</span>
        </div>
        <div class="stat-card failed">
          <span class="sc-num">{stats.totals.failed + stats.totals.deadLetter}</span>
          <span class="sc-lbl">Failed</span>
        </div>
        <div class="stat-card received">
          <span class="sc-num">{stats.totals.received}</span>
          <span class="sc-lbl">Received</span>
        </div>
      </div>
    {/if}

    {#if tab === 'devices'}
      <Devices deviceStats={stats?.devices ?? []} on:refresh={loadStats} />
    {:else if tab === 'outbox'}
      <Outbox />
    {:else if tab === 'inbox'}
      <Inbox />
    {:else if tab === 'settings'}
      <Settings />
    {:else}
      <Docs />
    {/if}
  </main>
</div>

<style>
  .layout { display: flex; flex-direction: column; min-height: 100vh; }

  header {
    position: sticky; top: 0; z-index: 100;
    height: 56px; display: flex; align-items: center; padding: 0 24px;
    background: var(--surface); border-bottom: 1px solid var(--border);
    gap: 12px;
  }
  .logo { font-weight: 600; font-size: 15px; flex: 1; }
  .logo span { color: var(--accent); }
  .right { display: flex; align-items: center; gap: 12px; }
  .username { font-family: var(--mono); font-size: 12px; color: var(--muted); }

  nav {
    position: sticky; top: 56px; z-index: 90;
    display: flex; padding: 0 24px; gap: 4px;
    background: var(--surface); border-bottom: 1px solid var(--border);
  }
  nav button {
    padding: 12px 16px; background: none; border: none;
    border-bottom: 2px solid transparent; margin-bottom: -1px;
    font-size: 13px; font-weight: 500; color: var(--muted);
    cursor: pointer; transition: color .15s; font-family: var(--sans);
  }
  nav button.active { color: var(--accent); border-color: var(--accent); }

  main { flex: 1; padding: 24px; max-width: 1200px; width: 100%; margin: 0 auto; }

  /* ── Stats cards ── */
  .stat-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 28px;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-left-width: 3px;
  }
  .stat-card.sent     { border-left-color: var(--success); }
  .stat-card.pending  { border-left-color: var(--warning); }
  .stat-card.failed   { border-left-color: var(--danger); }
  .stat-card.received { border-left-color: #38bdf8; }

  .sc-num {
    font-family: var(--mono);
    font-size: 28px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .stat-card.sent     .sc-num { color: var(--success); }
  .stat-card.pending  .sc-num { color: var(--warning); }
  .stat-card.failed   .sc-num { color: var(--danger); }
  .stat-card.received .sc-num { color: #38bdf8; }

  .sc-lbl {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: var(--muted);
    font-weight: 500;
  }

  @media (max-width: 600px) {
    .stat-cards { grid-template-columns: repeat(2, 1fr); }
  }
</style>
