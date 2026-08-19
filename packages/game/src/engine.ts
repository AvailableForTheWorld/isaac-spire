import {
  CARDS, DEFAULT_UNLOCKS, FLOORS, ITEMS, bossForFloor, eliteForFloor, enemyPoolForFloor, itemUsesCombatCard, passiveCardId,
} from './catalog.js';
import { availableNodeIds, createFloorMap, getMapNode, revealFromCurrent } from './map.js';
import { addPocketHeart, createCard, createIsaac, equipItem, healRed, maxRedHp } from './player.js';
import { hashSeed, nextRandom, pickOne, randomInt, shuffle, weightedPick } from './random.js';
import type {
  AttackFusionPreview, CardDefinition, CardInstance, ChoiceState, CombatAnimationEvent, CombatLogEntry, CombatRoomLayout, CombatState,
  EnemyAction, EnemyBehavior, EnemyDefinition, EnemyIntent, EnemyState, IntentKind,
  GridPosition, ItemDefinition, RewardOption, RoomKind, RunState,
} from './types.js';

const clone = <T>(value: T): T => structuredClone(value);

export const STANDARD_ROOM_WIDTH = 17;
export const STANDARD_ROOM_HEIGHT = 9;
export const COMBAT_GRID_WIDTH = STANDARD_ROOM_WIDTH;
export const COMBAT_GRID_HEIGHT = STANDARD_ROOM_HEIGHT;
export const ISAAC_DOOR_POSITION: GridPosition = { x: 0, y: 4 };

export const DEFAULT_COMBAT_ROOM_LAYOUT: CombatRoomLayout = {
  shape: 'standard', width: STANDARD_ROOM_WIDTH, height: STANDARD_ROOM_HEIGHT, unitCount: 1,
};

function gridDistance(left: GridPosition, right: GridPosition): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function isStraightLineInRange(origin: GridPosition, target: GridPosition, range: number): boolean {
  const xDistance = Math.abs(origin.x - target.x);
  const yDistance = Math.abs(origin.y - target.y);
  return (xDistance === 0 || yDistance === 0) && xDistance + yDistance <= range;
}

function roomLayout(combat?: Pick<CombatState, 'roomLayout'>): CombatRoomLayout {
  return combat?.roomLayout ?? DEFAULT_COMBAT_ROOM_LAYOUT;
}

export function isCombatCellAvailable(combat: Pick<CombatState, 'roomLayout'>, position: GridPosition): boolean {
  const layout = roomLayout(combat);
  if (position.x < 0 || position.x >= layout.width || position.y < 0 || position.y >= layout.height) return false;
  if (layout.shape !== 'l-shaped' || !layout.missingQuadrant) return true;
  const right = position.x >= STANDARD_ROOM_WIDTH;
  const bottom = position.y >= STANDARD_ROOM_HEIGHT;
  const quadrant = `${bottom ? 'bottom' : 'top'}-${right ? 'right' : 'left'}`;
  return quadrant !== layout.missingQuadrant;
}

export function getCombatRoomCells(combat: Pick<CombatState, 'roomLayout'>): GridPosition[] {
  const layout = roomLayout(combat);
  return Array.from({ length: layout.width * layout.height }, (_, index) => ({
    x: index % layout.width,
    y: Math.floor(index / layout.width),
  })).filter((position) => isCombatCellAvailable(combat, position));
}

function positionKey(position: GridPosition): string {
  return `${position.x}:${position.y}`;
}

function enemyFootprint(enemy: Pick<EnemyDefinition, 'footprintWidth' | 'footprintHeight'>): { width: number; height: number } {
  const maxWidth = STANDARD_ROOM_WIDTH * 2;
  const maxHeight = STANDARD_ROOM_HEIGHT * 2;
  return {
    width: Math.max(1, Math.min(maxWidth, Math.round(enemy.footprintWidth ?? 1))),
    height: Math.max(1, Math.min(maxHeight, Math.round(enemy.footprintHeight ?? 1))),
  };
}

function footprintCellsAt(
  enemy: Pick<EnemyDefinition, 'footprintWidth' | 'footprintHeight'>,
  position: GridPosition,
): GridPosition[] {
  const { width, height } = enemyFootprint(enemy);
  return Array.from({ length: width * height }, (_, index) => ({
    x: position.x + index % width,
    y: position.y + Math.floor(index / width),
  }));
}

export function getEnemyOccupiedCells(enemy: EnemyState, position = enemy.position): GridPosition[] {
  return footprintCellsAt(enemy, position);
}

function enemyPositionFits(combat: CombatState, enemy: EnemyState, position: GridPosition, blocked = new Set<string>()): boolean {
  return footprintCellsAt(enemy, position).every((cell) => isCombatCellAvailable(combat, cell) && !blocked.has(positionKey(cell)));
}

function fallbackEnemyPosition(
  combat: CombatState,
  index: number,
  enemy: EnemyState,
): GridPosition {
  const candidates = getCombatRoomCells(combat).filter((position) => enemyPositionFits(combat, enemy, position));
  return candidates[index % Math.max(1, candidates.length)] ?? { ...ISAAC_DOOR_POSITION };
}

function findAvailableEnemyPosition(combat: CombatState, enemy: EnemyState, preferred: GridPosition, blocked: Set<string>): GridPosition {
  const candidates = getCombatRoomCells(combat)
    .filter((candidate) => enemyPositionFits(combat, enemy, candidate, blocked))
    .sort((left, right) => gridDistance(left, preferred) - gridDistance(right, preferred));
  return candidates[0] ?? fallbackEnemyPosition(combat, 0, enemy);
}

function ensureCombatGrid(run: RunState): void {
  const combat = run.combat;
  if (!combat) return;
  combat.roomLayout ??= { ...DEFAULT_COMBAT_ROOM_LAYOUT };
  const stats = run.player.stats;
  stats.baseDamage ??= 6;
  stats.damageMultiplier ??= 1;
  stats.armor ??= 3;
  stats.baseShield ??= 10;
  stats.heartSize ??= 30;
  stats.maxVitality ??= 5;
  stats.drawCount ??= 7;
  stats.maxRetain ??= 5;
  stats.fireRate ??= 1;
  stats.luck ??= 0;
  stats.critChance ??= .05;
  stats.dodgeChance ??= 0;
  stats.shopDiscount ??= 0;
  stats.movementSpeed ??= 3;
  stats.attackRange ??= 5;
  stats.attackMode ??= 'basic';
  combat.playerPosition ??= { ...ISAAC_DOOR_POSITION };
  combat.deploymentPending ??= false;
  combat.playerDamageMultiplier ??= 1;
  combat.playerFireRateBuff ??= 0;
  combat.playerCritChanceBuff ??= 0;
  combat.playerRangeBuff ??= 0;
  combat.playerMovementBuff ??= 0;
  combat.attackMeter ??= 0;
  combat.usedPassiveItems ??= [];
  const occupied = new Set<string>();
  combat.enemies.forEach((enemy, index) => {
    enemy.movementSpeed ??= enemy.boss ? 2 : 3;
    enemy.attackRange ??= enemy.id === 'pooter' || enemy.id === 'horf' || enemy.id === 'vis' ? 5 : 1;
    enemy.visionRange ??= enemy.boss ? 9 : enemy.attackRange + 3;
    enemy.footprintWidth ??= enemy.boss ? (enemy.id === 'mom' ? 5 : 4) : enemy.elite ? 2 : enemy.id === 'spider' || enemy.id === 'leaper' ? 2 : 1;
    enemy.footprintHeight ??= enemy.boss ? (enemy.id === 'mom' ? 5 : 4) : enemy.elite || enemy.id === 'spider' || enemy.id === 'leaper' ? 2 : 1;
    enemy.movementPattern ??= enemy.id === 'spider' || enemy.id === 'leaper' || enemy.id === 'monstro' || enemy.id === 'fatty' || enemy.id === 'cage'
      ? 'diagonal-jump'
      : 'cardinal';
    enemy.alerted ??= false;
    const preferred = enemy.position ?? fallbackEnemyPosition(combat, index, enemy);
    enemy.position = enemy.hp > 0 && !enemyPositionFits(combat, enemy, preferred, occupied)
      ? findAvailableEnemyPosition(combat, enemy, preferred, occupied)
      : preferred;
    if (enemy.hp > 0) getEnemyOccupiedCells(enemy).forEach((cell) => occupied.add(positionKey(cell)));
  });
  if (!isCombatCellAvailable(combat, combat.playerPosition) || occupied.has(positionKey(combat.playerPosition))) {
    combat.playerPosition = getCombatRoomCells(combat).find((position) => !occupied.has(positionKey(position)))
      ?? { ...ISAAC_DOOR_POSITION };
  }
}

function reachablePositions(combat: CombatState, start: GridPosition, maxSteps: number, blocked: Set<string>): GridPosition[] {
  const queue: Array<{ position: GridPosition; steps: number }> = [{ position: start, steps: 0 }];
  const visited = new Set<string>([positionKey(start)]);
  const reachable: GridPosition[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.steps > 0) reachable.push(current.position);
    if (current.steps >= maxSteps) continue;
    const neighbors = [
      { x: current.position.x + 1, y: current.position.y }, { x: current.position.x - 1, y: current.position.y },
      { x: current.position.x, y: current.position.y + 1 }, { x: current.position.x, y: current.position.y - 1 },
    ];
    for (const position of neighbors) {
      const key = positionKey(position);
      if (!isCombatCellAvailable(combat, position) || blocked.has(key) || visited.has(key)) continue;
      visited.add(key);
      queue.push({ position, steps: current.steps + 1 });
    }
  }
  return reachable;
}

export function getPlayerAttackRange(run: RunState): number {
  return (run.player.stats.attackRange ?? 5) + (run.combat?.playerRangeBuff ?? 0);
}

export function getPlayerMovementSpeed(run: RunState): number {
  return (run.player.stats.movementSpeed ?? 3) + (run.combat?.playerMovementBuff ?? 0);
}

export function playerHasCurvedShots(run: RunState): boolean {
  return (run.combat?.usedPassiveItems ?? []).some((id) =>
    ITEMS[id]?.effects?.some((effect) => effect.curvedShots === true),
  );
}

export function isPositionInPlayerAttackRange(run: RunState, position: GridPosition): boolean {
  return isPositionInPlayerAttackRangeWithFusion(run, position, false);
}

function isPositionInPlayerAttackRangeWithFusion(run: RunState, position: GridPosition, curvedShots: boolean): boolean {
  const origin = run.combat?.playerPosition ?? ISAAC_DOOR_POSITION;
  const range = getPlayerAttackRange(run);
  return playerHasCurvedShots(run) || curvedShots
    ? gridDistance(origin, position) <= range
    : isStraightLineInRange(origin, position, range);
}

export function getReachablePlayerCells(run: RunState): GridPosition[] {
  if (run.phase !== 'combat' || !run.combat || run.combat.vitality < 1) return [];
  const playerPosition = run.combat.playerPosition ?? ISAAC_DOOR_POSITION;
  const blocked = new Set(run.combat.enemies
    .filter((enemy) => enemy.hp > 0)
    .flatMap((enemy) => getEnemyOccupiedCells(enemy))
    .map(positionKey));
  return reachablePositions(run.combat, playerPosition, getPlayerMovementSpeed(run), blocked);
}

export function getPlayerDeploymentCells(run: RunState): GridPosition[] {
  const combat = run.combat;
  if (run.phase !== 'combat' || !combat?.deploymentPending) return [];
  const occupied = new Set(combat.enemies
    .filter((enemy) => enemy.hp > 0)
    .flatMap((enemy) => getEnemyOccupiedCells(enemy))
    .map(positionKey));
  return getCombatRoomCells(combat).filter((position) => !occupied.has(positionKey(position)));
}

export function isEnemyInPlayerRange(run: RunState, enemyId: string): boolean {
  const combat = run.combat;
  if (!combat) return false;
  const enemy = combat.enemies.find((entry) => entry.instanceId === enemyId && entry.hp > 0);
  return Boolean(enemy && getEnemyOccupiedCells(enemy).some((cell) => isPositionInPlayerAttackRange(run, cell)));
}

function enemyDistanceToPosition(enemy: EnemyState, position: GridPosition, anchor = enemy.position): number {
  return Math.min(...footprintCellsAt(enemy, anchor).map((cell) => gridDistance(cell, position)));
}

function enemyChebyshevDistanceToPosition(enemy: EnemyState, position: GridPosition, anchor = enemy.position): number {
  return Math.min(...footprintCellsAt(enemy, anchor).map((cell) => Math.max(
    Math.abs(cell.x - position.x), Math.abs(cell.y - position.y),
  )));
}

function enemyCanAttackPosition(enemy: EnemyState, position: GridPosition, anchor = enemy.position): boolean {
  if (enemy.movementPattern === 'diagonal-jump') {
    return enemyChebyshevDistanceToPosition(enemy, position, anchor) <= enemy.attackRange;
  }
  return footprintCellsAt(enemy, anchor).some((cell) => isStraightLineInRange(cell, position, enemy.attackRange));
}

