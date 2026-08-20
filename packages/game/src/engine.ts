import {
  CARDS,
  DEFAULT_UNLOCKS,
  FLOORS,
  ITEMS,
  bossForFloor,
  eliteForFloor,
  enemyPoolForFloor,
  itemUsesCombatCard,
} from './catalog.js';
import { availableNodeIds, createFloorMap, getMapNode, revealFromCurrent, roomRequiresKey } from './map.js';
import {
  addPocketHeart,
  createCard,
  createIsaac,
  DEFAULT_MAX_SHIELD,
  equipItem,
  getPlayerHealth,
  healRed,
  increaseHeartSize,
  isPlayerAlive,
  maxRedHp,
} from './player.js';
import { hashSeed, nextRandom, pickOne, randomInt, shuffle, weightedPick } from './random.js';
import {
  DEFAULT_COMBAT_ROOM_LAYOUT,
  ISAAC_DOOR_POSITION,
  STANDARD_ROOM_HEIGHT,
  STANDARD_ROOM_WIDTH,
  enemyCanAttackPosition,
  enemyCanSeePosition,
  enemyChebyshevDistanceToPosition,
  enemyDistanceToPosition,
  enemyPositionFits,
  fallbackEnemyPosition,
  findAvailableEnemyPosition,
  getCombatRoomCells,
  getEnemyMovementSpeed,
  getEnemyOccupiedCells,
  gridDistance,
  isCombatCellAvailable,
  isStraightLineInRange,
  positionKey,
  reachablePositions,
} from './combat/grid.js';
import {
  attackValue,
  behaviorFor,
  enemyAction as action,
  ensureEnemyBehavior,
  makeIntent,
  rollEnemyIntent as rollIntent,
} from './combat/enemy-ai.js';
import { difficultyForFloor } from './combat/difficulty.js';
import {
  PROJECTILE_CONTACT_DAMAGE_RATIO,
  getProjectileContacts,
  projectileDiameterInCells,
} from './combat/projectile.js';
import { createFamiliarState, isFamiliarItem } from './combat/familiars.js';
import { pushCombatAnimation as pushAnimation, pushCombatLog as pushLog } from './combat/events.js';
import { rewardQualityWeight } from './rewards/room-rewards.js';
import { CURRENT_RUN_VERSION, migrateRunSnapshot } from './state/migrations.js';
import {
  createRunAchievementState,
  evaluateAchievementSnapshot,
  evaluateAllAchievements,
  recordAchievementEvent,
} from './achievements/tracker.js';
import {
  AchievementEventType,
  AchievementBossId,
  ARMOR_UPGRADE_AMOUNT,
  AttackMode,
  BossAttackPattern,
  CardPileKind,
  CardEffectOpcode,
  CardTarget,
  CardType,
  CARD_UPGRADE_EFFECT_MULTIPLIER,
  ChoiceAction,
  ChoiceKind,
  ChoiceNext,
  CombatAnimationKind,
  CombatLogTone,
  CombatMovementStyle,
  CombatRoomShape,
  CombatSelectionKind,
  DealType,
  DEFAULT_HEART_SIZE,
  EnemyMovementPattern,
  HeartKind,
  HEART_SIZE_UPGRADE_AMOUNT,
  IntentKind,
  ItemActionMethod,
  ItemActionTrigger,
  ItemKind,
  ItemUseTiming,
  MAX_RED_CONTAINERS,
  PocketItemAction,
  ResourceKind,
  RewardContext,
  RewardOptionType,
  RewardPool,
  RoomKind,
  RoomMissingQuadrant,
  RunPhase,
  SHIELD_CAPACITY_UPGRADE_AMOUNT,
  StatusKind,
  TREATMENT_BASE_HEAL,
  TREATMENT_UPGRADE_HEAL,
  UpgradeKind,
} from './types.js';

export {
  COMBAT_GRID_HEIGHT,
  COMBAT_GRID_WIDTH,
  DEFAULT_COMBAT_ROOM_LAYOUT,
  ISAAC_DOOR_POSITION,
  STANDARD_ROOM_HEIGHT,
  STANDARD_ROOM_WIDTH,
  getCombatRoomCells,
  getEnemyMovementSpeed,
  getEnemyOccupiedCells,
  isCombatCellAvailable,
} from './combat/grid.js';
export {
  BASE_PROJECTILE_DIAMETER_CELLS,
  PROJECTILE_CONTACT_DAMAGE_RATIO,
  getProjectileContacts,
  projectileDiameterInCells,
} from './combat/projectile.js';
import type {
  AttackFusionPreview,
  CardEffect,
  CardDefinition,
  CardInstance,
  ChoiceState,
  CombatRoomLayout,
  CombatState,
  EnemyAction,
  EnemyDefinition,
  EnemyState,
  GridPosition,
  ItemDefinition,
  RewardOption,
  AchievementId,
  ProfileState,
  RunState,
} from './types.js';

const clone = <T>(value: T): T => structuredClone(value);

function familiarsForPlayer(run: RunState): CombatState['familiars'] {
  return run.player.items
    .map((itemId) => ITEMS[itemId])
    .filter(isFamiliarItem)
    .map((item, index) =>
      createFamiliarState(item, index, run.player.stats.baseDamage, run.player.stats.damageMultiplier),
    );
}

export function getPlayerShieldCapacity(run: RunState): number {
  return Math.max(
    0,
    (run.player.stats.maxShield ?? DEFAULT_MAX_SHIELD) + (run.combat?.playerShieldCapacityBuff ?? 0),
  );
}

function gainPlayerShield(
  run: RunState,
  combat: CombatState,
  amount: number,
  allowCapacityOverflow = false,
): number {
  const before = Math.max(0, combat.playerShield);
  if (allowCapacityOverflow) {
    combat.playerShield = before + Math.max(0, amount);
    return combat.playerShield - before;
  }
  const capacity = getPlayerShieldCapacity(run);
  const cappedBefore = Math.min(capacity, before);
  combat.playerShield = Math.min(capacity, cappedBefore + Math.max(0, amount));
  return combat.playerShield - cappedBefore;
}

function ensureCombatGrid(run: RunState): void {
  const combat = run.combat;
  if (!combat) return;
  combat.roomLayout ??= { ...DEFAULT_COMBAT_ROOM_LAYOUT };
  combat.playerStatuses ??= {};
  combat.playerStatusPower ??= {};
  combat.cardDefinitionOverrides ??= {};
  combat.temporaryCardIds ??= [];
  combat.blankBookActive ??= false;
  combat.damoclesActive ??= false;
  combat.damoclesFallen ??= false;
  combat.ragnarokActive ??= false;
  combat.unlimitedVitalityTurns ??= 0;
  combat.usedPassiveItems ??= [];
  combat.itemActionCounters ??= {};
  combat.usedItemActions ??= [];
  combat.observedDefeatIds ??= [];
  combat.statFloorLocked ??= false;
  combat.activeEffectRepeats ??= 0;
  combat.familiars ??= familiarsForPlayer(run);
  combat.playerShieldCapacityBuff ??= 0;
  combat.enemies.forEach((enemy) => {
    enemy.statuses ??= {};
  });
  const stats = run.player.stats;
  stats.baseDamage ??= 6;
  stats.damageMultiplier ??= 1;
  stats.armor ??= 3;
  stats.baseShield ??= 10;
  stats.maxShield ??= DEFAULT_MAX_SHIELD;
  stats.heartSize ??= DEFAULT_HEART_SIZE;
  stats.maxVitality ??= 5;
  stats.drawCount ??= 7;
  stats.maxRetain ??= 5;
  stats.fireRate ??= 1;
  stats.luck ??= 0;
  stats.critChance ??= 0.05;
  stats.dodgeChance ??= 0;
  stats.shopDiscount ??= 0;
  stats.movementSpeed ??= 3;
  stats.attackRange ??= 5;
  stats.attackMode ??= AttackMode.Basic;
  combat.playerShield = Math.max(0, combat.playerShield);
  combat.playerPosition ??= { ...ISAAC_DOOR_POSITION };
  combat.deploymentPending ??= false;
  combat.playerDamageMultiplier ??= 1;
  combat.playerFireRateBuff ??= 0;
  combat.playerCritChanceBuff ??= 0;
  combat.playerDodgeChanceBuff ??= 0;
  combat.playerRangeBuff ??= 0;
  combat.playerMovementBuff ??= 0;
  combat.curvedShotsOverride ??= false;
  combat.attackMeter ??= 0;
  combat.usedPassiveItems ??= [];
  combat.animationSequence ??= 0;
  combat.animationEvents ??= [];
  const occupied = new Set<string>();
  combat.enemies.forEach((enemy, index) => {
    enemy.movementSpeed ??= enemy.boss ? 2 : 3;
    enemy.attackRange ??= enemy.id === 'pooter' || enemy.id === 'horf' || enemy.id === 'vis' ? 5 : 1;
    enemy.visionRange ??= enemy.boss ? 9 : enemy.attackRange + 3;
    enemy.footprintWidth ??= enemy.boss
      ? enemy.id === 'mom'
        ? 5
        : 4
      : enemy.elite
        ? 2
        : enemy.id === 'spider' || enemy.id === 'leaper'
          ? 2
          : 1;
    enemy.footprintHeight ??= enemy.boss
      ? enemy.id === 'mom'
        ? 5
        : 4
      : enemy.elite || enemy.id === 'spider' || enemy.id === 'leaper'
        ? 2
        : 1;
    enemy.movementPattern ??=
      enemy.id === 'spider' ||
      enemy.id === 'leaper' ||
      enemy.id === 'monstro' ||
      enemy.id === 'fatty' ||
      enemy.id === 'cage'
        ? EnemyMovementPattern.DiagonalJump
        : EnemyMovementPattern.Cardinal;
    enemy.alerted ??= false;
    const preferred = enemy.position ?? fallbackEnemyPosition(combat, index, enemy);
    enemy.position =
      enemy.hp > 0 && !enemyPositionFits(combat, enemy, preferred, occupied)
        ? findAvailableEnemyPosition(combat, enemy, preferred, occupied)
        : preferred;
    if (enemy.hp > 0) getEnemyOccupiedCells(enemy).forEach((cell) => occupied.add(positionKey(cell)));
  });
  if (
    !isCombatCellAvailable(combat, combat.playerPosition) ||
    occupied.has(positionKey(combat.playerPosition))
  ) {
    combat.playerPosition = getCombatRoomCells(combat).find(
      (position) => !occupied.has(positionKey(position)),
    ) ?? { ...ISAAC_DOOR_POSITION };
  }
}

export function getPlayerAttackRange(run: RunState): number {
  return (run.player.stats.attackRange ?? 5) + (run.combat?.playerRangeBuff ?? 0);
}

export function getPlayerMovementSpeed(run: RunState): number {
  return (run.player.stats.movementSpeed ?? 3) + (run.combat?.playerMovementBuff ?? 0);
}

export function playerHasCurvedShots(run: RunState): boolean {
  return Boolean(
    run.combat?.curvedShotsOverride ||
    (run.combat?.usedPassiveItems ?? []).some((id) =>
      ITEMS[id]?.effects?.some((effect) => effect.curvedShots === true),
    ),
  );
}

export function isPositionInPlayerAttackRange(run: RunState, position: GridPosition): boolean {
  return isPositionInPlayerAttackRangeWithFusion(run, position, false);
}

function isPositionInPlayerAttackRangeWithFusion(
  run: RunState,
  position: GridPosition,
  curvedShots: boolean,
): boolean {
  const origin = run.combat?.playerPosition ?? ISAAC_DOOR_POSITION;
  const range = getPlayerAttackRange(run);
  return playerHasCurvedShots(run) || curvedShots
    ? gridDistance(origin, position) <= range
    : isStraightLineInRange(origin, position, range);
}

export function getReachablePlayerCells(run: RunState): GridPosition[] {
  if (
    run.phase !== RunPhase.Combat ||
    !run.combat ||
    (run.combat.unlimitedVitalityTurns <= 0 && run.combat.vitality < 1)
  )
    return [];
  const playerPosition = run.combat.playerPosition ?? ISAAC_DOOR_POSITION;
  const blocked = new Set(
    run.combat.enemies
      .filter((enemy) => enemy.hp > 0)
      .flatMap((enemy) => getEnemyOccupiedCells(enemy))
      .map(positionKey),
  );
  return reachablePositions(run.combat, playerPosition, getPlayerMovementSpeed(run), blocked);
}

export function getPlayerDeploymentCells(run: RunState): GridPosition[] {
  const combat = run.combat;
  if (run.phase !== RunPhase.Combat || !combat?.deploymentPending) return [];
  const occupied = new Set(
    combat.enemies
      .filter((enemy) => enemy.hp > 0)
      .flatMap((enemy) => getEnemyOccupiedCells(enemy))
      .map(positionKey),
  );
  return getCombatRoomCells(combat).filter((position) => !occupied.has(positionKey(position)));
}

export function isEnemyInPlayerRange(run: RunState, enemyId: string): boolean {
  const combat = run.combat;
  if (!combat) return false;
  const enemy = combat.enemies.find((entry) => entry.instanceId === enemyId && entry.hp > 0);
  return Boolean(
    enemy && getEnemyOccupiedCells(enemy).some((cell) => isPositionInPlayerAttackRange(run, cell)),
  );
}

export function isPlayerInEnemyVision(run: RunState, enemyId: string): boolean {
  const combat = run.combat;
  const enemy = combat?.enemies.find((entry) => entry.instanceId === enemyId && entry.hp > 0);
  return Boolean(combat && enemy && enemyCanSeePosition(enemy, combat.playerPosition));
}

function now(): string {
  return new Date().toISOString();
}

function makeId(prefix: string, run: Pick<RunState, 'rngState'>): string {
  return `${prefix}-${randomInt(run, 100000, 999999)}`;
}

function touch(run: RunState): RunState {
  evaluateAchievementSnapshot(run);
  run.updatedAt = now();
  return run;
}

function itemHasEffect(run: RunState, key: 'revealSecrets' | 'revealAll' | 'guaranteeDeal'): boolean {
  return Object.values(ITEMS).some((item) => {
    const active = itemUsesCombatCard(item)
      ? (run.combat?.usedPassiveItems ?? []).includes(item.id)
      : run.player.items.includes(item.id);
    return active && item.effects?.some((effect) => effect[key] === true);
  });
}

export function createRun(
  seed = `${Date.now()}`,
  progression: readonly string[] | ProfileState = DEFAULT_UNLOCKS,
): RunState {
  const cleanSeed = seed.trim() || `${Date.now()}`;
  const createdAt = now();
  const profile = Array.isArray(progression) ? undefined : (progression as ProfileState);
  const unlockedItemIds = Array.isArray(progression)
    ? progression
    : (profile?.unlockedItemIds ?? DEFAULT_UNLOCKS);
  const run = {
    id: `run-${hashSeed(cleanSeed).toString(36)}-${Date.now().toString(36)}`,
    seed: cleanSeed,
    rngState: hashSeed(cleanSeed),
    version: CURRENT_RUN_VERSION,
    createdAt,
    updatedAt: createdAt,
    phase: RunPhase.Map,
    floorIndex: 0,
    floorMap: createFloorMap(0, cleanSeed),
    player: undefined as unknown as RunState['player'],
    clearedRooms: 0,
    score: 0,
    devilChance: 0.35,
    angelFavor: 0,
    tookDevilDeal: false,
    unlocks: [...new Set([...DEFAULT_UNLOCKS, ...unlockedItemIds])],
    unlockNotices: [],
    lastReward: [],
    floorBombSearches: [],
    floorRedDamage: 0,
    floorSecretVisits: [],
    victory: false,
    achievementState: createRunAchievementState(profile?.achievementProgress),
    achievementNotices: [],
  } satisfies RunState;
  run.player = createIsaac(run);
  evaluateAllAchievements(run);
  makeFloorStartChoice(run);
  return run;
}

export function usePocketItem(
  state: RunState,
  pocketInstanceId: string,
  selectedCardInstanceIds: readonly string[] = [],
): RunState {
  const run = clone(state);
  const pocket = run.player.pocketItems.find((entry) => entry.instanceId === pocketInstanceId);
  if (!pocket) throw new Error('Unknown pocket item');
  const item = ITEMS[pocket.itemId];
  if (!item?.pocketAction) throw new Error('This item cannot be used from the pocket bar');
  if (item.timing === ItemUseTiming.RunOnce && pocket.used)
    throw new Error('This item has already been used');
  if (item.timing === ItemUseTiming.FloorOnce && pocket.lastUsedFloor === run.floorIndex) {
    throw new Error('This item has already been used on this floor');
  }
  const deckEditing = [PocketItemAction.DeckEdit, PocketItemAction.DuplicateDeck].includes(item.pocketAction);
  if (deckEditing && [RunPhase.Combat, RunPhase.Discard].includes(run.phase)) {
    throw new Error('Deck editing is only available outside combat');
  }
  const selected = [...new Set(selectedCardInstanceIds)];
  if (selected.some((id) => !run.player.deck.some((card) => card.instanceId === id))) {
    throw new Error('A selected card is not in the current deck');
  }

  switch (item.pocketAction) {
    case PocketItemAction.DeckEdit: {
      if (selected.length > 30) throw new Error('Travel Pack can hold at most 30 cards');
      const retained = selected
        .map((id) => run.player.deck.find((card) => card.instanceId === id))
        .filter((card): card is CardInstance => Boolean(card));
      const activeSkills = run.player.deck.filter(
        (card) => CARDS[card.definitionId]?.type === CardType.Skill,
      );
      for (const skill of activeSkills) {
        if (!retained.some((card) => card.instanceId === skill.instanceId)) retained.push(skill);
      }
      if (retained.length > 30) throw new Error('The active item leaves fewer than 30 editable slots');
      while (retained.length < 30) retained.push(createCard(run, 'blank'));
      run.player.deck = retained;
      break;
    }
    case PocketItemAction.DuplicateDeck:
      for (const instanceId of selected) {
        const original = run.player.deck.find((card) => card.instanceId === instanceId)!;
        const copy = createCard(run, original.definitionId);
        copy.upgraded = original.upgraded;
        run.player.deck.push(copy);
      }
      break;
    case PocketItemAction.RestartRun:
      run.floorIndex = 0;
      run.floorMap = createFloorMap(0, run.seed);
      run.floorRedDamage = 0;
      run.floorSecretVisits = [];
      run.floorBombSearches = [];
      run.mapBombResult = undefined;
      run.currentRoomId = undefined;
      run.combat = undefined;
      run.roomCheckpoint = undefined;
      run.choice = undefined;
      run.phase = RunPhase.Map;
      makeFloorStartChoice(run);
      break;
    case PocketItemAction.ShopDiscount:
      run.player.stats.shopDiscount = Math.max(run.player.stats.shopDiscount, 0.5);
      break;
    case PocketItemAction.ClearDebuffs:
      if (run.combat) {
        run.combat.playerStatuses = {};
        run.combat.playerStatusPower = {};
      }
      pocket.lastUsedFloor = run.floorIndex;
      break;
  }

  run.lastReward = [item.name];
  if (item.timing === ItemUseTiming.RunOnce) {
    pocket.used = true;
    run.player.pocketItems = run.player.pocketItems.filter((entry) => entry.instanceId !== pocketInstanceId);
  }
  return touch(run);
}

export function getAvailableNodes(run: RunState): string[] {
  if (run.phase !== RunPhase.Map) return [];
  return availableNodeIds(run.floorMap);
}

export function useMapBomb(state: RunState): RunState {
  const run = clone(state);
  if (run.phase !== RunPhase.Map) throw new Error('A bomb can only search for doors from the map');
  if (run.player.bombs < 1) throw new Error('No bombs available');
  run.floorBombSearches ??= [];
  const current = getMapNode(run.floorMap, run.floorMap.currentNodeId);
  if (run.floorBombSearches.includes(current.id)) throw new Error('This room has already been searched');
  run.player.bombs -= 1;
  recordAchievementEvent(run, { type: AchievementEventType.BombUsed });
  run.floorBombSearches.push(current.id);
  const hiddenRoom = run.floorMap.nodes.find(
    (node) => node.optional && node.anchorId === current.id && !node.visited && !node.doorOpened,
  );
  if (hiddenRoom) {
    hiddenRoom.revealed = true;
    hiddenRoom.doorOpened = true;
  }
  run.mapBombResult = {
    currentNodeId: current.id,
    found: Boolean(hiddenRoom),
    roomKind:
      hiddenRoom?.kind === RoomKind.SuperSecret
        ? RoomKind.SuperSecret
        : hiddenRoom
          ? RoomKind.Secret
          : undefined,
  };
  return touch(run);
}

export function getCard(run: RunState, instanceId: string): CardInstance | undefined {
  return run.player.deck.find((card) => card.instanceId === instanceId);
}

export function getCardDefinition(run: RunState, instanceId: string): CardDefinition | undefined {
  const instance = getCard(run, instanceId);
  const definitionId = run.combat?.cardDefinitionOverrides?.[instanceId] ?? instance?.definitionId;
  return definitionId ? CARDS[definitionId] : undefined;
}

export function getAttackFusionMaterialIds(run: RunState, attackInstanceId: string): string[] {
  const attack = getCardDefinition(run, attackInstanceId);
  if (!run.combat || attack?.type !== CardType.Attack) return [];
  return run.combat.hand.filter((instanceId) => {
    if (instanceId === attackInstanceId) return false;
    const card = getCardDefinition(run, instanceId);
    return Boolean(card?.type === CardType.Item && card.itemId && ITEMS[card.itemId]?.fusion);
  });
}

