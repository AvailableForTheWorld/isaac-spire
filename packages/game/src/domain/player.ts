import type {
  AttackMode,
  CardEffectOpcode,
  CardTarget,
  CardType,
  CharacterId,
  HeartKind,
  ItemEffectFamily,
  ItemActionMethod,
  ItemActionTrigger,
  ItemKind,
  ItemMechanic,
  ItemTrait,
  ItemUseTiming,
  PocketItemAction,
  RewardPool,
  RewardQuality,
  StatusKind,
  UnlockEvent,
} from './enums.js';

export interface CharacterStats {
  baseDamage: number;
  damageMultiplier: number;
  armor: number;
  baseShield: number;
  heartSize: number;
  maxVitality: number;
  drawCount: number;
  maxRetain: number;
  fireRate: number;
  luck: number;
  critChance: number;
  dodgeChance: number;
  shopDiscount: number;
  movementSpeed: number;
  attackRange: number;
  attackMode: AttackMode;
}

export interface GridPosition {
  x: number;
  y: number;
}

export interface PocketHeart {
  id: string;
  kind: HeartKind;
  hp: number;
  maxHp: number;
}

export interface PlayerState {
  character: CharacterId;
  redContainers: number;
  redHp: number;
  pocketHearts: PocketHeart[];
  stats: CharacterStats;
  coins: number;
  bombs: number;
  keys: number;
  items: string[];
  activeItemId?: string;
  pocketItems: PocketItemInstance[];
  pocketItemSlots: number;
  deck: CardInstance[];
}

export interface PocketItemInstance {
  instanceId: string;
  itemId: string;
  used: boolean;
  lastUsedFloor?: number;
}

export type StatusDurations = Partial<Record<StatusKind, number>>;

export interface CardDefinition {
  id: string;
  name: string;
  type: CardType;
  cost: number;
  description: string;
  value?: number;
  hits?: number;
  target: CardTarget;
  exhaust?: boolean;
  itemId?: string;
  icon: string;
  quality: RewardQuality;
  rewardPools: RewardPool[];
  rewardWeight?: number;
  effects?: CardEffect[];
}

export interface CardInstance {
  instanceId: string;
  definitionId: string;
  upgraded: boolean;
}

export interface ItemEffect {
  stat?: keyof Omit<CharacterStats, 'attackMode'>;
  amount?: number;
  multiplier?: number;
  attackMode?: AttackMode;
  redContainers?: number;
  soulHearts?: number;
  blackHearts?: number;
  revealSecrets?: boolean;
  revealAll?: boolean;
  guaranteeDeal?: boolean;
  damageCap?: number;
  curvedShots?: boolean;
}

/** A serializable effect instruction interpreted by the combat engine. */
export interface CardEffect {
  opcode: CardEffectOpcode;
  amount?: number;
  secondaryAmount?: number;
  turns?: number;
  status?: StatusKind;
  target?: CardTarget;
  attackMode?: AttackMode;
}

export interface AttackFusionEffect {
  damageMultiplier?: number;
  flatDamage?: number;
  projectileScale?: number;
  knockback?: number;
  poisonTurns?: number;
  poisonDamage?: number;
  slowTurns?: number;
  curvedShots?: boolean;
  attackMode?: AttackMode;
}

export interface AttackFusionPreview {
  totalCost: number;
  damageMultiplier: number;
  flatDamage: number;
  projectileScale: number;
  knockback: number;
  poisonTurns: number;
  poisonDamage: number;
  slowTurns: number;
  curvedShots: boolean;
  attackMode?: AttackMode;
}

export interface ItemDefinition {
  id: string;
  isaacId?: number;
  name: string;
  nameZh?: string;
  kind: ItemKind;
  pool: RewardPool[];
  description: string;
  descriptionZh?: string;
  icon: string;
  quality: RewardQuality;
  timing?: ItemUseTiming;
  family?: ItemEffectFamily;
  originalMechanics?: ItemMechanic[];
  originalTraits?: ItemTrait[];
  chargeRounds?: number;
  cardCost?: number;
  skillCardId?: string;
  combatCard?: boolean;
  effects?: ItemEffect[];
  cardEffects?: CardEffect[];
  actions?: ItemActionDefinition[];
  pocketAction?: PocketItemAction;
  fusion?: AttackFusionEffect;
  unlock?: { event: UnlockEvent; label: string };
}

export interface ItemActionDefinition {
  id: string;
  trigger: ItemActionTrigger;
  method: ItemActionMethod;
  effects?: CardEffect[];
  chance?: number;
  every?: number;
  amount?: number;
  secondaryAmount?: number;
  oncePerCombat?: boolean;
  consumeItem?: boolean;
}

export interface FloorDefinition {
  index: number;
  name: string;
  subtitle: string;
  bossName: string;
  palette: string;
}
