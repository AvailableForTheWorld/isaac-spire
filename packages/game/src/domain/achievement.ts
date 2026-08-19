import type {
  AchievementBossId,
  AchievementCategory,
  AchievementComparison,
  AchievementEventType,
  AchievementId,
  AchievementMetric,
  AchievementPlatform,
  AchievementScope,
  AchievementTier,
} from './enums.js';

export interface AchievementRequirement {
  metric: AchievementMetric;
  scope: AchievementScope;
  comparison: AchievementComparison;
  target: number;
}

export interface AchievementDefinition {
  id: AchievementId;
  steamKey: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  category: AchievementCategory;
  tier: AchievementTier;
  hidden?: boolean;
  icon: string;
  requirements: AchievementRequirement[];
  rewardItemIds: string[];
}

export interface AchievementProgressState {
  completedIds: AchievementId[];
  completedAt: Partial<Record<AchievementId, string>>;
  lifetimeCounters: Partial<Record<AchievementMetric, number>>;
  platformSyncedIds: Partial<Record<AchievementPlatform, AchievementId[]>>;
}

export interface RunAchievementState extends AchievementProgressState {
  runCounters: Partial<Record<AchievementMetric, number>>;
}

export interface AchievementNotice {
  achievementId: AchievementId;
  rewardItemIds: string[];
  completedAt: string;
  acknowledgedAt?: string;
}

export type AchievementEvent =
  | { type: AchievementEventType.EnemyKilled; elite: boolean }
  | { type: AchievementEventType.ElitePerfect }
  | { type: AchievementEventType.BossDefeated; bossId: AchievementBossId }
  | { type: AchievementEventType.RoomCleared }
  | { type: AchievementEventType.FloorCleared; flawless: boolean }
  | { type: AchievementEventType.CoinsSpent; amount: number }
  | { type: AchievementEventType.HealthSacrificed; amount: number }
  | { type: AchievementEventType.SecretRoomEntered }
  | { type: AchievementEventType.BombUsed }
  | { type: AchievementEventType.CardPlayed }
  | { type: AchievementEventType.RoundStarted }
  | { type: AchievementEventType.AngelFavorGained; amount: number }
  | { type: AchievementEventType.DevilDealTaken }
  | { type: AchievementEventType.RunWon };

export interface AchievementPlatformUnlock {
  achievementId: AchievementId;
  platform: AchievementPlatform;
  platformKey: string;
}

/** Implemented later by a Steamworks/EOS/GOG bridge; the game domain never imports a platform SDK. */
export interface AchievementPlatformPort {
  readonly platform: AchievementPlatform;
  unlock(unlock: AchievementPlatformUnlock): Promise<void>;
}