export function getAttackFusionPreview(
  run: RunState,
  attackInstanceId: string,
  itemInstanceIds: readonly string[],
): AttackFusionPreview | undefined {
  const attack = getCardDefinition(run, attackInstanceId);
  if (!attack || attack.type !== CardType.Attack) return undefined;
  const preview: AttackFusionPreview = {
    totalCost: attack.cost,
    damageMultiplier: 1,
    flatDamage: 0,
    projectileScale: 1,
    projectileDiameter: projectileDiameterInCells(1),
    contactDamageRatio: PROJECTILE_CONTACT_DAMAGE_RATIO,
    knockback: 0,
    poisonTurns: 0,
    poisonDamage: 0,
    slowTurns: 0,
    curvedShots: false,
  };
  for (const instanceId of [...new Set(itemInstanceIds)]) {
    const card = getCardDefinition(run, instanceId);
    const item = card?.type === CardType.Item && card.itemId ? ITEMS[card.itemId] : undefined;
    if (!card || !item?.fusion) continue;
    const itemUpgradeScale = getCard(run, instanceId)?.upgraded ? CARD_UPGRADE_EFFECT_MULTIPLIER : 1;
    const scale = (run.combat?.damoclesActive && !run.combat.damoclesFallen ? 2 : 1) * itemUpgradeScale;
    preview.damageMultiplier *= Math.pow(item.fusion.damageMultiplier ?? 1, scale);
    preview.flatDamage += (item.fusion.flatDamage ?? 0) * scale;
    preview.projectileScale *= Math.pow(item.fusion.projectileScale ?? 1, scale);
    preview.knockback += (item.fusion.knockback ?? 0) * scale;
    preview.poisonTurns = Math.max(preview.poisonTurns, (item.fusion.poisonTurns ?? 0) * scale);
    preview.poisonDamage = Math.max(preview.poisonDamage, (item.fusion.poisonDamage ?? 0) * scale);
    preview.slowTurns = Math.max(preview.slowTurns, (item.fusion.slowTurns ?? 0) * scale);
    preview.curvedShots ||= item.fusion.curvedShots === true;
    if (item.fusion.attackMode) preview.attackMode = item.fusion.attackMode;
  }
  preview.projectileDiameter = projectileDiameterInCells(preview.projectileScale);
  return preview;
}

function unlockedPool(run: RunState, pool: RewardPool): ItemDefinition[] {
  const pocketItemIds = new Set(run.player.pocketItems.map((item) => item.itemId));
  const canBenefitFromItem = (item: ItemDefinition): boolean => {
    const effects = item.effects ?? [];
    const onlyAddsRedContainers =
      effects.some((effect) => (effect.redContainers ?? 0) > 0) &&
      !effects.some(
        (effect) =>
          effect.stat !== undefined ||
          effect.heartSize !== undefined ||
          effect.soulHearts !== undefined ||
          effect.blackHearts !== undefined ||
          effect.revealSecrets !== undefined ||
          effect.revealAll !== undefined ||
          effect.guaranteeDeal !== undefined ||
          effect.damageCap !== undefined ||
          effect.curvedShots !== undefined,
      );
    return !onlyAddsRedContainers || run.player.redContainers < MAX_RED_CONTAINERS;
  };
  const eligible = Object.values(ITEMS).filter(
    (item) =>
      run.unlocks.includes(item.id) &&
      item.pool.includes(pool) &&
      !run.player.items.includes(item.id) &&
      !pocketItemIds.has(item.id) &&
      canBenefitFromItem(item),
  );
  if (eligible.length) return eligible;
  return Object.values(ITEMS).filter(
    (item) => run.unlocks.includes(item.id) && item.pool.includes(pool) && canBenefitFromItem(item),
  );
}

function weightedUnique<T>(
  run: RunState,
  values: readonly T[],
  count: number,
  weight: (value: T) => number,
): T[] {
  const remaining = [...values];
  const selected: T[] = [];
  while (remaining.length && selected.length < count) {
    const picked = weightedPick(
      run,
      remaining.map((value) => ({ value, weight: weight(value) })),
    );
    selected.push(picked);
    remaining.splice(remaining.indexOf(picked), 1);
  }
  return selected;
}

function pickUniqueItems(
  run: RunState,
  pool: RewardPool,
  count: number,
  predicate: (item: ItemDefinition) => boolean = () => true,
): ItemDefinition[] {
  const candidates = unlockedPool(run, pool).filter(predicate);
  const weightedCandidates = candidates.filter((item) => rewardQualityWeight(pool, item.quality) > 0);
  return weightedUnique(run, weightedCandidates.length ? weightedCandidates : candidates, count, (item) =>
    Math.max(1, rewardQualityWeight(pool, item.quality)),
  );
}

function itemOptions(
  run: RunState,
  pool: RewardPool,
  count: number,
  price?: number,
  predicate?: (item: ItemDefinition) => boolean,
): RewardOption[] {
  return pickUniqueItems(run, pool, count, predicate).map((item) => ({
    id: makeId('option', run),
    type: RewardOptionType.Item,
    itemId: item.id,
    label: item.name,
    description: item.description,
    icon: item.icon,
    price,
  }));
}

function cardOptions(run: RunState, rewardPool: RewardPool, count: number, price?: number): RewardOption[] {
  const candidates = Object.values(CARDS).filter(
    (card) =>
      ![CardType.Skill, CardType.Curse].includes(card.type) &&
      card.id !== 'basic-attack' &&
      !(card.itemId && !itemUsesCombatCard(ITEMS[card.itemId]!)) &&
      card.rewardPools.includes(rewardPool),
  );
  const weightedPool = candidates.filter((card) => rewardQualityWeight(rewardPool, card.quality) > 0);
  return weightedUnique(run, weightedPool.length ? weightedPool : candidates, count, (card) =>
    cardRewardWeight(card, rewardPool),
  ).map((card) => ({
    id: makeId('option', run),
    type: RewardOptionType.Card,
    cardId: card.id,
    label: card.name,
    description: card.description,
    icon: card.icon,
    price,
  }));
}

function cardRewardWeight(card: CardDefinition, pool: RewardPool): number {
  return Math.max(1, rewardQualityWeight(pool, card.quality)) * (card.rewardWeight ?? 1);
}

function setChoice(run: RunState, choice: ChoiceState): void {
  run.phase = RunPhase.Choice;
  run.choice = choice;
}

function setRoomRewardChoice(run: RunState, choice: Omit<ChoiceState, 'canSkip'>): void {
  setChoice(run, { ...choice, canSkip: true });
}

function revealMap(run: RunState): void {
  revealFromCurrent(run.floorMap, itemHasEffect(run, 'revealSecrets'), itemHasEffect(run, 'revealAll'));
}

function returnToMap(run: RunState): void {
  if (run.combat?.temporaryCardIds.length) {
    const temporary = new Set(run.combat.temporaryCardIds);
    run.player.deck = run.player.deck.filter((card) => !temporary.has(card.instanceId));
  }
  run.phase = RunPhase.Map;
  run.combat = undefined;
  run.roomCheckpoint = undefined;
  run.choice = undefined;
  run.currentRoomId = undefined;
  revealMap(run);
}

function resourceOption(
  run: RunState,
  resource: NonNullable<RewardOption['resource']>,
  amount: number,
  label: string,
  description: string,
  icon: string,
  price?: number,
): RewardOption {
  return {
    id: makeId('option', run),
    type: RewardOptionType.Resource,
    resource,
    amount,
    label,
    description,
    icon,
    price,
  };
}

function floorStartItemOption(
  run: RunState,
  predicate: (item: ItemDefinition) => boolean,
): RewardOption | undefined {
  const candidates = Object.values(ITEMS).filter(
    (item) => run.unlocks.includes(item.id) && !run.player.items.includes(item.id) && predicate(item),
  );
  const item = weightedUnique(run, candidates, 1, (entry) =>
    Math.max(1, rewardQualityWeight(RewardPool.FloorStart, entry.quality)),
  )[0];
  return item
    ? {
        id: makeId('floor-item', run),
        type: RewardOptionType.Item,
        itemId: item.id,
        label: item.name,
        description: item.description,
        icon: item.icon,
      }
    : undefined;
}

function makeFloorStartChoice(run: RunState): void {
  const combatItem = floorStartItemOption(run, itemUsesCombatCard);
  const permanentItem = floorStartItemOption(
    run,
    (item) =>
      item.kind === ItemKind.Passive && item.combatCard === false && item.pool.includes(RewardPool.LargeRoom),
  );
  const resource = pickOne(run, [ResourceKind.Coins, ResourceKind.Bombs, ResourceKind.Keys] as const);
  const resourceAmount =
    resource === ResourceKind.Coins
      ? randomInt(run, 6 + run.floorIndex, 9 + run.floorIndex)
      : randomInt(run, 2, run.floorIndex >= 3 ? 3 : 2);
  const resourceRewards = {
    [ResourceKind.Coins]: resourceOption(
      run,
      ResourceKind.Coins,
      resourceAmount,
      'Coin cache',
      'Take the loose change.',
      '¢',
    ),
    [ResourceKind.Bombs]: resourceOption(
      run,
      ResourceKind.Bombs,
      resourceAmount,
      'Bomb bundle',
      'Bombs for future hidden doors.',
      '●',
    ),
    [ResourceKind.Keys]: resourceOption(
      run,
      ResourceKind.Keys,
      resourceAmount,
      'Key ring',
      'Keys for locked rewards.',
      '⚿',
    ),
  } satisfies Record<typeof resource, RewardOption>;
  const options = shuffle(
    run,
    [combatItem, permanentItem, resourceRewards[resource]].filter(
      (option): option is RewardOption => option !== undefined,
    ),
  );
  run.lastReward = [];
  setChoice(run, {
    kind: ChoiceKind.Loot,
    title: 'Floor provisions',
    subtitle: 'Choose one: a reusable item card, a permanent stat item, or an asset pack.',
    options,
    canSkip: false,
    next: ChoiceNext.Map,
    rewardContext: RewardContext.FloorStart,
    rewardPool: RewardPool.FloorStart,
  });
}

function applyResource(
  run: RunState,
  resource: NonNullable<RewardOption['resource']>,
  amount: number,
): string {
  switch (resource) {
    case ResourceKind.Coins:
      run.player.coins += amount;
      return `${amount}¢`;
    case ResourceKind.Bombs:
      run.player.bombs += amount;
      return `${amount} bomb${amount === 1 ? '' : 's'}`;
    case ResourceKind.Keys:
      run.player.keys += amount;
      return `${amount} key${amount === 1 ? '' : 's'}`;
    case ResourceKind.RedHeart: {
      const healed = healRed(run.player, run.player.stats.heartSize * amount);
      return `${healed} red-heart HP`;
    }
    case ResourceKind.SoulHeart:
      addPocketHeart(run, HeartKind.Soul, amount);
      return `${amount} soul heart${amount === 1 ? '' : 's'}`;
    case ResourceKind.BlackHeart:
      addPocketHeart(run, HeartKind.Black, amount);
      return `${amount} black heart${amount === 1 ? '' : 's'}`;
  }
}

function roomChoice(
  run: RunState,
  kind: ChoiceState['kind'],
  rewardPool: RewardPool,
  title: string,
  subtitle: string,
  options: RewardOption[],
): void {
  setRoomRewardChoice(run, { kind, title, subtitle, options, next: ChoiceNext.Map, rewardPool });
}

function resolveNonCombatRoom(run: RunState, kind: RoomKind): void {
  switch (kind) {
    case RoomKind.Shop: {
      const discount = 1 - run.player.stats.shopDiscount;
      const permanentStatUpgradePrice = run.floorIndex === 0 ? 5 : 15;
      const upgradeOption = (
        upgrade: UpgradeKind,
        label: string,
        description: string,
        icon: string,
        price: number,
      ): RewardOption => ({
        id: makeId('shop-upgrade', run),
        type: RewardOptionType.Upgrade,
        upgrade,
        label,
        description,
        icon,
        price,
      });
      const options = [
        upgradeOption(
          UpgradeKind.Card,
          'Deck Forge',
          'Choose any unupgraded card in your deck and upgrade it.',
          '✦',
          Math.max(2, Math.round(5 * discount)),
        ),
        upgradeOption(
          UpgradeKind.Heart,
          'Heart Training',
          `Each heart permanently holds ${HEART_SIZE_UPGRADE_AMOUNT} more HP.`,
          '♥',
          permanentStatUpgradePrice,
        ),
        upgradeOption(
          UpgradeKind.Shield,
          'Shield Capacity',
          `+${SHIELD_CAPACITY_UPGRADE_AMOUNT} permanent shield capacity.`,
          '⬡',
          permanentStatUpgradePrice,
        ),
        upgradeOption(
          UpgradeKind.Armor,
          'Tough Skin',
          `+${ARMOR_UPGRADE_AMOUNT} permanent armor.`,
          '⛉',
          permanentStatUpgradePrice,
        ),
        ...itemOptions(
          run,
          RewardPool.Shop,
          3,
          undefined,
          (item) => itemUsesCombatCard(item) || (item.kind === ItemKind.Active && Boolean(item.skillCardId)),
        ).map((option, index) => ({
          ...option,
          price: Math.max(3, Math.round((15 + index * 3) * discount)),
        })),
      ];
      roomChoice(
        run,
        ChoiceKind.Shop,
        RewardPool.Shop,
        'Shop',
        `${run.player.coins}¢ in your pocket`,
        options,
      );
      break;
    }
    case RoomKind.Treasure:
      roomChoice(
        run,
        ChoiceKind.Item,
        RewardPool.Treasure,
        'Treasure Room',
        'Choose one item. Active items replace the one you hold.',
        itemOptions(run, RewardPool.Treasure, 3),
      );
      break;
    case RoomKind.Planetarium:
      roomChoice(
        run,
        ChoiceKind.Item,
        RewardPool.Planetarium,
        'Planetarium',
        'The heavens offer one impossible instrument.',
        itemOptions(run, RewardPool.Planetarium, 3),
      );
      break;
    case RoomKind.Curse: {
      const payment = Math.min(15, Math.max(0, run.player.redHp - 1));
      run.player.redHp -= payment;
      run.floorRedDamage += payment;
      roomChoice(
        run,
        ChoiceKind.Item,
        RewardPool.Curse,
        'Curse Room',
        `The spikes took ${payment} HP. Choose what waited inside.`,
        itemOptions(run, RewardPool.Curse, 2),
      );
      break;
    }
    case RoomKind.Sacrifice:
      roomChoice(
        run,
        ChoiceKind.Sacrifice,
        RewardPool.Sacrifice,
        'Sacrifice Room',
        'Offer 15 red-heart HP for a soul heart and a Tarot card.',
        [
          {
            id: makeId('sacrifice', run),
            type: RewardOptionType.Action,
            action: ChoiceAction.Sacrifice,
            label: 'Step on the spikes',
            description: 'Lose 15 red HP; gain a soul heart and a Tarot card.',
            icon: '♱',
          },
          {
            id: makeId('leave', run),
            type: RewardOptionType.Action,
            action: ChoiceAction.Leave,
            label: 'Walk away',
            description: 'Return to the map unharmed.',
            icon: '↩',
          },
        ],
      );
      break;
    case RoomKind.Secret:
      run.floorSecretVisits.push(RoomKind.Secret);
      recordAchievementEvent(run, { type: AchievementEventType.SecretRoomEntered });
      roomChoice(
        run,
        ChoiceKind.Loot,
        RewardPool.Secret,
        'Secret Room',
        'A hollow wall concealed a small cache.',
        [
          resourceOption(
            run,
            ResourceKind.Coins,
            randomInt(run, 5, 10),
            'Coin cache',
            'Take the loose change.',
            '¢',
          ),
          resourceOption(
            run,
            ResourceKind.Bombs,
            2,
            'Bomb bundle',
            'Two bombs for future hidden doors.',
            '●',
          ),
          ...itemOptions(run, RewardPool.Secret, 1),
        ],
      );
      break;
    case RoomKind.SuperSecret:
      run.floorSecretVisits.push(RoomKind.SuperSecret);
      recordAchievementEvent(run, { type: AchievementEventType.SecretRoomEntered });
      roomChoice(
        run,
        ChoiceKind.Loot,
        RewardPool.SuperSecret,
        'Super Secret Room',
        'Something precious has been waiting here.',
        [
          resourceOption(run, ResourceKind.SoulHeart, 1, 'Soul Heart', 'Add a 10 HP soul heart.', '♡'),
          resourceOption(run, ResourceKind.BlackHeart, 1, 'Black Heart', 'Explodes when emptied.', '🖤'),
          ...itemOptions(run, RewardPool.SuperSecret, 1),
        ],
      );
      break;
    default:
      returnToMap(run);
  }
}

export function enterRoom(state: RunState, nodeId: string): RunState {
  const run = clone(state);
  if (run.phase !== RunPhase.Map) throw new Error('A room can only be entered from the map');
  if (!availableNodeIds(run.floorMap).includes(nodeId))
    throw new Error('That room is not connected to the current route');
  const node = getMapNode(run.floorMap, nodeId);
  if (node.visited) throw new Error('That room has already been cleared');
  if (roomRequiresKey(run.floorIndex, node.kind)) {
    if (run.player.keys < 1) throw new Error('A key is required to open this room');
    run.player.keys -= 1;
  }
  node.visited = true;
  if (!node.optional) run.floorMap.currentNodeId = node.id;
  run.currentRoomId = node.id;
  run.lastReward = [];
  run.mapBombResult = undefined;

  if (node.kind === RoomKind.Combat || node.kind === RoomKind.Elite || node.kind === RoomKind.Boss) {
    beginCombat(run, node.kind);
  } else {
    resolveNonCombatRoom(run, node.kind);
  }
  return touch(run);
}

/** Advances the route past an unopened Shop or Treasure Room when Isaac has no key. */
export function bypassLockedRoom(state: RunState, nodeId: string): RunState {
  const run = clone(state);
  if (run.phase !== RunPhase.Map) throw new Error('A room can only be bypassed from the map');
  if (!availableNodeIds(run.floorMap).includes(nodeId))
    throw new Error('That room is not connected to the current route');
  const node = getMapNode(run.floorMap, nodeId);
  if (!roomRequiresKey(run.floorIndex, node.kind)) throw new Error('That room is not key-locked');
  if (node.visited) throw new Error('That room has already been cleared');
  if (run.player.keys > 0) throw new Error('A key is available to open this room');

  node.visited = true;
  node.bypassed = true;
  run.floorMap.currentNodeId = node.id;
  run.currentRoomId = undefined;
  run.lastReward = [];
  run.mapBombResult = undefined;
  revealMap(run);
  return touch(run);
}

export function hydrateRunState(state: RunState): RunState {
  const run = migrateRunSnapshot(state);
  ensureCombatGrid(run);
  run.combat?.enemies.forEach(ensureEnemyBehavior);
  return run;
}

function makeEnemy(
  run: RunState,
  definition: EnemyDefinition,
  index: number,
  initializeIntent = true,
): EnemyState {
  const difficulty = difficultyForFloor(run.floorIndex);
  const maxHp = Math.max(1, Math.round(definition.maxHp * difficulty.hpMultiplier));
  const enemy: EnemyState = {
    ...definition,
    instanceId: `${definition.id}-${index}-${randomInt(run, 1000, 9999)}`,
    maxHp,
    hp: maxHp,
    attack: Math.max(1, Math.round(definition.attack * difficulty.attackMultiplier)),
    armor: Math.max(0, definition.armor + difficulty.armorBonus),
    movementSpeed: Math.max(1, definition.movementSpeed + difficulty.movementBonus),
    attackRange: Math.max(1, definition.attackRange + difficulty.rangeBonus),
    visionRange: Math.max(1, definition.visionRange + difficulty.rangeBonus),
    shield: 0,
    cursedTurns: 0,
    staggeredTurns: 0,
    poisonTurns: 0,
    poisonDamage: 0,
    statuses: {},
    slowedTurns: 0,
    prepared: false,
    behavior: behaviorFor(definition),
    behaviorStep: index,
    damageTakenThisRound: 0,
    reactionCooldown: 0,
    turnsSinceAttack: 0,
    alerted: false,
    position: { ...ISAAC_DOOR_POSITION },
    intent: { kind: IntentKind.Idle, value: 0, label: 'Watching' },
  };
  if (initializeIntent) enemy.intent = rollIntent(run, enemy);
  return enemy;
}

function createCombatRoomLayout(run: RunState, roomKind: CombatState['roomKind']): CombatRoomLayout {
  const progression = [
    // The first two floors are the build-up phase: most fights stay compact so
    // weak opening decks do not spend several turns only crossing empty space.
    { standard: 90, wide: 5, tall: 3, large: 1, lShape: 1 },
    { standard: 78, wide: 10, tall: 7, large: 3, lShape: 2 },
    { standard: 60, wide: 17, tall: 13, large: 6, lShape: 4 },
    { standard: 44, wide: 20, tall: 16, large: 11, lShape: 9 },
    { standard: 28, wide: 20, tall: 16, large: 20, lShape: 16 },
    { standard: 22, wide: 18, tall: 14, large: 26, lShape: 20 },
  ][Math.min(FLOORS.length - 1, Math.max(0, run.floorIndex))]!;
  const weights = { ...progression };
  if (roomKind === RoomKind.Elite) {
    weights.standard *= 0.82;
    weights.large *= 1.25;
    weights.lShape *= 1.2;
  } else if (roomKind === RoomKind.Boss) {
    const bossGrowth = run.floorIndex / Math.max(1, FLOORS.length - 1);
    weights.standard *= 0.72 - bossGrowth * 0.18;
    weights.wide *= 1.1;
    weights.tall *= 1.05;
    weights.large *= 1.7 + bossGrowth * 0.5;
    weights.lShape *= 1.45 + bossGrowth * 0.35;
  }
  const layout = weightedPick(run, [
    {
      value: {
        shape: CombatRoomShape.Standard,
        width: STANDARD_ROOM_WIDTH,
        height: STANDARD_ROOM_HEIGHT,
        unitCount: 1,
      } as CombatRoomLayout,
      weight: weights.standard,
    },
    {
      value: {
        shape: CombatRoomShape.Wide,
        width: STANDARD_ROOM_WIDTH * 2,
        height: STANDARD_ROOM_HEIGHT,
        unitCount: 2,
      } as CombatRoomLayout,
      weight: weights.wide,
    },
    {
      value: {
        shape: CombatRoomShape.Tall,
        width: STANDARD_ROOM_WIDTH,
        height: STANDARD_ROOM_HEIGHT * 2,
        unitCount: 2,
      } as CombatRoomLayout,
      weight: weights.tall,
    },
    {
      value: {
        shape: CombatRoomShape.Large,
        width: STANDARD_ROOM_WIDTH * 2,
        height: STANDARD_ROOM_HEIGHT * 2,
        unitCount: 4,
      } as CombatRoomLayout,
      weight: weights.large,
    },
    {
      value: {
        shape: CombatRoomShape.LShaped,
        width: STANDARD_ROOM_WIDTH * 2,
        height: STANDARD_ROOM_HEIGHT * 2,
        unitCount: 3,
      } as CombatRoomLayout,
      weight: weights.lShape,
    },
  ]);
  const generated = { ...layout };
  if (generated.shape === CombatRoomShape.LShaped) {
    generated.missingQuadrant = pickOne(run, [
      RoomMissingQuadrant.TopLeft,
      RoomMissingQuadrant.TopRight,
      RoomMissingQuadrant.BottomLeft,
      RoomMissingQuadrant.BottomRight,
    ] as const);
  }
  return generated;
}

