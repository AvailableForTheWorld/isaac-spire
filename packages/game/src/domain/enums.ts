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
  Blank = 'blank',
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
  Consumable = 'consumable',
}

/** How an adapted collectible participates in the deckbuilding rules. */
export enum ItemUseTiming {
  ActiveCharge = 'active-charge',
  CombatCard = 'combat-card',
  Permanent = 'permanent',
  RunOnce = 'run-once',
  FloorOnce = 'floor-once',
  CombatOnce = 'combat-once',
}

/** High-level semantic analysis of a collectible's original Isaac behavior. */
export enum ItemMechanic {
  Attack = 'attack',
  AttackPattern = 'attack-pattern',
  FireRate = 'fire-rate',
  Familiar = 'familiar',
  Defense = 'defense',
  Health = 'health',
  Movement = 'movement',
  Range = 'range',
  Status = 'status',
  Bomb = 'bomb',
  Resource = 'resource',
  Economy = 'economy',
  Map = 'map',
  Reroll = 'reroll',
  Deck = 'deck',
  RoomControl = 'room-control',
  Revival = 'revival',
  RiskReward = 'risk-reward',
  Wildcard = 'wildcard',
}

/** Concrete traits extracted from the original collectible effect text. */
export enum ItemTrait {
  DamageUp = 'damage-up',
  DamageDown = 'damage-down',
  FireRateUp = 'fire-rate-up',
  FireRateDown = 'fire-rate-down',
  RangeUp = 'range-up',
  RangeDown = 'range-down',
  MovementUp = 'movement-up',
  MovementDown = 'movement-down',
  Homing = 'homing',
  Piercing = 'piercing',
  Spectral = 'spectral',
  MultiShot = 'multi-shot',
  SplitShot = 'split-shot',
  Laser = 'laser',
  Brimstone = 'brimstone',
  Knife = 'knife',
  Explosive = 'explosive',
  Poison = 'poison',
  Slow = 'slow',
  Fear = 'fear',
  Charm = 'charm',
  Freeze = 'freeze',
  Burn = 'burn',
  Heal = 'heal',
  MaxHealth = 'max-health',
  SoulHeart = 'soul-heart',
  BlackHeart = 'black-heart',
  Shield = 'shield',
  Invincible = 'invincible',
  DamageReduction = 'damage-reduction',
  Familiar = 'familiar',
  Orbital = 'orbital',
  Coins = 'coins',
  Bombs = 'bombs',
  Keys = 'keys',
  Discount = 'discount',
  RevealMap = 'reveal-map',
  RevealSecret = 'reveal-secret',
  Teleport = 'teleport',
  Reroll = 'reroll',
  Copy = 'copy',
  CardGeneration = 'card-generation',
  Revival = 'revival',
  Retaliation = 'retaliation',
  RiskReward = 'risk-reward',
  Random = 'random',
}

/** Lifecycle hook used by authored item actions. */
export enum ItemActionTrigger {
  Activate = 'activate',
  CombatStart = 'combat-start',
  RoundStart = 'round-start',
  RoundEnd = 'round-end',
  CardPlayed = 'card-played',
  PlayerMoved = 'player-moved',
  PlayerDamaged = 'player-damaged',
  EnemyKilled = 'enemy-killed',
  FatalDamage = 'fatal-damage',
  RoomCleared = 'room-cleared',
}

/** Runtime method invoked by a custom collectible action. */
export enum ItemActionMethod {
  ApplyEffects = 'apply-effects',
  DuplicateRandomHandCard = 'duplicate-random-hand-card',
  RechargeActive = 'recharge-active',
  Revive = 'revive',
  ReplayPreviousCard = 'replay-previous-card',
  ExecuteWeakestEnemy = 'execute-weakest-enemy',
  RerollEnemies = 'reroll-enemies',
  RerollItemCards = 'reroll-item-cards',
  SpindownItemCards = 'spindown-item-cards',
  TransformHand = 'transform-hand',
  RestartRoom = 'restart-room',
  RestartFloor = 'restart-floor',
  RerollPlayerStats = 'reroll-player-stats',
  GenerateItemCard = 'generate-item-card',
  DestroyAllEnemies = 'destroy-all-enemies',
  SacrificeHeart = 'sacrifice-heart',
  ConvertShieldToHealth = 'convert-shield-to-health',
  SpendCoins = 'spend-coins',
  ConsumeItemCards = 'consume-item-cards',
  DuplicateResources = 'duplicate-resources',
  CrookedPenny = 'crooked-penny',
  LockStatFloor = 'lock-stat-floor',
  EnableActiveDoubling = 'enable-active-doubling',
  TriggerPlayerDamaged = 'trigger-player-damaged',
  RandomItemEffect = 'random-item-effect',
  RevealMap = 'reveal-map',
}

