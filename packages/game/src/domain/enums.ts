/** Stable wire enums. Values are persisted in saves and sent through the API; never rename a value in place. */
export enum CharacterId {
  Isaac = 'isaac',
}

export enum CardType {
  Attack = 'attack',
  Skill = 'skill',
  Item = 'item',
  Recovery = 'recovery',
  Shield = 'shield',
  Hex = 'hex',
  Tarot = 'tarot',
  Curse = 'curse',
}

export enum CardTarget {
  Enemy = 'enemy',
  AllEnemies = 'all-enemies',
  Self = 'self',
  None = 'none',
}

export enum AttackMode {
  Basic = 'basic',
  Knife = 'knife',
  Brimstone = 'brimstone',
  TechX = 'tech-x',
}

export enum HeartKind {
  Soul = 'soul',
  Black = 'black',
}

export enum ItemKind {
  Active = 'active',
  Passive = 'passive',
}

export enum UnlockEvent {
  FlawlessFloor = 'flawless-floor',
  Wealthy = 'wealthy',
  SecretHunter = 'secret-hunter',
  AngelLoyalty = 'angel-loyalty',
  MomClear = 'mom-clear',
  ElitePerfect = 'elite-perfect',
}

export enum RewardQuality {
  Common = 1,
  Uncommon = 2,
  Rare = 3,
  Legendary = 4,
}

export enum RewardPool {
  FloorStart = 'floor-start',
  RoomClear = 'room-clear',
  Treasure = 'treasure',
  Shop = 'shop',
  Boss = 'boss',
  Elite = 'elite',
  Devil = 'devil',
  Angel = 'angel',
  Planetarium = 'planetarium',
  Secret = 'secret',
  SuperSecret = 'super-secret',
  Curse = 'curse',
  Challenge = 'challenge',
  Library = 'library',
  Sacrifice = 'sacrifice',
  Arcade = 'arcade',
  Vault = 'vault',
  Bedroom = 'bedroom',
  Dice = 'dice',
  Crawlspace = 'crawlspace',
  Error = 'error',
  LargeRoom = 'large-room',
}

export enum RewardStrength {
  Basic = 1,
  Steady = 2,
  Rare = 3,
  Powerful = 4,
  Exceptional = 5,
}

export enum RewardKind {
  Card = 'card',
  Item = 'item',
  Mixed = 'mixed',
  Resource = 'resource',
  Transform = 'transform',
}

export enum RoomKind {
  Entrance = 'entrance',
  Combat = 'combat',
  Elite = 'elite',
  Shop = 'shop',
  Treasure = 'treasure',
  Curse = 'curse',
  Sacrifice = 'sacrifice',
  Secret = 'secret',
  SuperSecret = 'super-secret',
  Planetarium = 'planetarium',
  Boss = 'boss',
}

export enum IntentKind {
  Attack = 'attack',
  Shield = 'shield',
  Curse = 'curse',
  Heal = 'heal',
  Prepare = 'prepare',
  Summon = 'summon',
  Idle = 'idle',
}

export enum EnemyBehavior {
  Swarm = 'swarm',
  Hunter = 'hunter',
  Hexer = 'hexer',
  Tank = 'tank',
  Boss = 'boss',
}

export enum EnemyMovementPattern {
  Cardinal = 'cardinal',
  DiagonalJump = 'diagonal-jump',
}

export enum CombatAnimationKind {
  CardPlay = 'card-play',
  CardDiscard = 'card-discard',
  DiscardPhase = 'discard-phase',
  EnemyPhase = 'enemy-phase',
  RoundStart = 'round-start',
  Move = 'move',
  PlayerAttack = 'player-attack',
  EnemyAttack = 'enemy-attack',
  Shield = 'shield',
  Heal = 'heal',
  Poison = 'poison',
  Curse = 'curse',
  Prepare = 'prepare',
  Summon = 'summon',
  Idle = 'idle',
  Defeat = 'defeat',
  BombBlast = 'bomb-blast',
  BombHit = 'bomb-hit',
  BlackHeart = 'black-heart',
}

export enum CombatMovementStyle {
  Walk = 'walk',
  Jump = 'jump',
  Wander = 'wander',
}

export enum CombatLogTone {
  Normal = 'normal',
  Good = 'good',
  Danger = 'danger',
  Special = 'special',
}

export enum CombatRoomShape {
  Standard = 'standard',
  Wide = 'wide',
  Tall = 'tall',
  Large = 'large',
  LShaped = 'l-shaped',
}

export enum RoomMissingQuadrant {
  TopLeft = 'top-left',
  TopRight = 'top-right',
  BottomLeft = 'bottom-left',
  BottomRight = 'bottom-right',
}

export enum RunPhase {
  Map = 'map',
  Combat = 'combat',
  Discard = 'discard',
  Choice = 'choice',
  Victory = 'victory',
  Defeat = 'defeat',
}

export enum ChoiceKind {
  Loot = 'loot',
  Item = 'item',
  Shop = 'shop',
  Deal = 'deal',
  Upgrade = 'upgrade',
  Sacrifice = 'sacrifice',
  Card = 'card',
}

export enum RewardOptionType {
  Resource = 'resource',
  Item = 'item',
  Card = 'card',
  Upgrade = 'upgrade',
  Action = 'action',
}

export enum ResourceKind {
  Coins = 'coins',
  Bombs = 'bombs',
  Keys = 'keys',
  RedHeart = 'red-heart',
  SoulHeart = 'soul-heart',
  BlackHeart = 'black-heart',
}

export enum UpgradeKind {
  Damage = 'damage',
  Heart = 'heart',
  Armor = 'armor',
  Vitality = 'vitality',
  Speed = 'speed',
  Skill = 'skill',
}

export enum ChoiceAction {
  EnterDeal = 'enter-deal',
  SkipDeal = 'skip-deal',
  Leave = 'leave',
  Sacrifice = 'sacrifice',
}

export enum ChoiceNext {
  Map = 'map',
  BossGate = 'boss-gate',
  FloorUpgrade = 'floor-upgrade',
  NextFloor = 'next-floor',
  Victory = 'victory',
}

export enum DealType {
  Devil = 'devil',
  Angel = 'angel',
}

export enum RewardContext {
  FloorStart = 'floor-start',
  LargeRoom = 'large-room',
}

export enum RunStatus {
  Active = 'active',
  Won = 'won',
  Lost = 'lost',
}