function roomEnemyCapacity(layout: CombatRoomLayout): number {
  const cellCount =
    layout.width * layout.height -
    (layout.shape === CombatRoomShape.LShaped ? STANDARD_ROOM_WIDTH * STANDARD_ROOM_HEIGHT : 0);
  return Math.max(3, Math.floor(cellCount / 50));
}

function encounterDefinitions(
  run: RunState,
  roomKind: CombatState['roomKind'],
  layout: CombatRoomLayout,
): EnemyDefinition[] {
  const pool = enemyPoolForFloor(run.floorIndex);
  const capacity = roomEnemyCapacity(layout);
  const difficulty = difficultyForFloor(run.floorIndex);
  if (roomKind === RoomKind.Boss) {
    const supportLimit = layout.unitCount >= 3 ? Math.min(capacity - 1, difficulty.bossSupportLimit) : 0;
    const supportCount = supportLimit > 0 ? randomInt(run, 0, supportLimit) : 0;
    return [bossForFloor(run.floorIndex), ...Array.from({ length: supportCount }, () => pickOne(run, pool))];
  }
  if (roomKind === RoomKind.Elite) {
    const minimumSupport =
      layout.unitCount === 1 ? (run.floorIndex >= 2 ? 1 : 0) : Math.max(1, layout.unitCount - 1);
    const maximumSupport = Math.max(minimumSupport, Math.min(capacity - 1, Math.ceil(capacity * 0.65)));
    const supportCount = randomInt(run, minimumSupport, maximumSupport);
    return [eliteForFloor(run.floorIndex), ...Array.from({ length: supportCount }, () => pickOne(run, pool))];
  }
  const minimum = Math.max(2, Math.ceil(capacity * difficulty.encounterMinRatio));
  const maximum = Math.max(minimum, Math.min(capacity, Math.floor(capacity * difficulty.encounterMaxRatio)));
  const count = randomInt(run, minimum, maximum);
  return Array.from({ length: count }, () => pickOne(run, pool));
}

function positionEnemiesRandomly(run: RunState, combat: CombatState): void {
  const entryPosition = [
    { x: 0, y: 4 },
    { x: 0, y: 13 },
  ].find((position) => isCombatCellAvailable(combat, position)) ??
    getCombatRoomCells(combat)[0] ?? { ...ISAAC_DOOR_POSITION };
  const occupied = new Set<string>([positionKey(entryPosition)]);
  const placementOrder = [...combat.enemies].sort(
    (left, right) =>
      right.footprintWidth * right.footprintHeight - left.footprintWidth * left.footprintHeight,
  );
  for (const enemy of placementOrder) {
    const candidates = getCombatRoomCells(combat).filter((position) =>
      enemyPositionFits(combat, enemy, position, occupied),
    );
    if (!candidates.length) throw new Error(`Room layout cannot fit enemy ${enemy.id}`);
    enemy.position = pickOne(run, candidates);
    getEnemyOccupiedCells(enemy).forEach((cell) => occupied.add(positionKey(cell)));
  }
  occupied.delete(positionKey(entryPosition));
  const deploymentCells = getCombatRoomCells(combat).filter(
    (position) => !occupied.has(positionKey(position)),
  );
  if (!deploymentCells.length) throw new Error('Room layout has no free deployment cell');
  combat.playerPosition = entryPosition;
}

function drawToHand(run: RunState, combat: CombatState, target = run.player.stats.drawCount): void {
  while (combat.hand.length < target) {
    if (!combat.drawPile.length) {
      if (!combat.discardPile.length) break;
      combat.drawPile = shuffle(run, combat.discardPile);
      combat.discardPile = [];
    }
    const next = combat.drawPile.shift();
    if (next) combat.hand.push(next);
  }
}

function queueDrawSelection(
  run: RunState,
  combat: CombatState,
  sourceInstanceId: string,
  amount: number,
): number {
  const requested = Math.max(1, Math.round(amount));
  const existing =
    combat.pendingSelection?.kind === CombatSelectionKind.Draw ? combat.pendingSelection : undefined;
  const totalRequested = requested + (existing?.max ?? 0);
  const selectable = Math.min(totalRequested, combat.drawPile.length);
  if (selectable <= 0) return 0;
  if (existing) {
    existing.candidateInstanceIds = [...combat.drawPile];
    existing.min = 0;
    existing.max = selectable;
  } else {
    combat.pendingSelection = {
      kind: CombatSelectionKind.Draw,
      sourceInstanceId,
      candidateInstanceIds: [...combat.drawPile],
      min: 0,
      max: selectable,
    };
  }
  return selectable;
}

function beginCombat(run: RunState, roomKind: RoomKind.Combat | RoomKind.Elite | RoomKind.Boss): void {
  const generatedLayout = createCombatRoomLayout(run, roomKind);
  const definitions = encounterDefinitions(run, roomKind, generatedLayout);
  const skills = run.player.deck
    .filter((card) => CARDS[card.definitionId]?.type === CardType.Skill)
    .map((card) => card.instanceId);
  const others = run.player.deck
    .filter((card) => CARDS[card.definitionId]?.type !== CardType.Skill)
    .map((card) => card.instanceId);
  const combat: CombatState = {
    roomKind,
    roomLayout: generatedLayout,
    deploymentPending: true,
    round: 1,
    vitality: run.player.stats.maxVitality,
    playerShield: Math.max(0, Math.min(run.player.stats.baseShield, run.player.stats.maxShield)),
    playerShieldCapacityBuff: 0,
    playerArmorBuff: 0,
    playerDamageBuff: 0,
    playerDamageMultiplier: 1,
    playerFireRateBuff: 0,
    playerCritChanceBuff: 0,
    playerDodgeChanceBuff: 0,
    playerRangeBuff: 0,
    playerMovementBuff: 0,
    curvedShotsOverride: false,
    usedPassiveItems: [],
    itemActionCounters: {},
    usedItemActions: [],
    observedDefeatIds: [],
    statFloorLocked: false,
    activeEffectRepeats: 0,
    playerStatuses: {},
    playerStatusPower: {},
    cardDefinitionOverrides: {},
    temporaryCardIds: [],
    blankBookActive: false,
    damoclesActive: false,
    damoclesFallen: false,
    ragnarokActive: false,
    unlimitedVitalityTurns: 0,
    playerPosition: { ...ISAAC_DOOR_POSITION },
    attackMeter: 0,
    hand: [...skills],
    drawPile: shuffle(run, others),
    discardPile: [],
    exhausted: [],
    cooldowns: Object.fromEntries(skills.map((id) => [id, 0])),
    familiars: familiarsForPlayer(run),
    enemies: [],
    log: [],
    animationSequence: 0,
    animationEvents: [],
    damageTakenThisFloor: 0,
  };
  run.combat = combat;
  combat.enemies = definitions.map((definition, index) => makeEnemy(run, definition, index, false));
  positionEnemiesRandomly(run, combat);
  combat.enemies.forEach((enemy) => {
    enemy.intent = rollIntent(run, enemy);
  });
  if (
    !combat.enemies.some((enemy) => enemy.intent.actions?.some((entry) => entry.kind === IntentKind.Attack))
  ) {
    const attacker = combat.enemies.at(-1);
    if (attacker)
      attacker.intent = makeIntent(
        attacker.boss
          ? [
              action(IntentKind.Attack, attackValue(attacker)),
              action(IntentKind.Attack, attackValue(attacker, 0.7)),
            ]
          : [action(IntentKind.Attack, attackValue(attacker))],
      );
  }
  drawToHand(run, combat);
  pushLog(
    combat,
    `Round 1 — ${combat.enemies.map((enemy) => enemy.name).join(', ')} entered the room.`,
    CombatLogTone.Special,
    'enter',
    {
      enemies: combat.enemies.map((enemy) => enemy.id).join('|'),
    },
  );
  run.choice = undefined;
  run.phase = RunPhase.Combat;
  recordAchievementEvent(run, { type: AchievementEventType.RoundStarted });
  runItemActions(run, ItemActionTrigger.CombatStart);
  run.roomCheckpoint = {
    rngState: run.rngState,
    player: clone(run.player),
    combat: clone(combat),
    floorRedDamage: run.floorRedDamage,
  };
}

function selectedTarget(combat: CombatState, requestedId?: string): EnemyState | undefined {
  const enemyId = requestedId ?? combat.selectedEnemyId;
  return enemyId ? combat.enemies.find((enemy) => enemy.instanceId === enemyId && enemy.hp > 0) : undefined;
}

function hurtEnemy(enemy: EnemyState, rawDamage: number, armorPierce = 0): number {
  ensureEnemyBehavior(enemy);
  enemy.alerted = true;
  const durabilityBefore = enemy.hp + enemy.shield;
  const effectiveArmor = (enemy.statuses?.[StatusKind.ArmorBreak] ?? 0) > 0 ? 0 : enemy.armor;
  const afterArmor = Math.max(1, Math.round(rawDamage) - Math.max(0, effectiveArmor - armorPierce));
  const absorbed = Math.min(enemy.shield, afterArmor);
  enemy.shield -= absorbed;
  const hpDamage = afterArmor - absorbed;
  enemy.hp = Math.max(0, enemy.hp - hpDamage);
  enemy.damageTakenThisRound += Math.max(0, durabilityBefore - enemy.hp - enemy.shield);
  return afterArmor;
}

function runFamiliarAttacks(run: RunState): void {
  const combat = run.combat;
  if (!combat || combat.deploymentPending || !combat.familiars.length) return;
  let attacks = 0;
  let totalHpDamage = 0;

  const attackTarget = (familiar: CombatState['familiars'][number], target: EnemyState, scale = 1): void => {
    const wasAlive = target.hp > 0;
    const hpBefore = target.hp;
    const shieldBefore = target.shield;
    let rawTotal = 0;
    let afterArmorTotal = 0;
    const modeMultiplier =
      familiar.attackMode === AttackMode.Knife ? 1.4 : familiar.attackMode === AttackMode.Brimstone ? 0.9 : 1;
    const armorPierce = familiar.attackMode === AttackMode.Knife ? 2 : 0;
    for (let hit = 0; hit < familiar.hits; hit += 1) {
      const rawDamage = Math.max(1, Math.round(familiar.damage * modeMultiplier * scale));
      rawTotal += rawDamage;
      afterArmorTotal += hurtEnemy(target, rawDamage, armorPierce);
    }
    const hpDamage = hpBefore - target.hp;
    const shieldDamage = shieldBefore - target.shield;
    totalHpDamage += hpDamage;
    attacks += 1;
    if (target.hp > 0 && familiar.poisonTurns > 0) {
      target.poisonTurns = Math.max(target.poisonTurns, familiar.poisonTurns);
      target.poisonDamage = Math.max(target.poisonDamage, familiar.poisonDamage);
    }
    if (target.hp > 0 && familiar.slowTurns > 0) {
      target.slowedTurns = Math.max(target.slowedTurns, familiar.slowTurns);
    }
    pushAnimation(combat, {
      kind: CombatAnimationKind.FamiliarAttack,
      sourceId: familiar.instanceId,
      targetId: target.instanceId,
      value: hpDamage,
      secondaryValue: shieldDamage,
      rawValue: rawTotal,
      armorValue: Math.max(0, rawTotal - afterArmorTotal),
      hitCount: familiar.hits,
      attackMode: familiar.attackMode,
      projectileScale: familiar.projectileScale,
      poisonTurns: familiar.poisonTurns,
      slowTurns: familiar.slowTurns,
    });
    if (wasAlive && target.hp <= 0) {
      pushAnimation(combat, {
        kind: CombatAnimationKind.Defeat,
        sourceId: target.instanceId,
        targetId: target.instanceId,
      });
    }
  };

  for (const familiar of combat.familiars) {
    const target = combat.enemies
      .filter((enemy) => enemy.hp > 0)
      .sort((left, right) => {
        const distance =
          enemyChebyshevDistanceToPosition(left, combat.playerPosition) -
          enemyChebyshevDistanceToPosition(right, combat.playerPosition);
        return distance || left.hp - right.hp || left.instanceId.localeCompare(right.instanceId);
      })[0];
    if (!target) break;
    attackTarget(familiar, target);
    if (familiar.splashDamageRatio > 0) {
      combat.enemies
        .filter(
          (enemy) =>
            enemy.hp > 0 &&
            enemy.instanceId !== target.instanceId &&
            enemyChebyshevDistanceToPosition(enemy, target.position) <= 1,
        )
        .forEach((enemy) => attackTarget(familiar, enemy, familiar.splashDamageRatio));
    }
  }

  if (attacks > 0) {
    pushLog(
      combat,
      `${combat.familiars.length} familiars attacked automatically for ${totalHpDamage} HP damage.`,
      CombatLogTone.Good,
      'familiarVolley',
      { count: combat.familiars.length, damage: totalHpDamage },
    );
  }
  notifyNewEnemyDeaths(run);
}

function attackDamage(
  run: RunState,
  combat: CombatState,
  card: CardDefinition,
  instance: CardInstance,
): number {
  const upgraded = instance.upgraded ? 2 : 0;
  const nominal = card.value ?? 6;
  const factor = nominal / 6;
  const weakness = (combat.playerStatuses[StatusKind.Weak] ?? 0) > 0 ? 0.5 : 1;
  return Math.max(
    1,
    (run.player.stats.baseDamage + combat.playerDamageBuff + upgraded) *
      run.player.stats.damageMultiplier *
      combat.playerDamageMultiplier *
      factor *
      weakness,
  );
}

function knockbackEnemy(combat: CombatState, enemy: EnemyState, distance: number): void {
  if (distance <= 0 || enemy.hp <= 0) return;
  const origin = combat.playerPosition;
  const horizontal = Math.abs(enemy.position.x - origin.x) >= Math.abs(enemy.position.y - origin.y);
  const stepX = horizontal ? Math.sign(enemy.position.x - origin.x) : 0;
  const stepY = horizontal ? 0 : Math.sign(enemy.position.y - origin.y);
  if (stepX === 0 && stepY === 0) return;
  const occupied = new Set(
    combat.enemies
      .filter((entry) => entry.hp > 0 && entry.instanceId !== enemy.instanceId)
      .flatMap((entry) => getEnemyOccupiedCells(entry))
      .map(positionKey),
  );
  occupied.add(positionKey(origin));
  let destination = { ...enemy.position };
  for (let step = 0; step < distance; step += 1) {
    const candidate = { x: destination.x + stepX, y: destination.y + stepY };
    if (!enemyPositionFits(combat, enemy, candidate, occupied)) break;
    destination = candidate;
  }
  if (destination.x === enemy.position.x && destination.y === enemy.position.y) return;
  const from = { ...enemy.position };
  enemy.position = destination;
  pushAnimation(combat, {
    kind: CombatAnimationKind.Move,
    sourceId: enemy.instanceId,
    targetId: enemy.instanceId,
    fromX: from.x,
    fromY: from.y,
    toX: destination.x,
    toY: destination.y,
  });
}

function playAttack(
  run: RunState,
  combat: CombatState,
  card: CardDefinition,
  instance: CardInstance,
  targetId?: string,
  fusion?: AttackFusionPreview,
  fusedItemCount = 0,
): void {
  ensureCombatGrid(run);
  const modifier =
    fusion ??
    ({
      totalCost: card.cost,
      damageMultiplier: 1,
      flatDamage: 0,
      projectileScale: 1,
      projectileDiameter: projectileDiameterInCells(1),
      contactDamageRatio: PROJECTILE_CONTACT_DAMAGE_RATIO,
      knockback: 0,
      poisonTurns: 0,
      poisonDamage: 0,
      slowTurns: 0,
      curvedShots: false,
    } satisfies AttackFusionPreview);
  const inRange = (enemy: EnemyState) =>
    getEnemyOccupiedCells(enemy).some((cell) =>
      isPositionInPlayerAttackRangeWithFusion(run, cell, modifier.curvedShots),
    );
  let targets =
    card.target === CardTarget.AllEnemies
      ? combat.enemies.filter((enemy) => enemy.hp > 0 && inRange(enemy))
      : [selectedTarget(combat, targetId)].filter((enemy): enemy is EnemyState => Boolean(enemy));
  let multiplier = 1;
  let armorPierce = 0;
  const attackMode = modifier.attackMode ?? combat.attackModeOverride ?? run.player.stats.attackMode;
  if (attackMode === AttackMode.Knife) {
    multiplier = 1.6;
    armorPierce = 3;
  }
  if (attackMode === AttackMode.Brimstone) {
    targets = combat.enemies.filter((enemy) => enemy.hp > 0 && inRange(enemy));
    multiplier = 0.85;
  }
  if (attackMode === AttackMode.TechX) {
    targets = combat.enemies.filter((enemy) => enemy.hp > 0 && inRange(enemy));
    targets.forEach((enemy) => {
      enemy.shield = Math.max(0, enemy.shield - 3);
    });
  }

  combat.attackMeter += Math.max(0, run.player.stats.fireRate + combat.playerFireRateBuff - 1);
  const echoHits = Math.floor(combat.attackMeter + 0.00001);
  combat.attackMeter -= echoHits;
  const hits = (card.hits ?? 1) + echoHits;
  const base =
    attackDamage(run, combat, card, instance) * multiplier * modifier.damageMultiplier + modifier.flatDamage;

  const projectileContacts = (() => {
    if (attackMode !== AttackMode.Basic || card.target !== CardTarget.Enemy || targets.length !== 1)
      return [];
    const target = targets[0]!;
    const aimedCell = getEnemyOccupiedCells(target)
      .filter((cell) => isPositionInPlayerAttackRangeWithFusion(run, cell, modifier.curvedShots))
      .sort(
        (left, right) =>
          gridDistance(combat.playerPosition, left) - gridDistance(combat.playerPosition, right),
      )[0];
    return aimedCell
      ? getProjectileContacts(
          combat.playerPosition,
          aimedCell,
          target,
          combat.enemies,
          modifier.projectileDiameter,
        )
      : [];
  })();

  let total = 0;
  const damageTarget = (target: EnemyState, damageScale = 1, contactDamageScale?: number): number => {
    target.alerted = true;
    const wasAlive = target.hp > 0;
    const hpBefore = target.hp;
    const shieldBefore = target.shield;
    let targetTotal = 0;
    let rawTotal = 0;
    for (let hit = 0; hit < hits; hit += 1) {
      const critical = nextRandom(run) < run.player.stats.critChance + combat.playerCritChanceBuff;
      const rawHit = base * damageScale * (critical ? 2 : 1);
      rawTotal += Math.round(rawHit);
      const dealt = hurtEnemy(target, rawHit, armorPierce);
      total += dealt;
      targetTotal += dealt;
    }
    const hpDamage = hpBefore - target.hp;
    const shieldDamage = shieldBefore - target.shield;
    pushAnimation(combat, {
      kind: CombatAnimationKind.PlayerAttack,
      sourceId: 'isaac',
      targetId: target.instanceId,
      value: hpDamage,
      secondaryValue: shieldDamage,
      rawValue: rawTotal,
      armorValue: Math.max(0, rawTotal - targetTotal),
      hitCount: hits,
      attackMode,
      projectileScale: modifier.projectileScale,
      contactDamageScale,
      poisonTurns: modifier.poisonTurns,
      slowTurns: modifier.slowTurns,
    });
    if (target.hp > 0 && modifier.poisonTurns > 0) {
      target.poisonTurns = Math.max(target.poisonTurns, modifier.poisonTurns);
      target.poisonDamage = Math.max(target.poisonDamage, modifier.poisonDamage || 3);
    }
    if (target.hp > 0 && modifier.slowTurns > 0)
      target.slowedTurns = Math.max(target.slowedTurns, modifier.slowTurns);
    if (target.hp > 0 && contactDamageScale === undefined) knockbackEnemy(combat, target, modifier.knockback);
    if (wasAlive && target.hp <= 0)
      pushAnimation(combat, {
        kind: CombatAnimationKind.Defeat,
        sourceId: target.instanceId,
        targetId: target.instanceId,
      });
    return targetTotal;
  };

  for (const target of targets) damageTarget(target);

  let grazeDamage = 0;
  let grazeCount = 0;
  for (const contact of projectileContacts) {
    const target = combat.enemies.find((enemy) => enemy.instanceId === contact.enemyId && enemy.hp > 0);
    if (!target) continue;
    const contactDamageScale = modifier.contactDamageRatio * contact.areaRatio;
    grazeDamage += damageTarget(target, contactDamageScale, contactDamageScale);
    grazeCount += 1;
  }
  const mode = attackMode === AttackMode.Basic ? '' : ` ${attackMode}`;
  pushLog(
    combat,
    `${card.name} dealt ${total}${mode} damage${echoHits ? ` with ${echoHits} echo hit` : ''}.`,
    CombatLogTone.Good,
    'attack',
    {
      cardId: card.id,
      damage: total,
      mode: attackMode === AttackMode.Basic ? '' : attackMode,
      echoCount: echoHits,
    },
  );
  if (fusedItemCount > 0) {
    pushLog(
      combat,
      `Fusion attack used ${fusedItemCount} item cards: ×${modifier.damageMultiplier.toFixed(2)} direct damage, ${modifier.projectileDiameter.toFixed(2)}-cell projectile, ${grazeCount} grazed.`,
      CombatLogTone.Special,
      'fusionAttack',
      {
        count: fusedItemCount,
        multiplier: modifier.damageMultiplier.toFixed(2),
        diameter: modifier.projectileDiameter.toFixed(2),
        grazeCount,
      },
    );
  }
  if (grazeCount > 0) {
    pushLog(
      combat,
      `The projectile grazed ${grazeCount} enemies for ${grazeDamage} contact damage.`,
      CombatLogTone.Good,
      'projectileGraze',
      { count: grazeCount, damage: grazeDamage },
    );
  }
}

function skillChargeRounds(run: RunState, instance: CardInstance): number {
  const item = Object.values(ITEMS).find((entry) => entry.skillCardId === instance.definitionId);
  return Math.max(1, (item?.chargeRounds ?? 3) - (instance.upgraded ? 1 : 0));
}

interface D6ExchangeResult {
  count: number;
  fromDraw: number;
  fromDiscard: number;
}

function combatPile(combat: CombatState, kind: CardPileKind): string[] {
  return kind === CardPileKind.Draw ? combat.drawPile : combat.discardPile;
}