/** Balanced gameplay family used by the generic collectible effect interpreter. */
export enum ItemEffectFamily {
  Assault = 'assault',
  Volley = 'volley',
  Familiar = 'familiar',
  Defense = 'defense',
  Sustain = 'sustain',
  Mobility = 'mobility',
  Status = 'status',
  Bomb = 'bomb',
  Economy = 'economy',
  Mapping = 'mapping',
  Reroll = 'reroll',
  Draw = 'draw',
  Cycle = 'cycle',
  Wildcard = 'wildcard',
}

export enum CardEffectOpcode {
  GainDamage = 'gain-damage',
  MultiplyDamage = 'multiply-damage',
  GainFireRate = 'gain-fire-rate',
  GainArmor = 'gain-armor',
  GainShield = 'gain-shield',
  Heal = 'heal',
  GainRange = 'gain-range',
  GainMovement = 'gain-movement',
  GainVitality = 'gain-vitality',
  GainCritical = 'gain-critical',
  GainDodge = 'gain-dodge',
  EnableCurvedShots = 'enable-curved-shots',
  SetAttackMode = 'set-attack-mode',
  Draw = 'draw',
  Cycle = 'cycle',
  DamageTarget = 'damage-target',
  DamageAll = 'damage-all',
  ApplyStatus = 'apply-status',
  AddBlank = 'add-blank',
  RerollHand = 'reroll-hand',
  RevealMap = 'reveal-map',
  GainCoins = 'gain-coins',
  GainBombs = 'gain-bombs',
  GainKeys = 'gain-keys',
  ClearDebuffs = 'clear-debuffs',
  Transposition = 'transposition',
  BlankBook = 'blank-book',
  RestartRoom = 'restart-room',
  Damocles = 'damocles',
  Ragnarok = 'ragnarok',
  Stimulant = 'stimulant',
}

export enum StatusKind {
  Silence = 'silence',
  Poison = 'poison',
  Blind = 'blind',
  ArmorBreak = 'armor-break',
  Weak = 'weak',
  ItemLock = 'item-lock',
}

export enum PocketItemAction {
  DeckEdit = 'deck-edit',
  DuplicateDeck = 'duplicate-deck',
  RestartRun = 'restart-run',
  ShopDiscount = 'shop-discount',
  ClearDebuffs = 'clear-debuffs',
}

export enum CombatSelectionKind {
  Transposition = 'transposition',
  BlankImitation = 'blank-imitation',
}

export enum UnlockEvent {
  FlawlessFloor = 'flawless-floor',
  Wealthy = 'wealthy',
  SecretHunter = 'secret-hunter',
  AngelLoyalty = 'angel-loyalty',
  MomClear = 'mom-clear',
  ElitePerfect = 'elite-perfect',
}

export enum AchievementId {
  BasementAwakening = 'basement-awakening',
  MomLeg = 'mom-leg',
  MomLegVeteran = 'mom-leg-veteran',
  MomHeart = 'mom-heart',
  ItLives = 'it-lives',
  Isaac = 'isaac',
  Satan = 'satan',
  BlueBaby = 'blue-baby',
  BossHunter = 'boss-hunter',
  BossSlayer = 'boss-slayer',
  EliteHunter = 'elite-hunter',
  ElitePerfect = 'elite-perfect',
  FlawlessFloor = 'flawless-floor',
  SacrificeNovice = 'sacrifice-novice',
  SacrificeDevotee = 'sacrifice-devotee',
  SacrificeMartyr = 'sacrifice-martyr',
  ShopRegular = 'shop-regular',
  ShopPatron = 'shop-patron',
  ShopTycoon = 'shop-tycoon',
  DeepPockets = 'deep-pockets',
  SecretSeeker = 'secret-seeker',
  SecretMaster = 'secret-master',
  Demolition = 'demolition',
  CardStudent = 'card-student',
  CardMaster = 'card-master',
  MonsterHunter = 'monster-hunter',
  MonsterSlayer = 'monster-slayer',
  AngelFaith = 'angel-faith',
  DevilPact = 'devil-pact',
  Minimalist = 'minimalist',
  CommonSense = 'common-sense',
  SpeedClimber = 'speed-climber',
  WhoNeedsItems = 'who-needs-items',
  Impervious = 'impervious',
  Adrenaline = 'adrenaline',
  ComboMaster = 'combo-master',
}

