import { hydrateRunState, type RunState } from '@isaac-spire/game';

const LOCAL_RUN_KEY = 'isaac-spire.active-run.v1';

export function readLocalRun(): RunState | null {
  try {
    const raw = localStorage.getItem(LOCAL_RUN_KEY);
    return raw ? hydrateRunState(JSON.parse(raw) as RunState) : null;
  } catch {
    return null;
  }
}

export function writeLocalRun(run: RunState): void {
  localStorage.setItem(LOCAL_RUN_KEY, JSON.stringify(run));
}

export function clearLocalRun(): void {
  localStorage.removeItem(LOCAL_RUN_KEY);
}