function exchangeD6HandItems(run: RunState, combat: CombatState, sourceInstanceId: string): D6ExchangeResult {
  const handItemIds = combat.hand.filter(
    (id) => id !== sourceInstanceId && getCardDefinition(run, id)?.type === CardType.Item,
  );
  const availableSlots = [
    ...combat.drawPile.map((instanceId, index) => ({ kind: CardPileKind.Draw, index, instanceId })),
    ...combat.discardPile.map((instanceId, index) => ({ kind: CardPileKind.Discard, index, instanceId })),
  ];
  const result: D6ExchangeResult = { count: 0, fromDraw: 0, fromDiscard: 0 };

  for (const outgoingId of handItemIds) {
    if (!availableSlots.length) break;
    const outgoing = getCardDefinition(run, outgoingId);
    const differentSlots = availableSlots.filter(
      (slot) => getCardDefinition(run, slot.instanceId)?.id !== outgoing?.id,
    );
    const candidates = differentSlots.length ? differentSlots : availableSlots;
    const selected = pickOne(run, candidates);
    const selectedIndex = availableSlots.indexOf(selected);
    availableSlots.splice(selectedIndex, 1);

    const pile = combatPile(combat, selected.kind);
    const incomingId = pile[selected.index];
    const handIndex = combat.hand.indexOf(outgoingId);
    if (!incomingId || handIndex < 0) continue;
    combat.hand[handIndex] = incomingId;
    pile[selected.index] = outgoingId;
    result.count += 1;
    if (selected.kind === CardPileKind.Draw) result.fromDraw += 1;
    else result.fromDiscard += 1;
  }
  return result;
}

function d6ExchangeAvailability(
  run: RunState,
  combat: CombatState,
  sourceInstanceId: string,
): { handItems: number; pileCards: number } {
  return {
    handItems: combat.hand.filter(
      (id) => id !== sourceInstanceId && getCardDefinition(run, id)?.type === CardType.Item,
    ).length,
    pileCards: combat.drawPile.length + combat.discardPile.length,
  };
}

function effectScale(combat: CombatState, opcode: CardEffectOpcode): number {
  if (opcode === CardEffectOpcode.Damocles) return 1;
  return combat.damoclesActive && !combat.damoclesFallen ? 2 : 1;
}

function animateEnemyDamage(combat: CombatState, enemy: EnemyState, amount: number): void {
  const wasAlive = enemy.hp > 0;
  const dealt = hurtEnemy(enemy, amount, 99);
  pushAnimation(combat, {
    kind: CombatAnimationKind.PlayerAttack,
    sourceId: 'isaac',
    targetId: enemy.instanceId,
    value: dealt,
    attackMode: AttackMode.Basic,
  });
  if (wasAlive && enemy.hp <= 0) {
    pushAnimation(combat, {
      kind: CombatAnimationKind.Defeat,
      sourceId: enemy.instanceId,
      targetId: enemy.instanceId,
    });
  }
}

function rerollHandCards(
  run: RunState,
  combat: CombatState,
  sourceInstanceId: string,
  amount: number,
): number {
  const candidates = combat.hand
    .filter((id) => id !== sourceInstanceId)
    .map((id) => getCard(run, id))
    .filter((card): card is CardInstance => Boolean(card))
    .slice(0, Math.max(0, amount));
  const pool = Object.values(CARDS).filter(
    (card) =>
      ![CardType.Skill, CardType.Curse, CardType.Blank].includes(card.type) &&
      (card.type !== CardType.Item ||
        Boolean(card.itemId && run.unlocks.includes(card.itemId) && itemUsesCombatCard(ITEMS[card.itemId]!))),
  );
  for (const candidate of candidates) {
    const replacements = pool.filter((card) => card.id !== candidate.definitionId);
    if (replacements.length) candidate.definitionId = pickOne(run, replacements).id;
    candidate.upgraded = false;
  }
  return candidates.length;
}

function queueCycleSelection(
  run: RunState,
  combat: CombatState,
  sourceInstanceId: string,
  amount: number,
): number {
  const candidates = combat.hand
    .filter((id) => id !== sourceInstanceId)
    .filter((id) => Boolean(getCard(run, id)));
  const selectable = Math.min(Math.max(0, Math.round(amount)), candidates.length);
  if (selectable <= 0) return 0;
  combat.pendingSelection = {
    kind: CombatSelectionKind.Cycle,
    sourceInstanceId,
    candidateInstanceIds: candidates,
    min: 0,
    max: selectable,
  };
  return selectable;
}

function applyStatusToEnemy(
  combat: CombatState,
  enemy: EnemyState,
  status: StatusKind,
  turns: number,
  power: number,
): void {
  enemy.statuses[status] = Math.max(enemy.statuses[status] ?? 0, turns);
  if (status === StatusKind.Poison) {
    enemy.poisonTurns = Math.max(enemy.poisonTurns, turns);
    enemy.poisonDamage = Math.max(enemy.poisonDamage, power || 3);
  }
  pushAnimation(combat, {
    kind: status === StatusKind.Poison ? CombatAnimationKind.Poison : CombatAnimationKind.Curse,
    sourceId: 'isaac',
    targetId: enemy.instanceId,
    value: turns,
    poisonTurns: status === StatusKind.Poison ? turns : undefined,
  });
}

function applyCardEffects(
  run: RunState,
  combat: CombatState,
  effects: readonly CardEffect[],
  sourceInstanceId: string,
  targetId?: string,
  allowShieldOverflow = false,
  cycleSelectionLimit?: number,
): void {
  const sourceType = getCardDefinition(run, sourceInstanceId)?.type;
  const sourceUpgraded = getCard(run, sourceInstanceId)?.upgraded === true;
  const cardUpgradeScale = sourceUpgraded ? CARD_UPGRADE_EFFECT_MULTIPLIER : 1;
  const itemShieldOverflow =
    allowShieldOverflow || sourceType === CardType.Item || sourceType === CardType.Skill;
  for (let effectIndex = 0; effectIndex < effects.length; effectIndex += 1) {
    const effect = effects[effectIndex]!;
    const scale = effectScale(combat, effect.opcode);
    const baseAmount = (effect.amount ?? 0) * scale;
    const amountUpgradeScale =
      sourceUpgraded && baseAmount > 0 && effect.opcode !== CardEffectOpcode.AddBlank ? cardUpgradeScale : 1;
    const amount = baseAmount * amountUpgradeScale;
    const turns = Math.max(
      0,
      Math.round((effect.turns ?? 0) * scale + (sourceUpgraded && effect.turns ? 1 : 0)),
    );
    const target = selectedTarget(combat, targetId);
    switch (effect.opcode) {
      case CardEffectOpcode.GainDamage:
        if (combat.statFloorLocked && amount < 0) break;
        combat.playerDamageBuff += amount;
        break;
      case CardEffectOpcode.MultiplyDamage:
        combat.playerDamageMultiplier *= Math.pow(
          1 + ((effect.amount ?? 1) - 1) * ((effect.amount ?? 1) >= 1 ? cardUpgradeScale : 1),
          scale,
        );
        break;
      case CardEffectOpcode.GainFireRate:
        if (combat.statFloorLocked && amount < 0) break;
        combat.playerFireRateBuff += amount;
        break;
      case CardEffectOpcode.GainArmor:
        if (combat.statFloorLocked && amount < 0) break;
        combat.playerArmorBuff += amount;
        break;
      case CardEffectOpcode.GainShield: {
        const gained = gainPlayerShield(run, combat, amount, itemShieldOverflow);
        pushAnimation(combat, {
          kind: CombatAnimationKind.Shield,
          sourceId: 'isaac',
          targetId: 'isaac',
          value: gained,
        });
        break;
      }
      case CardEffectOpcode.GainShieldCapacity:
        combat.playerShieldCapacityBuff = Math.max(0, combat.playerShieldCapacityBuff + amount);
        break;
      case CardEffectOpcode.Heal: {
        const healed = healRed(run.player, amount);
        pushAnimation(combat, {
          kind: CombatAnimationKind.Heal,
          sourceId: 'isaac',
          targetId: 'isaac',
          value: healed,
        });
        break;
      }
      case CardEffectOpcode.GainRange:
        if (combat.statFloorLocked && amount < 0) break;
        combat.playerRangeBuff += amount;
        break;
      case CardEffectOpcode.GainMovement:
        if (combat.statFloorLocked && amount < 0) break;
        combat.playerMovementBuff += amount;
        break;
      case CardEffectOpcode.GainVitality:
        combat.vitality += amount;
        break;
      case CardEffectOpcode.GainCritical:
        combat.playerCritChanceBuff += amount;
        break;
      case CardEffectOpcode.GainDodge:
        combat.playerDodgeChanceBuff += amount;
        break;
      case CardEffectOpcode.EnableCurvedShots:
        combat.curvedShotsOverride = true;
        break;
      case CardEffectOpcode.SetAttackMode:
        if (effect.attackMode) combat.attackModeOverride = effect.attackMode;
        break;
      case CardEffectOpcode.Draw:
        if (queueDrawSelection(run, combat, sourceInstanceId, Math.ceil(amount)) > 0) {
          combat.pendingSelection!.remainingEffects = effects.slice(effectIndex + 1);
          combat.pendingSelection!.targetId = targetId;
          return;
        }
        cycleSelectionLimit = 0;
        break;
      case CardEffectOpcode.Cycle: {
        const selectableAmount =
          cycleSelectionLimit === undefined ? amount : Math.min(amount, cycleSelectionLimit);
        if (queueCycleSelection(run, combat, sourceInstanceId, selectableAmount) > 0) {
          combat.pendingSelection!.remainingEffects = effects.slice(effectIndex + 1);
          combat.pendingSelection!.targetId = targetId;
          return;
        }
        break;
      }
      case CardEffectOpcode.DamageTarget:
        if (target) animateEnemyDamage(combat, target, amount);
        break;
      case CardEffectOpcode.DamageAll:
        combat.enemies
          .filter((enemy) => enemy.hp > 0)
          .forEach((enemy) => animateEnemyDamage(combat, enemy, amount));
        break;
      case CardEffectOpcode.ApplyStatus:
        if (effect.status && effect.target === CardTarget.AllEnemies) {
          combat.enemies
            .filter((enemy) => enemy.hp > 0)
            .forEach((enemy) => applyStatusToEnemy(combat, enemy, effect.status!, turns || 1, amount));
        } else if (effect.status && target) {
          applyStatusToEnemy(combat, target, effect.status, turns || 1, amount);
        }
        break;
      case CardEffectOpcode.AddBlank:
        for (let index = 0; index < Math.max(1, Math.round(amount)); index += 1) {
          const blank = createCard(run, 'blank');
          run.player.deck.push(blank);
          combat.discardPile.push(blank.instanceId);
        }
        break;
      case CardEffectOpcode.RerollHand: {
        const count = rerollHandCards(run, combat, sourceInstanceId, Math.max(1, Math.round(amount)));
        pushLog(combat, `Rerolled ${count} cards.`, CombatLogTone.Special, 'reroll', { count });
        break;
      }
      case CardEffectOpcode.RevealMap:
        revealMap(run);
        break;
      case CardEffectOpcode.GainCoins:
        run.player.coins += Math.round(amount);
        break;
      case CardEffectOpcode.GainBombs:
        run.player.bombs += Math.round(amount);
        break;
      case CardEffectOpcode.GainKeys:
        run.player.keys += Math.round(amount);
        break;
      case CardEffectOpcode.ClearDebuffs:
        combat.playerStatuses = {};
        combat.playerStatusPower = {};
        break;
      case CardEffectOpcode.Transposition: {
        const candidates = combat.drawPile.filter((id) => {
          const definition = getCardDefinition(run, id);
          return (
            definition?.type === CardType.Item &&
            ITEMS[definition.itemId ?? '']?.timing !== ItemUseTiming.ActiveCharge
          );
        });
        if (candidates.length) {
          combat.pendingSelection = {
            kind: CombatSelectionKind.Transposition,
            sourceInstanceId,
            candidateInstanceIds: candidates,
            min: 0,
            max: candidates.length,
          };
        }
        break;
      }
      case CardEffectOpcode.BlankBook:
        combat.blankBookActive = true;
        break;
      case CardEffectOpcode.Damocles:
        combat.damoclesActive = true;
        combat.damoclesFallen = false;
        break;
      case CardEffectOpcode.Ragnarok:
        combat.ragnarokActive = true;
        break;
      case CardEffectOpcode.Stimulant:
        combat.unlimitedVitalityTurns = Math.max(combat.unlimitedVitalityTurns, turns || 5);
        break;
      case CardEffectOpcode.RestartRoom:
        break;
    }
  }
}

interface ItemActionContext {
  sourceItem?: ItemDefinition;
  sourceInstanceId?: string;
  targetId?: string;
  amount?: number;
}

function removeOwnedItem(run: RunState, item: ItemDefinition): void {
  run.player.items = run.player.items.filter((id) => id !== item.id);
  if (run.player.activeItemId === item.id) run.player.activeItemId = undefined;
  const removed = new Set(
    run.player.deck
      .filter((instance) => {
        const definition = CARDS[instance.definitionId];
        return definition?.itemId === item.id || instance.definitionId === item.skillCardId;
      })
      .map((instance) => instance.instanceId),
  );
  run.player.deck = run.player.deck.filter((instance) => !removed.has(instance.instanceId));
  if (!run.combat) return;
  run.combat.familiars = run.combat.familiars.filter((familiar) => familiar.itemId !== item.id);
  run.combat.hand = run.combat.hand.filter((id) => !removed.has(id));
  run.combat.drawPile = run.combat.drawPile.filter((id) => !removed.has(id));
  run.combat.discardPile = run.combat.discardPile.filter((id) => !removed.has(id));
  run.combat.exhausted.push(...removed);
}

function rerollItemCardsBy(
  run: RunState,
  combat: CombatState,
  replacementFor: (item: ItemDefinition) => CardDefinition | undefined,
): number {
  let changed = 0;
  for (const instanceId of combat.hand) {
    const instance = getCard(run, instanceId);
    const definition = instance ? getCardDefinition(run, instanceId) : undefined;
    const item = definition?.itemId ? ITEMS[definition.itemId] : undefined;
    if (!instance || !definition || definition.type !== CardType.Item || !item) continue;
    const replacement = replacementFor(item);
    if (!replacement || replacement.id === definition.id) continue;
    instance.definitionId = replacement.id;
    instance.upgraded = false;
    changed += 1;
  }
  return changed;
}

function executeItemActionMethod(
  run: RunState,
  combat: CombatState,
  item: ItemDefinition,
  action: NonNullable<ItemDefinition['actions']>[number],
  context: ItemActionContext,
): void {
  const sourceInstanceId = context.sourceInstanceId ?? `action:${item.id}:${action.id}`;
  switch (action.method) {
    case ItemActionMethod.ApplyEffects:
      applyCardEffects(run, combat, action.effects ?? [], sourceInstanceId, context.targetId, true);
      break;
    case ItemActionMethod.DuplicateRandomHandCard: {
      const candidates = combat.hand.filter((id) => id !== context.sourceInstanceId);
      const originalId = candidates.length ? pickOne(run, candidates) : undefined;
      const original = originalId ? getCard(run, originalId) : undefined;
      if (!original) break;
      const duplicate = createCard(run, original.definitionId);
      duplicate.upgraded = original.upgraded;
      run.player.deck.push(duplicate);
      combat.hand.push(duplicate.instanceId);
      break;
    }
    case ItemActionMethod.RechargeActive:
      for (const id of Object.keys(combat.cooldowns)) {
        combat.cooldowns[id] = Math.max(0, combat.cooldowns[id]! - Math.max(1, action.amount ?? 1));
      }
      break;
    case ItemActionMethod.Revive:
      if (isPlayerAlive(run.player)) break;
      if (maxRedHp(run.player) > 0)
        run.player.redHp = Math.min(
          maxRedHp(run.player),
          Math.max(1, action.amount ?? run.player.stats.heartSize),
        );
      else addPocketHeart(run, HeartKind.Soul);
      gainPlayerShield(run, combat, action.secondaryAmount ?? 0, true);
      break;
    case ItemActionMethod.ReplayPreviousCard: {
      const previous = combat.previousCardDefinitionId ? CARDS[combat.previousCardDefinitionId] : undefined;
      if (!previous || previous.type === CardType.Skill || previous.itemId === item.id) break;
      const replayScale = Math.max(0, action.amount ?? 1);
      const replayEffects = previous.effects?.map((effect) => ({
        ...effect,
        amount: effect.amount === undefined ? undefined : Math.round(effect.amount * replayScale * 100) / 100,
        turns: effect.turns === undefined ? undefined : Math.max(1, Math.round(effect.turns * replayScale)),
      }));
      if (replayEffects?.length)
        applyCardEffects(run, combat, replayEffects, sourceInstanceId, context.targetId, true);
      if (previous.type === CardType.Shield)
        gainPlayerShield(run, combat, Math.max(1, Math.round((previous.value ?? 5) * replayScale)), true);
      if (previous.type === CardType.Recovery)
        healRed(run.player, Math.max(1, Math.round((previous.value ?? 10) * replayScale)));
      if (previous.type === CardType.Vitality)
        combat.vitality += Math.max(1, Math.round((previous.value ?? 2) * replayScale));
      break;
    }
    case ItemActionMethod.ExecuteWeakestEnemy: {
      const target = combat.enemies
        .filter((enemy) => enemy.hp > 0)
        .sort((left, right) => left.hp - right.hp)[0];
      if (!target) break;
      const threshold = action.amount ?? 12;
      animateEnemyDamage(combat, target, target.hp <= threshold ? target.hp : threshold);
      break;
    }
    case ItemActionMethod.RerollEnemies: {
      const pool = enemyPoolForFloor(run.floorIndex);
      combat.enemies = combat.enemies.map((enemy, index) => {
        if (enemy.boss) return enemy;
        const replacement = makeEnemy(run, pickOne(run, pool), index);
        replacement.position = { ...enemy.position };
        replacement.hp = Math.max(1, Math.round(replacement.maxHp * (enemy.hp / Math.max(1, enemy.maxHp))));
        return replacement;
      });
      ensureCombatGrid(run);
      break;
    }
    case ItemActionMethod.RerollItemCards: {
      const pool = Object.values(CARDS).filter(
        (card) =>
          card.type === CardType.Item &&
          card.itemId &&
          run.unlocks.includes(card.itemId) &&
          itemUsesCombatCard(ITEMS[card.itemId]!),
      );
      rerollItemCardsBy(run, combat, (original) => {
        const candidates = pool.filter((card) => card.itemId !== original.id);
        return candidates.length ? pickOne(run, candidates) : undefined;
      });
      break;
    }
    case ItemActionMethod.SpindownItemCards:
      rerollItemCardsBy(run, combat, (original) => {
        const replacement = Object.values(ITEMS).find(
          (candidate) => candidate.isaacId === (original.isaacId ?? 0) - 1 && itemUsesCombatCard(candidate),
        );
        return replacement ? CARDS[`item:${replacement.id}`] : undefined;
      });
      break;
    case ItemActionMethod.TransformHand:
      rerollHandCards(run, combat, sourceInstanceId, combat.hand.length);
      break;
    case ItemActionMethod.RestartRoom:
      restartCurrentRoom(run);
      break;
    case ItemActionMethod.RestartFloor:
      run.floorMap = createFloorMap(run.floorIndex, `${run.seed}:restart:${run.rngState}`);
      run.floorRedDamage = 0;
      run.floorSecretVisits = [];
      run.floorBombSearches = [];
      run.mapBombResult = undefined;
      run.choice = undefined;
      run.combat = undefined;
      run.roomCheckpoint = undefined;
      run.currentRoomId = undefined;
      run.phase = RunPhase.Map;
      makeFloorStartChoice(run);
      break;
    case ItemActionMethod.RerollPlayerStats: {
      const stats = run.player.stats;
      stats.baseDamage = randomInt(run, 4, 11);
      stats.armor = randomInt(run, 1, 6);
      stats.fireRate = randomInt(run, 75, 175) / 100;
      stats.movementSpeed = randomInt(run, 2, 5);
      stats.attackRange = randomInt(run, 3, 8);
      break;
    }
    case ItemActionMethod.GenerateItemCard: {
      const pool = Object.values(CARDS).filter(
        (card) =>
          card.type === CardType.Item &&
          card.itemId &&
          run.unlocks.includes(card.itemId) &&
          itemUsesCombatCard(ITEMS[card.itemId]!) &&
          card.itemId !== item.id,
      );
      if (!pool.length) break;
      const generated = createCard(run, pickOne(run, pool).id);
      run.player.deck.push(generated);
      combat.discardPile.push(generated.instanceId);
      break;
    }
    case ItemActionMethod.DestroyAllEnemies:
      combat.enemies
        .filter((enemy) => enemy.hp > 0)
        .forEach((enemy) => animateEnemyDamage(combat, enemy, 9999));
      if ((action.secondaryAmount ?? 0) > 0)
        loseDirectHeartHp(run, combat, action.secondaryAmount!, item.name);
      break;
    case ItemActionMethod.SacrificeHeart:
      loseDirectHeartHp(run, combat, action.amount ?? run.player.stats.heartSize, item.name);
      applyCardEffects(run, combat, action.effects ?? [], sourceInstanceId, context.targetId, true);
      break;
    case ItemActionMethod.ConvertShieldToHealth: {
      const shieldCost = Math.max(1, action.amount ?? 10);
      if (combat.playerShield < shieldCost) break;
      combat.playerShield -= shieldCost;
      const healed = healRed(run.player, Math.max(1, action.secondaryAmount ?? 15));
      pushAnimation(combat, {
        kind: CombatAnimationKind.Heal,
        sourceId: 'isaac',
        targetId: 'isaac',
        value: healed,
      });
      break;
    }
    case ItemActionMethod.SpendCoins: {
      const coinCost = Math.max(1, action.amount ?? 1);
      if (run.player.coins < coinCost) break;
      run.player.coins -= coinCost;
      const damage = Math.max(1, action.secondaryAmount ?? 10);
      combat.enemies
        .filter((enemy) => enemy.hp > 0)
        .forEach((enemy) => animateEnemyDamage(combat, enemy, damage));
      break;
    }
    case ItemActionMethod.ConsumeItemCards: {
      const consumed = combat.hand.filter((id) => {
        if (id === context.sourceInstanceId) return false;
        return getCardDefinition(run, id)?.type === CardType.Item;
      });
      const consumedSet = new Set(consumed);
      combat.hand = combat.hand.filter((id) => !consumedSet.has(id));
      run.player.deck = run.player.deck.filter((card) => !consumedSet.has(card.instanceId));
      combat.exhausted.push(...consumed);
      if (consumed.length)
        applyCardEffects(
          run,
          combat,
          [
            {
              opcode: CardEffectOpcode.DamageAll,
              amount: consumed.length * Math.max(3, action.amount ?? 5),
              target: CardTarget.AllEnemies,
            },
            {
              opcode: CardEffectOpcode.GainShield,
              amount: consumed.length * Math.max(2, action.secondaryAmount ?? 3),
              target: CardTarget.Self,
            },
          ],
          sourceInstanceId,
          context.targetId,
          true,
        );
      break;
    }
    case ItemActionMethod.DuplicateResources:
      run.player.coins *= 2;
      run.player.bombs *= 2;
      run.player.keys *= 2;
      break;
    case ItemActionMethod.CrookedPenny:
      if (nextRandom(run) < 0.5) {
        run.player.coins *= 2;
        run.player.bombs *= 2;
        run.player.keys *= 2;
      } else {
        run.player.coins = Math.floor(run.player.coins / 2);
        run.player.bombs = Math.floor(run.player.bombs / 2);
        run.player.keys = Math.floor(run.player.keys / 2);
      }
      break;
    case ItemActionMethod.LockStatFloor:
      combat.statFloorLocked = true;
      break;
    case ItemActionMethod.EnableActiveDoubling:
      combat.activeEffectRepeats = Math.max(combat.activeEffectRepeats, 1);
      break;
    case ItemActionMethod.TriggerPlayerDamaged:
      runItemActions(run, ItemActionTrigger.PlayerDamaged, {
        sourceInstanceId,
        amount: Math.max(0, action.amount ?? 0),
      });
      break;
    case ItemActionMethod.RandomItemEffect: {
      const candidates = Object.values(ITEMS).filter(
        (candidate) => candidate.id !== item.id && candidate.cardEffects?.length,
      );
      if (!candidates.length) break;
      const selected = pickOne(run, candidates);
      applyCardEffects(run, combat, selected.cardEffects!, sourceInstanceId, context.targetId, true);
      break;
    }
    case ItemActionMethod.RevealMap:
      revealMap(run);
      break;
  }
  if (
    action.effects?.length &&
    action.method !== ItemActionMethod.ApplyEffects &&
    action.method !== ItemActionMethod.SacrificeHeart
  ) {
    applyCardEffects(run, combat, action.effects, sourceInstanceId, context.targetId, true);
  }
}

