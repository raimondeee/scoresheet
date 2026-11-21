import { initialState } from './seed.ts';
import type { AppState } from './types.ts';

const STORAGE_KEY = 'winterhawks-scorebook';

export function normalize(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<AppState>;
  if (value.version !== 1 || !Array.isArray(value.roster) || !Array.isArray(value.games)) return null;
  return {
    version: 1,
    teamName: value.teamName || initialState().teamName,
    roster: value.roster,
    filmLeadSeconds: typeof value.filmLeadSeconds === 'number' ? value.filmLeadSeconds : 10,
    games: value.games,
  };
}

export async function loadState(): Promise<AppState> {
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (response.ok) {
      const normalized = normalize(await response.json());
      if (normalized) return normalized;
    }
  } catch {
    // The file server is only available under `npm run dev`.
  }
  const local = localStorage.getItem(STORAGE_KEY);
  if (local) {
    try {
      const normalized = normalize(JSON.parse(local));
      if (normalized) return normalized;
    } catch {
      // Ignore a damaged browser copy and try the published book.
    }
  }
  try {
    const published = await fetch(`${import.meta.env.BASE_URL}scorebook.json`, { cache: 'no-store' });
    if (published.ok) {
      const normalized = normalize(await published.json());
      if (normalized) return normalized;
    }
  } catch {
    // A static copy is only present in a built site.
  }
  return initialState();
}

export async function persistState(state: AppState): Promise<'saved' | 'local'> {
  const text = JSON.stringify(state, null, 2);
  localStorage.setItem(STORAGE_KEY, text);
  try {
    const response = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: text,
    });
    return response.ok ? 'saved' : 'local';
  } catch {
    return 'local';
  }
}

export function downloadState(state: AppState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'scorekeeper.json';
  link.click();
  URL.revokeObjectURL(url);
}