function enemyCanSeePosition(enemy: EnemyState, position: GridPosition): boolean {
  return enemyChebyshevDistanceToPosition(enemy, position) <= enemy.visionRange;
}

export function isPlayerInEnemyVision(run: RunState, enemyId: string): boolean {
  const combat = run.combat;
  const enemy = combat?.enemies.find((entry) => entry.instanceId === enemyId && entry.hp > 0);
  return Boolean(combat && enemy && enemyCanSeePosition(enemy, combat.playerPosition));
}

export function getEnemyMovementSpeed(enemy: EnemyState): number {
  const movementSpeed = enemy.movementSpeed ?? (enemy.boss ? 2 : 3);
  return enemy.slowedTurns > 0 ? Math.max(1, Math.ceil(movementSpeed / 2)) : movementSpeed;
}

function now(): string {
  return new Date().toISOString();
}

function makeId(prefix: string, run: Pick<RunState, 'rngState'>): string {
  return `${prefix}-${randomInt(run, 100000, 999999)}`;
}

function touch(run: RunState): RunState {
  run.updatedAt = now();
  return run;
}

function itemHasEffect(run: RunState, key: 'revealSecrets' | 'revealAll' | 'guaranteeDeal'): boolean {
  return (run.combat?.usedPassiveItems ?? []).some((id) => ITEMS[id]?.effects?.some((effect) => effect[key] === true));
}

function pushLog(
  combat: CombatState,
  message: string,
  tone: CombatLogEntry['tone'] = 'normal',
  messageKey?: string,
  params?: Record<string, string | number>,
): void {
  const idBase = `${combat.round}-${message}`;
  let id = idBase;
  let duplicate = 1;
  while (combat.log.some((entry) => entry.id === id)) id = `${idBase}-${duplicate++}`;
  combat.log.unshift({ id, message, tone, messageKey, params });
  combat.log = combat.log.slice(0, 8);
}

function pushAnimation(
  combat: CombatState,
  event: Omit<CombatAnimationEvent, 'sequence'>,
): void {
  combat.animationSequence = (combat.animationSequence ?? 0) + 1;
  combat.animationEvents ??= [];
  combat.animationEvents.push({ ...event, sequence: combat.animationSequence });
  combat.animationEvents = combat.animationEvents.slice(-32);
}

export function createRun(seed = `${Date.now()}`, unlockedItemIds = DEFAULT_UNLOCKS): RunState {
  const cleanSeed = seed.trim() || `${Date.now()}`;
  const createdAt = now();
  const run = {
    id: `run-${hashSeed(cleanSeed).toString(36)}-${Date.now().toString(36)}`,
    seed: cleanSeed,
    rngState: hashSeed(cleanSeed),
    version: 1,
    createdAt,
    updatedAt: createdAt,
    phase: 'map',
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
  } satisfies RunState;
  run.player = createIsaac(run);
  makeFloorStartChoice(run);
  return run;
}

export function getAvailableNodes(run: RunState): string[] {
  if (run.phase !== 'map') return [];
  return availableNodeIds(run.floorMap);
}

export function useMapBomb(state: RunState): RunState {
  const run = clone(state);
  if (run.phase !== 'map') throw new Error('A bomb can only search for doors from the map');
  if (run.player.bombs < 1) throw new Error('No bombs available');
  run.floorBombSearches ??= [];
  const current = getMapNode(run.floorMap, run.floorMap.currentNodeId);
  if (run.floorBombSearches.includes(current.id)) throw new Error('This room has already been searched');
  run.player.bombs -= 1;
  run.floorBombSearches.push(current.id);
  const hiddenRoom = run.floorMap.nodes.find((node) =>
    node.optional && node.anchorId === current.id && !node.visited && !node.doorOpened);
  if (hiddenRoom) {
    hiddenRoom.revealed = true;
    hiddenRoom.doorOpened = true;
  }
  run.mapBombResult = {
    currentNodeId: current.id,
    found: Boolean(hiddenRoom),
    roomKind: hiddenRoom?.kind === 'super-secret' ? 'super-secret' : hiddenRoom ? 'secret' : undefined,
  };
  return touch(run);
}

export function getCard(run: RunState, instanceId: string): CardInstance | undefined {
  return run.player.deck.find((card) => card.instanceId === instanceId);
}

export function getCardDefinition(run: RunState, instanceId: string): CardDefinition | undefined {
  const instance = getCard(run, instanceId);
  return instance ? CARDS[instance.definitionId] : undefined;
}

export function getAttackFusionMaterialIds(run: RunState, attackInstanceId: string): string[] {
  const attack = getCardDefinition(run, attackInstanceId);
  if (!run.combat || attack?.type !== 'attack') return [];
  return run.combat.hand.filter((instanceId) => {
    if (instanceId === attackInstanceId) return false;
    const card = getCardDefinition(run, instanceId);
    return Boolean(card?.type === 'item' && card.itemId && ITEMS[card.itemId]?.fusion);
  });
}

export function getAttackFusionPreview(run: RunState, attackInstanceId: string, itemInstanceIds: readonly string[]): AttackFusionPreview | undefined {
  const attack = getCardDefinition(run, attackInstanceId);
  if (!attack || attack.type !== 'attack') return undefined;
  const preview: AttackFusionPreview = {
    totalCost: attack.cost,
    damageMultiplier: 1,
    flatDamage: 0,
    projectileScale: 1,
    knockback: 0,
    poisonTurns: 0,
    poisonDamage: 0,
    slowTurns: 0,
    curvedShots: false,
  };
  for (const instanceId of [...new Set(itemInstanceIds)]) {
    const card = getCardDefinition(run, instanceId);
    const item = card?.type === 'item' && card.itemId ? ITEMS[card.itemId] : undefined;
    if (!card || !item?.fusion) continue;
    preview.damageMultiplier *= item.fusion.damageMultiplier ?? 1;
    preview.flatDamage += item.fusion.flatDamage ?? 0;
    preview.projectileScale *= item.fusion.projectileScale ?? 1;
    preview.knockback += item.fusion.knockback ?? 0;
    preview.poisonTurns = Math.max(preview.poisonTurns, item.fusion.poisonTurns ?? 0);
    preview.poisonDamage = Math.max(preview.poisonDamage, item.fusion.poisonDamage ?? 0);
    preview.slowTurns = Math.max(preview.slowTurns, item.fusion.slowTurns ?? 0);
    preview.curvedShots ||= item.fusion.curvedShots === true;
    if (item.fusion.attackMode) preview.attackMode = item.fusion.attackMode;
  }
  return preview;
}

function unlockedPool(run: RunState, pool: ItemDefinition['pool'][number]): ItemDefinition[] {
  const eligible = Object.values(ITEMS).filter((item) =>
    run.unlocks.includes(item.id) && item.pool.includes(pool) && !run.player.items.includes(item.id));
  if (eligible.length) return eligible;
  return Object.values(ITEMS).filter((item) => run.unlocks.includes(item.id) && item.pool.includes(pool));
}

const ITEM_QUALITY_WEIGHTS: Record<ItemDefinition['quality'], number> = { 1: 12, 2: 7, 3: 3, 4: 1 };

function weightedUnique<T>(run: RunState, values: readonly T[], count: number, weight: (value: T) => number): T[] {
  const remaining = [...values];
  const selected: T[] = [];
  while (remaining.length && selected.length < count) {
    const picked = weightedPick(run, remaining.map((value) => ({ value, weight: weight(value) })));
    selected.push(picked);
    remaining.splice(remaining.indexOf(picked), 1);
  }
  return selected;
}

function pickUniqueItems(run: RunState, pool: ItemDefinition['pool'][number], count: number): ItemDefinition[] {
  return weightedUnique(run, unlockedPool(run, pool), count, (item) => ITEM_QUALITY_WEIGHTS[item.quality]);
}

function itemOptions(run: RunState, pool: ItemDefinition['pool'][number], count: number, price?: number): RewardOption[] {
  return pickUniqueItems(run, pool, count).map((item) => ({
    id: makeId('option', run), type: 'item', itemId: item.id, label: item.name,
    description: item.description, icon: item.icon, price,
  }));
}

function cardOptions(run: RunState, count: number, price?: number): RewardOption[] {
  const pool = Object.values(CARDS).filter((card) =>
    !['skill', 'curse'].includes(card.type) && card.id !== 'basic-attack');
  return weightedUnique(run, pool, count, cardRewardWeight).map((card) => ({
    id: makeId('option', run), type: 'card', cardId: card.id, label: card.name,
    description: card.description, icon: card.icon, price,
  }));
}

function cardRewardWeight(card: CardDefinition): number {
  const item = card.itemId ? ITEMS[card.itemId] : undefined;
  return item ? ITEM_QUALITY_WEIGHTS[item.quality] : (card.rewardWeight ?? 8);
}

function setChoice(run: RunState, choice: ChoiceState): void {
  run.phase = 'choice';
  run.choice = choice;
}

function revealMap(run: RunState): void {
  revealFromCurrent(
    run.floorMap,
    itemHasEffect(run, 'revealSecrets'),
    itemHasEffect(run, 'revealAll'),
  );
}

function returnToMap(run: RunState): void {
  run.phase = 'map';
  run.combat = undefined;
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
  return { id: makeId('option', run), type: 'resource', resource, amount, label, description, icon, price };
}

function floorStartItemOption(run: RunState, predicate: (item: ItemDefinition) => boolean): RewardOption | undefined {
  const candidates = Object.values(ITEMS).filter((item) =>
    run.unlocks.includes(item.id) && !run.player.items.includes(item.id) && predicate(item));
  const item = weightedUnique(run, candidates, 1, (entry) => ITEM_QUALITY_WEIGHTS[entry.quality])[0];
  return item ? {
    id: makeId('floor-item', run), type: 'item', itemId: item.id,
    label: item.name, description: item.description, icon: item.icon,
  } : undefined;
}

function makeFloorStartChoice(run: RunState): void {
  const combatItem = floorStartItemOption(run, itemUsesCombatCard);
  const permanentItem = floorStartItemOption(run, (item) =>
    item.kind === 'passive' && item.combatCard === false && item.pool.includes('large-room'));
  const resource = pickOne(run, ['coins', 'bombs', 'keys'] as const);
  const resourceAmount = resource === 'coins'
    ? randomInt(run, 6 + run.floorIndex, 9 + run.floorIndex)
    : randomInt(run, 2, run.floorIndex >= 3 ? 3 : 2);
  const resourceRewards = {
    coins: resourceOption(run, 'coins', resourceAmount, 'Coin cache', 'Take the loose change.', '¢'),
    bombs: resourceOption(run, 'bombs', resourceAmount, 'Bomb bundle', 'Bombs for future hidden doors.', '●'),
    keys: resourceOption(run, 'keys', resourceAmount, 'Key ring', 'Keys for locked rewards.', '⚿'),
  } satisfies Record<typeof resource, RewardOption>;
  const options = shuffle(run, [combatItem, permanentItem, resourceRewards[resource]]
    .filter((option): option is RewardOption => option !== undefined));
  run.lastReward = [];
  setChoice(run, {
    kind: 'loot', title: 'Floor provisions',
    subtitle: 'Choose one: a reusable item card, a permanent stat item, or an asset pack.',
    options, canSkip: false, next: 'map', rewardContext: 'floor-start',
  });
}

function applyResource(run: RunState, resource: NonNullable<RewardOption['resource']>, amount: number): string {
  switch (resource) {
    case 'coins': run.player.coins += amount; return `${amount}¢`;
    case 'bombs': run.player.bombs += amount; return `${amount} bomb${amount === 1 ? '' : 's'}`;
    case 'keys': run.player.keys += amount; return `${amount} key${amount === 1 ? '' : 's'}`;
    case 'red-heart': {
      const healed = healRed(run.player, run.player.stats.heartSize * amount);
      return `${healed} red-heart HP`;
    }
    case 'soul-heart': addPocketHeart(run, 'soul', amount); return `${amount} soul heart${amount === 1 ? '' : 's'}`;
    case 'black-heart': addPocketHeart(run, 'black', amount); return `${amount} black heart${amount === 1 ? '' : 's'}`;
  }
}

function unlock(run: RunState, itemId: string): void {
  if (run.unlocks.includes(itemId)) return;
  const item = ITEMS[itemId];
  if (!item) return;
  run.unlocks.push(itemId);
  run.unlockNotices.push({ itemId, label: `${item.name} unlocked — ${item.unlock?.label ?? 'new discovery'}` });
}

function checkProgressUnlocks(run: RunState): void {
  if (run.player.coins >= 15) unlock(run, 'steam-sale');
  if (run.floorSecretVisits.includes('secret') && run.floorSecretVisits.includes('super-secret')) unlock(run, 'blue-map');
  if (run.angelFavor >= 2) unlock(run, 'sacred-heart');
}

function roomChoice(run: RunState, kind: ChoiceState['kind'], title: string, subtitle: string, options: RewardOption[], canSkip = true): void {
  setChoice(run, { kind, title, subtitle, options, canSkip, next: 'map' });
}