function actionItemsFor(
  run: RunState,
  trigger: ItemActionTrigger,
  sourceItem?: ItemDefinition,
): ItemDefinition[] {
  if (sourceItem) return [sourceItem];
  const combat = run.combat;
  if (!combat) return [];
  return run.player.items
    .map((id) => ITEMS[id])
    .filter((item): item is ItemDefinition =>
      Boolean(item?.actions?.some((action) => action.trigger === trigger)),
    )
    .filter(
      (item) =>
        !itemUsesCombatCard(item) ||
        combat.usedPassiveItems.includes(item.id) ||
        item.timing === ItemUseTiming.Permanent,
    );
}

function runItemActions(run: RunState, trigger: ItemActionTrigger, context: ItemActionContext = {}): void {
  const combat = run.combat;
  if (!combat) return;
  for (const item of actionItemsFor(run, trigger, context.sourceItem)) {
    for (const action of item.actions ?? []) {
      if (action.trigger !== trigger) continue;
      const key = `${item.id}:${action.id}`;
      if (action.oncePerCombat && combat.usedItemActions.includes(key)) continue;
      combat.itemActionCounters[key] = (combat.itemActionCounters[key] ?? 0) + 1;
      if (action.every && combat.itemActionCounters[key] % action.every !== 0) continue;
      if (action.chance !== undefined && nextRandom(run) >= action.chance) continue;
      executeItemActionMethod(run, combat, item, action, context);
      if (action.oncePerCombat) combat.usedItemActions.push(key);
      if (action.consumeItem) removeOwnedItem(run, item);
      pushLog(combat, `${item.name}: ${action.id}.`, CombatLogTone.Special, 'itemAction', {
        itemId: item.id,
        actionId: action.id,
      });
    }
  }
}

function notifyNewEnemyDeaths(run: RunState): void {
  const combat = run.combat;
  if (!combat) return;
  let found = true;
  while (found) {
    const next = combat.enemies.find(
      (enemy) => enemy.hp <= 0 && !combat.observedDefeatIds.includes(enemy.instanceId),
    );
    if (!next) {
      found = false;
      continue;
    }
    combat.observedDefeatIds.push(next.instanceId);
    recordAchievementEvent(run, {
      type: AchievementEventType.EnemyKilled,
      elite: Boolean(next.elite),
    });
    runItemActions(run, ItemActionTrigger.EnemyKilled, { targetId: next.instanceId, amount: 1 });
  }
}

function playSkill(run: RunState, combat: CombatState, instance: CardInstance, targetId?: string): void {
  const activeScale = combat.damoclesActive && !combat.damoclesFallen ? 2 : 1;
  const activeItem = Object.values(ITEMS).find((entry) => entry.skillCardId === instance.definitionId);
  if (activeItem?.actions?.length) {
    for (let repeat = 0; repeat <= combat.activeEffectRepeats; repeat += 1) {
      runItemActions(run, ItemActionTrigger.Activate, {
        sourceItem: activeItem,
        sourceInstanceId: instance.instanceId,
        targetId,
      });
      if (run.combat !== combat) break;
    }
    if (run.combat === combat) combat.cooldowns[instance.instanceId] = skillChargeRounds(run, instance);
    return;
  }
  switch (instance.definitionId) {
    case 'skill-d6': {
      const exchanged = exchangeD6HandItems(run, combat, instance.instanceId);
      pushAnimation(combat, {
        kind: CombatAnimationKind.CardExchange,
        sourceId: 'isaac',
        cardId: instance.definitionId,
        value: exchanged.count,
        secondaryValue: exchanged.fromDraw,
        rawValue: exchanged.fromDiscard,
      });
      pushLog(
        combat,
        `The D6 exchanged ${exchanged.count} Item cards: ${exchanged.fromDraw} from draw, ${exchanged.fromDiscard} from discard.`,
        CombatLogTone.Special,
        'd6Exchange',
        {
          count: exchanged.count,
          draw: exchanged.fromDraw,
          discard: exchanged.fromDiscard,
        },
      );
      break;
    }
    case 'skill-yum-heart': {
      const healed = healRed(run.player, 15 * activeScale);
      pushAnimation(combat, {
        kind: CombatAnimationKind.Heal,
        sourceId: 'isaac',
        targetId: 'isaac',
        value: healed,
      });
      pushLog(combat, `Yum Heart recovered ${healed} HP.`, CombatLogTone.Good, 'heal', {
        sourceCardId: instance.definitionId,
        amount: healed,
      });
      break;
    }
    case 'skill-belial':
      combat.playerDamageBuff += activeScale;
      pushAnimation(combat, {
        kind: CombatAnimationKind.Prepare,
        sourceId: 'isaac',
        targetId: 'isaac',
        value: activeScale,
      });
      pushLog(combat, `Book of Belial granted +${activeScale} room damage.`, CombatLogTone.Special, 'belial');
      break;
    case 'skill-shadows':
      {
        const gained = gainPlayerShield(run, combat, 12 * activeScale, true);
        pushAnimation(combat, {
          kind: CombatAnimationKind.Shield,
          sourceId: 'isaac',
          targetId: 'isaac',
          value: gained,
        });
        pushLog(combat, `Book of Shadows granted ${gained} shield.`, CombatLogTone.Good, 'shield', {
          sourceCardId: instance.definitionId,
          amount: gained,
        });
      }
      break;
    case 'skill-tammy': {
      const damage =
        (run.player.stats.baseDamage + combat.playerDamageBuff) *
        run.player.stats.damageMultiplier *
        combat.playerDamageMultiplier;
      combat.enemies
        .filter((enemy) => enemy.hp > 0)
        .forEach((enemy) => {
          const wasAlive = enemy.hp > 0;
          const dealt = hurtEnemy(enemy, damage * activeScale);
          pushAnimation(combat, {
            kind: CombatAnimationKind.PlayerAttack,
            sourceId: 'isaac',
            targetId: enemy.instanceId,
            value: dealt,
            attackMode: AttackMode.Basic,
          });
          if (wasAlive && enemy.hp <= 0)
            pushAnimation(combat, {
              kind: CombatAnimationKind.Defeat,
              sourceId: enemy.instanceId,
              targetId: enemy.instanceId,
            });
        });
      pushLog(
        combat,
        `Tammy's Head burst for ${Math.round(damage * activeScale)} damage to all enemies.`,
        CombatLogTone.Good,
        'tammy',
        { damage: Math.round(damage * activeScale) },
      );
      break;
    }
    case 'skill-nail':
      addPocketHeart(run, HeartKind.Black, activeScale);
      combat.playerArmorBuff += activeScale;
      pushAnimation(combat, {
        kind: CombatAnimationKind.Shield,
        sourceId: 'isaac',
        targetId: 'isaac',
        value: 1,
      });
      pushLog(
        combat,
        `The Nail granted ${activeScale} black heart and +${activeScale} room armor.`,
        CombatLogTone.Special,
        'nail',
      );
      break;
    case 'skill-hourglass':
      combat.enemies
        .filter((enemy) => enemy.hp > 0)
        .forEach((enemy) => {
          ensureEnemyBehavior(enemy);
          enemy.staggeredTurns = Math.max(activeScale, enemy.staggeredTurns ?? 0);
          pushAnimation(combat, {
            kind: CombatAnimationKind.Curse,
            sourceId: 'isaac',
            targetId: enemy.instanceId,
            value: 1,
          });
        });
      pushLog(combat, 'Time folds. Every enemy loses its next action.', CombatLogTone.Special, 'hourglass');
      break;
    default: {
      const definition = getCardDefinition(run, instance.instanceId);
      if (definition?.effects?.length) {
        applyCardEffects(run, combat, definition.effects, instance.instanceId, targetId);
        pushLog(combat, `${definition.name} activated.`, CombatLogTone.Special, 'activeAdapted', {
          cardId: definition.id,
        });
      } else {
        pushLog(combat, 'The active item fizzled.', CombatLogTone.Normal, 'fizzled');
      }
    }
  }
  if (run.combat === combat) combat.cooldowns[instance.instanceId] = skillChargeRounds(run, instance);
}

function playPassiveItemCard(
  run: RunState,
  combat: CombatState,
  card: CardDefinition,
  instanceId: string,
  targetId?: string,
): void {
  const item = card.itemId ? ITEMS[card.itemId] : undefined;
  if (!item || item.kind !== ItemKind.Passive) return;
  if (!combat.usedPassiveItems.includes(item.id)) combat.usedPassiveItems.push(item.id);
  let shieldGained = 0;
  let healed = 0;
  let cardsToChoose = 0;
  const itemUpgradeScale = getCard(run, instanceId)?.upgraded ? CARD_UPGRADE_EFFECT_MULTIPLIER : 1;
  const damoclesScale = combat.damoclesActive && !combat.damoclesFallen && item.id !== 'damocles' ? 2 : 1;
  const scaledAmount = (amount: number): number =>
    amount * damoclesScale * (amount > 0 ? itemUpgradeScale : 1);
  for (const effect of item.effects ?? []) {
    if (effect.stat === 'baseDamage') combat.playerDamageBuff += scaledAmount(effect.amount ?? 0);
    if (effect.stat === 'armor') combat.playerArmorBuff += scaledAmount(effect.amount ?? 0);
    if (effect.stat === 'fireRate') combat.playerFireRateBuff += scaledAmount(effect.amount ?? 0);
    if (effect.stat === 'damageMultiplier')
      combat.playerDamageMultiplier *= Math.pow(
        effect.multiplier ?? 1,
        damoclesScale * ((effect.multiplier ?? 1) >= 1 ? itemUpgradeScale : 1),
      );
    if (effect.stat === 'critChance') combat.playerCritChanceBuff += scaledAmount(effect.amount ?? 0);
    if (effect.stat === 'attackRange') combat.playerRangeBuff += scaledAmount(effect.amount ?? 0);
    if (effect.stat === 'movementSpeed') combat.playerMovementBuff += scaledAmount(effect.amount ?? 0);
    if (effect.stat === 'drawCount') cardsToChoose += Math.ceil(scaledAmount(effect.amount ?? 1));
    if (effect.stat === 'baseShield') shieldGained += scaledAmount(effect.amount ?? 0);
    if (effect.stat === 'shopDiscount') run.player.coins += Math.round(scaledAmount(2));
    if (effect.attackMode) combat.attackModeOverride = effect.attackMode;
    if (effect.redContainers) healed += healRed(run.player, Math.round(scaledAmount(15)));
    if (effect.soulHearts) shieldGained += scaledAmount(effect.soulHearts * 10);
    if (effect.damageCap !== undefined)
      combat.damageCap = Math.min(combat.damageCap ?? Number.POSITIVE_INFINITY, effect.damageCap);
  }
  if (card.effects?.length) applyCardEffects(run, combat, card.effects, instanceId, targetId, true);
  if (item.actions?.length) {
    runItemActions(run, ItemActionTrigger.Activate, {
      sourceItem: item,
      sourceInstanceId: instanceId,
      targetId,
    });
  }
  if (cardsToChoose > 0) queueDrawSelection(run, combat, instanceId, cardsToChoose);
  if (shieldGained > 0) {
    const gained = gainPlayerShield(run, combat, Math.round(shieldGained), true);
    pushAnimation(combat, {
      kind: CombatAnimationKind.Shield,
      sourceId: 'isaac',
      targetId: 'isaac',
      value: gained,
    });
  }
  if (healed > 0)
    pushAnimation(combat, {
      kind: CombatAnimationKind.Heal,
      sourceId: 'isaac',
      targetId: 'isaac',
      value: healed,
    });
  if (item.effects?.some((effect) => effect.revealAll || effect.revealSecrets)) revealMap(run);
  pushLog(combat, `${item.name} activated from the deck.`, CombatLogTone.Special, 'passiveUsed', {
    itemId: item.id,
  });
}

function allEnemiesDefeated(combat: CombatState): boolean {
  return combat.enemies.every((enemy) => enemy.hp <= 0);
}

export function canPlayFusedAttack(
  run: RunState,
  attackInstanceId: string,
  itemInstanceIds: readonly string[],
  targetId?: string,
): { ok: boolean; reason?: string } {
  if (run.phase !== RunPhase.Combat || !run.combat) return { ok: false, reason: 'Not in combat' };
  if (run.combat.pendingSelection) return { ok: false, reason: 'Finish the current card selection first' };
  if ((run.combat.playerStatuses[StatusKind.Silence] ?? 0) > 0)
    return { ok: false, reason: 'Silence prevents attacks' };
  if (itemInstanceIds.length && (run.combat.playerStatuses[StatusKind.ItemLock] ?? 0) > 0)
    return { ok: false, reason: 'Item Lock disables fusion item cards' };
  if (!run.combat.hand.includes(attackInstanceId)) return { ok: false, reason: 'Card is not in hand' };
  const attack = getCardDefinition(run, attackInstanceId);
  if (!attack || attack.type !== CardType.Attack) return { ok: false, reason: 'Choose an attack card' };
  if (new Set(itemInstanceIds).size !== itemInstanceIds.length)
    return { ok: false, reason: 'The same item card cannot be fused twice' };
  for (const instanceId of itemInstanceIds) {
    if (instanceId === attackInstanceId || !run.combat.hand.includes(instanceId))
      return { ok: false, reason: 'Fusion card is not in hand' };
    const card = getCardDefinition(run, instanceId);
    const item = card?.type === CardType.Item && card.itemId ? ITEMS[card.itemId] : undefined;
    if (!item?.fusion) return { ok: false, reason: 'That item card cannot enhance an attack' };
  }
  const preview = getAttackFusionPreview(run, attackInstanceId, itemInstanceIds)!;
  if (run.combat.unlimitedVitalityTurns <= 0 && run.combat.vitality < preview.totalCost)
    return { ok: false, reason: 'Not enough vitality for this fusion' };
  const inRange = (enemy: EnemyState) =>
    enemy.hp > 0 &&
    getEnemyOccupiedCells(enemy).some((cell) =>
      isPositionInPlayerAttackRangeWithFusion(run, cell, preview.curvedShots),
    );
  if (targetId === undefined) {
    if (!run.combat.enemies.some(inRange)) return { ok: false, reason: 'Target is outside attack range' };
  } else {
    const target = selectedTarget(run.combat, targetId);
    if (!target) return { ok: false, reason: 'Choose an enemy target' };
    if (!inRange(target)) return { ok: false, reason: 'Target is outside attack range' };
  }
  return { ok: true };
}

export function canPlayCard(
  run: RunState,
  instanceId: string,
  targetId?: string,
): { ok: boolean; reason?: string } {
  if (run.phase !== RunPhase.Combat || !run.combat) return { ok: false, reason: 'Not in combat' };
  if (!run.combat.hand.includes(instanceId)) return { ok: false, reason: 'Card is not in hand' };
  const instance = getCard(run, instanceId);
  const card = instance ? getCardDefinition(run, instanceId) : undefined;
  if (!instance || !card) return { ok: false, reason: 'Unknown card' };
  if (card.type === CardType.Curse) return { ok: false, reason: 'Curse cards are unplayable' };
  if (run.combat.pendingSelection) return { ok: false, reason: 'Finish the current card selection first' };
  if (card.type === CardType.Blank && !run.combat.blankBookActive)
    return { ok: false, reason: 'Blank cards have no effect' };
  if (card.type === CardType.Attack && (run.combat.playerStatuses[StatusKind.Silence] ?? 0) > 0)
    return { ok: false, reason: 'Silence prevents attacks' };
  if (
    [CardType.Item, CardType.Skill].includes(card.type) &&
    (run.combat.playerStatuses[StatusKind.ItemLock] ?? 0) > 0
  )
    return { ok: false, reason: 'Item Lock disables item cards' };
  if (card.type === CardType.Shield && run.combat.playerShield >= getPlayerShieldCapacity(run))
    return { ok: false, reason: 'Shield is already at maximum' };
  if (card.type === CardType.Recovery && run.player.redHp >= maxRedHp(run.player))
    return { ok: false, reason: 'Red-heart HP is already full' };
  if (run.combat.unlimitedVitalityTurns <= 0 && run.combat.vitality < card.cost)
    return { ok: false, reason: 'Not enough vitality' };
  if (card.type === CardType.Skill && (run.combat.cooldowns[instanceId] ?? 0) > 0)
    return { ok: false, reason: 'Active item is recharging' };
  if (card.id === 'skill-d6') {
    const availability = d6ExchangeAvailability(run, run.combat, instanceId);
    if (availability.handItems <= 0)
      return { ok: false, reason: 'The D6 has no Item card in hand to exchange' };
    if (availability.pileCards <= 0)
      return { ok: false, reason: 'The D6 has no draw or discard pile card to exchange' };
  }
  if (card.itemId) {
    const item = ITEMS[card.itemId];
    if (item?.timing === ItemUseTiming.CombatOnce && run.combat.usedPassiveItems.includes(item.id)) {
      return { ok: false, reason: 'This item has already been used in this combat' };
    }
  }
  if (card.target === CardTarget.Enemy || card.target === CardTarget.AllEnemies) {
    if (card.target === CardTarget.AllEnemies) {
      const hasTargetInRange = run.combat.enemies.some(
        (enemy) => enemy.hp > 0 && isEnemyInPlayerRange(run, enemy.instanceId),
      );
      if (!hasTargetInRange) return { ok: false, reason: 'Target is outside attack range' };
    } else if (targetId === undefined) {
      const hasTargetInRange = run.combat.enemies.some(
        (enemy) => enemy.hp > 0 && isEnemyInPlayerRange(run, enemy.instanceId),
      );
      if (!hasTargetInRange) return { ok: false, reason: 'Target is outside attack range' };
    } else {
      const target = selectedTarget(run.combat, targetId);
      if (!target) return { ok: false, reason: 'Choose an enemy target' };
      if (!isEnemyInPlayerRange(run, target.instanceId))
        return { ok: false, reason: 'Target is outside attack range' };
    }
  }
  return { ok: true };
}

export function playFusedAttack(
  state: RunState,
  attackInstanceId: string,
  itemInstanceIds: readonly string[],
  targetId?: string,
): RunState {
  const playable = canPlayFusedAttack(state, attackInstanceId, itemInstanceIds, targetId);
  if (!playable.ok) throw new Error(playable.reason);
  const pendingAttack = getCardDefinition(state, attackInstanceId)!;
  if (pendingAttack.target === CardTarget.Enemy && targetId === undefined)
    throw new Error('Choose an enemy target');

  const run = clone(state);
  const combat = run.combat!;
  const attackInstance = getCard(run, attackInstanceId)!;
  const attack = CARDS[attackInstance.definitionId]!;
  const preview = getAttackFusionPreview(run, attackInstanceId, itemInstanceIds)!;
  if (targetId) combat.selectedEnemyId = targetId;
  if (combat.unlimitedVitalityTurns <= 0) combat.vitality -= preview.totalCost;
  pushAnimation(combat, {
    kind: CombatAnimationKind.CardPlay,
    sourceId: 'isaac',
    cardId: attack.id,
    value: attack.cost,
  });
  for (const itemInstanceId of itemInstanceIds) {
    const itemCard = getCardDefinition(run, itemInstanceId)!;
    pushAnimation(combat, {
      kind: CombatAnimationKind.CardPlay,
      sourceId: 'isaac',
      cardId: itemCard.id,
      value: 0,
    });
  }
  playAttack(run, combat, attack, attackInstance, targetId, preview, itemInstanceIds.length);
  recordAchievementEvent(run, { type: AchievementEventType.CardPlayed });
  for (const _itemInstanceId of itemInstanceIds) {
    recordAchievementEvent(run, { type: AchievementEventType.CardPlayed });
  }
  runItemActions(run, ItemActionTrigger.CardPlayed, {
    sourceInstanceId: attackInstanceId,
    targetId,
  });
  combat.previousCardDefinitionId = attack.id;
  notifyNewEnemyDeaths(run);

  for (const instanceId of [attackInstanceId, ...itemInstanceIds]) {
    const card = getCardDefinition(run, instanceId)!;
    combat.hand = combat.hand.filter((id) => id !== instanceId);
    if (card.exhaust) {
      combat.exhausted.push(instanceId);
      run.player.deck = run.player.deck.filter((entry) => entry.instanceId !== instanceId);
    } else {
      combat.discardPile.push(instanceId);
    }
  }
  if (allEnemiesDefeated(combat) && !combat.pendingSelection) finishCombat(run);
  return touch(run);
}

export function selectEnemy(state: RunState, enemyId: string): RunState {
  const run = clone(state);
  if (run.combat?.enemies.some((enemy) => enemy.instanceId === enemyId && enemy.hp > 0)) {
    run.combat.selectedEnemyId = enemyId;
  }
  return touch(run);
}

