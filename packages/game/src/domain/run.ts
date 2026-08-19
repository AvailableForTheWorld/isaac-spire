import type { CombatState } from './combat.js';
import type { FloorMap } from './map.js';
import type { PlayerState } from './player.js';

export type RunPhase = 'map' | 'combat' | 'discard' | 'choice' | 'victory' | 'defeat';
export type ChoiceKind = 'loot' | 'item' | 'shop' | 'deal' | 'upgrade' | 'sacrifice' | 'card';

export interface RewardOption {
  id: string;
  type: 'resource' | 'item' | 'card' | 'upgrade' | 'action';
  label: string;
  description: string;
  icon: string;
  itemId?: string;
  cardId?: string;
  resource?: 'coins' | 'bombs' | 'keys' | 'red-heart' | 'soul-heart' | 'black-heart';
  amount?: number;
  upgrade?: 'damage' | 'heart' | 'armor' | 'vitality' | 'speed' | 'skill';
  action?: 'enter-deal' | 'skip-deal' | 'leave' | 'sacrifice';
  price?: number;
  sold?: boolean;
}

export interface ChoiceState {
  kind: ChoiceKind;
  title: string;
  subtitle: string;
  options: RewardOption[];
  canSkip: boolean;
  next: 'map' | 'boss-gate' | 'floor-upgrade' | 'next-floor' | 'victory';
  dealType?: 'devil' | 'angel';
  rewardContext?: 'large-room' | 'floor-start';
}

export interface UnlockNotice {
  itemId: string;
  label: string;
}

export interface RunState {
  id: string;
  seed: string;
  rngState: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  phase: RunPhase;
  floorIndex: number;
  floorMap: FloorMap;
  player: PlayerState;
  combat?: CombatState;
  choice?: ChoiceState;
  currentRoomId?: string;
  clearedRooms: number;
  score: number;
  devilChance: number;
  angelFavor: number;
  tookDevilDeal: boolean;
  unlocks: string[];
  unlockNotices: UnlockNotice[];
  lastReward: string[];
  floorBombSearches: string[];
  mapBombResult?: { currentNodeId: string; found: boolean; roomKind?: 'secret' | 'super-secret' };
  floorRedDamage: number;
  floorSecretVisits: string[];
  victory: boolean;
}

export interface ProfileState {
  wins: number;
  losses: number;
  bestScore: number;
  unlockedItemIds: string[];
  discoveredItemIds: string[];
  eventFlags: string[];
}

export interface PersistedRun {
  id: string;
  status: 'active' | 'won' | 'lost';
  snapshot: RunState;
  createdAt: string;
  updatedAt: string;
}

export interface RunSummary {
  id: string;
  status: PersistedRun['status'];
  seed: string;
  floorIndex: number;
  score: number;
  createdAt: string;
  updatedAt: string;
}
