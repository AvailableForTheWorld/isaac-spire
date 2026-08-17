import {
  CARDS, DEFAULT_UNLOCKS, FLOORS, ITEMS, bossForFloor, eliteForFloor, enemyPoolForFloor,
} from './catalog.js';
import { availableNodeIds, createFloorMap, getMapNode, revealFromCurrent } from './map.js';
import { addPocketHeart, createCard, createIsaac, equipItem, getItemEffectTotal, healRed, maxRedHp } from './player.js';
import { hashSeed, nextRandom, pickOne, randomInt, shuffle, weightedPick } from './random.js';
import type {
  CardDefinition, CardInstance, ChoiceState, CombatAnimationEvent, CombatLogEntry, CombatState,
  EnemyAction, EnemyBehavior, EnemyDefinition, EnemyIntent, EnemyState, IntentKind,
  ItemDefinition, RewardOption, RoomKind, RunState,
} from './types.js';

const clone = <T>(value: T): T => structuredClone(value);

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
  return run.player.items.some((id) => ITEMS[id]?.effects?.some((effect) => effect[key] === true));
}

function pushLog(
  combat: CombatState,
  message: string,
  tone: CombatLogEntry['tone'] = 'normal',
  messageKey?: string,
  params?: Record<string, string | number>,
): void {
  combat.log.unshift({ id: `${combat.round}-${combat.log.length}-${message}`, message, tone, messageKey, params });
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
    floorMap: createFloorMap(0),
    player: undefined as unknown as RunState['player'],
    clearedRooms: 0,
    score: 0,
    devilChance: 0.35,
    angelFavor: 0,
    tookDevilDeal: false,
    unlocks: [...new Set([...DEFAULT_UNLOCKS.filter((id) => id === 'd6'), ...unlockedItemIds])],
    unlockNotices: [],
    lastReward: [],
    floorRedDamage: 0,
    floorSecretVisits: [],
    victory: false,
  } satisfies RunState;
  run.player = createIsaac(run);
  return run;
}

export function getAvailableNodes(run: RunState): string[] {
  if (run.phase !== 'map') return [];
  return availableNodeIds(run.floorMap);
}

export function getCard(run: RunState, instanceId: string): CardInstance | undefined {
  return run.player.deck.find((card) => card.instanceId === instanceId);
}

export function getCardDefinition(run: RunState, instanceId: string): CardDefinition | undefined {
  const instance = getCard(run, instanceId);
  return instance ? CARDS[instance.definitionId] : undefined;
}

function unlockedPool(run: RunState, pool: ItemDefinition['pool'][number]): ItemDefinition[] {
  const eligible = Object.values(ITEMS).filter((item) =>
    run.unlocks.includes(item.id) && item.pool.includes(pool) && !run.player.items.includes(item.id));
  if (eligible.length) return eligible;
  return Object.values(ITEMS).filter((item) => run.unlocks.includes(item.id) && item.pool.includes(pool));
}

function pickUniqueItems(run: RunState, pool: ItemDefinition['pool'][number], count: number): ItemDefinition[] {
  const candidates = shuffle(run, unlockedPool(run, pool));
  return candidates.slice(0, Math.min(count, candidates.length));
}

function itemOptions(run: RunState, pool: ItemDefinition['pool'][number], count: number, price?: number): RewardOption[] {
  return pickUniqueItems(run, pool, count).map((item) => ({
    id: makeId('option', run), type: 'item', itemId: item.id, label: item.name,
    description: item.description, icon: item.icon, price,
  }));
}