export function placePlayerForDeployment(state: RunState, x: number, y: number): RunState {
  const run = clone(state);
  if (run.phase !== RunPhase.Combat || !run.combat?.deploymentPending)
    throw new Error('Player deployment is not active');
  const destination = { x, y };
  if (!getPlayerDeploymentCells(run).some((position) => position.x === x && position.y === y)) {
    throw new Error('That grid cell is outside the deployment zone');
  }
  const from = { ...run.combat.playerPosition };
  run.combat.playerPosition = destination;
  run.combat.selectedEnemyId = undefined;
  pushAnimation(run.combat, {
    kind: CombatAnimationKind.Move,
    sourceId: 'isaac',
    targetId: 'isaac',
    fromX: from.x,
    fromY: from.y,
    toX: x,
    toY: y,
  });
  return touch(run);
}

export function confirmPlayerDeployment(state: RunState): RunState {
  const run = clone(state);
  if (run.phase !== RunPhase.Combat || !run.combat?.deploymentPending)
    throw new Error('Player deployment is not active');
  run.combat.deploymentPending = false;
  run.combat.enemies
    .filter((enemy) => enemy.hp > 0 && enemy.boss)
    .forEach((enemy) => {
      enemy.intent = rollIntent(run, enemy);
    });
  pushAnimation(run.combat, {
    kind: CombatAnimationKind.RoundStart,
    sourceId: 'isaac',
    value: run.combat.round,
  });
  run.combat.familiars.forEach((familiar) => {
    pushAnimation(run.combat!, {
      kind: CombatAnimationKind.FamiliarSpawn,
      sourceId: familiar.instanceId,
      targetId: familiar.instanceId,
    });
  });
  pushLog(
    run.combat,
    `Isaac deployed at (${run.combat.playerPosition.x}, ${run.combat.playerPosition.y}).`,
    CombatLogTone.Special,
    'deploymentConfirmed',
    {
      x: run.combat.playerPosition.x,
      y: run.combat.playerPosition.y,
    },
  );
  runFamiliarAttacks(run);
  if (allEnemiesDefeated(run.combat)) finishCombat(run);
  return touch(run);
}

export function movePlayer(state: RunState, x: number, y: number): RunState {
  const run = clone(state);
  if (run.phase !== RunPhase.Combat || !run.combat) throw new Error('Not in combat');
  ensureCombatGrid(run);
  const destination = { x, y };
  if (!getReachablePlayerCells(run).some((position) => position.x === x && position.y === y)) {
    throw new Error('That grid cell is outside movement range');
  }
  const from = { ...run.combat.playerPosition };
  run.combat.playerPosition = destination;
  if (run.combat.unlimitedVitalityTurns <= 0) run.combat.vitality -= 1;
  pushAnimation(run.combat, {
    kind: CombatAnimationKind.Move,
    sourceId: 'isaac',
    targetId: 'isaac',
    fromX: from.x,
    fromY: from.y,
    toX: x,
    toY: y,
  });
  pushLog(
    run.combat,
    `Isaac moved from (${from.x}, ${from.y}) to (${x}, ${y}).`,
    CombatLogTone.Normal,
    'playerMoved',
    {
      fromX: from.x,
      fromY: from.y,
      x,
      y,
    },
  );
  runItemActions(run, ItemActionTrigger.PlayerMoved, { amount: gridDistance(from, destination) });
  return touch(run);
}

export function useCombatBomb(state: RunState, x: number, y: number): RunState {
  const run = clone(state);
  if (run.phase !== RunPhase.Combat || !run.combat) throw new Error('Not in combat');
  if (run.combat.deploymentPending) throw new Error('Confirm deployment before using a bomb');
  if (run.player.bombs < 1) throw new Error('No bombs available');
  const center = { x, y };
  if (!isCombatCellAvailable(run.combat, center)) throw new Error('That grid cell cannot hold a bomb');
  run.player.bombs -= 1;
  recordAchievementEvent(run, { type: AchievementEventType.BombUsed });
  run.combat.selectedEnemyId = undefined;
  const blastDamageByCell = new Map<string, number>();
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const cell = { x: x + offsetX, y: y + offsetY };
      if (!isCombatCellAvailable(run.combat, cell)) continue;
      const damage = offsetX === 0 && offsetY === 0 ? 30 : offsetX === 0 || offsetY === 0 ? 20 : 15;
      blastDamageByCell.set(positionKey(cell), damage);
    }
  }
  pushAnimation(run.combat, {
    kind: CombatAnimationKind.BombBlast,
    sourceId: 'isaac',
    toX: x,
    toY: y,
    value: 30,
  });
  let totalDamage = 0;
  let hitEnemies = 0;
  for (const enemy of run.combat.enemies.filter((entry) => entry.hp > 0)) {
    const coveredCells = getEnemyOccupiedCells(enemy).filter((cell) =>
      blastDamageByCell.has(positionKey(cell)),
    );
    if (!coveredCells.length) continue;
    hitEnemies += 1;
    const wasAlive = enemy.hp > 0;
    const hpBefore = enemy.hp;
    const shieldBefore = enemy.shield;
    let afterArmorTotal = 0;
    for (const cell of coveredCells) {
      afterArmorTotal += hurtEnemy(enemy, blastDamageByCell.get(positionKey(cell))!);
    }
    const hpDamage = hpBefore - enemy.hp;
    const shieldDamage = shieldBefore - enemy.shield;
    const durabilityDamage = hpDamage + shieldDamage;
    const rawDamage = coveredCells.reduce((sum, cell) => sum + blastDamageByCell.get(positionKey(cell))!, 0);
    totalDamage += durabilityDamage;
    pushAnimation(run.combat, {
      kind: CombatAnimationKind.BombHit,
      sourceId: 'isaac',
      targetId: enemy.instanceId,
      value: hpDamage,
      secondaryValue: shieldDamage,
      rawValue: rawDamage,
      armorValue: Math.max(0, rawDamage - afterArmorTotal),
      hitCount: coveredCells.length,
    });
    if (wasAlive && enemy.hp <= 0) {
      pushAnimation(run.combat, {
        kind: CombatAnimationKind.Defeat,
        sourceId: enemy.instanceId,
        targetId: enemy.instanceId,
      });
    }
  }
  pushLog(
    run.combat,
    `Bomb hit ${hitEnemies} enemies for ${totalDamage} damage at (${x}, ${y}).`,
    CombatLogTone.Special,
    'bombBlast',
    {
      enemies: hitEnemies,
      damage: totalDamage,
      x,
      y,
    },
  );
  notifyNewEnemyDeaths(run);
  if (allEnemiesDefeated(run.combat)) finishCombat(run);
  return touch(run);
}

function restartCurrentRoom(run: RunState): void {
  const checkpoint = run.roomCheckpoint;
  if (!checkpoint) throw new Error('This room has no restart checkpoint');
  run.rngState = checkpoint.rngState;
  run.player = clone(checkpoint.player);
  run.floorRedDamage = checkpoint.floorRedDamage;
  run.combat = clone(checkpoint.combat);
  run.combat.usedPassiveItems.push('regret-medicine');
  run.combat.deploymentPending = true;
  run.phase = RunPhase.Combat;
  pushLog(
    run.combat,
    'Regret Medicine rewound the room. It cannot be used again in this combat.',
    CombatLogTone.Special,
    'roomRestarted',
  );
}

export function playCard(state: RunState, instanceId: string, targetId?: string): RunState {
  if (getCardDefinition(state, instanceId)?.type === CardType.Attack) {
    return playFusedAttack(state, instanceId, [], targetId);
  }
  const playable = canPlayCard(state, instanceId, targetId);
  if (!playable.ok) throw new Error(playable.reason);
  const pendingInstance = getCard(state, instanceId);
  const pendingCard = pendingInstance ? getCardDefinition(state, instanceId) : undefined;
  if (pendingCard?.target === CardTarget.Enemy && targetId === undefined) {
    throw new Error('Choose an enemy target');
  }
  const run = clone(state);
  const combat = run.combat!;
  const instance = getCard(run, instanceId)!;
  const card = getCardDefinition(run, instanceId)!;
  if (card.type === CardType.Blank) {
    const candidates = [...combat.drawPile, ...combat.discardPile].filter(
      (id) => getCardDefinition(run, id)?.type !== CardType.Blank,
    );
    if (!candidates.length) throw new Error('There is no card for Blank to imitate');
    combat.pendingSelection = {
      kind: CombatSelectionKind.BlankImitation,
      sourceInstanceId: instanceId,
      candidateInstanceIds: candidates,
      min: 1,
      max: 1,
    };
    return touch(run);
  }
  if (card.effects?.some((effect) => effect.opcode === CardEffectOpcode.RestartRoom)) {
    restartCurrentRoom(run);
    return touch(run);
  }
  if (targetId) combat.selectedEnemyId = targetId;
  if (combat.unlimitedVitalityTurns <= 0) combat.vitality -= card.cost;
  pushAnimation(combat, {
    kind: CombatAnimationKind.CardPlay,
    sourceId: 'isaac',
    cardId: card.id,
    value: card.cost,
  });

  if (card.type === CardType.Shield) {
    const amount = (card.value ?? 5) + (instance.upgraded ? 3 : 0);
    const gained = gainPlayerShield(run, combat, amount);
    pushAnimation(combat, {
      kind: CombatAnimationKind.Shield,
      sourceId: 'isaac',
      targetId: 'isaac',
      value: gained,
    });
    pushLog(combat, `${card.name} granted ${gained} shield.`, CombatLogTone.Good, 'shield', {
      sourceCardId: card.id,
      amount: gained,
    });
  }
  if (card.type === CardType.Recovery) {
    const amount = (card.value ?? TREATMENT_BASE_HEAL) + (instance.upgraded ? TREATMENT_UPGRADE_HEAL : 0);
    const healed = healRed(run.player, amount);
    pushAnimation(combat, {
      kind: CombatAnimationKind.Heal,
      sourceId: 'isaac',
      targetId: 'isaac',
      value: healed,
    });
    pushLog(combat, `${card.name} recovered ${healed} HP.`, CombatLogTone.Good, 'heal', {
      sourceCardId: card.id,
      amount: healed,
    });
  }
  if (card.type === CardType.Vitality) {
    const amount = (card.value ?? 2) + (instance.upgraded ? 1 : 0);
    combat.vitality += amount;
    pushLog(combat, `${card.name} granted ${amount} vitality this turn.`, CombatLogTone.Good, 'vitality', {
      sourceCardId: card.id,
      amount,
    });
  }
  if (card.type === CardType.Hex) {
    const target = selectedTarget(combat, targetId);
    if (target && !card.effects?.length) {
      target.cursedTurns += (card.value ?? 1) + (instance.upgraded ? 1 : 0);
      pushAnimation(combat, {
        kind: CombatAnimationKind.Curse,
        sourceId: 'isaac',
        targetId: target.instanceId,
        value: target.cursedTurns,
      });
      pushLog(combat, `${target.name} was cursed.`, CombatLogTone.Special, 'cursed', {
        enemyId: target.id,
        enemy: target.name,
      });
    }
    if (card.effects?.length) applyCardEffects(run, combat, card.effects, instanceId, targetId);
  }
  if (card.type === CardType.Tarot) {
    const tarotUpgradeScale = instance.upgraded ? CARD_UPGRADE_EFFECT_MULTIPLIER : 1;
    if (card.id === 'the-empress') combat.playerDamageBuff += (card.value ?? 3) * tarotUpgradeScale;
    if (card.id === 'death' || card.id === 'the-sun') {
      combat.enemies
        .filter((enemy) => enemy.hp > 0)
        .forEach((enemy) => {
          const wasAlive = enemy.hp > 0;
          const dealt = hurtEnemy(enemy, (card.value ?? 25) * tarotUpgradeScale, 99);
          pushAnimation(combat, {
            kind: CombatAnimationKind.PlayerAttack,
            sourceId: 'isaac',
            targetId: enemy.instanceId,
            value: dealt,
            attackMode: card.id === 'death' ? AttackMode.Knife : AttackMode.Brimstone,
          });
          if (wasAlive && enemy.hp <= 0)
            pushAnimation(combat, {
              kind: CombatAnimationKind.Defeat,
              sourceId: enemy.instanceId,
              targetId: enemy.instanceId,
            });
        });
      if (card.id === 'the-sun') {
        const healed = healRed(run.player, Math.round(TREATMENT_BASE_HEAL * tarotUpgradeScale));
        pushAnimation(combat, {
          kind: CombatAnimationKind.Heal,
          sourceId: 'isaac',
          targetId: 'isaac',
          value: healed,
        });
      }
      pushLog(combat, `${card.name} consumed in a burst of power.`, CombatLogTone.Special, 'tarot', {
        cardId: card.id,
      });
    }
  }
  if (card.type === CardType.Skill) playSkill(run, combat, instance, targetId);
  if (card.type === CardType.Item) playPassiveItemCard(run, combat, card, instanceId, targetId);
  recordAchievementEvent(run, { type: AchievementEventType.CardPlayed });

  if (run.combat === combat) {
    runItemActions(run, ItemActionTrigger.CardPlayed, {
      sourceInstanceId: instanceId,
      targetId,
    });
    combat.previousCardDefinitionId = card.id;
    notifyNewEnemyDeaths(run);
  }

  if (card.type !== CardType.Skill) {
    combat.hand = combat.hand.filter((id) => id !== instanceId);
    if (card.exhaust) {
      combat.exhausted.push(instanceId);
      run.player.deck = run.player.deck.filter((entry) => entry.instanceId !== instanceId);
    } else {
      combat.discardPile.push(instanceId);
    }
    delete combat.cardDefinitionOverrides[instanceId];
  }
  if (allEnemiesDefeated(combat) && !combat.pendingSelection) finishCombat(run);
  return touch(run);
}

export function resolveCombatSelection(state: RunState, selectedInstanceIds: readonly string[]): RunState {
  const run = clone(state);
  const combat = run.combat;
  const pending = combat?.pendingSelection;
  if (!combat || !pending) throw new Error('There is no combat card selection to resolve');
  const selected = [...new Set(selectedInstanceIds)];
  if (selected.length < pending.min || selected.length > pending.max) {
    throw new Error(`Select between ${pending.min} and ${pending.max} cards`);
  }
  if (selected.some((id) => !pending.candidateInstanceIds.includes(id))) {
    throw new Error('A selected card is not available');
  }

  if (pending.kind === CombatSelectionKind.Draw) {
    for (const selectedId of selected) {
      const drawIndex = combat.drawPile.indexOf(selectedId);
      if (drawIndex < 0) throw new Error('A selected draw card is no longer available');
      combat.drawPile.splice(drawIndex, 1);
      combat.hand.push(selectedId);
    }
    const remainingEffects = pending.remainingEffects ?? [];
    const continuationTargetId = pending.targetId;
    combat.pendingSelection = undefined;
    pushLog(
      combat,
      `Chose ${selected.length} card${selected.length === 1 ? '' : 's'} from the draw pile.`,
      CombatLogTone.Special,
      'chosenDraw',
      { count: selected.length },
    );
    if (remainingEffects.length) {
      applyCardEffects(
        run,
        combat,
        remainingEffects,
        pending.sourceInstanceId,
        continuationTargetId,
        false,
        selected.length,
      );
    }
    notifyNewEnemyDeaths(run);
    if (allEnemiesDefeated(combat) && !combat.pendingSelection) finishCombat(run);
    return touch(run);
  }

  if (pending.kind === CombatSelectionKind.Cycle) {
    const targetHandSize = combat.hand.length;
    for (const selectedId of selected) {
      if (!combat.hand.includes(selectedId)) throw new Error('A selected cycle card is no longer in hand');
      combat.hand = combat.hand.filter((id) => id !== selectedId);
      combat.discardPile.push(selectedId);
    }
    drawToHand(run, combat, targetHandSize);
    const remainingEffects = pending.remainingEffects ?? [];
    const continuationTargetId = pending.targetId;
    combat.pendingSelection = undefined;
    pushLog(
      combat,
      `Cycled ${selected.length} selected hand card${selected.length === 1 ? '' : 's'}.`,
      CombatLogTone.Special,
      'chosenCycle',
      { count: selected.length },
    );
    if (remainingEffects.length) {
      applyCardEffects(run, combat, remainingEffects, pending.sourceInstanceId, continuationTargetId);
    }
    notifyNewEnemyDeaths(run);
    if (allEnemiesDefeated(combat) && !combat.pendingSelection) finishCombat(run);
    return touch(run);
  }

  if (pending.kind === CombatSelectionKind.BlankImitation) {
    const source = selected[0];
    const definition = source ? getCardDefinition(run, source) : undefined;
    if (!definition) throw new Error('Choose one card for Blank to imitate');
    combat.cardDefinitionOverrides[pending.sourceInstanceId] = definition.id;
    combat.pendingSelection = undefined;
    pushLog(combat, `Blank copied ${definition.name}.`, CombatLogTone.Special, 'blankCopied', {
      cardId: definition.id,
    });
    return touch(run);
  }

  const itemCardPool = Object.values(CARDS).filter(
    (card) =>
      card.type === CardType.Item &&
      Boolean(card.itemId && run.unlocks.includes(card.itemId)) &&
      itemUsesCombatCard(ITEMS[card.itemId!]!) &&
      ITEMS[card.itemId!]?.timing !== ItemUseTiming.CombatOnce,
  );
  for (const selectedId of selected) {
    const original = getCardDefinition(run, selectedId);
    const drawIndex = combat.drawPile.indexOf(selectedId);
    if (!original || drawIndex < 0) continue;
    const replacements = itemCardPool.filter((card) => card.id !== original.id);
    if (!replacements.length) continue;
    const replacement = createCard(run, pickOne(run, replacements).id);
    run.player.deck.push(replacement);
    combat.temporaryCardIds.push(replacement.instanceId);
    combat.drawPile.splice(drawIndex, 1, replacement.instanceId);
    combat.discardPile.push(selectedId);
  }
  combat.pendingSelection = undefined;
  pushLog(
    combat,
    `Transposition replaced ${selected.length} draw-pile item cards.`,
    CombatLogTone.Special,
    'transposed',
    {
      count: selected.length,
    },
  );
  return touch(run);
}

export function cancelCombatSelection(state: RunState): RunState {
  if (!state.combat?.pendingSelection) return clone(state);
  if (state.combat.pendingSelection.min > 0) throw new Error('This selection requires a card');
  return resolveCombatSelection(state, []);
}

export function endTurn(state: RunState): RunState {
  const run = clone(state);
  if (run.phase !== RunPhase.Combat || !run.combat) throw new Error('Not in combat');
  if (run.combat.pendingSelection) throw new Error('Finish the current card selection first');
  run.phase = RunPhase.Discard;
  pushAnimation(run.combat, {
    kind: CombatAnimationKind.DiscardPhase,
    sourceId: 'isaac',
    value: run.player.stats.maxRetain,
  });
  pushLog(
    run.combat,
    `Choose any cards to discard, then retain no more than ${run.player.stats.maxRetain}.`,
    CombatLogTone.Normal,
    'discard',
    { count: run.player.stats.maxRetain },
  );
  return touch(run);
}

export function discardCard(state: RunState, instanceId: string): RunState {
  const run = clone(state);
  if (run.phase !== RunPhase.Discard || !run.combat) throw new Error('Not choosing discards');
  const instance = getCard(run, instanceId);
  if (!instance) throw new Error('Unknown card');
  if (!run.combat.hand.includes(instanceId)) throw new Error('Card is not in hand');
  run.combat.hand = run.combat.hand.filter((id) => id !== instanceId);
  run.combat.discardPile.push(instanceId);
  pushAnimation(run.combat, {
    kind: CombatAnimationKind.CardDiscard,
    sourceId: 'isaac',
    cardId: instance.definitionId,
  });
  return touch(run);
}

export function finishDiscard(state: RunState): RunState {
  const run = clone(state);
  if (run.phase !== RunPhase.Discard || !run.combat) throw new Error('Not choosing discards');
  if (!run.combat.ragnarokActive && run.combat.hand.length > run.player.stats.maxRetain)
    throw new Error(`Retain no more than ${run.player.stats.maxRetain} cards`);
  pushAnimation(run.combat, {
    kind: CombatAnimationKind.EnemyPhase,
    sourceId: 'isaac',
    value: run.combat.round,
  });
  resolveEnemyTurn(run);
  return touch(run);
}

function addCurseCard(run: RunState, combat: CombatState): void {
  const curse = createCard(run, 'dead-weight');
  run.player.deck.push(curse);
  combat.discardPile.push(curse.instanceId);
  pushLog(combat, 'A Dead Weight curse was added to your deck.', CombatLogTone.Danger, 'deadWeight');
}

function loseDirectHeartHp(run: RunState, combat: CombatState, amount: number, reason: string): number {
  let remaining = Math.max(0, Math.round(amount));
  const initial = remaining;
  while (remaining > 0 && run.player.pocketHearts.length) {
    const heart = run.player.pocketHearts.at(-1)!;
    const applied = Math.min(heart.hp, remaining);
    heart.hp -= applied;
    remaining -= applied;
    if (heart.hp <= 0) {
      run.player.pocketHearts.pop();
      if (heart.kind === HeartKind.Black) blackHeartBurst(combat);
    }
  }
  const redDamage = Math.min(run.player.redHp, remaining);
  run.player.redHp -= redDamage;
  remaining -= redDamage;
  run.floorRedDamage += redDamage;
  const dealt = initial - remaining;
  combat.damageTakenThisFloor += dealt;
  const health = getPlayerHealth(run.player);
  pushAnimation(combat, {
    kind: CombatAnimationKind.EnemyAttack,
    sourceId: reason,
    targetId: 'isaac',
    value: dealt,
    secondaryValue: 0,
    rawValue: initial,
    armorValue: 0,
  });
  pushLog(combat, `${reason} removed ${dealt} HP directly.`, CombatLogTone.Danger, 'directHeartDamage', {
    reason,
    damage: dealt,
    remainingHp: health.current,
    maximumHp: health.maximum,
  });
  if (dealt > 0) runItemActions(run, ItemActionTrigger.PlayerDamaged, { amount: dealt });
  if (!isPlayerAlive(run.player)) runItemActions(run, ItemActionTrigger.FatalDamage, { amount: dealt });
  return dealt;
}

