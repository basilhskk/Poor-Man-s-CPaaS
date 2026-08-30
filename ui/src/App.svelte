<script lang="ts">
  import { onMount } from 'svelte';
  import { me } from './lib/stores.js';
  import { api } from './lib/api.js';
  import Auth from './routes/Auth.svelte';
  import Dashboard from './routes/Dashboard.svelte';

  let loading = true;

  onMount(async () => {
    try {
      const user = await api.get<{ id: string; username: string }>('/auth/me');
      me.set(user);
    } catch {
      me.set(null);
    }
    loading = false;
  });
</script>

{#if loading}
  <div class="splash">Loading…</div>
{:else if $me}
  <Dashboard />
{:else}
  <Auth />
{/if}

<style>
  .splash {
    display: flex; align-items: center; justify-content: center;
    height: 100vh; color: var(--muted); font-size: 14px;
  }
</style>
