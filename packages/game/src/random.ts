export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

export function nextRandom(state: { rngState: number }): number {
  let value = state.rngState += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  state.rngState = value >>> 0;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(state: { rngState: number }, min: number, max: number): number {
  return Math.floor(nextRandom(state) * (max - min + 1)) + min;
}

export function pickOne<T>(state: { rngState: number }, values: readonly T[]): T {
  if (values.length === 0) throw new Error('Cannot pick from an empty collection');
  return values[Math.floor(nextRandom(state) * values.length)] as T;
}

export function shuffle<T>(state: { rngState: number }, values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(state, 0, i);
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

export function weightedPick<T>(
  state: { rngState: number },
  values: readonly { value: T; weight: number }[],
): T {
  const total = values.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = nextRandom(state) * total;
  for (const entry of values) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return values.at(-1)!.value;
}