function applyRandomPlayerCurse(run: RunState, combat: CombatState, enemy: EnemyState): void {
  const outcomes = [
    StatusKind.Silence,
    StatusKind.Poison,
    StatusKind.Blind,
    StatusKind.ArmorBreak,
    StatusKind.Weak,
    StatusKind.ItemLock,
    'bloat',
  ] as const;
  const outcome = pickOne(run, outcomes);
  if (outcome === 'bloat') {
    const count = enemy.elite || enemy.boss ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      const blank = createCard(run, 'blank');
      run.player.deck.push(blank);
      combat.discardPile.push(blank.instanceId);
    }
    pushLog(
      combat,
      `${enemy.name} bloated the deck with ${count} Blank card.`,
      CombatLogTone.Danger,
      'bloat',
      {
        enemyId: enemy.id,
        enemy: enemy.name,
        count,
      },
    );
    return;
  }
  const turns = enemy.boss ? 3 : 2;
  combat.playerStatuses[outcome] = Math.max(combat.playerStatuses[outcome] ?? 0, turns);
  if (outcome === StatusKind.Poison) combat.playerStatusPower[outcome] = Math.max(4, enemy.attack / 3);
  if (outcome === StatusKind.Blind) combat.hand = shuffle(run, combat.hand);
  pushLog(
    combat,
    `${enemy.name} applied ${outcome} for ${turns} turns.`,
    CombatLogTone.Danger,
    'playerStatus',
    {
      enemyId: enemy.id,
      enemy: enemy.name,
      status: outcome,
      turns,
    },
  );
}

function blackHeartBurst(combat: CombatState): void {
  pushAnimation(combat, {
    kind: CombatAnimationKind.BlackHeart,
    sourceId: 'isaac',
    targetId: 'isaac',
    value: 100,
  });
  for (const enemy of combat.enemies.filter((entry) => entry.hp > 0)) {
    const wasAlive = enemy.hp > 0;
    if (enemy.elite || enemy.boss) enemy.hp = Math.max(0, enemy.hp - 100);
    else enemy.hp = 0;
    if (wasAlive && enemy.hp <= 0)
      pushAnimation(combat, {
        kind: CombatAnimationKind.Defeat,
        sourceId: enemy.instanceId,
        targetId: enemy.instanceId,
      });
  }
  pushLog(
    combat,
    'A black heart shattered: normal enemies died and champions took 100 damage!',
    CombatLogTone.Special,
    'blackBurst',
  );
}

function hurtPlayer(
  run: RunState,
  combat: CombatState,
  raw: number,
  source?: EnemyState,
  enemyAction?: EnemyAction,
): number {
  if (nextRandom(run) < run.player.stats.dodgeChance + combat.playerDodgeChanceBuff) {
    if (source)
      pushAnimation(combat, {
        kind: CombatAnimationKind.EnemyAttack,
        sourceId: source.instanceId,
        targetId: 'isaac',
        value: 0,
        secondaryValue: 0,
        bossPattern: enemyAction?.pattern,
        toX: enemyAction?.targetX,
        toY: enemyAction?.targetY,
      });
    pushLog(combat, 'Isaac slipped past the attack.', CombatLogTone.Good, 'dodge');
    return 0;
  }
  const cap = combat.damageCap;
  const capped = cap === undefined ? raw : Math.min(raw, cap);
  const rounded = Math.round(capped);
  const totalArmor =
    (combat.playerStatuses[StatusKind.ArmorBreak] ?? 0) > 0
      ? 0
      : run.player.stats.armor + combat.playerArmorBuff;
  const armorBlocked = Math.min(rounded, totalArmor);
  let damage = Math.max(0, rounded - totalArmor);
  const initial = damage;
  const shielded = Math.min(combat.playerShield, damage);
  combat.playerShield -= shielded;
  damage -= shielded;

  while (damage > 0 && run.player.pocketHearts.length) {
    const heart = run.player.pocketHearts.at(-1)!;
    const applied = Math.min(heart.hp, damage);
    heart.hp -= applied;
    damage -= applied;
    if (heart.hp <= 0) {
      run.player.pocketHearts.pop();
      if (heart.kind === HeartKind.Black) blackHeartBurst(combat);
    }
  }
  const redDamage = Math.min(run.player.redHp, damage);
  run.player.redHp -= redDamage;
  run.floorRedDamage += redDamage;
  combat.damageTakenThisFloor += Math.max(0, initial - shielded);
  const heartDamage = Math.max(0, initial - shielded);
  const health = getPlayerHealth(run.player);
  if (source) {
    pushAnimation(combat, {
      kind: CombatAnimationKind.EnemyAttack,
      sourceId: source.instanceId,
      targetId: 'isaac',
      value: heartDamage,
      secondaryValue: shielded,
      rawValue: rounded,
      armorValue: armorBlocked,
      bossPattern: enemyAction?.pattern,
      toX: enemyAction?.targetX,
      toY: enemyAction?.targetY,
    });
    pushLog(
      combat,
      `${source.name} attacked Isaac for ${heartDamage} heart damage (${shielded} blocked by shield).`,
      CombatLogTone.Danger,
      'enemyAttack',
      {
        enemyId: source.id,
        enemy: source.name,
        damage: heartDamage,
        shield: shielded,
        remainingHp: health.current,
        maximumHp: health.maximum,
      },
    );
  } else {
    pushLog(
      combat,
      `Isaac took ${heartDamage} heart damage (${shielded} blocked by shield).`,
      CombatLogTone.Danger,
      'playerHit',
      {
        damage: heartDamage,
        shield: shielded,
        remainingHp: health.current,
        maximumHp: health.maximum,
      },
    );
  }
  if (heartDamage > 0) runItemActions(run, ItemActionTrigger.PlayerDamaged, { amount: heartDamage });
  if (!isPlayerAlive(run.player)) runItemActions(run, ItemActionTrigger.FatalDamage, { amount: heartDamage });
  return heartDamage;
}

function cursedActions(enemy: EnemyState, actions: EnemyAction[]): EnemyAction[] {
  const intendedAttacks = actions.filter((entry) => entry.kind === IntentKind.Attack);
  const count = enemy.boss ? 2 : 1;
  return Array.from({ length: count }, (_, index) => {
    const raw = intendedAttacks[index]?.value ?? intendedAttacks[0]?.value ?? enemy.attack;
    return action(IntentKind.Attack, Math.max(1, Math.round(raw * 0.6)));
  });
}

function reachableEnemyPositions(combat: CombatState, enemy: EnemyState): GridPosition[] {
  const blocked = new Set(
    combat.enemies
      .filter((entry) => entry.hp > 0 && entry.instanceId !== enemy.instanceId)
      .flatMap((entry) => getEnemyOccupiedCells(entry))
      .map(positionKey),
  );
  blocked.add(positionKey(combat.playerPosition));
  const diagonal = enemy.movementPattern === EnemyMovementPattern.DiagonalJump;
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    ...(diagonal
      ? [
          { x: 1, y: 1 },
          { x: 1, y: -1 },
          { x: -1, y: 1 },
          { x: -1, y: -1 },
        ]
      : []),
  ];
  const queue: Array<{ position: GridPosition; steps: number }> = [{ position: enemy.position, steps: 0 }];
  const visited = new Set<string>([positionKey(enemy.position)]);
  const reachable: GridPosition[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.steps > 0) reachable.push(current.position);
    if (current.steps >= getEnemyMovementSpeed(enemy)) continue;
    for (const direction of directions) {
      const candidate = { x: current.position.x + direction.x, y: current.position.y + direction.y };
      const key = positionKey(candidate);
      if (visited.has(key) || !enemyPositionFits(combat, enemy, candidate, blocked)) continue;
      visited.add(key);
      queue.push({ position: candidate, steps: current.steps + 1 });
    }
  }
  return reachable;
}

function moveEnemyTo(
  combat: CombatState,
  enemy: EnemyState,
  destination: GridPosition,
  wandering = false,
): boolean {
  if (destination.x === enemy.position.x && destination.y === enemy.position.y) return false;
  const from = { ...enemy.position };
  enemy.position = destination;
  pushAnimation(combat, {
    kind: CombatAnimationKind.Move,
    sourceId: enemy.instanceId,
    targetId: enemy.instanceId,
    fromX: from.x,
    fromY: from.y,
    toX: destination.x,
    toY: destination.y,
    movementStyle: wandering
      ? CombatMovementStyle.Wander
      : enemy.movementPattern === EnemyMovementPattern.DiagonalJump
        ? CombatMovementStyle.Jump
        : CombatMovementStyle.Walk,
  });
  pushLog(
    combat,
    wandering
      ? `${enemy.name} wandered to (${destination.x}, ${destination.y}) while Isaac was out of sight.`
      : `${enemy.name} moved to (${destination.x}, ${destination.y}).`,
    CombatLogTone.Normal,
    wandering ? 'enemyWandered' : 'enemyMoved',
    { enemyId: enemy.id, enemy: enemy.name, x: destination.x, y: destination.y },
  );
  return true;
}

function moveEnemyRandomly(run: RunState, combat: CombatState, enemy: EnemyState): boolean {
  const destinations = reachableEnemyPositions(combat, enemy);
  if (!destinations.length || nextRandom(run) < 0.2) {
    pushAnimation(combat, {
      kind: CombatAnimationKind.Idle,
      sourceId: enemy.instanceId,
      targetId: enemy.instanceId,
    });
    pushLog(
      combat,
      `${enemy.name} listened in the dark and stayed put.`,
      CombatLogTone.Normal,
      'enemyWanderIdle',
      {
        enemyId: enemy.id,
        enemy: enemy.name,
      },
    );
    return false;
  }
  return moveEnemyTo(combat, enemy, pickOne(run, destinations), true);
}

function moveEnemyTowardPlayer(combat: CombatState, enemy: EnemyState): boolean {
  const playerPosition = combat.playerPosition;
  if (enemyCanAttackPosition(enemy, playerPosition)) return false;
  const destination = reachableEnemyPositions(combat, enemy).sort((left, right) => {
    const leftCanAttack = enemyCanAttackPosition(enemy, playerPosition, left) ? 0 : 1;
    const rightCanAttack = enemyCanAttackPosition(enemy, playerPosition, right) ? 0 : 1;
    if (leftCanAttack !== rightCanAttack) return leftCanAttack - rightCanAttack;
    const leftAlignment =
      enemy.movementPattern === EnemyMovementPattern.DiagonalJump
        ? enemyChebyshevDistanceToPosition(enemy, playerPosition, left)
        : Math.min(Math.abs(left.x - playerPosition.x), Math.abs(left.y - playerPosition.y));
    const rightAlignment =
      enemy.movementPattern === EnemyMovementPattern.DiagonalJump
        ? enemyChebyshevDistanceToPosition(enemy, playerPosition, right)
        : Math.min(Math.abs(right.x - playerPosition.x), Math.abs(right.y - playerPosition.y));
    return (
      leftAlignment - rightAlignment ||
      gridDistance(left, playerPosition) - gridDistance(right, playerPosition)
    );
  })[0];
  if (
    !destination ||
    enemyDistanceToPosition(enemy, playerPosition, destination) >=
      enemyDistanceToPosition(enemy, playerPosition)
  )
    return false;
  return moveEnemyTo(combat, enemy, destination);
}

function bossAttackHits(combat: CombatState, enemy: EnemyState, enemyAction: EnemyAction): boolean {
  const pattern = enemyAction.pattern ?? BossAttackPattern.Contact;
  const player = combat.playerPosition;
  const target = {
    x: enemyAction.targetX ?? player.x,
    y: enemyAction.targetY ?? player.y,
  };
  const targetDistance = Math.max(Math.abs(player.x - target.x), Math.abs(player.y - target.y));
  switch (pattern) {
    case BossAttackPattern.ProjectileSpread:
    case BossAttackPattern.LeapSlam:
    case BossAttackPattern.GroundStomp:
    case BossAttackPattern.ProjectileRain:
      return targetDistance <= (enemyAction.radius ?? 0);
    case BossAttackPattern.RadialBurst:
      return enemyChebyshevDistanceToPosition(enemy, player) <= (enemyAction.radius ?? enemy.attackRange);
    case BossAttackPattern.SpiralBarrage: {
      const distance = enemyChebyshevDistanceToPosition(enemy, player);
      return distance > (enemyAction.innerRadius ?? 0) && distance <= (enemyAction.radius ?? 6);
    }
    case BossAttackPattern.LaserLine:
    case BossAttackPattern.ChargeLane:
    case BossAttackPattern.RockWave:
      return player.x === target.x || player.y === target.y;
    case BossAttackPattern.Contact:
    default:
      return enemyCanAttackPosition(enemy, player);
  }
}

function relocateBossForAttack(combat: CombatState, enemy: EnemyState, enemyAction: EnemyAction): void {
  if (
    ![BossAttackPattern.LeapSlam, BossAttackPattern.ChargeLane].includes(
      enemyAction.pattern ?? BossAttackPattern.Contact,
    ) ||
    enemyAction.targetX === undefined ||
    enemyAction.targetY === undefined
  )
    return;
  const blocked = new Set(
    combat.enemies
      .filter((entry) => entry.hp > 0 && entry.instanceId !== enemy.instanceId)
      .flatMap((entry) => getEnemyOccupiedCells(entry))
      .map(positionKey),
  );
  blocked.add(positionKey(combat.playerPosition));
  const destination = findAvailableEnemyPosition(
    combat,
    enemy,
    { x: enemyAction.targetX, y: enemyAction.targetY },
    blocked,
  );
  moveEnemyTo(combat, enemy, destination);
}

function resolveEnemyAttack(
  run: RunState,
  combat: CombatState,
  enemy: EnemyState,
  enemyAction: EnemyAction,
): void {
  const hits = bossAttackHits(combat, enemy, enemyAction);
  relocateBossForAttack(combat, enemy, enemyAction);
  enemy.prepared = false;
  if (hits) {
    hurtPlayer(run, combat, enemyAction.value, enemy, enemyAction);
    return;
  }
  if (enemyAction.pattern) {
    pushAnimation(combat, {
      kind: CombatAnimationKind.EnemyAttack,
      sourceId: enemy.instanceId,
      targetId: 'isaac',
      value: 0,
      rawValue: enemyAction.value,
      bossPattern: enemyAction.pattern,
      toX: enemyAction.targetX,
      toY: enemyAction.targetY,
    });
    pushLog(
      combat,
      `${enemy.name}'s ${enemyAction.pattern} missed Isaac.`,
      CombatLogTone.Good,
      'bossPatternDodged',
      {
        enemyId: enemy.id,
        enemy: enemy.name,
        pattern: enemyAction.pattern,
      },
    );
    return;
  }
  pushAnimation(combat, {
    kind: CombatAnimationKind.Idle,
    sourceId: enemy.instanceId,
    targetId: enemy.instanceId,
  });
  pushLog(combat, `${enemy.name} is still outside attack range.`, CombatLogTone.Normal, 'enemyOutOfRange', {
    enemyId: enemy.id,
    enemy: enemy.name,
  });
}

function resolveEnemyAction(
  run: RunState,
  combat: CombatState,
  enemy: EnemyState,
  enemyAction: EnemyAction,
): void {
  switch (enemyAction.kind) {
    case IntentKind.Attack:
      resolveEnemyAttack(run, combat, enemy, enemyAction);
      break;
    case IntentKind.Shield:
      enemy.shield += enemyAction.value;
      pushAnimation(combat, {
        kind: CombatAnimationKind.Shield,
        sourceId: enemy.instanceId,
        targetId: enemy.instanceId,
        value: enemyAction.value,
      });
      pushLog(
        combat,
        `${enemy.name} gained ${enemyAction.value} shield.`,
        CombatLogTone.Normal,
        'enemyShield',
        {
          enemyId: enemy.id,
          enemy: enemy.name,
          amount: enemyAction.value,
        },
      );
      break;
    case IntentKind.Curse:
      pushAnimation(combat, {
        kind: CombatAnimationKind.Curse,
        sourceId: enemy.instanceId,
        targetId: 'isaac',
        value: 1,
      });
      if (nextRandom(run) < 0.3) addCurseCard(run, combat);
      else applyRandomPlayerCurse(run, combat, enemy);
      break;
    case IntentKind.Heal: {
      const allies = combat.enemies.filter((entry) => entry.hp > 0);
      const target = allies.reduce((lowest, entry) => (entry.hp < lowest.hp ? entry : lowest), allies[0]!);
      const healed = Math.min(enemyAction.value, target.maxHp - target.hp);
      target.hp += healed;
      pushAnimation(combat, {
        kind: CombatAnimationKind.Heal,
        sourceId: enemy.instanceId,
        targetId: target.instanceId,
        value: healed,
      });
      pushLog(
        combat,
        `${enemy.name} restored ${healed} HP to ${target.name}.`,
        CombatLogTone.Normal,
        'enemyHeal',
        {
          enemyId: enemy.id,
          enemy: enemy.name,
          amount: healed,
          targetId: target.id,
          target: target.name,
        },
      );
      break;
    }
    case IntentKind.Prepare:
      enemy.prepared = true;
      pushAnimation(combat, {
        kind: CombatAnimationKind.Prepare,
        sourceId: enemy.instanceId,
        targetId: enemy.instanceId,
        value: enemy.attack * 2,
      });
      pushLog(combat, `${enemy.name} prepares a doubled attack!`, CombatLogTone.Danger, 'prepare', {
        enemyId: enemy.id,
        enemy: enemy.name,
      });
      break;
    case IntentKind.Summon: {
      const livingMinions = combat.enemies.filter((entry) => entry.hp > 0 && !entry.boss).length;
      const summonCount = Math.max(0, Math.min(enemyAction.value || 1, 3 - livingMinions));
      if (summonCount <= 0) {
        pushAnimation(combat, {
          kind: CombatAnimationKind.Idle,
          sourceId: enemy.instanceId,
          targetId: enemy.instanceId,
        });
        pushLog(combat, `${enemy.name}'s call went unanswered.`, CombatLogTone.Normal, 'bossSummonBlocked', {
          enemyId: enemy.id,
          enemy: enemy.name,
        });
        break;
      }
      const pool = enemyPoolForFloor(run.floorIndex).filter(
        (definition) => !definition.boss && !definition.elite,
      );
      for (let index = 0; index < summonCount; index += 1) {
        const summoned = makeEnemy(run, pickOne(run, pool), combat.enemies.length + index);
        summoned.alerted = true;
        combat.enemies.push(summoned);
        pushAnimation(combat, {
          kind: CombatAnimationKind.Summon,
          sourceId: enemy.instanceId,
          targetId: summoned.instanceId,
          value: 1,
        });
      }
      ensureCombatGrid(run);
      pushLog(combat, `${enemy.name} summoned ${summonCount} minion.`, CombatLogTone.Danger, 'bossSummon', {
        enemyId: enemy.id,
        enemy: enemy.name,
        count: summonCount,
      });
      break;
    }
    case IntentKind.Idle:
      pushAnimation(combat, {
        kind: CombatAnimationKind.Idle,
        sourceId: enemy.instanceId,
        targetId: enemy.instanceId,
      });
      pushLog(combat, `${enemy.name} hesitates.`, CombatLogTone.Normal, 'hesitate', {
        enemyId: enemy.id,
        enemy: enemy.name,
      });
      break;
  }
}