export enum AchievementCategory {
  Progression = 'progression',
  Combat = 'combat',
  Economy = 'economy',
  Exploration = 'exploration',
  Sacrifice = 'sacrifice',
  Deckbuilding = 'deckbuilding',
  Challenge = 'challenge',
}

export enum AchievementTier {
  Bronze = 'bronze',
  Silver = 'silver',
  Gold = 'gold',
  Platinum = 'platinum',
}

export enum AchievementMetric {
  BossesDefeated = 'bosses-defeated',
  MomLegKills = 'mom-leg-kills',
  MomHeartKills = 'mom-heart-kills',
  ItLivesKills = 'it-lives-kills',
  IsaacKills = 'isaac-kills',
  SatanKills = 'satan-kills',
  BlueBabyKills = 'blue-baby-kills',
  EnemiesKilled = 'enemies-killed',
  ElitesKilled = 'elites-killed',
  PerfectElites = 'perfect-elites',
  RoomsCleared = 'rooms-cleared',
  FloorsCleared = 'floors-cleared',
  FlawlessFloors = 'flawless-floors',
  SacrificeHp = 'sacrifice-hp',
  CoinsSpent = 'coins-spent',
  MaxCoinsHeld = 'max-coins-held',
  SecretRoomsEntered = 'secret-rooms-entered',
  BombsUsed = 'bombs-used',
  CardsPlayed = 'cards-played',
  AngelFavorGained = 'angel-favor-gained',
  DevilDealsTaken = 'devil-deals-taken',
  RunsWon = 'runs-won',
  FinalDeckSize = 'final-deck-size',
  FinalItemCount = 'final-item-count',
  FinalHighestCardQuality = 'final-highest-card-quality',
  RunDurationSeconds = 'run-duration-seconds',
  MaxShield = 'max-shield',
  MaxVitality = 'max-vitality',
  CardsPlayedThisTurn = 'cards-played-this-turn',
  MaxCardsPlayedInTurn = 'max-cards-played-in-turn',
}

export enum AchievementScope {
  Lifetime = 'lifetime',
  Run = 'run',
}

export enum AchievementComparison {
  AtLeast = 'at-least',
  AtMost = 'at-most',
  Equal = 'equal',
}

export enum AchievementEventType {
  EnemyKilled = 'enemy-killed',
  ElitePerfect = 'elite-perfect',
  BossDefeated = 'boss-defeated',
  RoomCleared = 'room-cleared',
  FloorCleared = 'floor-cleared',
  CoinsSpent = 'coins-spent',
  HealthSacrificed = 'health-sacrificed',
  SecretRoomEntered = 'secret-room-entered',
  BombUsed = 'bomb-used',
  CardPlayed = 'card-played',
  RoundStarted = 'round-started',
  AngelFavorGained = 'angel-favor-gained',
  DevilDealTaken = 'devil-deal-taken',
  RunWon = 'run-won',
}

export enum AchievementPlatform {
  Steam = 'steam',
}

export enum AchievementBossId {
  Monstro = 'monstro',
  Duke = 'duke',
  Gurdy = 'gurdy',
  MegaFatty = 'fatty',
  Cage = 'cage',
  MomLeg = 'mom',
  MomHeart = 'mom-heart',
  ItLives = 'it-lives',
  Isaac = 'isaac',
  Satan = 'satan',
  BlueBaby = 'blue-baby',
}

export enum RewardQuality {
  Poor = 0,
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

/**
 * Reusable grid-combat adaptations of Isaac boss attacks. Boss profiles compose
 * these primitives instead of adding boss-specific branches to the engine.
 */
export enum BossAttackPattern {
  Contact = 'contact',
  ProjectileSpread = 'projectile-spread',
  RadialBurst = 'radial-burst',
  SpiralBarrage = 'spiral-barrage',
  LaserLine = 'laser-line',
  LeapSlam = 'leap-slam',
  GroundStomp = 'ground-stomp',
  ChargeLane = 'charge-lane',
  RockWave = 'rock-wave',
  ProjectileRain = 'projectile-rain',
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