function cardOptions(run: RunState, count: number, price?: number): RewardOption[] {
  const pool = Object.values(CARDS).filter((card) =>
    !['skill', 'curse'].includes(card.type) && card.id !== 'isaacs-tears');
  return shuffle(run, pool).slice(0, count).map((card) => ({
    id: makeId('option', run), type: 'card', cardId: card.id, label: card.name,
    description: card.description, icon: card.icon, price,
  }));
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
  if ((node.kind === 'secret' || node.kind === 'super-secret')) {
    if (run.player.bombs < 1) throw new Error('A bomb is required to open this room');
    run.player.bombs -= 1;
  }
  node.visited = true;
  if (!node.optional) run.floorMap.currentNodeId = node.id;
  run.currentRoomId = node.id;
  run.lastReward = [];

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
        [action('attack', attackValue(enemy)), action('shield', shieldValue(run, 0.65))],
        [action('attack', attackValue(enemy, 1.2))],
      ];
    case 'hexer':
      return [
        [action('curse')],
        [action('attack', attackValue(enemy))],
        [action('heal', healValue(run)), action('attack', attackValue(enemy, 0.7))],
        [action('prepare')],
      ];
    case 'tank':
      return [
        [action('shield', shieldValue(run, 1.35)), action('attack', attackValue(enemy, 0.7))],
        [action('attack', attackValue(enemy))],
        [action('prepare')],
        [action('heal', healValue(run)), action('shield', shieldValue(run, 0.75)), action('attack', attackValue(enemy, 0.8))],
      ];
    case 'boss':
      return [
        [action('prepare')],
        [action('attack', attackValue(enemy, 1.1)), action('curse')],
        [action('shield', shieldValue(run, 1.5)), action('heal', healValue(run, 1.25)), action('attack', attackValue(enemy, 0.85))],
        [action('attack', attackValue(enemy, 1.25))],
      ];
    case 'swarm':
    default:
      return [
        [action('attack', attackValue(enemy))],
        [action('prepare')],
        [action('attack', attackValue(enemy, 0.8)), action('shield', shieldValue(run, 0.5))],
        [action('attack', attackValue(enemy, 1.15))],
      ];
  }
}

function reactionIntent(run: RunState, enemy: EnemyState): EnemyIntent {
  switch (enemy.behavior) {
    case 'hunter':
      return makeIntent([action('attack', attackValue(enemy, 0.85)), action('prepare')]);
    case 'swarm':
      return makeIntent([action('shield', shieldValue(run, 0.65)), action('attack', attackValue(enemy, 0.8))]);
    case 'hexer':
      return makeIntent([action('heal', healValue(run, 1.2)), action('curse'), action('attack', attackValue(enemy, 0.75))]);
    case 'boss':
      return makeIntent([action('heal', healValue(run, 1.35)), action('shield', shieldValue(run, 1.2)), action('attack', attackValue(enemy, 0.9))]);
    case 'tank':
    default:
      return makeIntent([action('shield', shieldValue(run, 1.25)), action('heal', healValue(run)), action('attack', attackValue(enemy, 0.8))]);
  }
}

function ensureEnemyBehavior(enemy: EnemyState): void {
  enemy.behavior ??= behaviorFor(enemy);
  enemy.behaviorStep ??= 0;
  enemy.damageTakenThisRound ??= 0;
  enemy.reactionCooldown ??= 0;
  enemy.turnsSinceAttack ??= 0;
  enemy.staggeredTurns ??= 0;
  enemy.intent.actions ??= [action(enemy.intent.kind, enemy.intent.value)];
  const hasAttack = enemy.intent.actions.some((entry) => entry.kind === 'attack');
  const isDefensiveTurn = enemy.intent.actions.some((entry) => entry.kind === 'shield' || entry.kind === 'heal');
  const isTelegraphTurn = enemy.intent.actions.some((entry) => ['prepare', 'curse', 'idle'].includes(entry.kind));
  if (!hasAttack && isDefensiveTurn && !isTelegraphTurn) {
    enemy.intent = makeIntent([...enemy.intent.actions, action('attack', attackValue(enemy, 0.8))]);
  }
}