function resolveEnemyTurn(run: RunState): void {
  const combat = run.combat!;
  ensureCombatGrid(run);
  run.phase = RunPhase.Combat;
  if ((combat.playerStatuses[StatusKind.Poison] ?? 0) > 0) {
    loseDirectHeartHp(run, combat, combat.playerStatusPower[StatusKind.Poison] ?? 4, 'Poison');
  }
  for (const enemy of combat.enemies.filter((entry) => entry.hp > 0)) {
    if (enemy.hp <= 0) continue;
    ensureEnemyBehavior(enemy);
    if (enemy.poisonTurns > 0) {
      const wasAlive = enemy.hp > 0;
      const dealt = hurtEnemy(enemy, enemy.poisonDamage || 3, 99);
      enemy.poisonTurns -= 1;
      enemy.statuses[StatusKind.Poison] = enemy.poisonTurns;
      pushAnimation(combat, {
        kind: CombatAnimationKind.Poison,
        sourceId: 'isaac',
        targetId: enemy.instanceId,
        value: dealt,
        poisonTurns: enemy.poisonTurns,
      });
      pushLog(combat, `${enemy.name} took ${dealt} poison damage.`, CombatLogTone.Good, 'enemyPoisoned', {
        enemyId: enemy.id,
        enemy: enemy.name,
        damage: dealt,
        turns: enemy.poisonTurns,
      });
      if (wasAlive && enemy.hp <= 0) {
        pushAnimation(combat, {
          kind: CombatAnimationKind.Defeat,
          sourceId: enemy.instanceId,
          targetId: enemy.instanceId,
        });
        continue;
      }
    }
    if (enemy.staggeredTurns > 0) {
      enemy.staggeredTurns -= 1;
      enemy.turnsSinceAttack += 1;
      pushAnimation(combat, {
        kind: CombatAnimationKind.Idle,
        sourceId: enemy.instanceId,
        targetId: enemy.instanceId,
      });
      pushLog(
        combat,
        `${enemy.name} is staggered and loses its action.`,
        CombatLogTone.Good,
        'enemyStaggered',
        {
          enemyId: enemy.id,
          enemy: enemy.name,
        },
      );
    } else {
      const roaming = !enemy.alerted && !enemyCanSeePosition(enemy, combat.playerPosition);
      const relocatesWithIntent = enemy.intent.actions?.some((entry) =>
        [BossAttackPattern.LeapSlam, BossAttackPattern.ChargeLane].includes(
          entry.pattern ?? BossAttackPattern.Contact,
        ),
      );
      if (roaming) moveEnemyRandomly(run, combat, enemy);
      else if (!relocatesWithIntent) moveEnemyTowardPlayer(combat, enemy);
      const actionLimit = enemy.boss ? 2 : 1;
      const visibleIntent =
        (enemy.statuses[StatusKind.Blind] ?? 0) > 0 ? rollIntent(run, enemy) : enemy.intent;
      const rolledActions = (
        visibleIntent.actions?.length
          ? visibleIntent.actions
          : [action(visibleIntent.kind, visibleIntent.value)]
      ).slice(0, actionLimit);
      const intendedActions = rolledActions.map((rolledAction) =>
        roaming && (rolledAction.kind === IntentKind.Attack || rolledAction.kind === IntentKind.Curse)
          ? action(IntentKind.Idle, 0)
          : rolledAction,
      );
      const weakened = enemy.cursedTurns > 0 && !roaming;
      if (roaming && enemy.cursedTurns > 0) enemy.cursedTurns -= 1;
      let enemyActions = weakened ? cursedActions(enemy, intendedActions) : intendedActions;
      if ((enemy.statuses[StatusKind.Silence] ?? 0) > 0) {
        enemyActions = enemyActions.map((entry) =>
          entry.kind === IntentKind.Attack ? action(IntentKind.Idle, 0) : entry,
        );
      }
      if ((enemy.statuses[StatusKind.ItemLock] ?? 0) > 0) {
        enemyActions = enemyActions.map((entry) =>
          [IntentKind.Attack, IntentKind.Idle].includes(entry.kind) ? entry : action(IntentKind.Idle, 0),
        );
      }
      if ((enemy.statuses[StatusKind.Weak] ?? 0) > 0) {
        enemyActions = enemyActions.map((entry) =>
          entry.kind === IntentKind.Attack
            ? { ...entry, value: Math.max(1, Math.round(entry.value * 0.5)) }
            : entry,
        );
      }
      if (weakened) {
        enemy.cursedTurns -= 1;
        pushLog(
          combat,
          `${enemy.name}'s curse suppresses its special action and weakens its attack.`,
          CombatLogTone.Good,
          'enemyWeakened',
          {
            enemyId: enemy.id,
            enemy: enemy.name,
            damage: enemyActions[0]?.value ?? 0,
          },
        );
      }
      let attacked = false;
      for (const enemyAction of enemyActions) {
        if (!isPlayerAlive(run.player)) break;
        resolveEnemyAction(run, combat, enemy, enemyAction);
        attacked ||= enemyAction.kind === IntentKind.Attack;
      }
      enemy.turnsSinceAttack = attacked ? 0 : enemy.turnsSinceAttack + 1;
    }
    if (enemy.slowedTurns > 0) enemy.slowedTurns -= 1;
    for (const status of Object.values(StatusKind)) {
      if (status === StatusKind.Poison) continue;
      if ((enemy.statuses[status] ?? 0) > 0) enemy.statuses[status] = (enemy.statuses[status] ?? 0) - 1;
    }
    if (!isPlayerAlive(run.player)) break;
  }

  notifyNewEnemyDeaths(run);
  if (allEnemiesDefeated(combat)) {
    finishCombat(run);
    return;
  }
  runItemActions(run, ItemActionTrigger.RoundEnd);
  notifyNewEnemyDeaths(run);
  if (allEnemiesDefeated(combat)) {
    finishCombat(run);
    return;
  }
  if (combat.ragnarokActive && combat.hand.length > 0) {
    loseDirectHeartHp(run, combat, combat.hand.length, 'Ragnarok');
  }
  if (combat.damoclesActive && !combat.damoclesFallen && nextRandom(run) < 0.5) {
    combat.damoclesFallen = true;
    loseDirectHeartHp(run, combat, run.player.stats.heartSize, 'Damocles');
  }
  if (combat.unlimitedVitalityTurns > 0) {
    combat.unlimitedVitalityTurns -= 1;
    if (combat.unlimitedVitalityTurns === 0) {
      run.player.stats.maxVitality = Math.max(1, run.player.stats.maxVitality - 1);
      pushLog(
        combat,
        'The stimulant crash permanently removed 1 max vitality.',
        CombatLogTone.Danger,
        'stimulantCrash',
      );
    }
  }
  for (const status of Object.values(StatusKind)) {
    if ((combat.playerStatuses[status] ?? 0) > 0) {
      combat.playerStatuses[status] = (combat.playerStatuses[status] ?? 0) - 1;
    }
  }
  if (!isPlayerAlive(run.player)) {
    run.phase = RunPhase.Defeat;
    run.victory = false;
    run.combat = combat;
    return;
  }

  combat.round += 1;
  combat.vitality = run.player.stats.maxVitality;
  recordAchievementEvent(run, { type: AchievementEventType.RoundStarted });
  for (const key of Object.keys(combat.cooldowns)) {
    combat.cooldowns[key] = Math.max(0, (combat.cooldowns[key] ?? 0) - 1);
  }
  combat.enemies
    .filter((enemy) => enemy.hp > 0)
    .forEach((enemy) => {
      enemy.intent = rollIntent(run, enemy);
    });
  if (combat.ragnarokActive) drawToHand(run, combat, combat.hand.length + 5);
  else drawToHand(run, combat);
  runItemActions(run, ItemActionTrigger.RoundStart);
  notifyNewEnemyDeaths(run);
  if ((combat.playerStatuses[StatusKind.Blind] ?? 0) > 0) combat.hand = shuffle(run, combat.hand);
  if (!combat.enemies.some((enemy) => enemy.hp > 0 && enemy.instanceId === combat.selectedEnemyId)) {
    combat.selectedEnemyId = undefined;
  }
  pushAnimation(combat, { kind: CombatAnimationKind.RoundStart, sourceId: 'isaac', value: combat.round });
  runFamiliarAttacks(run);
  if (allEnemiesDefeated(combat)) {
    finishCombat(run);
    return;
  }
  pushLog(
    combat,
    `Round ${combat.round} — vitality restored to ${combat.vitality}.`,
    CombatLogTone.Special,
    'nextRound',
    { round: combat.round, vitality: combat.vitality },
  );
}

function rollLoot(run: RunState): string {
  const resource = weightedPick(run, [
    { value: ResourceKind.Coins, weight: 42 + run.player.stats.luck * 2 },
    { value: ResourceKind.Bombs, weight: 18 },
    { value: ResourceKind.Keys, weight: 16 },
    { value: ResourceKind.RedHeart, weight: 12 },
    { value: ResourceKind.SoulHeart, weight: 8 + run.player.stats.luck },
    { value: ResourceKind.BlackHeart, weight: 4 + run.player.stats.luck },
  ]);
  const amount =
    resource === ResourceKind.Coins
      ? weightedPick(run, [
          { value: 1, weight: 65 },
          { value: 5, weight: 28 },
          { value: 10, weight: 7 },
        ])
      : resource === ResourceKind.Bombs || resource === ResourceKind.Keys
        ? randomInt(run, 1, 2)
        : 1;
  return applyResource(run, resource, amount);
}

function makeFloorUpgrade(run: RunState): void {
  const options: RewardOption[] = shuffle(run, [
    {
      id: makeId('up', run),
      type: RewardOptionType.Upgrade,
      upgrade: UpgradeKind.Damage,
      label: 'Attack Up',
      description: '+2 base attack damage.',
      icon: '↑',
    },
    {
      id: makeId('up', run),
      type: RewardOptionType.Upgrade,
      upgrade: UpgradeKind.Heart,
      label: 'Heart Training',
      description: `+${HEART_SIZE_UPGRADE_AMOUNT} HP per heart and fully heal red hearts.`,
      icon: '♥',
    },
    {
      id: makeId('up', run),
      type: RewardOptionType.Upgrade,
      upgrade: UpgradeKind.Armor,
      label: 'Tough Skin',
      description: '+1 permanent armor.',
      icon: '⬡',
    },
    {
      id: makeId('up', run),
      type: RewardOptionType.Upgrade,
      upgrade: UpgradeKind.Speed,
      label: 'Attack Accelerator',
      description: '+0.25 fire rate.',
      icon: '»',
    },
    {
      id: makeId('up', run),
      type: RewardOptionType.Upgrade,
      upgrade: UpgradeKind.Skill,
      label: 'Battery Pack',
      description: 'Reduce active recharge by one round.',
      icon: '▣',
    },
    ...(run.floorIndex >= 4 && run.player.stats.maxVitality < 6
      ? [
          {
            id: makeId('up', run),
            type: RewardOptionType.Upgrade,
            upgrade: UpgradeKind.Vitality,
            label: 'Adrenaline',
            description: '+1 maximum vitality (maximum 6).',
            icon: '✦',
          },
        ]
      : []),
  ] satisfies RewardOption[]).slice(0, 3);
  setChoice(run, {
    kind: ChoiceKind.Upgrade,
    title: `${FLOORS[run.floorIndex]?.name} cleared`,
    subtitle:
      run.floorIndex === 5
        ? "Mom's shadow lifts. Take one final blessing."
        : 'Choose one permanent floor blessing.',
    options,
    canSkip: false,
    next: run.floorIndex === 5 ? ChoiceNext.Victory : ChoiceNext.NextFloor,
  });
}

function makeDealItems(run: RunState, type: DealType): void {
  const rewardPool = type === DealType.Devil ? RewardPool.Devil : RewardPool.Angel;
  const options = itemOptions(run, rewardPool, 3);
  if (type === DealType.Devil) {
    options.forEach((option) => {
      option.description = `${option.description} Cost: 1 red-heart container.`;
    });
  }
  setRoomRewardChoice(run, {
    kind: ChoiceKind.Item,
    title: type === DealType.Devil ? 'Devil Room' : 'Angel Room',
    subtitle: type === DealType.Devil ? 'Power always has a price.' : 'Faith is rewarded freely.',
    options,
    next: ChoiceNext.FloorUpgrade,
    dealType: type,
    rewardPool,
  });
}

function makeBossGate(run: RunState): void {
  const guaranteed = itemHasEffect(run, 'guaranteeDeal');
  const appears = guaranteed || nextRandom(run) < run.devilChance;
  if (!appears) {
    run.devilChance = Math.min(1, run.devilChance + 0.15);
    makeFloorUpgrade(run);
    return;
  }
  run.devilChance = 0.35;
  const type: DealType =
    !run.tookDevilDeal && run.angelFavor > 0 && nextRandom(run) < Math.min(0.8, 0.35 + run.angelFavor * 0.2)
      ? DealType.Angel
      : DealType.Devil;
  setChoice(run, {
    kind: ChoiceKind.Deal,
    title: type === DealType.Devil ? 'A trapdoor exhales heat…' : 'A white door opens…',
    subtitle: `${type === DealType.Devil ? 'Devil' : 'Angel'} and Angel rooms can never appear together.`,
    options: [
      {
        id: makeId('deal', run),
        type: RewardOptionType.Action,
        action: ChoiceAction.EnterDeal,
        label: `Enter ${type} room`,
        description:
          type === DealType.Devil
            ? 'See three powerful items offered for heart containers.'
            : 'Receive a free holy item.',
        icon: type === DealType.Devil ? '▼' : '△',
      },
      {
        id: makeId('skip', run),
        type: RewardOptionType.Action,
        action: ChoiceAction.SkipDeal,
        label: 'Descend without entering',
        description:
          type === DealType.Devil ? 'Build Angel favor for later floors.' : 'Leave the blessing untouched.',
        icon: '↘',
      },
    ],
    canSkip: false,
    next: ChoiceNext.FloorUpgrade,
    dealType: type,
  });
}

function finishCombat(run: RunState): void {
  const combat = run.combat!;
  const defeatedBossId = combat.enemies.find((enemy) => enemy.boss)?.id;
  runItemActions(run, ItemActionTrigger.RoomCleared);
  const loot = rollLoot(run);
  run.lastReward = [loot];
  run.clearedRooms += 1;
  run.score +=
    combat.roomKind === RoomKind.Boss
      ? 500 + run.floorIndex * 100
      : combat.roomKind === RoomKind.Elite
        ? 220
        : 90;
  if (combat.roomKind === RoomKind.Boss) {
    setRoomRewardChoice(run, {
      kind: ChoiceKind.Item,
      title: `${FLOORS[run.floorIndex]?.bossName} defeated`,
      subtitle: `Boss drop: ${loot}. Choose one item before the exit door opens.`,
      options: itemOptions(run, RewardPool.Boss, 3),
      next: ChoiceNext.BossGate,
      rewardPool: RewardPool.Boss,
    });
  } else if (combat.roomKind === RoomKind.Elite) {
    setRoomRewardChoice(run, {
      kind: ChoiceKind.Item,
      title: 'Champion defeated',
      subtitle: `Room drop: ${loot}. Choose one elite item.`,
      options: itemOptions(run, RewardPool.Elite, 3),
      next: ChoiceNext.Map,
      rewardPool: RewardPool.Elite,
    });
  } else if (
    combat.roomLayout.unitCount >= 3 &&
    nextRandom(run) <
      Math.min(
        0.6,
        (combat.roomLayout.shape === CombatRoomShape.Large ? 0.38 : 0.28) +
          run.floorIndex * 0.02 +
          run.player.stats.luck * 0.02,
      )
  ) {
    setRoomRewardChoice(run, {
      kind: ChoiceKind.Item,
      title: 'Large room treasure',
      subtitle: `Room drop: ${loot}. Choose one permanent stat item; it never enters the combat deck.`,
      options: itemOptions(run, RewardPool.LargeRoom, 3),
      next: ChoiceNext.Map,
      rewardContext: RewardContext.LargeRoom,
      rewardPool: RewardPool.LargeRoom,
    });
  } else {
    setRoomRewardChoice(run, {
      kind: ChoiceKind.Card,
      title: 'Room cleared',
      subtitle: `Room drop: ${loot}. Add one card, or skip.`,
      options: cardOptions(run, RewardPool.RoomClear, 3),
      next: ChoiceNext.Map,
      rewardPool: RewardPool.RoomClear,
    });
  }
  if (run.choice) run.choice.requiresRewardConfirmation = true;
  recordAchievementEvent(run, { type: AchievementEventType.RoomCleared });
  if (combat.roomKind === RoomKind.Elite && combat.damageTakenThisFloor === 0) {
    recordAchievementEvent(run, { type: AchievementEventType.ElitePerfect });
  }
  if (combat.roomKind === RoomKind.Boss && defeatedBossId) {
    const achievementBossId = Object.values(AchievementBossId).find((bossId) => bossId === defeatedBossId);
    if (!achievementBossId) throw new Error(`Boss ${defeatedBossId} has no achievement identity`);
    recordAchievementEvent(run, {
      type: AchievementEventType.BossDefeated,
      bossId: achievementBossId,
    });
  }
}

function applyUpgrade(run: RunState, upgrade: NonNullable<RewardOption['upgrade']>): void {
  switch (upgrade) {
    case UpgradeKind.Card:
      throw new Error('Choose a deck card for this upgrade');
    case UpgradeKind.Damage:
      run.player.stats.baseDamage += 2;
      break;
    case UpgradeKind.Heart:
      increaseHeartSize(run.player, HEART_SIZE_UPGRADE_AMOUNT);
      run.player.redHp = maxRedHp(run.player);
      break;
    case UpgradeKind.Shield:
      run.player.stats.maxShield += SHIELD_CAPACITY_UPGRADE_AMOUNT;
      break;
    case UpgradeKind.Armor:
      run.player.stats.armor += ARMOR_UPGRADE_AMOUNT;
      break;
    case UpgradeKind.Vitality:
      run.player.stats.maxVitality += 1;
      break;
    case UpgradeKind.Speed:
      run.player.stats.fireRate += 0.25;
      break;
    case UpgradeKind.Skill: {
      const active = run.player.deck.find((card) => CARDS[card.definitionId]?.type === CardType.Skill);
      if (active) active.upgraded = true;
      break;
    }
  }
}

function advanceFloor(run: RunState): void {
  recordAchievementEvent(run, {
    type: AchievementEventType.FloorCleared,
    flawless: run.floorRedDamage === 0,
  });
  run.floorIndex += 1;
  run.floorMap = createFloorMap(run.floorIndex, run.seed);
  run.floorRedDamage = 0;
  run.floorSecretVisits = [];
  run.floorBombSearches = [];
  run.mapBombResult = undefined;
  run.choice = undefined;
  run.combat = undefined;
  run.roomCheckpoint = undefined;
  run.currentRoomId = undefined;
  run.phase = RunPhase.Map;
  revealMap(run);
  makeFloorStartChoice(run);
}

function finishVictory(run: RunState): void {
  recordAchievementEvent(run, {
    type: AchievementEventType.FloorCleared,
    flawless: run.floorRedDamage === 0,
  });
  run.phase = RunPhase.Victory;
  run.choice = undefined;
  run.combat = undefined;
  run.roomCheckpoint = undefined;
  run.victory = true;
  run.score += 2000;
  recordAchievementEvent(run, { type: AchievementEventType.RunWon });
}

function advanceAfterChoice(run: RunState, next: ChoiceState['next']): void {
  switch (next) {
    case ChoiceNext.Map:
      returnToMap(run);
      break;
    case ChoiceNext.FloorUpgrade:
      makeFloorUpgrade(run);
      break;
    case ChoiceNext.NextFloor:
      advanceFloor(run);
      break;
    case ChoiceNext.Victory:
      finishVictory(run);
      break;
    case ChoiceNext.BossGate:
      makeBossGate(run);
      break;
  }
}

function payPrice(run: RunState, option: RewardOption): void {
  if (option.price === undefined) return;
  if (run.player.coins < option.price) throw new Error('Not enough coins');
  run.player.coins -= option.price;
}

export function chooseOption(state: RunState, optionId: string): RunState {
  const run = clone(state);
  if (run.phase !== RunPhase.Choice || !run.choice) throw new Error('There is no choice to make');
  const choice = run.choice;
  if (choice.requiresRewardConfirmation) throw new Error('Acknowledge the room reward first');
  const option = choice.options.find((entry) => entry.id === optionId);
  if (!option || option.sold) throw new Error('That option is unavailable');

  if (option.action === ChoiceAction.Leave) {
    returnToMap(run);
    return touch(run);
  }
  if (option.action === ChoiceAction.Sacrifice) {
    if (run.player.redHp <= 15) throw new Error('Not enough red-heart HP to survive the sacrifice');
    run.player.redHp -= 15;
    run.floorRedDamage += 15;
    recordAchievementEvent(run, {
      type: AchievementEventType.HealthSacrificed,
      amount: 15,
    });
    addPocketHeart(run, HeartKind.Soul);
    const tarotPool = Object.values(CARDS).filter(
      (card) => card.type === CardType.Tarot && card.rewardPools.includes(RewardPool.Sacrifice),
    );
    const tarot = weightedPick(
      run,
      tarotPool.map((card) => ({
        value: card,
        weight: cardRewardWeight(card, RewardPool.Sacrifice),
      })),
    );
    run.player.deck.push(createCard(run, tarot.id));
    run.lastReward = ['1 soul heart', tarot.name];
    returnToMap(run);
    return touch(run);
  }
  if (option.action === ChoiceAction.EnterDeal) {
    makeDealItems(run, choice.dealType ?? DealType.Devil);
    return touch(run);
  }
  if (option.action === ChoiceAction.SkipDeal) {
    if (choice.dealType === DealType.Devil) {
      run.angelFavor += 1;
      recordAchievementEvent(run, {
        type: AchievementEventType.AngelFavorGained,
        amount: 1,
      });
    }
    makeFloorUpgrade(run);
    return touch(run);
  }
  if (choice.kind === ChoiceKind.Shop && option.upgrade === UpgradeKind.Card) {
    throw new Error('Choose a deck card for this upgrade');
  }

  payPrice(run, option);
  if (choice.kind === ChoiceKind.Shop && (option.price ?? 0) > 0) {
    recordAchievementEvent(run, {
      type: AchievementEventType.CoinsSpent,
      amount: option.price!,
    });
  }
  if (option.type === RewardOptionType.Item && option.itemId) {
    if (choice.dealType === DealType.Devil) {
      if (run.player.redContainers <= 1) throw new Error('A Devil deal needs a spare red-heart container');
      run.player.redContainers -= 1;
      run.player.redHp = Math.min(run.player.redHp, maxRedHp(run.player));
      run.tookDevilDeal = true;
      run.angelFavor = 0;
      recordAchievementEvent(run, { type: AchievementEventType.DevilDealTaken });
    }
    equipItem(run, option.itemId);
    run.lastReward = [ITEMS[option.itemId]!.name];
  }
  if (option.type === RewardOptionType.Card && option.cardId) {
    run.player.deck.push(createCard(run, option.cardId));
    run.lastReward = [CARDS[option.cardId]!.name];
  }
  if (option.type === RewardOptionType.Resource && option.resource && option.amount) {
    run.lastReward = [applyResource(run, option.resource, option.amount)];
  }
  if (option.type === RewardOptionType.Upgrade && option.upgrade) {
    applyUpgrade(run, option.upgrade);
    run.lastReward = [option.label];
  }
  if (choice.kind === ChoiceKind.Shop) {
    const current = run.choice!.options.find((entry) => entry.id === optionId);
    if (current) current.sold = true;
  } else {
    advanceAfterChoice(run, choice.next);
  }
  return touch(run);
}

export function purchaseShopCardUpgrade(state: RunState, optionId: string, cardInstanceId: string): RunState {
  const run = clone(state);
  if (run.phase !== RunPhase.Choice || run.choice?.kind !== ChoiceKind.Shop) {
    throw new Error('Card upgrades are only available in a shop');
  }
  const option = run.choice.options.find((entry) => entry.id === optionId);
  if (
    !option ||
    option.sold ||
    option.type !== RewardOptionType.Upgrade ||
    option.upgrade !== UpgradeKind.Card
  ) {
    throw new Error('That card-upgrade slot is unavailable');
  }
  const card = run.player.deck.find((entry) => entry.instanceId === cardInstanceId);
  if (!card) throw new Error('That card is not in the deck');
  if (card.upgraded) throw new Error('That card is already upgraded');

  payPrice(run, option);
  if ((option.price ?? 0) > 0) {
    recordAchievementEvent(run, {
      type: AchievementEventType.CoinsSpent,
      amount: option.price!,
    });
  }
  card.upgraded = true;
  option.sold = true;
  run.lastReward = [CARDS[card.definitionId]?.name ?? option.label];
  return touch(run);
}

export function skipChoice(state: RunState): RunState {
  const run = clone(state);
  if (run.phase !== RunPhase.Choice || !run.choice?.canSkip) throw new Error('This choice cannot be skipped');
  if (run.choice.requiresRewardConfirmation) throw new Error('Acknowledge the room reward first');
  const next = run.choice.next;
  if (run.choice.kind === ChoiceKind.Shop) returnToMap(run);
  else advanceAfterChoice(run, next);
  return touch(run);
}

export function acknowledgeRoomReward(state: RunState): RunState {
  const run = clone(state);
  if (run.phase !== RunPhase.Choice || !run.choice?.requiresRewardConfirmation) {
    throw new Error('There is no room reward to acknowledge');
  }
  run.choice.requiresRewardConfirmation = false;
  return touch(run);
}

export function acknowledgeAchievementNotice(state: RunState, achievementId: AchievementId): RunState {
  const run = clone(state);
  const notice = run.achievementNotices.find(
    (entry) => entry.achievementId === achievementId && !entry.acknowledgedAt,
  );
  if (!notice) throw new Error('There is no pending achievement notice');
  notice.acknowledgedAt = now();
  return touch(run);
}

export function abandonRun(state: RunState): RunState {
  const run = clone(state);
  run.phase = RunPhase.Defeat;
  run.victory = false;
  return touch(run);
}