function resolveNonCombatRoom(run: RunState, kind: RoomKind): void {
  switch (kind) {
    case 'shop': {
      const discount = 1 - run.player.stats.shopDiscount;
      const options = [
        ...itemOptions(run, 'shop', 3).map((option, index) => ({ ...option, price: Math.max(3, Math.round((15 + index * 3) * discount)) })),
        ...cardOptions(run, 2).map((option) => ({ ...option, price: Math.max(2, Math.round(7 * discount)) })),
        resourceOption(run, 'red-heart', 1, 'Full Red Heart', 'Recover one heart container.', '♥', Math.max(1, Math.round(4 * discount))),
        { id: makeId('leave', run), type: 'action', action: 'leave', label: 'Leave shop', description: 'Keep your coins and return to the route.', icon: '↩' } satisfies RewardOption,
      ];
      roomChoice(run, 'shop', 'Shop', `${run.player.coins}¢ in your pocket`, options, true);
      break;
    }
    case 'treasure':
      roomChoice(run, 'item', 'Treasure Room', 'Choose one item. Active items replace the one you hold.', itemOptions(run, 'treasure', 3), false);
      break;
    case 'planetarium':
      roomChoice(run, 'item', 'Planetarium', 'The heavens offer one impossible instrument.', itemOptions(run, 'planetarium', 3), false);
      break;
    case 'curse': {
      const payment = Math.min(15, Math.max(0, run.player.redHp - 1));
      run.player.redHp -= payment;
      run.floorRedDamage += payment;
      roomChoice(run, 'item', 'Curse Room', `The spikes took ${payment} HP. Choose what waited inside.`, itemOptions(run, 'devil', 2), true);
      break;
    }
    case 'sacrifice':
      roomChoice(run, 'sacrifice', 'Sacrifice Room', 'Offer 15 red-heart HP for a soul heart and a Tarot card.', [
        { id: makeId('sacrifice', run), type: 'action', action: 'sacrifice', label: 'Step on the spikes', description: 'Lose 15 red HP; gain a soul heart and a Tarot card.', icon: '♱' },
        { id: makeId('leave', run), type: 'action', action: 'leave', label: 'Walk away', description: 'Return to the map unharmed.', icon: '↩' },
      ], true);
      break;
    case 'secret':
      run.floorSecretVisits.push('secret');
      checkProgressUnlocks(run);
      roomChoice(run, 'loot', 'Secret Room', 'A hollow wall concealed a small cache.', [
        resourceOption(run, 'coins', randomInt(run, 5, 10), 'Coin cache', 'Take the loose change.', '¢'),
        resourceOption(run, 'bombs', 2, 'Bomb bundle', 'Two bombs for future hidden doors.', '●'),
        ...itemOptions(run, 'secret', 1),
      ], false);
      break;
    case 'super-secret':
      run.floorSecretVisits.push('super-secret');
      checkProgressUnlocks(run);
      roomChoice(run, 'loot', 'Super Secret Room', 'Something precious has been waiting here.', [
        resourceOption(run, 'soul-heart', 1, 'Soul Heart', 'Add a 30 HP soul heart.', '♡'),
        resourceOption(run, 'black-heart', 1, 'Black Heart', 'Explodes when emptied.', '🖤'),
        ...itemOptions(run, 'secret', 1),
      ], false);
      break;
    default:
      returnToMap(run);
  }
}

export function enterRoom(state: RunState, nodeId: string): RunState {
  const run = clone(state);
  if (run.phase !== 'map') throw new Error('A room can only be entered from the map');
  if (!availableNodeIds(run.floorMap).includes(nodeId)) throw new Error('That room is not connected to the current route');
  const node = getMapNode(run.floorMap, nodeId);
  if (node.visited) throw new Error('That room has already been cleared');
  if ((node.kind === 'shop' || node.kind === 'treasure') && run.floorIndex > 0) {
    if (run.player.keys < 1) throw new Error('A key is required to open this room');
    run.player.keys -= 1;
  }
  node.visited = true;
  if (!node.optional) run.floorMap.currentNodeId = node.id;
  run.currentRoomId = node.id;
  run.lastReward = [];
  run.mapBombResult = undefined;

  if (node.kind === 'combat' || node.kind === 'elite' || node.kind === 'boss') {
    beginCombat(run, node.kind);
  } else {
    resolveNonCombatRoom(run, node.kind);
  }
  return touch(run);
}

function intentLabel(kind: IntentKind, value: number): string {
  const labels: Record<IntentKind, string> = {
    attack: `Attack ${value}`,
    shield: `Guard ${value}`,
    curse: 'Curse',
    heal: `Recover ${value}`,
    prepare: 'Preparing…',
    summon: `Summon ${value}`,
    idle: 'Staggered',
  };
  return labels[kind];
}

function behaviorFor(enemy: Pick<EnemyDefinition, 'id' | 'elite' | 'boss'>): EnemyBehavior {
  if (enemy.boss) return 'boss';
  if (enemy.elite || ['globin', 'knight', 'fat-bat', 'champion-knight'].includes(enemy.id)) return 'tank';
  if (['horf', 'vis'].includes(enemy.id)) return 'hexer';
  if (['spider', 'charger', 'leaper'].includes(enemy.id)) return 'hunter';
  return 'swarm';
}

function action(kind: IntentKind, value = 0): EnemyAction {
  return { kind, value };
}

function attackValue(enemy: EnemyState, multiplier = 1): number {
  return Math.max(1, Math.round(enemy.attack * multiplier));
}

function shieldValue(run: RunState, multiplier = 1): number {
  return Math.round((7 + run.floorIndex * 2) * multiplier);
}

function healValue(run: RunState, multiplier = 1): number {
  return Math.round((8 + run.floorIndex * 2) * multiplier);
}

function makeIntent(actions: EnemyAction[]): EnemyIntent {
  const primary = actions[0] ?? action('idle');
  return {
    kind: primary.kind,
    value: primary.value,
    label: actions.map((entry) => intentLabel(entry.kind, entry.value)).join(' + '),
    actions,
  };
}

function behaviorPattern(run: RunState, enemy: EnemyState): EnemyAction[][] {
  switch (enemy.behavior) {
    case 'hunter':
      return [
        [action('prepare')],
        [action('attack', attackValue(enemy))],
        [action('attack', attackValue(enemy, 1.2))],
      ];
    case 'hexer':
      return [
        [action('curse')],
        [action('attack', attackValue(enemy))],
        [action('heal', healValue(run))],
        [action('prepare')],
      ];
    case 'tank':
      return [
        [action('shield', shieldValue(run, 1.35))],
        [action('attack', attackValue(enemy))],
        [action('prepare')],
        [action('heal', healValue(run))],
      ];
    case 'boss':
      return [[action('attack', attackValue(enemy)), action('attack', attackValue(enemy, 0.7))]];
    case 'swarm':
    default:
      return [
        [action('attack', attackValue(enemy))],
        [action('prepare')],
        [action('shield', shieldValue(run, 0.5))],
        [action('attack', attackValue(enemy, 1.15))],
      ];
  }
}

function reactionIntent(run: RunState, enemy: EnemyState): EnemyIntent {
  switch (enemy.behavior) {
    case 'hunter':
      return makeIntent([action('prepare')]);
    case 'swarm':
      return makeIntent([action('shield', shieldValue(run, 0.65))]);
    case 'hexer':
      return makeIntent([action('heal', healValue(run, 1.2))]);
    case 'boss':
      return makeIntent([action('heal', healValue(run, 1.35))]);
    case 'tank':
    default:
      return makeIntent([action('shield', shieldValue(run, 1.25))]);
  }
}

function ensureEnemyBehavior(enemy: EnemyState): void {
  enemy.intent ??= { kind: 'idle', value: 0, label: 'Watching' };
  enemy.behavior ??= behaviorFor(enemy);
  enemy.behaviorStep ??= 0;
  enemy.damageTakenThisRound ??= 0;
  enemy.reactionCooldown ??= 0;
  enemy.turnsSinceAttack ??= 0;
  enemy.staggeredTurns ??= 0;
  enemy.poisonTurns ??= 0;
  enemy.poisonDamage ??= 0;
  enemy.slowedTurns ??= 0;
  const intendedActions = enemy.intent.actions?.length
    ? enemy.intent.actions
    : [action(enemy.intent.kind, enemy.intent.value)];
  enemy.intent = makeIntent(intendedActions.slice(0, enemy.boss ? 2 : 1));
}

export function hydrateRunState(state: RunState): RunState {
  const run = clone(state);
  run.floorBombSearches ??= [];
  const legacyCardIds: Record<string, string> = {
    'isaacs-tears': 'basic-attack',
    'wide-tears': 'sweeping-attack',
  };
  run.player.deck.forEach((card) => {
    card.definitionId = legacyCardIds[card.definitionId] ?? card.definitionId;
  });
  if ((run.player.stats.attackMode as string) === 'tears') run.player.stats.attackMode = 'basic';
  run.choice?.options.forEach((option) => {
    if (option.cardId) option.cardId = legacyCardIds[option.cardId] ?? option.cardId;
  });
  if (run.combat) {
    const legacyCombat = run.combat as CombatState & { tearMeter?: number };
    legacyCombat.attackMeter ??= legacyCombat.tearMeter ?? 0;
    delete legacyCombat.tearMeter;
    if ((legacyCombat.attackModeOverride as string | undefined) === 'tears') legacyCombat.attackModeOverride = 'basic';
    (legacyCombat.animationEvents ?? []).forEach((event) => {
      if ((event.attackMode as string | undefined) === 'tears') event.attackMode = 'basic';
    });
    (legacyCombat.log ?? []).forEach((entry) => {
      if (typeof entry.params?.cardId === 'string') entry.params.cardId = legacyCardIds[entry.params.cardId] ?? entry.params.cardId;
      if (entry.params?.mode === 'tears') entry.params.mode = 'basic';
    });
  }
  const retiredCardIds = new Set(Object.values(ITEMS)
    .filter((item) => item.kind === 'passive' && !itemUsesCombatCard(item))
    .map((item) => passiveCardId(item.id)));
  const retiredInstances = new Set(run.player.deck
    .filter((card) => retiredCardIds.has(card.definitionId))
    .map((card) => card.instanceId));
  run.player.deck = run.player.deck.filter((card) => !retiredInstances.has(card.instanceId));
  for (const itemId of run.player.items) {
    const item = ITEMS[itemId];
    if (!item || itemUsesCombatCard(item)) continue;
    for (const effect of item.effects ?? []) {
      if (effect.stat === 'shopDiscount') {
        run.player.stats.shopDiscount = Math.max(run.player.stats.shopDiscount ?? 0, effect.amount ?? 0);
      }
    }
  }
  if (run.combat && retiredInstances.size) {
    run.combat.hand = run.combat.hand.filter((id) => !retiredInstances.has(id));
    run.combat.drawPile = run.combat.drawPile.filter((id) => !retiredInstances.has(id));
    run.combat.discardPile = run.combat.discardPile.filter((id) => !retiredInstances.has(id));
    run.combat.exhausted = run.combat.exhausted.filter((id) => !retiredInstances.has(id));
    retiredInstances.forEach((id) => { delete run.combat!.cooldowns[id]; });
  }
  ensureCombatGrid(run);
  run.combat?.enemies.forEach(ensureEnemyBehavior);
  return run;
}

function rollBossIntent(run: RunState, enemy: EnemyState, canReact: boolean): EnemyIntent {
  const playerPosition = run.combat?.playerPosition ?? ISAAC_DOOR_POSITION;
  const inRange = enemyCanAttackPosition(enemy, playerPosition);
  let patterns: EnemyAction[][];

  if (canReact) {
    enemy.reactionCooldown = 2;
    patterns = inRange
      ? [[action('attack', attackValue(enemy, 1.1)), action('heal', healValue(run, 1.35))]]
      : [[action('heal', healValue(run, 1.35)), action('shield', shieldValue(run, 1.25))]];
  } else if (inRange && enemy.prepared) {
    patterns = [
      [action('attack', attackValue(enemy, 2)), action('attack', attackValue(enemy, 0.7))],
      [action('attack', attackValue(enemy, 2)), action('curse')],
      [action('attack', attackValue(enemy, 2)), action('summon', 1)],
      [action('attack', attackValue(enemy, 2)), action('shield', shieldValue(run))],
    ];
  } else if (inRange) {
    patterns = [
      [action('attack', attackValue(enemy)), action('attack', attackValue(enemy, 0.7))],
      [action('curse'), action('attack', attackValue(enemy))],
      [action('summon', 1), action('attack', attackValue(enemy, 0.9))],
      [action('prepare'), action('attack', attackValue(enemy, 2))],
      [action('attack', attackValue(enemy, 1.15)), action('shield', shieldValue(run))],
      [action('attack', attackValue(enemy)), action('prepare')],
    ];
  } else {
    patterns = [
      [action('summon', 1), action('prepare')],
      [action('curse'), action('shield', shieldValue(run, 1.25))],
      [action('heal', healValue(run, 1.15)), action('summon', 1)],
      [action('prepare'), action('shield', shieldValue(run))],
    ];
  }

  const actions = patterns[enemy.behaviorStep % patterns.length]
    ?? [action('attack', attackValue(enemy)), action('attack', attackValue(enemy, 0.7))];
  enemy.behaviorStep = (enemy.behaviorStep + 1) % patterns.length;
  return makeIntent(actions);
}

