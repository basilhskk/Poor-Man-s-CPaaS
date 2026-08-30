import { writable } from 'svelte/store';
import type { User, Device } from './types.js';

export const me = writable<User | null>(null);
export const devices = writable<Device[]>([]);

export function reltime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return new Date(iso).toLocaleDateString();
}

export function deviceStatus(lastSeen: string | null): { label: string; cls: string } {
  if (!lastSeen) return { label: 'OFFLINE', cls: 'badge-red' };
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 2 * 60000) return { label: 'ONLINE', cls: 'badge-green' };
  if (diff < 10 * 60000) return { label: 'IDLE', cls: 'badge-yellow' };
  return { label: 'OFFLINE', cls: 'badge-red' };
}

export function statusBadge(status: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    pending:     { label: 'PENDING',     cls: 'badge-grey' },
    sent:        { label: 'SENT',        cls: 'badge-green' },
    failed:      { label: 'FAILED',      cls: 'badge-yellow' },
    dead_letter: { label: 'DEAD LETTER', cls: 'badge-red' },
    in_progress: { label: 'IN PROGRESS', cls: 'badge-purple' },
  };
  return map[status] ?? { label: status.toUpperCase(), cls: 'badge-grey' };
}
