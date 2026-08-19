import type { CombatState } from './combat.js';
import type { AchievementNotice, AchievementProgressState, RunAchievementState } from './achievement.js';
import type {
  ChoiceAction,
  ChoiceKind,
  ChoiceNext,
  DealType,
  ResourceKind,
  RewardContext,
  RewardOptionType,
  RewardPool,
  RoomKind,
  RunPhase,
  RunStatus,
  UpgradeKind,
} from './enums.js';
import type { FloorMap } from './map.js';
import type { PlayerState } from './player.js';

export interface RewardOption {
  id: string;
  type: RewardOptionType;
  label: string;
  description: string;
  icon: string;
  itemId?: string;
  cardId?: string;
  resource?: ResourceKind;
  amount?: number;
  upgrade?: UpgradeKind;
  action?: ChoiceAction;
  price?: number;
  sold?: boolean;
}

export interface ChoiceState {
  kind: ChoiceKind;
  title: string;
  subtitle: string;
  options: RewardOption[];
  canSkip: boolean;
  next: ChoiceNext;
  dealType?: DealType;
  rewardContext?: RewardContext;
  rewardPool?: RewardPool;
  requiresRewardConfirmation?: boolean;
}

export interface UnlockNotice {
  itemId: string;
  label: string;
}

export interface RoomCheckpoint {
  rngState: number;
  player: PlayerState;
  combat: CombatState;
  floorRedDamage: number;
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
  roomCheckpoint?: RoomCheckpoint;
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
  mapBombResult?: {
    currentNodeId: string;
    found: boolean;
    roomKind?: RoomKind.Secret | RoomKind.SuperSecret;
  };
  floorRedDamage: number;
  floorSecretVisits: Array<RoomKind.Secret | RoomKind.SuperSecret>;
  victory: boolean;
  achievementState: RunAchievementState;
  achievementNotices: AchievementNotice[];
}

export interface ProfileState {
  wins: number;
  losses: number;
  bestScore: number;
  unlockedItemIds: string[];
  discoveredItemIds: string[];
  eventFlags: string[];
  achievementProgress: AchievementProgressState;
}

export interface PersistedRun {
  id: string;
  status: RunStatus;
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