function rollIntent(run: RunState, enemy: EnemyState): EnemyIntent {
  ensureEnemyBehavior(enemy);
  const wasCoolingDown = enemy.reactionCooldown > 0;
  enemy.reactionCooldown = Math.max(0, enemy.reactionCooldown - 1);
  const canReact = !wasCoolingDown
    && enemy.damageTakenThisRound >= Math.max(5, Math.round(enemy.maxHp * 0.12))
    && enemy.hp < enemy.maxHp;
  enemy.damageTakenThisRound = 0;
  if (enemy.boss) return rollBossIntent(run, enemy, canReact);
  if (enemy.prepared) return makeIntent([action('attack', attackValue(enemy, 2))]);
  if (enemy.turnsSinceAttack >= 1) return makeIntent([action('attack', attackValue(enemy, 1.15))]);
  if (canReact) {
    enemy.reactionCooldown = 2;
    return reactionIntent(run, enemy);
  }
  const pattern = behaviorPattern(run, enemy);
  const actions = pattern[enemy.behaviorStep % pattern.length] ?? [action('attack', attackValue(enemy))];
  enemy.behaviorStep = (enemy.behaviorStep + 1) % pattern.length;
  return makeIntent(actions);
}

function makeEnemy(run: RunState, definition: EnemyDefinition, index: number, initializeIntent = true): EnemyState {
  const scale = 1 + run.floorIndex * 0.08;
  const enemy: EnemyState = {
    ...definition,
    instanceId: `${definition.id}-${index}-${randomInt(run, 1000, 9999)}`,
    maxHp: Math.round(definition.maxHp * scale),
    hp: Math.round(definition.maxHp * scale),
    shield: 0,
    cursedTurns: 0,
    staggeredTurns: 0,
    poisonTurns: 0,
    poisonDamage: 0,
    slowedTurns: 0,
    prepared: false,
    behavior: behaviorFor(definition),
    behaviorStep: index,
    damageTakenThisRound: 0,
    reactionCooldown: 0,
    turnsSinceAttack: 0,
    alerted: false,
    position: { ...ISAAC_DOOR_POSITION },
    intent: { kind: 'idle', value: 0, label: 'Watching' },
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
  if (roomKind === 'elite') {
    weights.standard *= 0.82;
    weights.large *= 1.25;
    weights.lShape *= 1.2;
  } else if (roomKind === 'boss') {
    const bossGrowth = run.floorIndex / Math.max(1, FLOORS.length - 1);
    weights.standard *= 0.72 - bossGrowth * 0.18;
    weights.wide *= 1.1;
    weights.tall *= 1.05;
    weights.large *= 1.7 + bossGrowth * 0.5;
    weights.lShape *= 1.45 + bossGrowth * 0.35;
  }
  const layout = weightedPick(run, [
    {
      value: { shape: 'standard', width: STANDARD_ROOM_WIDTH, height: STANDARD_ROOM_HEIGHT, unitCount: 1 } as CombatRoomLayout,
      weight: weights.standard,
    },
    {
      value: { shape: 'wide', width: STANDARD_ROOM_WIDTH * 2, height: STANDARD_ROOM_HEIGHT, unitCount: 2 } as CombatRoomLayout,
      weight: weights.wide,
    },
    {
      value: { shape: 'tall', width: STANDARD_ROOM_WIDTH, height: STANDARD_ROOM_HEIGHT * 2, unitCount: 2 } as CombatRoomLayout,
      weight: weights.tall,
    },
    {
      value: { shape: 'large', width: STANDARD_ROOM_WIDTH * 2, height: STANDARD_ROOM_HEIGHT * 2, unitCount: 4 } as CombatRoomLayout,
      weight: weights.large,
    },
    {
      value: { shape: 'l-shaped', width: STANDARD_ROOM_WIDTH * 2, height: STANDARD_ROOM_HEIGHT * 2, unitCount: 3 } as CombatRoomLayout,
      weight: weights.lShape,
    },
  ]);
  const generated = { ...layout };
  if (generated.shape === 'l-shaped') {
    generated.missingQuadrant = pickOne(run, ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const);
  }
  return generated;
}

function roomEnemyCapacity(layout: CombatRoomLayout): number {
  const cellCount = layout.width * layout.height
    - (layout.shape === 'l-shaped' ? STANDARD_ROOM_WIDTH * STANDARD_ROOM_HEIGHT : 0);
  return Math.max(3, Math.floor(cellCount / 50));
}

function encounterDefinitions(run: RunState, roomKind: CombatState['roomKind'], layout: CombatRoomLayout): EnemyDefinition[] {
  const pool = enemyPoolForFloor(run.floorIndex);
  const capacity = roomEnemyCapacity(layout);
  if (roomKind === 'boss') {
    const supportLimit = layout.unitCount >= 3 ? Math.min(2, Math.floor(run.floorIndex / 2)) : 0;
    const supportCount = supportLimit > 0 ? randomInt(run, 0, supportLimit) : 0;
    return [bossForFloor(run.floorIndex), ...Array.from({ length: supportCount }, () => pickOne(run, pool))];
  }
  if (roomKind === 'elite') {
    const minimumSupport = layout.unitCount === 1 ? (run.floorIndex >= 2 ? 1 : 0) : Math.max(1, layout.unitCount - 1);
    const maximumSupport = Math.max(minimumSupport, Math.min(capacity - 1, Math.ceil(capacity * 0.65)));
    const supportCount = randomInt(run, minimumSupport, maximumSupport);
    return [eliteForFloor(run.floorIndex), ...Array.from({ length: supportCount }, () => pickOne(run, pool))];
  }
  const minimum = Math.max(2, Math.ceil(capacity * 0.6));
  const count = randomInt(run, minimum, capacity);
  return Array.from({ length: count }, () => pickOne(run, pool));
}

function positionEnemiesRandomly(run: RunState, combat: CombatState): void {
  const entryPosition = [{ x: 0, y: 4 }, { x: 0, y: 13 }]
    .find((position) => isCombatCellAvailable(combat, position))
    ?? getCombatRoomCells(combat)[0]
    ?? { ...ISAAC_DOOR_POSITION };
  const occupied = new Set<string>([positionKey(entryPosition)]);
  const placementOrder = [...combat.enemies].sort((left, right) => (
    right.footprintWidth * right.footprintHeight - left.footprintWidth * left.footprintHeight
  ));
  for (const enemy of placementOrder) {
    const candidates = getCombatRoomCells(combat)
      .filter((position) => enemyPositionFits(combat, enemy, position, occupied));
    if (!candidates.length) throw new Error(`Room layout cannot fit enemy ${enemy.id}`);
    enemy.position = pickOne(run, candidates);
    getEnemyOccupiedCells(enemy).forEach((cell) => occupied.add(positionKey(cell)));
  }
  occupied.delete(positionKey(entryPosition));
  const deploymentCells = getCombatRoomCells(combat).filter((position) => !occupied.has(positionKey(position)));
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

function beginCombat(run: RunState, roomKind: 'combat' | 'elite' | 'boss'): void {
  const generatedLayout = createCombatRoomLayout(run, roomKind);
  const definitions = encounterDefinitions(run, roomKind, generatedLayout);
  const skills = run.player.deck.filter((card) => CARDS[card.definitionId]?.type === 'skill').map((card) => card.instanceId);
  const others = run.player.deck.filter((card) => CARDS[card.definitionId]?.type !== 'skill').map((card) => card.instanceId);
  const combat: CombatState = {
    roomKind,
    roomLayout: generatedLayout,
    deploymentPending: true,
    round: 1,
    vitality: run.player.stats.maxVitality,
    playerShield: run.player.stats.baseShield,
    playerArmorBuff: 0,
    playerDamageBuff: 0,
    playerDamageMultiplier: 1,
    playerFireRateBuff: 0,
    playerCritChanceBuff: 0,
    playerRangeBuff: 0,
    playerMovementBuff: 0,
    usedPassiveItems: [],
    playerPosition: { ...ISAAC_DOOR_POSITION },
    attackMeter: 0,
    hand: [...skills],
    drawPile: shuffle(run, others),
    discardPile: [],
    exhausted: [],
    cooldowns: Object.fromEntries(skills.map((id) => [id, 0])),
    enemies: [],
    log: [],
    animationSequence: 0,
    animationEvents: [],
    damageTakenThisFloor: 0,
  };
  run.combat = combat;
  combat.enemies = definitions.map((definition, index) => makeEnemy(run, definition, index, false));
  positionEnemiesRandomly(run, combat);
  combat.enemies.forEach((enemy) => { enemy.intent = rollIntent(run, enemy); });
  if (!combat.enemies.some((enemy) => enemy.intent.actions?.some((entry) => entry.kind === 'attack'))) {
    const attacker = combat.enemies.at(-1);
    if (attacker) attacker.intent = makeIntent(attacker.boss
      ? [action('attack', attackValue(attacker)), action('attack', attackValue(attacker, 0.7))]
      : [action('attack', attackValue(attacker))]);
  }
  drawToHand(run, combat);
  pushLog(combat, `Round 1 — ${combat.enemies.map((enemy) => enemy.name).join(', ')} entered the room.`, 'special', 'enter', {
    enemies: combat.enemies.map((enemy) => enemy.id).join('|'),
  });
  run.choice = undefined;
  run.phase = 'combat';
}

function selectedTarget(combat: CombatState, requestedId?: string): EnemyState | undefined {
  const enemyId = requestedId ?? combat.selectedEnemyId;
  return enemyId ? combat.enemies.find((enemy) => enemy.instanceId === enemyId && enemy.hp > 0) : undefined;
}

function hurtEnemy(enemy: EnemyState, rawDamage: number, armorPierce = 0): number {
  ensureEnemyBehavior(enemy);
  enemy.alerted = true;
  const durabilityBefore = enemy.hp + enemy.shield;
  const afterArmor = Math.max(1, Math.round(rawDamage) - Math.max(0, enemy.armor - armorPierce));
  const absorbed = Math.min(enemy.shield, afterArmor);
  enemy.shield -= absorbed;
  const hpDamage = afterArmor - absorbed;
  enemy.hp = Math.max(0, enemy.hp - hpDamage);
  enemy.damageTakenThisRound += Math.max(0, durabilityBefore - enemy.hp - enemy.shield);
  return afterArmor;
}

function attackDamage(run: RunState, combat: CombatState, card: CardDefinition, instance: CardInstance): number {
  const upgraded = instance.upgraded ? 2 : 0;
  const nominal = card.value ?? 6;
  const factor = nominal / 6;
  return Math.max(1, (run.player.stats.baseDamage + combat.playerDamageBuff + upgraded)
    * run.player.stats.damageMultiplier * combat.playerDamageMultiplier * factor);
}

function knockbackEnemy(combat: CombatState, enemy: EnemyState, distance: number): void {
  if (distance <= 0 || enemy.hp <= 0) return;
  const origin = combat.playerPosition;
  const horizontal = Math.abs(enemy.position.x - origin.x) >= Math.abs(enemy.position.y - origin.y);
  const stepX = horizontal ? Math.sign(enemy.position.x - origin.x) : 0;
  const stepY = horizontal ? 0 : Math.sign(enemy.position.y - origin.y);
  if (stepX === 0 && stepY === 0) return;
  const occupied = new Set(combat.enemies
    .filter((entry) => entry.hp > 0 && entry.instanceId !== enemy.instanceId)
    .flatMap((entry) => getEnemyOccupiedCells(entry))
    .map(positionKey));
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
    kind: 'move', sourceId: enemy.instanceId, targetId: enemy.instanceId,
    fromX: from.x, fromY: from.y, toX: destination.x, toY: destination.y,
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
  const modifier = fusion ?? {
    totalCost: card.cost, damageMultiplier: 1, flatDamage: 0, projectileScale: 1,
    knockback: 0, poisonTurns: 0, poisonDamage: 0, slowTurns: 0, curvedShots: false,
  } satisfies AttackFusionPreview;
  const inRange = (enemy: EnemyState) => getEnemyOccupiedCells(enemy)
    .some((cell) => isPositionInPlayerAttackRangeWithFusion(run, cell, modifier.curvedShots));
  let targets = card.target === 'all-enemies'
    ? combat.enemies.filter((enemy) => enemy.hp > 0 && inRange(enemy))
    : [selectedTarget(combat, targetId)].filter((enemy): enemy is EnemyState => Boolean(enemy));
  let multiplier = 1;
  let armorPierce = 0;
  const attackMode = modifier.attackMode ?? combat.attackModeOverride ?? run.player.stats.attackMode;
  if (attackMode === 'knife') { multiplier = 1.6; armorPierce = 3; }
  if (attackMode === 'brimstone') {
    targets = combat.enemies.filter((enemy) => enemy.hp > 0 && inRange(enemy));
    multiplier = 0.85;
  }
  if (attackMode === 'tech-x') {
    targets = combat.enemies.filter((enemy) => enemy.hp > 0 && inRange(enemy));
    targets.forEach((enemy) => { enemy.shield = Math.max(0, enemy.shield - 3); });
  }

  combat.attackMeter += Math.max(0, run.player.stats.fireRate + combat.playerFireRateBuff - 1);
  const echoHits = Math.floor(combat.attackMeter + 0.00001);
  combat.attackMeter -= echoHits;
  const hits = (card.hits ?? 1) + echoHits;
  const base = attackDamage(run, combat, card, instance) * multiplier * modifier.damageMultiplier + modifier.flatDamage;
  let total = 0;
  for (const target of targets) {
    target.alerted = true;
    const wasAlive = target.hp > 0;
    const hpBefore = target.hp;
    const shieldBefore = target.shield;
    let targetTotal = 0;
    let rawTotal = 0;
    for (let hit = 0; hit < hits; hit += 1) {
      const critical = nextRandom(run) < run.player.stats.critChance + combat.playerCritChanceBuff;
      const rawHit = base * (critical ? 2 : 1);
      rawTotal += Math.round(rawHit);
      const dealt = hurtEnemy(target, rawHit, armorPierce);
      total += dealt;
      targetTotal += dealt;
    }
    const hpDamage = hpBefore - target.hp;
    const shieldDamage = shieldBefore - target.shield;
    pushAnimation(combat, {
      kind: 'player-attack', sourceId: 'isaac', targetId: target.instanceId,
      value: hpDamage, secondaryValue: shieldDamage, rawValue: rawTotal,
      armorValue: Math.max(0, rawTotal - targetTotal), hitCount: hits,
      attackMode, projectileScale: modifier.projectileScale,
      poisonTurns: modifier.poisonTurns, slowTurns: modifier.slowTurns,
    });
    if (target.hp > 0 && modifier.poisonTurns > 0) {
      target.poisonTurns = Math.max(target.poisonTurns, modifier.poisonTurns);
      target.poisonDamage = Math.max(target.poisonDamage, modifier.poisonDamage || 3);
    }
    if (target.hp > 0 && modifier.slowTurns > 0) target.slowedTurns = Math.max(target.slowedTurns, modifier.slowTurns);
    if (target.hp > 0) knockbackEnemy(combat, target, modifier.knockback);
    if (wasAlive && target.hp <= 0) pushAnimation(combat, { kind: 'defeat', sourceId: target.instanceId, targetId: target.instanceId });
  }
  const mode = attackMode === 'basic' ? '' : ` ${attackMode}`;
  pushLog(combat, `${card.name} dealt ${total}${mode} damage${echoHits ? ` with ${echoHits} echo hit` : ''}.`, 'good', 'attack', {
    cardId: card.id, damage: total, mode: attackMode === 'basic' ? '' : attackMode, echoCount: echoHits,
  });
  if (fusedItemCount > 0) pushLog(combat, `Fusion attack used ${fusedItemCount} item cards for this attack only at ×${modifier.damageMultiplier.toFixed(2)} power.`, 'special', 'fusionAttack', {
    count: fusedItemCount, multiplier: modifier.damageMultiplier.toFixed(2),
  });
}

function skillChargeRounds(run: RunState, instance: CardInstance): number {
  const item = Object.values(ITEMS).find((entry) => entry.skillCardId === instance.definitionId);
  return Math.max(1, (item?.chargeRounds ?? 3) - (instance.upgraded ? 1 : 0));
}

function playSkill(run: RunState, combat: CombatState, instance: CardInstance): void {
  switch (instance.definitionId) {
    case 'skill-d6': {
      const rerolled = combat.hand
        .filter((id) => id !== instance.instanceId)
        .map((id) => getCard(run, id))
        .filter((card): card is CardInstance => Boolean(card));
      const pool = Object.values(CARDS).filter((card) =>
        !['skill', 'curse'].includes(card.type)
        && (card.type !== 'item' || Boolean(card.itemId && run.unlocks.includes(card.itemId))),
      );
      for (const rerolledCard of rerolled) {
        const candidates = pool.filter((card) => card.id !== rerolledCard.definitionId);
        if (!candidates.length) continue;
        rerolledCard.definitionId = weightedPick(run, candidates.map((card) => ({ value: card, weight: cardRewardWeight(card) }))).id;
        rerolledCard.upgraded = false;
      }
      pushLog(combat, `The D6 rerolled ${rerolled.length} cards.`, 'special', 'reroll', { count: rerolled.length });
      break;
    }
    case 'skill-yum-heart': {
      const healed = healRed(run.player, 15);
      pushAnimation(combat, { kind: 'heal', sourceId: 'isaac', targetId: 'isaac', value: healed });
      pushLog(combat, `Yum Heart recovered ${healed} HP.`, 'good', 'heal', { sourceCardId: instance.definitionId, amount: healed });
      break;
    }
    case 'skill-belial':
      combat.playerDamageBuff += 1;
      pushAnimation(combat, { kind: 'prepare', sourceId: 'isaac', targetId: 'isaac', value: 1 });
      pushLog(combat, 'Book of Belial granted +1 room damage.', 'special', 'belial');
      break;
    case 'skill-shadows':
      combat.playerShield += 12;
      pushAnimation(combat, { kind: 'shield', sourceId: 'isaac', targetId: 'isaac', value: 12 });
      pushLog(combat, 'Book of Shadows granted 12 shield.', 'good', 'shadows');
      break;
    case 'skill-tammy': {
      const damage = (run.player.stats.baseDamage + combat.playerDamageBuff)
        * run.player.stats.damageMultiplier * combat.playerDamageMultiplier;
      combat.enemies.filter((enemy) => enemy.hp > 0).forEach((enemy) => {
        const wasAlive = enemy.hp > 0;
        const dealt = hurtEnemy(enemy, damage);
        pushAnimation(combat, { kind: 'player-attack', sourceId: 'isaac', targetId: enemy.instanceId, value: dealt, attackMode: 'basic' });
        if (wasAlive && enemy.hp <= 0) pushAnimation(combat, { kind: 'defeat', sourceId: enemy.instanceId, targetId: enemy.instanceId });
      });
      pushLog(combat, `Tammy's Head burst for ${Math.round(damage)} damage to all enemies.`, 'good', 'tammy', { damage: Math.round(damage) });
      break;
    }
    case 'skill-nail':
      addPocketHeart(run, 'black');
      combat.playerArmorBuff += 1;
      pushAnimation(combat, { kind: 'shield', sourceId: 'isaac', targetId: 'isaac', value: 1 });
      pushLog(combat, 'The Nail granted a black heart and +1 room armor.', 'special', 'nail');
      break;
    case 'skill-hourglass':
      combat.enemies.filter((enemy) => enemy.hp > 0).forEach((enemy) => {
        ensureEnemyBehavior(enemy);
        enemy.staggeredTurns = Math.max(1, enemy.staggeredTurns ?? 0);
        pushAnimation(combat, { kind: 'curse', sourceId: 'isaac', targetId: enemy.instanceId, value: 1 });
      });
      pushLog(combat, 'Time folds. Every enemy loses its next action.', 'special', 'hourglass');
      break;
    default:
      pushLog(combat, 'The active item fizzled.', 'normal', 'fizzled');
  }
  combat.cooldowns[instance.instanceId] = skillChargeRounds(run, instance);
}

function playPassiveItemCard(run: RunState, combat: CombatState, card: CardDefinition): void {
  const item = card.itemId ? ITEMS[card.itemId] : undefined;
  if (!item || item.kind !== 'passive') return;
  if (!combat.usedPassiveItems.includes(item.id)) combat.usedPassiveItems.push(item.id);
  let shieldGained = 0;
  let healed = 0;
  for (const effect of item.effects ?? []) {
    if (effect.stat === 'baseDamage') combat.playerDamageBuff += effect.amount ?? 0;
    if (effect.stat === 'armor') combat.playerArmorBuff += effect.amount ?? 0;
    if (effect.stat === 'fireRate') combat.playerFireRateBuff += effect.amount ?? 0;
    if (effect.stat === 'damageMultiplier') combat.playerDamageMultiplier *= effect.multiplier ?? 1;
    if (effect.stat === 'critChance') combat.playerCritChanceBuff += effect.amount ?? 0;
    if (effect.stat === 'attackRange') combat.playerRangeBuff += effect.amount ?? 0;
    if (effect.stat === 'movementSpeed') combat.playerMovementBuff += effect.amount ?? 0;
    if (effect.stat === 'drawCount') drawToHand(run, combat, combat.hand.length + Math.max(1, Math.round(effect.amount ?? 1)));
    if (effect.stat === 'baseShield') shieldGained += effect.amount ?? 0;
    if (effect.stat === 'shopDiscount') run.player.coins += 2;
    if (effect.attackMode) combat.attackModeOverride = effect.attackMode;
    if (effect.redContainers) healed += healRed(run.player, 15);
    if (effect.soulHearts) shieldGained += effect.soulHearts * 10;
    if (effect.damageCap !== undefined) combat.damageCap = Math.min(combat.damageCap ?? Number.POSITIVE_INFINITY, effect.damageCap);
  }
  if (shieldGained > 0) {
    combat.playerShield += shieldGained;
    pushAnimation(combat, { kind: 'shield', sourceId: 'isaac', targetId: 'isaac', value: shieldGained });
  }
  if (healed > 0) pushAnimation(combat, { kind: 'heal', sourceId: 'isaac', targetId: 'isaac', value: healed });
  if (item.effects?.some((effect) => effect.revealAll || effect.revealSecrets)) revealMap(run);
  pushLog(combat, `${item.name} activated from the deck.`, 'special', 'passiveUsed', { itemId: item.id });
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
  if (run.phase !== 'combat' || !run.combat) return { ok: false, reason: 'Not in combat' };
  if (!run.combat.hand.includes(attackInstanceId)) return { ok: false, reason: 'Card is not in hand' };
  const attack = getCardDefinition(run, attackInstanceId);
  if (!attack || attack.type !== 'attack') return { ok: false, reason: 'Choose an attack card' };
  if (new Set(itemInstanceIds).size !== itemInstanceIds.length) return { ok: false, reason: 'The same item card cannot be fused twice' };
  for (const instanceId of itemInstanceIds) {
    if (instanceId === attackInstanceId || !run.combat.hand.includes(instanceId)) return { ok: false, reason: 'Fusion card is not in hand' };
    const card = getCardDefinition(run, instanceId);
    const item = card?.type === 'item' && card.itemId ? ITEMS[card.itemId] : undefined;
    if (!item?.fusion) return { ok: false, reason: 'That item card cannot enhance an attack' };
  }
  const preview = getAttackFusionPreview(run, attackInstanceId, itemInstanceIds)!;
  if (run.combat.vitality < preview.totalCost) return { ok: false, reason: 'Not enough vitality for this fusion' };
  const inRange = (enemy: EnemyState) => enemy.hp > 0
    && getEnemyOccupiedCells(enemy).some((cell) => isPositionInPlayerAttackRangeWithFusion(run, cell, preview.curvedShots));
  if (targetId === undefined) {
    if (!run.combat.enemies.some(inRange)) return { ok: false, reason: 'Target is outside attack range' };
  } else {
    const target = selectedTarget(run.combat, targetId);
    if (!target) return { ok: false, reason: 'Choose an enemy target' };
    if (!inRange(target)) return { ok: false, reason: 'Target is outside attack range' };
  }
  return { ok: true };
}

export function canPlayCard(run: RunState, instanceId: string, targetId?: string): { ok: boolean; reason?: string } {
  if (run.phase !== 'combat' || !run.combat) return { ok: false, reason: 'Not in combat' };
  if (!run.combat.hand.includes(instanceId)) return { ok: false, reason: 'Card is not in hand' };
  const instance = getCard(run, instanceId);
  const card = instance ? CARDS[instance.definitionId] : undefined;
  if (!instance || !card) return { ok: false, reason: 'Unknown card' };
  if (card.type === 'curse') return { ok: false, reason: 'Curse cards are unplayable' };
  if (run.combat.vitality < card.cost) return { ok: false, reason: 'Not enough vitality' };
  if (card.type === 'skill' && (run.combat.cooldowns[instanceId] ?? 0) > 0) return { ok: false, reason: 'Active item is recharging' };
  if (card.type === 'attack' || card.type === 'hex') {
    if (card.target === 'all-enemies') {
      const hasTargetInRange = run.combat.enemies.some((enemy) => enemy.hp > 0 && isEnemyInPlayerRange(run, enemy.instanceId));
      if (!hasTargetInRange) return { ok: false, reason: 'Target is outside attack range' };
    } else if (targetId === undefined) {
      const hasTargetInRange = run.combat.enemies.some((enemy) => enemy.hp > 0 && isEnemyInPlayerRange(run, enemy.instanceId));
      if (!hasTargetInRange) return { ok: false, reason: 'Target is outside attack range' };
    } else {
      const target = selectedTarget(run.combat, targetId);
      if (!target) return { ok: false, reason: 'Choose an enemy target' };
      if (!isEnemyInPlayerRange(run, target.instanceId)) return { ok: false, reason: 'Target is outside attack range' };
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
  if (pendingAttack.target === 'enemy' && targetId === undefined) throw new Error('Choose an enemy target');

  const run = clone(state);
  const combat = run.combat!;
  const attackInstance = getCard(run, attackInstanceId)!;
  const attack = CARDS[attackInstance.definitionId]!;
  const preview = getAttackFusionPreview(run, attackInstanceId, itemInstanceIds)!;
  if (targetId) combat.selectedEnemyId = targetId;
  combat.vitality -= preview.totalCost;
  pushAnimation(combat, { kind: 'card-play', sourceId: 'isaac', cardId: attack.id, value: attack.cost });
  for (const itemInstanceId of itemInstanceIds) {
    const itemCard = getCardDefinition(run, itemInstanceId)!;
    pushAnimation(combat, { kind: 'card-play', sourceId: 'isaac', cardId: itemCard.id, value: 0 });
  }
  playAttack(run, combat, attack, attackInstance, targetId, preview, itemInstanceIds.length);

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
  if (allEnemiesDefeated(combat)) finishCombat(run);
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
  if (run.phase !== 'combat' || !run.combat?.deploymentPending) throw new Error('Player deployment is not active');
  const destination = { x, y };
  if (!getPlayerDeploymentCells(run).some((position) => position.x === x && position.y === y)) {
    throw new Error('That grid cell is outside the deployment zone');
  }
  const from = { ...run.combat.playerPosition };
  run.combat.playerPosition = destination;
  run.combat.selectedEnemyId = undefined;
  pushAnimation(run.combat, {
    kind: 'move', sourceId: 'isaac', targetId: 'isaac', fromX: from.x, fromY: from.y, toX: x, toY: y,
  });
  return touch(run);
}

export function confirmPlayerDeployment(state: RunState): RunState {
  const run = clone(state);
  if (run.phase !== 'combat' || !run.combat?.deploymentPending) throw new Error('Player deployment is not active');
  run.combat.deploymentPending = false;
  run.combat.enemies.filter((enemy) => enemy.hp > 0 && enemy.boss).forEach((enemy) => {
    enemy.intent = rollIntent(run, enemy);
  });
  pushAnimation(run.combat, { kind: 'round-start', sourceId: 'isaac', value: run.combat.round });
  pushLog(run.combat, `Isaac deployed at (${run.combat.playerPosition.x}, ${run.combat.playerPosition.y}).`, 'special', 'deploymentConfirmed', {
    x: run.combat.playerPosition.x, y: run.combat.playerPosition.y,
  });
  return touch(run);
}

export function movePlayer(state: RunState, x: number, y: number): RunState {
  const run = clone(state);
  if (run.phase !== 'combat' || !run.combat) throw new Error('Not in combat');
  ensureCombatGrid(run);
  const destination = { x, y };
  if (!getReachablePlayerCells(run).some((position) => position.x === x && position.y === y)) {
    throw new Error('That grid cell is outside movement range');
  }
  const from = { ...run.combat.playerPosition };
  run.combat.playerPosition = destination;
  run.combat.vitality -= 1;
  pushAnimation(run.combat, {
    kind: 'move', sourceId: 'isaac', targetId: 'isaac', fromX: from.x, fromY: from.y, toX: x, toY: y,
  });
  pushLog(run.combat, `Isaac moved from (${from.x}, ${from.y}) to (${x}, ${y}).`, 'normal', 'playerMoved', {
    fromX: from.x, fromY: from.y, x, y,
  });
  return touch(run);
}

export function useCombatBomb(state: RunState, x: number, y: number): RunState {
  const run = clone(state);
  if (run.phase !== 'combat' || !run.combat) throw new Error('Not in combat');
  if (run.combat.deploymentPending) throw new Error('Confirm deployment before using a bomb');
  if (run.player.bombs < 1) throw new Error('No bombs available');
  const center = { x, y };
  if (!isCombatCellAvailable(run.combat, center)) throw new Error('That grid cell cannot hold a bomb');
  run.player.bombs -= 1;
  run.combat.selectedEnemyId = undefined;
  const blastCells = new Set<string>();
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const cell = { x: x + offsetX, y: y + offsetY };
      if (isCombatCellAvailable(run.combat, cell)) blastCells.add(positionKey(cell));
    }
  }
  pushAnimation(run.combat, { kind: 'bomb-blast', sourceId: 'isaac', toX: x, toY: y, value: 50 });
  let totalDamage = 0;
  let hitEnemies = 0;
  for (const enemy of run.combat.enemies.filter((entry) => entry.hp > 0)) {
    const coveredCells = getEnemyOccupiedCells(enemy).filter((cell) => blastCells.has(positionKey(cell)));
    if (!coveredCells.length) continue;
    hitEnemies += 1;
    const wasAlive = enemy.hp > 0;
    const hpBefore = enemy.hp;
    const shieldBefore = enemy.shield;
    let afterArmorTotal = 0;
    for (const _cell of coveredCells) afterArmorTotal += hurtEnemy(enemy, 50);
    const hpDamage = hpBefore - enemy.hp;
    const shieldDamage = shieldBefore - enemy.shield;
    const durabilityDamage = hpDamage + shieldDamage;
    const rawDamage = coveredCells.length * 50;
    totalDamage += durabilityDamage;
    pushAnimation(run.combat, {
      kind: 'bomb-hit', sourceId: 'isaac', targetId: enemy.instanceId,
      value: hpDamage, secondaryValue: shieldDamage, rawValue: rawDamage,
      armorValue: Math.max(0, rawDamage - afterArmorTotal), hitCount: coveredCells.length,
    });
    if (wasAlive && enemy.hp <= 0) {
      pushAnimation(run.combat, { kind: 'defeat', sourceId: enemy.instanceId, targetId: enemy.instanceId });
    }
  }
  pushLog(run.combat, `Bomb hit ${hitEnemies} enemies for ${totalDamage} damage at (${x}, ${y}).`, 'special', 'bombBlast', {
    enemies: hitEnemies, damage: totalDamage, x, y,
  });
  if (allEnemiesDefeated(run.combat)) finishCombat(run);
  return touch(run);
}

export function playCard(state: RunState, instanceId: string, targetId?: string): RunState {
  if (getCardDefinition(state, instanceId)?.type === 'attack') {
    return playFusedAttack(state, instanceId, [], targetId);
  }
  const playable = canPlayCard(state, instanceId, targetId);
  if (!playable.ok) throw new Error(playable.reason);
  const pendingInstance = getCard(state, instanceId);
  const pendingCard = pendingInstance ? CARDS[pendingInstance.definitionId] : undefined;
  if (pendingCard?.target === 'enemy' && ['attack', 'hex'].includes(pendingCard.type) && targetId === undefined) {
    throw new Error('Choose an enemy target');
  }
  const run = clone(state);
  const combat = run.combat!;
  const instance = getCard(run, instanceId)!;
  const card = CARDS[instance.definitionId]!;
  if (targetId) combat.selectedEnemyId = targetId;
  combat.vitality -= card.cost;
  pushAnimation(combat, { kind: 'card-play', sourceId: 'isaac', cardId: card.id, value: card.cost });

  if (card.type === 'shield') {
    const amount = (card.value ?? 5) + (instance.upgraded ? 3 : 0);
    combat.playerShield += amount;
    pushAnimation(combat, { kind: 'shield', sourceId: 'isaac', targetId: 'isaac', value: amount });
    pushLog(combat, `${card.name} granted ${amount} shield.`, 'good', 'shield', { sourceCardId: card.id, amount });
  }
  if (card.type === 'recovery') {
    const amount = (card.value ?? 10) + (instance.upgraded ? 5 : 0);
    const healed = healRed(run.player, amount);
    pushAnimation(combat, { kind: 'heal', sourceId: 'isaac', targetId: 'isaac', value: healed });
    pushLog(combat, `${card.name} recovered ${healed} HP.`, 'good', 'heal', { sourceCardId: card.id, amount: healed });
  }
  if (card.type === 'hex') {
    const target = selectedTarget(combat, targetId);
    if (target) {
      target.cursedTurns += (card.value ?? 1) + (instance.upgraded ? 1 : 0);
      pushAnimation(combat, { kind: 'curse', sourceId: 'isaac', targetId: target.instanceId, value: target.cursedTurns });
      pushLog(combat, `${target.name} was cursed.`, 'special', 'cursed', { enemyId: target.id, enemy: target.name });
    }
  }
  if (card.type === 'tarot') {
    if (card.id === 'the-empress') combat.playerDamageBuff += (card.value ?? 3);
    if (card.id === 'death' || card.id === 'the-sun') {
      combat.enemies.filter((enemy) => enemy.hp > 0).forEach((enemy) => {
        const wasAlive = enemy.hp > 0;
        const dealt = hurtEnemy(enemy, card.value ?? 25, 99);
        pushAnimation(combat, { kind: 'player-attack', sourceId: 'isaac', targetId: enemy.instanceId, value: dealt, attackMode: card.id === 'death' ? 'knife' : 'brimstone' });
        if (wasAlive && enemy.hp <= 0) pushAnimation(combat, { kind: 'defeat', sourceId: enemy.instanceId, targetId: enemy.instanceId });
      });
      if (card.id === 'the-sun') {
        const healed = healRed(run.player, 10);
        pushAnimation(combat, { kind: 'heal', sourceId: 'isaac', targetId: 'isaac', value: healed });
      }
      pushLog(combat, `${card.name} consumed in a burst of power.`, 'special', 'tarot', { cardId: card.id });
    }
  }
  if (card.type === 'skill') playSkill(run, combat, instance);
  if (card.type === 'item') playPassiveItemCard(run, combat, card);

  if (card.type !== 'skill') {
    combat.hand = combat.hand.filter((id) => id !== instanceId);
    if (card.exhaust) {
      combat.exhausted.push(instanceId);
      run.player.deck = run.player.deck.filter((entry) => entry.instanceId !== instanceId);
    } else {
      combat.discardPile.push(instanceId);
    }
  }
  if (allEnemiesDefeated(combat)) finishCombat(run);
  return touch(run);
}

export function endTurn(state: RunState): RunState {
  const run = clone(state);
  if (run.phase !== 'combat' || !run.combat) throw new Error('Not in combat');
  run.phase = 'discard';
  pushAnimation(run.combat, { kind: 'discard-phase', sourceId: 'isaac', value: run.player.stats.maxRetain });
  pushLog(run.combat, `Choose any cards to discard, then retain no more than ${run.player.stats.maxRetain}.`, 'normal', 'discard', { count: run.player.stats.maxRetain });
  return touch(run);
}

export function discardCard(state: RunState, instanceId: string): RunState {
  const run = clone(state);
  if (run.phase !== 'discard' || !run.combat) throw new Error('Not choosing discards');
  const instance = getCard(run, instanceId);
  if (!instance) throw new Error('Unknown card');
  const definition = CARDS[instance.definitionId];
  if (!run.combat.hand.includes(instanceId)) throw new Error('Card is not in hand');
  run.combat.hand = run.combat.hand.filter((id) => id !== instanceId);
  if (definition?.type === 'skill') {
    const item = Object.values(ITEMS).find((entry) => entry.skillCardId === instance.definitionId);
    run.combat.exhausted.push(instanceId);
    run.player.deck = run.player.deck.filter((card) => card.instanceId !== instanceId);
    if (item) {
      run.player.items = run.player.items.filter((id) => id !== item.id);
      if (run.player.activeItemId === item.id) run.player.activeItemId = undefined;
    }
    delete run.combat.cooldowns[instanceId];
    pushLog(run.combat, `${item?.name ?? definition.name} was discarded and is gone.`, 'danger', 'activeDiscarded', {
      itemId: item?.id ?? '', cardId: definition.id,
    });
  } else {
    run.combat.discardPile.push(instanceId);
  }
  pushAnimation(run.combat, { kind: 'card-discard', sourceId: 'isaac', cardId: instance.definitionId });
  return touch(run);
}

export function finishDiscard(state: RunState): RunState {
  const run = clone(state);
  if (run.phase !== 'discard' || !run.combat) throw new Error('Not choosing discards');
  if (run.combat.hand.length > run.player.stats.maxRetain) throw new Error(`Retain no more than ${run.player.stats.maxRetain} cards`);
  pushAnimation(run.combat, { kind: 'enemy-phase', sourceId: 'isaac', value: run.combat.round });
  resolveEnemyTurn(run);
  return touch(run);
}

function addCurseCard(run: RunState, combat: CombatState): void {
  const curse = createCard(run, 'dead-weight');
  run.player.deck.push(curse);
  combat.discardPile.push(curse.instanceId);
  pushLog(combat, 'A Dead Weight curse was added to your deck.', 'danger', 'deadWeight');
}

function blackHeartBurst(combat: CombatState): void {
  pushAnimation(combat, { kind: 'black-heart', sourceId: 'isaac', targetId: 'isaac', value: 100 });
  for (const enemy of combat.enemies.filter((entry) => entry.hp > 0)) {
    const wasAlive = enemy.hp > 0;
    if (enemy.elite || enemy.boss) enemy.hp = Math.max(0, enemy.hp - 100);
    else enemy.hp = 0;
    if (wasAlive && enemy.hp <= 0) pushAnimation(combat, { kind: 'defeat', sourceId: enemy.instanceId, targetId: enemy.instanceId });
  }
  pushLog(combat, 'A black heart shattered: normal enemies died and champions took 100 damage!', 'special', 'blackBurst');
}

function hurtPlayer(run: RunState, combat: CombatState, raw: number, source?: EnemyState): number {
  if (nextRandom(run) < run.player.stats.dodgeChance) {
    if (source) pushAnimation(combat, { kind: 'enemy-attack', sourceId: source.instanceId, targetId: 'isaac', value: 0, secondaryValue: 0 });
    pushLog(combat, 'Isaac slipped past the attack.', 'good', 'dodge');
    return 0;
  }
  const cap = combat.damageCap;
  const capped = cap === undefined ? raw : Math.min(raw, cap);
  const rounded = Math.round(capped);
  const totalArmor = run.player.stats.armor + combat.playerArmorBuff;
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
      if (heart.kind === 'black') blackHeartBurst(combat);
    }
  }
  const redDamage = Math.min(run.player.redHp, damage);
  run.player.redHp -= redDamage;
  run.floorRedDamage += redDamage;
  combat.damageTakenThisFloor += Math.max(0, initial - shielded);
  const heartDamage = Math.max(0, initial - shielded);
  if (source) {
    pushAnimation(combat, {
      kind: 'enemy-attack', sourceId: source.instanceId, targetId: 'isaac', value: heartDamage,
      secondaryValue: shielded, rawValue: rounded, armorValue: armorBlocked,
    });
    pushLog(combat, `${source.name} attacked Isaac for ${heartDamage} heart damage (${shielded} blocked by shield).`, 'danger', 'enemyAttack', {
      enemyId: source.id, enemy: source.name, damage: heartDamage, shield: shielded,
    });
  } else {
    pushLog(combat, `Isaac took ${heartDamage} heart damage (${shielded} blocked by shield).`, 'danger', 'playerHit', {
      damage: heartDamage, shield: shielded,
    });
  }
  return heartDamage;
}

