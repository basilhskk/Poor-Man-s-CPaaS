<script lang="ts">
  import { api } from '../lib/api.js';
  import { me } from '../lib/stores.js';

  let tab: 'login' | 'register' = 'login';
  let username = '';
  let password = '';
  let error = '';
  let loading = false;

  function switchTab(t: typeof tab) {
    tab = t; error = ''; username = ''; password = '';
  }

  async function submit() {
    error = ''; loading = true;
    try {
      const path = tab === 'login' ? '/auth/login' : '/auth/register';
      const user = await api.post<{ id: string; username: string }>(path, { username, password });
      me.set(user);
    } catch (e: unknown) {
      error = (e as { error?: string }).error ?? 'Something went wrong';
    } finally {
      loading = false;
    }
  }
</script>

<div class="wrap">
  <div class="card">
    <div class="brand">
      <span class="logo-mark">◈</span>
      <h1>Poor Man's <span>CPaaS</span></h1>
      <p>Self-hosted SMS gateway</p>
    </div>

    <div class="tabs">
      <button class:active={tab === 'login'} on:click={() => switchTab('login')}>Sign in</button>
      <button class:active={tab === 'register'} on:click={() => switchTab('register')}>Register</button>
    </div>

    <form on:submit|preventDefault={submit}>
      {#if error}
        <div class="err">{error}</div>
      {/if}
      <div class="field">
        <label for="u">Username</label>
        <input id="u" type="text" bind:value={username} autocomplete="username" required />
      </div>
      <div class="field">
        <label for="p">
          Password
          {#if tab === 'register'}<span class="hint">(min 8 chars)</span>{/if}
        </label>
        <input
          id="p" type="password" bind:value={password}
          autocomplete={tab === 'login' ? 'current-password' : 'new-password'}
          required
        />
      </div>
      <button class="btn btn-primary submit" type="submit" disabled={loading}>
        {#if loading}…{:else if tab === 'login'}Sign in{:else}Create account{/if}
      </button>
    </form>
  </div>
</div>

<style>
  .wrap {
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 24px;
  }
  .card {
    width: 100%; max-width: 380px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 36px 32px;
  }
  .brand { text-align: center; margin-bottom: 28px; }
  .logo-mark { font-size: 28px; color: var(--accent); display: block; margin-bottom: 10px; }
  h1 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
  h1 span { color: var(--accent); }
  .brand p { font-size: 13px; color: var(--muted); }

  .tabs {
    display: flex; border-bottom: 1px solid var(--border); margin-bottom: 24px;
  }
  .tabs button {
    flex: 1; padding: 10px; background: none; border: none;
    border-bottom: 2px solid transparent; margin-bottom: -1px;
    font-size: 13px; font-weight: 500; color: var(--muted);
    cursor: pointer; transition: color .15s; font-family: var(--sans);
  }
  .tabs button.active { color: var(--accent); border-color: var(--accent); }

  .err {
    background: rgba(248,81,73,.1); border: 1px solid rgba(248,81,73,.3);
    border-radius: 6px; padding: 8px 12px;
    color: var(--danger); font-size: 13px; margin-bottom: 14px;
  }
  .hint { color: var(--muted); font-size: 11px; }
  .submit { width: 100%; justify-content: center; padding: 10px; font-size: 14px; }
</style>
