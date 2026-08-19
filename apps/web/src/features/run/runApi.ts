import {
  DEFAULT_PROFILE,
  type PersistedRun,
  type ProfileState,
  type RunState,
  type RunSummary,
} from '@isaac-spire/game';
import { ApiError, apiRequest } from '../../shared/api/httpClient';

export async function loadProfile(): Promise<ProfileState> {
  try {
    return await apiRequest<ProfileState>('/profile');
  } catch {
    return structuredClone(DEFAULT_PROFILE);
  }
}

export async function loadLatestActiveRun(): Promise<RunState | null> {
  try {
    return (await apiRequest<PersistedRun>('/runs/active/latest')).snapshot;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    return null;
  }
}

export async function loadRunSummaries(): Promise<RunSummary[]> {
  try {
    return await apiRequest<RunSummary[]>('/runs');
  } catch {
    return [];
  }
}

export async function saveRun(run: RunState, create = false): Promise<boolean> {
  try {
    await apiRequest<PersistedRun>(create ? '/runs' : `/runs/${run.id}`, {
      method: create ? 'POST' : 'PUT',
      body: JSON.stringify(run),
    });
    return true;
  } catch {
    // The current browser snapshot remains authoritative while the API is unavailable.
    return false;
  }
}