function cursedActions(enemy: EnemyState, actions: EnemyAction[]): EnemyAction[] {
  const intendedAttacks = actions.filter((entry) => entry.kind === 'attack');
  const count = enemy.boss ? 2 : 1;
  return Array.from({ length: count }, (_, index) => {
    const raw = intendedAttacks[index]?.value ?? intendedAttacks[0]?.value ?? enemy.attack;
    return action('attack', Math.max(1, Math.round(raw * 0.6)));
  });
}

function reachableEnemyPositions(combat: CombatState, enemy: EnemyState): GridPosition[] {
  const blocked = new Set(combat.enemies
    .filter((entry) => entry.hp > 0 && entry.instanceId !== enemy.instanceId)
    .flatMap((entry) => getEnemyOccupiedCells(entry))
    .map(positionKey));
  blocked.add(positionKey(combat.playerPosition));
  const diagonal = enemy.movementPattern === 'diagonal-jump';
  const directions = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    ...(diagonal ? [{ x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }] : []),
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

function moveEnemyTo(combat: CombatState, enemy: EnemyState, destination: GridPosition, wandering = false): boolean {
  if (destination.x === enemy.position.x && destination.y === enemy.position.y) return false;
  const from = { ...enemy.position };
  enemy.position = destination;
  pushAnimation(combat, {
    kind: 'move', sourceId: enemy.instanceId, targetId: enemy.instanceId,
    fromX: from.x, fromY: from.y, toX: destination.x, toY: destination.y,
    movementStyle: wandering ? 'wander' : enemy.movementPattern === 'diagonal-jump' ? 'jump' : 'walk',
  });
  pushLog(
    combat,
    wandering
      ? `${enemy.name} wandered to (${destination.x}, ${destination.y}) while Isaac was out of sight.`
      : `${enemy.name} moved to (${destination.x}, ${destination.y}).`,
    'normal',
    wandering ? 'enemyWandered' : 'enemyMoved',
    { enemyId: enemy.id, enemy: enemy.name, x: destination.x, y: destination.y },
  );
  return true;
}

function moveEnemyRandomly(run: RunState, combat: CombatState, enemy: EnemyState): boolean {
  const destinations = reachableEnemyPositions(combat, enemy);
  if (!destinations.length || nextRandom(run) < 0.2) {
    pushAnimation(combat, { kind: 'idle', sourceId: enemy.instanceId, targetId: enemy.instanceId });
    pushLog(combat, `${enemy.name} listened in the dark and stayed put.`, 'normal', 'enemyWanderIdle', {
      enemyId: enemy.id, enemy: enemy.name,
    });
    return false;
  }
  return moveEnemyTo(combat, enemy, pickOne(run, destinations), true);
}

function moveEnemyTowardPlayer(combat: CombatState, enemy: EnemyState): boolean {
  const playerPosition = combat.playerPosition;
  if (enemyCanAttackPosition(enemy, playerPosition)) return false;
  const destination = reachableEnemyPositions(combat, enemy)
    .sort((left, right) => {
      const leftCanAttack = enemyCanAttackPosition(enemy, playerPosition, left) ? 0 : 1;
      const rightCanAttack = enemyCanAttackPosition(enemy, playerPosition, right) ? 0 : 1;
      if (leftCanAttack !== rightCanAttack) return leftCanAttack - rightCanAttack;
      const leftAlignment = enemy.movementPattern === 'diagonal-jump'
        ? enemyChebyshevDistanceToPosition(enemy, playerPosition, left)
        : Math.min(Math.abs(left.x - playerPosition.x), Math.abs(left.y - playerPosition.y));
      const rightAlignment = enemy.movementPattern === 'diagonal-jump'
        ? enemyChebyshevDistanceToPosition(enemy, playerPosition, right)
        : Math.min(Math.abs(right.x - playerPosition.x), Math.abs(right.y - playerPosition.y));
      return leftAlignment - rightAlignment || gridDistance(left, playerPosition) - gridDistance(right, playerPosition);
    })[0];
  if (!destination || enemyDistanceToPosition(enemy, playerPosition, destination) >= enemyDistanceToPosition(enemy, playerPosition)) return false;
  return moveEnemyTo(combat, enemy, destination);
}

function resolveEnemyAction(run: RunState, combat: CombatState, enemy: EnemyState, enemyAction: EnemyAction): void {
  switch (enemyAction.kind) {
    case 'attack': {
      if (enemyCanAttackPosition(enemy, combat.playerPosition)) {
        hurtPlayer(run, combat, enemyAction.value, enemy);
        enemy.prepared = false;
      } else {
        pushAnimation(combat, { kind: 'idle', sourceId: enemy.instanceId, targetId: enemy.instanceId });
        pushLog(combat, `${enemy.name} is still outside attack range.`, 'normal', 'enemyOutOfRange', {
          enemyId: enemy.id, enemy: enemy.name,
        });
      }
      break;
    }
    case 'shield':
      enemy.shield += enemyAction.value;
      pushAnimation(combat, { kind: 'shield', sourceId: enemy.instanceId, targetId: enemy.instanceId, value: enemyAction.value });
      pushLog(combat, `${enemy.name} gained ${enemyAction.value} shield.`, 'normal', 'enemyShield', { enemyId: enemy.id, enemy: enemy.name, amount: enemyAction.value });
      break;
    case 'curse':
      pushAnimation(combat, { kind: 'curse', sourceId: enemy.instanceId, targetId: 'isaac', value: 1 });
      addCurseCard(run, combat);
      break;
    case 'heal': {
      const allies = combat.enemies.filter((entry) => entry.hp > 0);
      const target = allies.reduce((lowest, entry) => entry.hp < lowest.hp ? entry : lowest, allies[0]!);
      const healed = Math.min(enemyAction.value, target.maxHp - target.hp);
      target.hp += healed;
      pushAnimation(combat, { kind: 'heal', sourceId: enemy.instanceId, targetId: target.instanceId, value: healed });
      pushLog(combat, `${enemy.name} restored ${healed} HP to ${target.name}.`, 'normal', 'enemyHeal', {
        enemyId: enemy.id, enemy: enemy.name, amount: healed, targetId: target.id, target: target.name,
      });
      break;
    }
    case 'prepare':
      enemy.prepared = true;
      pushAnimation(combat, { kind: 'prepare', sourceId: enemy.instanceId, targetId: enemy.instanceId, value: enemy.attack * 2 });
      pushLog(combat, `${enemy.name} prepares a doubled attack!`, 'danger', 'prepare', { enemyId: enemy.id, enemy: enemy.name });
      break;
    case 'summon': {
      const livingMinions = combat.enemies.filter((entry) => entry.hp > 0 && !entry.boss).length;
      const summonCount = Math.max(0, Math.min(enemyAction.value || 1, 3 - livingMinions));
      if (summonCount <= 0) {
        pushAnimation(combat, { kind: 'idle', sourceId: enemy.instanceId, targetId: enemy.instanceId });
        pushLog(combat, `${enemy.name}'s call went unanswered.`, 'normal', 'bossSummonBlocked', {
          enemyId: enemy.id, enemy: enemy.name,
        });
        break;
      }
      const pool = enemyPoolForFloor(run.floorIndex).filter((definition) => !definition.boss && !definition.elite);
      for (let index = 0; index < summonCount; index += 1) {
        const summoned = makeEnemy(run, pickOne(run, pool), combat.enemies.length + index);
        summoned.alerted = true;
        combat.enemies.push(summoned);
        pushAnimation(combat, {
          kind: 'summon', sourceId: enemy.instanceId, targetId: summoned.instanceId, value: 1,
        });
      }
      ensureCombatGrid(run);
      pushLog(combat, `${enemy.name} summoned ${summonCount} minion.`, 'danger', 'bossSummon', {
        enemyId: enemy.id, enemy: enemy.name, count: summonCount,
      });
      break;
    }
    case 'idle':
      pushAnimation(combat, { kind: 'idle', sourceId: enemy.instanceId, targetId: enemy.instanceId });
      pushLog(combat, `${enemy.name} hesitates.`, 'normal', 'hesitate', { enemyId: enemy.id, enemy: enemy.name });
      break;
  }
}

function resolveEnemyTurn(run: RunState): void {
  const combat = run.combat!;
  ensureCombatGrid(run);
  run.phase = 'combat';
  for (const enemy of combat.enemies.filter((entry) => entry.hp > 0)) {
    if (enemy.hp <= 0) continue;
    ensureEnemyBehavior(enemy);
    if (enemy.poisonTurns > 0) {
      const wasAlive = enemy.hp > 0;
      const dealt = hurtEnemy(enemy, enemy.poisonDamage || 3, 99);
      enemy.poisonTurns -= 1;
      pushAnimation(combat, { kind: 'poison', sourceId: 'isaac', targetId: enemy.instanceId, value: dealt, poisonTurns: enemy.poisonTurns });
      pushLog(combat, `${enemy.name} took ${dealt} poison damage.`, 'good', 'enemyPoisoned', {
        enemyId: enemy.id, enemy: enemy.name, damage: dealt, turns: enemy.poisonTurns,
      });
      if (wasAlive && enemy.hp <= 0) {
        pushAnimation(combat, { kind: 'defeat', sourceId: enemy.instanceId, targetId: enemy.instanceId });
        continue;
      }
    }
    if (enemy.staggeredTurns > 0) {
      enemy.staggeredTurns -= 1;
      enemy.turnsSinceAttack += 1;
      pushAnimation(combat, { kind: 'idle', sourceId: enemy.instanceId, targetId: enemy.instanceId });
      pushLog(combat, `${enemy.name} is staggered and loses its action.`, 'good', 'enemyStaggered', { enemyId: enemy.id, enemy: enemy.name });
    } else {
      const roaming = !enemy.alerted && !enemyCanSeePosition(enemy, combat.playerPosition);
      if (roaming) moveEnemyRandomly(run, combat, enemy);
      else moveEnemyTowardPlayer(combat, enemy);
      const actionLimit = enemy.boss ? 2 : 1;
      const rolledActions = (enemy.intent.actions?.length
        ? enemy.intent.actions
        : [action(enemy.intent.kind, enemy.intent.value)]).slice(0, actionLimit);
      const intendedActions = rolledActions.map((rolledAction) => (
        roaming && (rolledAction.kind === 'attack' || rolledAction.kind === 'curse')
          ? action('idle', 0)
          : rolledAction
      ));
      const weakened = enemy.cursedTurns > 0 && !roaming;
      if (roaming && enemy.cursedTurns > 0) enemy.cursedTurns -= 1;
      const enemyActions = weakened ? cursedActions(enemy, intendedActions) : intendedActions;
      if (weakened) {
        enemy.cursedTurns -= 1;
        pushLog(combat, `${enemy.name}'s curse suppresses its special action and weakens its attack.`, 'good', 'enemyWeakened', {
          enemyId: enemy.id, enemy: enemy.name, damage: enemyActions[0]?.value ?? 0,
        });
      }
      let attacked = false;
      for (const enemyAction of enemyActions) {
        if (run.player.redHp <= 0) break;
        resolveEnemyAction(run, combat, enemy, enemyAction);
        attacked ||= enemyAction.kind === 'attack';
      }
      enemy.turnsSinceAttack = attacked ? 0 : enemy.turnsSinceAttack + 1;
    }
    if (enemy.slowedTurns > 0) enemy.slowedTurns -= 1;
    if (run.player.redHp <= 0) break;
  }

  if (allEnemiesDefeated(combat)) {
    finishCombat(run);
    return;
  }
  if (run.player.redHp <= 0) {
    run.phase = 'defeat';
    run.victory = false;
    run.combat = combat;
    return;
  }

  combat.round += 1;
  combat.vitality = run.player.stats.maxVitality;
  for (const key of Object.keys(combat.cooldowns)) {
    combat.cooldowns[key] = Math.max(0, (combat.cooldowns[key] ?? 0) - 1);
  }
  combat.enemies.filter((enemy) => enemy.hp > 0).forEach((enemy) => { enemy.intent = rollIntent(run, enemy); });
  drawToHand(run, combat);
  if (!combat.enemies.some((enemy) => enemy.hp > 0 && enemy.instanceId === combat.selectedEnemyId)) {
    combat.selectedEnemyId = undefined;
  }
  pushAnimation(combat, { kind: 'round-start', sourceId: 'isaac', value: combat.round });
  pushLog(combat, `Round ${combat.round} — vitality restored to ${combat.vitality}.`, 'special', 'nextRound', { round: combat.round, vitality: combat.vitality });
}

function rollLoot(run: RunState): string {
  const resource = weightedPick(run, [
    { value: 'coins' as const, weight: 42 + run.player.stats.luck * 2 },
    { value: 'bombs' as const, weight: 18 },
    { value: 'keys' as const, weight: 16 },
    { value: 'red-heart' as const, weight: 12 },
    { value: 'soul-heart' as const, weight: 8 + run.player.stats.luck },
    { value: 'black-heart' as const, weight: 4 + run.player.stats.luck },
  ]);
  const amount = resource === 'coins'
    ? weightedPick(run, [{ value: 1, weight: 65 }, { value: 5, weight: 28 }, { value: 10, weight: 7 }])
    : (resource === 'bombs' || resource === 'keys') ? randomInt(run, 1, 2) : 1;
  return applyResource(run, resource, amount);
}

function makeFloorUpgrade(run: RunState): void {
  const options: RewardOption[] = shuffle(run, [
    { id: makeId('up', run), type: 'upgrade', upgrade: 'damage', label: 'Attack Up', description: '+2 base attack damage.', icon: '↑' },
    { id: makeId('up', run), type: 'upgrade', upgrade: 'heart', label: 'Heart Training', description: '+5 HP per red container and fully heal.', icon: '♥' },
    { id: makeId('up', run), type: 'upgrade', upgrade: 'armor', label: 'Tough Skin', description: '+1 permanent armor.', icon: '⬡' },
    { id: makeId('up', run), type: 'upgrade', upgrade: 'speed', label: 'Attack Accelerator', description: '+0.25 fire rate.', icon: '»' },
    { id: makeId('up', run), type: 'upgrade', upgrade: 'skill', label: 'Battery Pack', description: 'Reduce active recharge by one round.', icon: '▣' },
    ...(run.floorIndex >= 4 && run.player.stats.maxVitality < 6
      ? [{ id: makeId('up', run), type: 'upgrade' as const, upgrade: 'vitality' as const, label: 'Adrenaline', description: '+1 maximum vitality (maximum 6).', icon: '✦' }]
      : []),
  ] satisfies RewardOption[]).slice(0, 3);
  setChoice(run, {
    kind: 'upgrade', title: `${FLOORS[run.floorIndex]?.name} cleared`,
    subtitle: run.floorIndex === 5 ? "Mom's shadow lifts. Take one final blessing." : 'Choose one permanent floor blessing.',
    options, canSkip: false, next: run.floorIndex === 5 ? 'victory' : 'next-floor',
  });
}

function makeDealItems(run: RunState, type: 'devil' | 'angel'): void {
  const options = itemOptions(run, type, 3);
  if (type === 'devil') {
    options.forEach((option) => { option.description = `${option.description} Cost: 1 red-heart container.`; });
  }
  setChoice(run, {
    kind: 'item', title: type === 'devil' ? 'Devil Room' : 'Angel Room',
    subtitle: type === 'devil' ? 'Power always has a price.' : 'Faith is rewarded freely.',
    options, canSkip: true, next: 'floor-upgrade', dealType: type,
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
  const type: 'devil' | 'angel' = !run.tookDevilDeal && run.angelFavor > 0 && nextRandom(run) < Math.min(0.8, 0.35 + run.angelFavor * 0.2)
    ? 'angel' : 'devil';
  setChoice(run, {
    kind: 'deal',
    title: type === 'devil' ? 'A trapdoor exhales heat…' : 'A white door opens…',
    subtitle: `${type === 'devil' ? 'Devil' : 'Angel'} and Angel rooms can never appear together.`,
    options: [
      { id: makeId('deal', run), type: 'action', action: 'enter-deal', label: `Enter ${type} room`, description: type === 'devil' ? 'See three powerful items offered for heart containers.' : 'Receive a free holy item.', icon: type === 'devil' ? '▼' : '△' },
      { id: makeId('skip', run), type: 'action', action: 'skip-deal', label: 'Descend without entering', description: type === 'devil' ? 'Build Angel favor for later floors.' : 'Leave the blessing untouched.', icon: '↘' },
    ],
    canSkip: false,
    next: 'floor-upgrade',
    dealType: type,
  });
}

function finishCombat(run: RunState): void {
  const combat = run.combat!;
  const loot = rollLoot(run);
  run.lastReward = [loot];
  run.clearedRooms += 1;
  run.score += combat.roomKind === 'boss' ? 500 + run.floorIndex * 100 : combat.roomKind === 'elite' ? 220 : 90;
  if (combat.roomKind === 'elite' && combat.damageTakenThisFloor === 0) unlock(run, 'tech-x');
  checkProgressUnlocks(run);

  if (combat.roomKind === 'boss') {
    setChoice(run, {
      kind: 'item', title: `${FLOORS[run.floorIndex]?.bossName} defeated`,
      subtitle: `Boss drop: ${loot}. Choose one item before the exit door opens.`,
      options: itemOptions(run, 'boss', 3), canSkip: false, next: 'boss-gate',
    });
  } else if (combat.roomKind === 'elite') {
    setChoice(run, {
      kind: 'item', title: 'Champion defeated', subtitle: `Room drop: ${loot}. Choose one elite item.`,
      options: itemOptions(run, 'elite', 3), canSkip: false, next: 'map',
    });
  } else if (combat.roomLayout.unitCount >= 3 && nextRandom(run) < Math.min(
    0.6,
    (combat.roomLayout.shape === 'large' ? 0.38 : 0.28) + run.floorIndex * 0.02 + run.player.stats.luck * 0.02,
  )) {
    setChoice(run, {
      kind: 'item', title: 'Large room treasure',
      subtitle: `Room drop: ${loot}. Choose one permanent stat item; it never enters the combat deck.`,
      options: itemOptions(run, 'large-room', 3), canSkip: true, next: 'map', rewardContext: 'large-room',
    });
  } else {
    setChoice(run, {
      kind: 'card', title: 'Room cleared', subtitle: `Room drop: ${loot}. Add one card, or skip.`,
      options: cardOptions(run, 3), canSkip: true, next: 'map',
    });
  }
}

function applyUpgrade(run: RunState, upgrade: NonNullable<RewardOption['upgrade']>): void {
  switch (upgrade) {
    case 'damage': run.player.stats.baseDamage += 2; break;
    case 'heart': run.player.stats.heartSize += 5; run.player.pocketHearts.forEach((heart) => { heart.maxHp += 5; heart.hp += 5; }); run.player.redHp = maxRedHp(run.player); break;
    case 'armor': run.player.stats.armor += 1; break;
    case 'vitality': run.player.stats.maxVitality += 1; break;
    case 'speed': run.player.stats.fireRate += 0.25; break;
    case 'skill': {
      const active = run.player.deck.find((card) => CARDS[card.definitionId]?.type === 'skill');
      if (active) active.upgraded = true;
      break;
    }
  }
}

function advanceFloor(run: RunState): void {
  if (run.floorRedDamage === 0) unlock(run, 'holy-mantle');
  run.floorIndex += 1;
  run.floorMap = createFloorMap(run.floorIndex, run.seed);
  run.floorRedDamage = 0;
  run.floorSecretVisits = [];
  run.floorBombSearches = [];
  run.mapBombResult = undefined;
  run.choice = undefined;
  run.combat = undefined;
  run.currentRoomId = undefined;
  run.phase = 'map';
  revealMap(run);
  makeFloorStartChoice(run);
}

function finishVictory(run: RunState): void {
  if (run.floorRedDamage === 0) unlock(run, 'holy-mantle');
  unlock(run, 'brimstone');
  unlock(run, 'moms-knife');
  run.phase = 'victory';
  run.choice = undefined;
  run.combat = undefined;
  run.victory = true;
  run.score += 2000;
}

function advanceAfterChoice(run: RunState, next: ChoiceState['next']): void {
  switch (next) {
    case 'map': returnToMap(run); break;
    case 'floor-upgrade': makeFloorUpgrade(run); break;
    case 'next-floor': advanceFloor(run); break;
    case 'victory': finishVictory(run); break;
    case 'boss-gate': makeBossGate(run); break;
  }
}

function payPrice(run: RunState, option: RewardOption): void {
  if (option.price === undefined) return;
  if (run.player.coins < option.price) throw new Error('Not enough coins');
  run.player.coins -= option.price;
}

export function chooseOption(state: RunState, optionId: string): RunState {
  const run = clone(state);
  if (run.phase !== 'choice' || !run.choice) throw new Error('There is no choice to make');
  const choice = run.choice;
  const option = choice.options.find((entry) => entry.id === optionId);
  if (!option || option.sold) throw new Error('That option is unavailable');

  if (option.action === 'leave') {
    returnToMap(run);
    return touch(run);
  }
  if (option.action === 'sacrifice') {
    if (run.player.redHp <= 15) throw new Error('Not enough red-heart HP to survive the sacrifice');
    run.player.redHp -= 15;
    run.floorRedDamage += 15;
    addPocketHeart(run, 'soul');
    const tarot = pickOne(run, ['the-empress', 'death', 'the-sun']);
    run.player.deck.push(createCard(run, tarot));
    run.lastReward = ['1 soul heart', CARDS[tarot]!.name];
    returnToMap(run);
    return touch(run);
  }
  if (option.action === 'enter-deal') {
    makeDealItems(run, choice.dealType ?? 'devil');
    return touch(run);
  }
  if (option.action === 'skip-deal') {
    if (choice.dealType === 'devil') {
      run.angelFavor += 1;
      checkProgressUnlocks(run);
    }
    makeFloorUpgrade(run);
    return touch(run);
  }

  payPrice(run, option);
  if (option.type === 'item' && option.itemId) {
    if (choice.dealType === 'devil') {
      if (run.player.redContainers <= 1) throw new Error('A Devil deal needs a spare red-heart container');
      run.player.redContainers -= 1;
      run.player.redHp = Math.min(run.player.redHp, maxRedHp(run.player));
      run.tookDevilDeal = true;
      run.angelFavor = 0;
    }
    equipItem(run, option.itemId);
    run.lastReward = [ITEMS[option.itemId]!.name];
  }
  if (option.type === 'card' && option.cardId) {
    run.player.deck.push(createCard(run, option.cardId));
    run.lastReward = [CARDS[option.cardId]!.name];
  }
  if (option.type === 'resource' && option.resource && option.amount) {
    run.lastReward = [applyResource(run, option.resource, option.amount)];
  }
  if (option.type === 'upgrade' && option.upgrade) {
    applyUpgrade(run, option.upgrade);
    run.lastReward = [option.label];
  }
  checkProgressUnlocks(run);

  if (choice.kind === 'shop') {
    const current = run.choice!.options.find((entry) => entry.id === optionId);
    if (current) current.sold = true;
  } else {
    advanceAfterChoice(run, choice.next);
  }
  return touch(run);
}

export function skipChoice(state: RunState): RunState {
  const run = clone(state);
  if (run.phase !== 'choice' || !run.choice?.canSkip) throw new Error('This choice cannot be skipped');
  const next = run.choice.next;
  if (run.choice.kind === 'shop') returnToMap(run);
  else advanceAfterChoice(run, next);
  return touch(run);
}

export function abandonRun(state: RunState): RunState {
  const run = clone(state);
  run.phase = 'defeat';
  run.victory = false;
  return touch(run);
}