function rollIntent(run: RunState, enemy: EnemyState): EnemyIntent {
  ensureEnemyBehavior(enemy);
  const wasCoolingDown = enemy.reactionCooldown > 0;
  enemy.reactionCooldown = Math.max(0, enemy.reactionCooldown - 1);
  const canReact = !wasCoolingDown
    && enemy.damageTakenThisRound >= Math.max(5, Math.round(enemy.maxHp * 0.12))
    && enemy.hp < enemy.maxHp;
  enemy.damageTakenThisRound = 0;
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

function makeEnemy(run: RunState, definition: EnemyDefinition, index: number): EnemyState {
  const scale = 1 + run.floorIndex * 0.08;
  const enemy: EnemyState = {
    ...definition,
    instanceId: `${definition.id}-${index}-${randomInt(run, 1000, 9999)}`,
    maxHp: Math.round(definition.maxHp * scale),
    hp: Math.round(definition.maxHp * scale),
    shield: 0,
    cursedTurns: 0,
    staggeredTurns: 0,
    prepared: false,
    behavior: behaviorFor(definition),
    behaviorStep: index,
    damageTakenThisRound: 0,
    reactionCooldown: 0,
    turnsSinceAttack: 0,
    intent: { kind: 'idle', value: 0, label: 'Watching' },
  };
  enemy.intent = rollIntent(run, enemy);
  return enemy;
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
  let definitions: EnemyDefinition[];
  if (roomKind === 'boss') {
    definitions = [bossForFloor(run.floorIndex)];
  } else if (roomKind === 'elite') {
    definitions = [eliteForFloor(run.floorIndex)];
    if (run.floorIndex >= 2) definitions.push(pickOne(run, enemyPoolForFloor(run.floorIndex)));
  } else {
    const pool = enemyPoolForFloor(run.floorIndex);
    const count = randomInt(run, 2, Math.min(3, 2 + Math.floor(run.floorIndex / 2)));
    definitions = Array.from({ length: count }, () => pickOne(run, pool));
  }
  const skills = run.player.deck.filter((card) => CARDS[card.definitionId]?.type === 'skill').map((card) => card.instanceId);
  const others = run.player.deck.filter((card) => CARDS[card.definitionId]?.type !== 'skill').map((card) => card.instanceId);
  const combat: CombatState = {
    roomKind,
    round: 1,
    vitality: run.player.stats.maxVitality,
    playerShield: run.player.stats.baseShield,
    playerArmorBuff: 0,
    playerDamageBuff: 0,
    tearMeter: 0,
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
  combat.enemies = definitions.map((definition, index) => makeEnemy(run, definition, index));
  if (!combat.enemies.some((enemy) => enemy.intent.actions?.some((entry) => entry.kind === 'attack'))) {
    const attacker = combat.enemies.at(-1);
    if (attacker) attacker.intent = makeIntent([action('attack', attackValue(attacker))]);
  }
  combat.selectedEnemyId = combat.enemies[0]?.instanceId;
  drawToHand(run, combat);
  pushLog(combat, `Round 1 — ${combat.enemies.map((enemy) => enemy.name).join(', ')} entered the room.`, 'special', 'enter', {
    enemies: combat.enemies.map((enemy) => enemy.id).join('|'),
  });
  run.combat = combat;
  run.choice = undefined;
  run.phase = 'combat';
}

function currentTarget(combat: CombatState, requestedId?: string): EnemyState | undefined {
  return combat.enemies.find((enemy) => enemy.instanceId === requestedId && enemy.hp > 0)
    ?? combat.enemies.find((enemy) => enemy.instanceId === combat.selectedEnemyId && enemy.hp > 0)
    ?? combat.enemies.find((enemy) => enemy.hp > 0);
}

function hurtEnemy(enemy: EnemyState, rawDamage: number, armorPierce = 0): number {
  ensureEnemyBehavior(enemy);
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
  return Math.max(1, (run.player.stats.baseDamage + combat.playerDamageBuff + upgraded) * run.player.stats.damageMultiplier * factor);
}

function playAttack(run: RunState, combat: CombatState, card: CardDefinition, instance: CardInstance, targetId?: string): void {
  let targets = card.target === 'all-enemies'
    ? combat.enemies.filter((enemy) => enemy.hp > 0)
    : [currentTarget(combat, targetId)].filter((enemy): enemy is EnemyState => Boolean(enemy));
  let multiplier = 1;
  let armorPierce = 0;
  if (run.player.stats.attackMode === 'knife') { multiplier = 1.6; armorPierce = 3; }
  if (run.player.stats.attackMode === 'brimstone') {
    targets = combat.enemies.filter((enemy) => enemy.hp > 0);
    multiplier = 0.85;
  }
  if (run.player.stats.attackMode === 'tech-x') {
    targets = combat.enemies.filter((enemy) => enemy.hp > 0);
    targets.forEach((enemy) => { enemy.shield = Math.max(0, enemy.shield - 3); });
  }

  combat.tearMeter += Math.max(0, run.player.stats.fireRate - 1);
  const echoHits = Math.floor(combat.tearMeter + 0.00001);
  combat.tearMeter -= echoHits;
  const hits = (card.hits ?? 1) + echoHits;
  const base = attackDamage(run, combat, card, instance) * multiplier;
  let total = 0;
  for (const target of targets) {
    const wasAlive = target.hp > 0;
    let targetTotal = 0;
    for (let hit = 0; hit < hits; hit += 1) {
      const critical = nextRandom(run) < run.player.stats.critChance;
      const dealt = hurtEnemy(target, base * (critical ? 2 : 1), armorPierce);
      total += dealt;
      targetTotal += dealt;
    }
    pushAnimation(combat, {
      kind: 'player-attack', sourceId: 'isaac', targetId: target.instanceId,
      value: targetTotal, secondaryValue: hits, attackMode: run.player.stats.attackMode,
    });
    if (wasAlive && target.hp <= 0) pushAnimation(combat, { kind: 'defeat', sourceId: target.instanceId, targetId: target.instanceId });
  }
  const mode = run.player.stats.attackMode === 'tears' ? '' : ` ${run.player.stats.attackMode}`;
  pushLog(combat, `${card.name} dealt ${total}${mode} damage${echoHits ? ` with ${echoHits} echo hit` : ''}.`, 'good', 'attack', {
    cardId: card.id, damage: total, mode: run.player.stats.attackMode === 'tears' ? '' : run.player.stats.attackMode, echoCount: echoHits,
  });
}

function skillChargeRounds(run: RunState, instance: CardInstance): number {
  const item = Object.values(ITEMS).find((entry) => entry.skillCardId === instance.definitionId);
  return Math.max(1, (item?.chargeRounds ?? 3) - (instance.upgraded ? 1 : 0));
}

function playSkill(run: RunState, combat: CombatState, instance: CardInstance): void {
  switch (instance.definitionId) {
    case 'skill-d6': {
      const rerolled = combat.hand.filter((id) => id !== instance.instanceId && CARDS[getCard(run, id)?.definitionId ?? '']?.type !== 'skill');
      combat.hand = combat.hand.filter((id) => !rerolled.includes(id));
      combat.discardPile.push(...rerolled);
      drawToHand(run, combat);
      pushLog(combat, `The D6 rerolled ${rerolled.length} cards.`, 'special', 'reroll', { count: rerolled.length });
      break;
    }
    case 'skill-yum-heart': {
      const healed = healRed(run.player, run.player.stats.heartSize);
      pushAnimation(combat, { kind: 'heal', sourceId: 'isaac', targetId: 'isaac', value: healed });
      pushLog(combat, `Yum Heart recovered ${healed} HP.`, 'good', 'heal', { sourceCardId: instance.definitionId, amount: healed });
      break;
    }
    case 'skill-belial':
      combat.playerDamageBuff += 2;
      pushAnimation(combat, { kind: 'prepare', sourceId: 'isaac', targetId: 'isaac', value: 2 });
      pushLog(combat, 'Book of Belial granted +2 room damage.', 'special', 'belial');
      break;
    case 'skill-shadows':
      combat.playerShield += 20;
      pushAnimation(combat, { kind: 'shield', sourceId: 'isaac', targetId: 'isaac', value: 20 });
      pushLog(combat, 'Book of Shadows granted 20 shield.', 'good', 'shadows');
      break;
    case 'skill-tammy': {
      const damage = (run.player.stats.baseDamage + combat.playerDamageBuff) * run.player.stats.damageMultiplier;
      combat.enemies.filter((enemy) => enemy.hp > 0).forEach((enemy) => {
        const wasAlive = enemy.hp > 0;
        const dealt = hurtEnemy(enemy, damage);
        pushAnimation(combat, { kind: 'player-attack', sourceId: 'isaac', targetId: enemy.instanceId, value: dealt, attackMode: 'tears' });
        if (wasAlive && enemy.hp <= 0) pushAnimation(combat, { kind: 'defeat', sourceId: enemy.instanceId, targetId: enemy.instanceId });
      });
      pushLog(combat, `Tammy's Head burst for ${Math.round(damage)} damage to all enemies.`, 'good', 'tammy', { damage: Math.round(damage) });
      break;
    }
    case 'skill-nail':
      addPocketHeart(run, 'black');
      combat.playerArmorBuff += 2;
      pushAnimation(combat, { kind: 'shield', sourceId: 'isaac', targetId: 'isaac', value: 2 });
      pushLog(combat, 'The Nail granted a black heart and +2 room armor.', 'special', 'nail');
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

function allEnemiesDefeated(combat: CombatState): boolean {
  return combat.enemies.every((enemy) => enemy.hp <= 0);
}

export function canPlayCard(run: RunState, instanceId: string): { ok: boolean; reason?: string } {
  if (run.phase !== 'combat' || !run.combat) return { ok: false, reason: 'Not in combat' };
  if (!run.combat.hand.includes(instanceId)) return { ok: false, reason: 'Card is not in hand' };
  const instance = getCard(run, instanceId);
  const card = instance ? CARDS[instance.definitionId] : undefined;
  if (!instance || !card) return { ok: false, reason: 'Unknown card' };
  if (card.type === 'curse') return { ok: false, reason: 'Curse cards are unplayable' };
  if (run.combat.vitality < card.cost) return { ok: false, reason: 'Not enough vitality' };
  if (card.type === 'skill' && (run.combat.cooldowns[instanceId] ?? 0) > 0) return { ok: false, reason: 'Active item is recharging' };
  return { ok: true };
}

export function selectEnemy(state: RunState, enemyId: string): RunState {
  const run = clone(state);
  if (run.combat?.enemies.some((enemy) => enemy.instanceId === enemyId && enemy.hp > 0)) {
    run.combat.selectedEnemyId = enemyId;
  }
  return touch(run);
}

export function playCard(state: RunState, instanceId: string, targetId?: string): RunState {
  const playable = canPlayCard(state, instanceId);
  if (!playable.ok) throw new Error(playable.reason);
  const run = clone(state);
  const combat = run.combat!;
  const instance = getCard(run, instanceId)!;
  const card = CARDS[instance.definitionId]!;
  combat.vitality -= card.cost;
  pushAnimation(combat, { kind: 'card-play', sourceId: 'isaac', cardId: card.id, value: card.cost });

  if (card.type === 'attack') playAttack(run, combat, card, instance, targetId);
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
    const target = currentTarget(combat, targetId);
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
        const healed = healRed(run.player, 20);
        pushAnimation(combat, { kind: 'heal', sourceId: 'isaac', targetId: 'isaac', value: healed });
      }
      pushLog(combat, `${card.name} consumed in a burst of power.`, 'special', 'tarot', { cardId: card.id });
    }
  }
  if (card.type === 'skill') playSkill(run, combat, instance);

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
  if (!instance || CARDS[instance.definitionId]?.type === 'skill') throw new Error('Active item cards remain equipped');
  if (!run.combat.hand.includes(instanceId)) throw new Error('Card is not in hand');
  run.combat.hand = run.combat.hand.filter((id) => id !== instanceId);
  run.combat.discardPile.push(instanceId);
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
  const cap = getItemEffectTotal(run, 'damageCap');
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
  const intendedAttack = actions.find((entry) => entry.kind === 'attack');
  const raw = intendedAttack?.value ?? enemy.attack;
  return [action('attack', Math.max(1, Math.round(raw * 0.6)))];
}

function resolveEnemyAction(run: RunState, combat: CombatState, enemy: EnemyState, enemyAction: EnemyAction): void {
  switch (enemyAction.kind) {
    case 'attack':
      hurtPlayer(run, combat, enemyAction.value, enemy);
      enemy.prepared = false;
      break;
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
    case 'idle':
      pushAnimation(combat, { kind: 'idle', sourceId: enemy.instanceId, targetId: enemy.instanceId });
      pushLog(combat, `${enemy.name} hesitates.`, 'normal', 'hesitate', { enemyId: enemy.id, enemy: enemy.name });
      break;
  }
}

function resolveEnemyTurn(run: RunState): void {
  const combat = run.combat!;
  run.phase = 'combat';
  for (const enemy of combat.enemies.filter((entry) => entry.hp > 0)) {
    if (enemy.hp <= 0) continue;
    ensureEnemyBehavior(enemy);
    if (enemy.staggeredTurns > 0) {
      enemy.staggeredTurns -= 1;
      enemy.turnsSinceAttack += 1;
      pushAnimation(combat, { kind: 'idle', sourceId: enemy.instanceId, targetId: enemy.instanceId });
      pushLog(combat, `${enemy.name} is staggered and loses its action.`, 'good', 'enemyStaggered', { enemyId: enemy.id, enemy: enemy.name });
    } else {
      const intendedActions = enemy.intent.actions ?? [action(enemy.intent.kind, enemy.intent.value)];
      const weakened = enemy.cursedTurns > 0;
      const actions = weakened ? cursedActions(enemy, intendedActions) : intendedActions;
      if (weakened) {
        enemy.cursedTurns -= 1;
        pushLog(combat, `${enemy.name}'s curse suppresses its special action and weakens its attack.`, 'good', 'enemyWeakened', {
          enemyId: enemy.id, enemy: enemy.name, damage: actions[0]?.value ?? 0,
        });
      }
      for (const enemyAction of actions) {
        resolveEnemyAction(run, combat, enemy, enemyAction);
        if (run.player.redHp <= 0) break;
      }
      enemy.turnsSinceAttack = actions.some((enemyAction) => enemyAction.kind === 'attack')
        ? 0
        : enemy.turnsSinceAttack + 1;
    }
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
  combat.selectedEnemyId = currentTarget(combat)?.instanceId;
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
    { id: makeId('up', run), type: 'upgrade', upgrade: 'damage', label: 'Tears Up', description: '+2 base attack damage.', icon: '↑' },
    { id: makeId('up', run), type: 'upgrade', upgrade: 'heart', label: 'Heart Training', description: '+5 HP per red container and fully heal.', icon: '♥' },
    { id: makeId('up', run), type: 'upgrade', upgrade: 'armor', label: 'Tough Skin', description: '+1 permanent armor.', icon: '⬡' },
    { id: makeId('up', run), type: 'upgrade', upgrade: 'speed', label: 'Tears Accelerator', description: '+0.25 fire rate.', icon: '»' },
    { id: makeId('up', run), type: 'upgrade', upgrade: 'skill', label: 'Battery Pack', description: 'Reduce active recharge by one round.', icon: '▣' },
    ...(run.floorIndex >= 2 ? [{ id: makeId('up', run), type: 'upgrade' as const, upgrade: 'vitality' as const, label: 'Adrenaline', description: '+1 maximum vitality.', icon: '✦' }] : []),
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
  run.floorMap = createFloorMap(run.floorIndex);
  run.floorRedDamage = 0;
  run.floorSecretVisits = [];
  run.choice = undefined;
  run.combat = undefined;
  run.currentRoomId = undefined;
  run.phase = 'map';
  revealMap(run);
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
