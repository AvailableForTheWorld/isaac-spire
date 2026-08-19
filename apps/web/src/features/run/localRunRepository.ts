import { hydrateRunState, RunPhase, type RunState } from '@isaac-spire/game';

const LOCAL_RUN_KEY = 'isaac-spire.active-run.v1';

export function readLocalRun(): RunState | null {
  try {
    const raw = localStorage.getItem(LOCAL_RUN_KEY);
    return raw ? hydrateRunState(JSON.parse(raw) as RunState) : null;
  } catch {
    return null;
  }
}

export function writeLocalRun(run: RunState): boolean {
  try {
    localStorage.setItem(LOCAL_RUN_KEY, JSON.stringify(run));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalRun(): void {
  localStorage.removeItem(LOCAL_RUN_KEY);
}

export function latestResumableRun(...runs: Array<RunState | null>): RunState | undefined {
  return runs
    .filter((run): run is RunState =>
      Boolean(run && ![RunPhase.Victory, RunPhase.Defeat].includes(run.phase)),
    )
    .sort((left, right) => (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0))[0];
}
