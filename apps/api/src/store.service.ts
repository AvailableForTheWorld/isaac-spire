import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DEFAULT_PROFILE, type PersistedRun, type ProfileState, type RunState } from '@isaac-spire/game';

interface StoreData {
  runs: Record<string, PersistedRun>;
  profile: ProfileState;
}

function freshData(): StoreData {
  return { runs: {}, profile: structuredClone(DEFAULT_PROFILE) };
}

@Injectable()
export class StoreService {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.filePath = resolve(process.env.ISAAC_SPIRE_DATA_FILE ?? 'data/runtime/store.json');
  }

  private async read(): Promise<StoreData> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as StoreData;
      return {
        runs: parsed.runs ?? {},
        profile: { ...freshData().profile, ...(parsed.profile ?? {}) },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return freshData();
      throw error;
    }
  }

  private async write(data: StoreData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
    await rename(temporary, this.filePath);
  }

  private enqueue(operation: (data: StoreData) => void): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const data = await this.read();
      operation(data);
      await this.write(data);
    });
    return this.writeQueue;
  }

  async profile(): Promise<ProfileState> {
    await this.writeQueue;
    return (await this.read()).profile;
  }

  async listRuns(): Promise<PersistedRun[]> {
    await this.writeQueue;
    const data = await this.read();
    return Object.values(data.runs).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getRun(id: string): Promise<PersistedRun> {
    await this.writeQueue;
    const run = (await this.read()).runs[id];
    if (!run) throw new NotFoundException(`Run ${id} was not found`);
    return run;
  }

  async saveRun(snapshot: RunState): Promise<PersistedRun> {
    if (!snapshot?.id || !snapshot.seed || !snapshot.player || !snapshot.floorMap) {
      throw new TypeError('Invalid run snapshot');
    }
    const timestamp = new Date().toISOString();
    let result!: PersistedRun;
    await this.enqueue((data) => {
      const previous = data.runs[snapshot.id];
      result = {
        id: snapshot.id,
        status: snapshot.phase === 'victory' ? 'won' : snapshot.phase === 'defeat' ? 'lost' : 'active',
        snapshot,
        createdAt: previous?.createdAt ?? snapshot.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      data.runs[snapshot.id] = result;
      data.profile.unlockedItemIds = [...new Set([...data.profile.unlockedItemIds, ...snapshot.unlocks])];
      data.profile.discoveredItemIds = [...new Set([...data.profile.discoveredItemIds, ...snapshot.player.items])];
      if (result.status === 'won' && previous?.status !== 'won') data.profile.wins += 1;
      if (result.status === 'lost' && previous?.status !== 'lost') data.profile.losses += 1;
      data.profile.bestScore = Math.max(data.profile.bestScore, snapshot.score);
    });
    return result;
  }
}
