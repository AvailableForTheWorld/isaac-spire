import { DEFAULT_PROFILE, type PersistedRun, type ProfileState, type RunState } from '@isaac-spire/game';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json() as Promise<T>;
}

export async function loadProfile(): Promise<ProfileState> {
  try {
    return await request<ProfileState>('/profile');
  } catch {
    return structuredClone(DEFAULT_PROFILE);
  }
}

export async function loadRecentRuns(): Promise<PersistedRun[]> {
  try {
    return await request<PersistedRun[]>('/runs');
  } catch {
    return [];
  }
}

export async function saveRun(run: RunState, create = false): Promise<void> {
  try {
    await request<PersistedRun>(create ? '/runs' : `/runs/${run.id}`, {
      method: create ? 'POST' : 'PUT',
      body: JSON.stringify(run),
    });
  } catch {
    // The browser save remains authoritative while the API is unavailable.
  }
}
