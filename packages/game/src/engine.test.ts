import { describe, expect, it } from 'vitest';
import { CARDS, DEFAULT_UNLOCKS, ITEMS, bossForFloor, getEnemy, itemUsesCombatCard } from './catalog.js';
import {
  acknowledgeRoomReward,
  bypassLockedRoom,
  cancelCombatSelection,
  canPlayCard,
  canPlayFusedAttack,
  chooseOption,
  confirmPlayerDeployment,
  createRun as createRunWithFloorChoice,
  DEFAULT_COMBAT_ROOM_LAYOUT,
  discardCard,
  endTurn,
  enterRoom,
  finishDiscard,
  getAttackFusionMaterialIds,
  getAttackFusionPreview,
  getAvailableNodes,
  getCombatRoomCells,
  getEnemyMovementSpeed,
  getEnemyOccupiedCells,
  getPlayerDeploymentCells,
  getPlayerMovementSpeed,
  getPlayerShieldCapacity,
  getReachablePlayerCells,
  hydrateRunState,
  isPlayerInEnemyVision,
  movePlayer,
  placePlayerForDeployment,
  playCard,
  playFusedAttack,
  purchaseShopCardUpgrade,
  resolveCombatSelection,
  selectEnemy,
  skipChoice,
  useCombatBomb,
  useMapBomb,
  usePocketItem,
} from './engine.js';
import { createFloorMap } from './map.js';
import { addPocketHeart, createCard, equipItem } from './player.js';
import { CURRENT_RUN_VERSION } from './state/migrations.js';
import {
  AchievementMetric,
  ARMOR_UPGRADE_AMOUNT,
  AttackMode,
  BossAttackPattern,
  CardType,
  ChoiceAction,
  ChoiceKind,
  ChoiceNext,
  CombatAnimationKind,
  CombatMovementStyle,
  CombatRoomShape,
  CombatSelectionKind,
  EnemyMovementPattern,
  HeartKind,
  HEART_SIZE_UPGRADE_AMOUNT,
  IntentKind,
  ItemKind,
  MAX_RED_CONTAINERS,
  ResourceKind,
  RewardContext,
  RewardOptionType,
  RewardPool,
  RoomKind,
  RunPhase,
  SHIELD_CAPACITY_UPGRADE_AMOUNT,
  UpgradeKind,
} from './types.js';

function createRun(seed?: string, unlockedItemIds = DEFAULT_UNLOCKS) {
  const run = createRunWithFloorChoice(seed, unlockedItemIds);
  if (run.choice?.rewardContext !== RewardContext.FloorStart) return run;
  const resource = run.choice.options.find((option) => option.type === RewardOptionType.Resource)!;
  return chooseOption(run, resource.id);
}

function settleChoice(
  run: ReturnType<typeof createRun>,
  onChoice?: (choiceRun: ReturnType<typeof createRun>) => void,
) {
  let next = run;
  while (next.phase === RunPhase.Choice) {
    onChoice?.(next);
    const choice = next.choice!;
    if (choice.requiresRewardConfirmation) {
      next = acknowledgeRoomReward(next);
    } else if (choice.kind === ChoiceKind.Shop) {
      next = skipChoice(next);
    } else if (choice.kind === ChoiceKind.Deal) {
      next = chooseOption(next, choice.options.find((option) => option.action === ChoiceAction.SkipDeal)!.id);
    } else if (choice.canSkip && (choice.kind === ChoiceKind.Card || choice.kind === ChoiceKind.Sacrifice)) {
      next = skipChoice(next);
    } else {
      next = chooseOption(next, choice.options[0]!.id);
    }
  }
  return next;
}

function instantlyWinCombat(run: ReturnType<typeof createRun>) {
  const combat = run.combat!;
  const target = combat.enemies[0]!;
  combat.enemies.forEach((enemy, index) => {
    enemy.hp = index === 0 ? 1 : 0;
    enemy.shield = 0;
    enemy.armor = 0;
  });
  target.position = { x: combat.playerPosition.x + 4, y: combat.playerPosition.y };
  const attack = run.player.deck.find((card) => CARDS[card.definitionId]?.type === CardType.Attack)!;
  combat.hand = combat.hand.filter((id) => id !== attack.instanceId);
  combat.hand.push(attack.instanceId);
  combat.drawPile = combat.drawPile.filter((id) => id !== attack.instanceId);
  combat.discardPile = combat.discardPile.filter((id) => id !== attack.instanceId);
  combat.vitality = run.player.stats.maxVitality;
  combat.selectedEnemyId = target.instanceId;
  return playCard(run, attack.instanceId, target.instanceId);
}

describe('run generation', () => {
  it('offers a combat item card, a permanent stat item, and an asset pack at floor entry', () => {
    // A legacy profile may only remember The D6; baseline, non-event items must still fill all three slots.
    const run = createRunWithFloorChoice('FLOOR-START-REWARDS', ['d6']);
    expect(run).toMatchObject({ phase: RunPhase.Choice, floorIndex: 0 });
    expect(run.choice).toMatchObject({
      kind: ChoiceKind.Loot,
      rewardContext: RewardContext.FloorStart,
      canSkip: false,
      next: ChoiceNext.Map,
    });
    expect(run.choice!.options).toHaveLength(3);

    const combatOption = run.choice!.options.find(
      (option) => option.itemId && itemUsesCombatCard(ITEMS[option.itemId]!),
    )!;
    const permanentOption = run.choice!.options.find(
      (option) => option.itemId && ITEMS[option.itemId]?.pool.includes(RewardPool.LargeRoom),
    )!;
    const resourceOption = run.choice!.options.find((option) => option.type === RewardOptionType.Resource)!;
    expect(ITEMS[combatOption.itemId!]!.kind).toBe(ItemKind.Passive);
    expect(ITEMS[permanentOption.itemId!]!.combatCard).toBe(false);
    expect([ResourceKind.Coins, ResourceKind.Bombs, ResourceKind.Keys]).toContain(resourceOption.resource);

    const withCombatItem = chooseOption(run, combatOption.id);
    expect(withCombatItem.phase).toBe('map');
    expect(withCombatItem.player.items).toContain(combatOption.itemId);
    expect(
      withCombatItem.player.deck.some((card) => card.definitionId === `item:${combatOption.itemId}`),
    ).toBe(true);

    const deckSize = run.player.deck.length;
    const withPermanentItem = chooseOption(run, permanentOption.id);
    expect(withPermanentItem.player.items).toContain(permanentOption.itemId);
    expect(withPermanentItem.player.deck).toHaveLength(deckSize);

    const resourceKey = resourceOption.resource as
      ResourceKind.Coins | ResourceKind.Bombs | ResourceKind.Keys;
    const beforeResource = run.player[resourceKey];
    const withResource = chooseOption(run, resourceOption.id);
    expect(withResource.player[resourceKey]).toBe(beforeResource + resourceOption.amount!);
  });

  it('creates a deterministic six-floor first-run Isaac build', () => {
    const left = createRun('MOM-1001', DEFAULT_UNLOCKS);
    const right = createRun('MOM-1001', DEFAULT_UNLOCKS);
    expect(left.floorMap.nodes).toEqual(right.floorMap.nodes);
    expect(left.player.redContainers).toBe(3);
    expect(left.player.redHp).toBe(30);
    expect(left.player.stats.heartSize).toBe(10);
    expect(left.player.stats.maxVitality).toBe(5);
    expect(left.player.stats.baseShield).toBe(10);
    expect(left.player.stats.movementSpeed).toBe(3);
    expect(left.player.stats.attackRange).toBe(5);
    expect(left.player.deck).toHaveLength(15);
    expect(left.player.activeItemId).toBe('d6');
  });

  it('builds seeded route layouts with calm stretches, real branches, and no unreachable rooms', () => {
    const routeSignatures = new Set<string>();
    const curveDirections = new Set<number>();
    for (let index = 0; index < 12; index += 1) {
      const run = createRun(`ROUTE-LAYOUT-${index}`);
      const mainNodes = run.floorMap.nodes.filter((node) => !node.optional);
      routeSignatures.add(JSON.stringify(mainNodes.map((node) => [node.mapPosition, node.connections])));

      const reachable = new Set([run.floorMap.currentNodeId]);
      const queue = [run.floorMap.currentNodeId];
      while (queue.length) {
        const id = queue.shift()!;
        const node = mainNodes.find((entry) => entry.id === id)!;
        for (const targetId of node.connections) {
          if (reachable.has(targetId)) continue;
          reachable.add(targetId);
          queue.push(targetId);
        }
      }
      expect(reachable.size).toBe(mainNodes.length);

      const transitionalNodes = mainNodes.filter((node) => node.depth >= 1 && node.depth <= 5);
      expect(transitionalNodes.some((node) => node.connections.length > 1)).toBe(true);
      expect(
        Array.from({ length: 5 }, (_, depthIndex) => depthIndex + 1).some((depth) => {
          const row = transitionalNodes.filter((node) => node.depth === depth);
          return row.every(
            (node) =>
              node.connections.length === 1 &&
              mainNodes.find((target) => target.id === node.connections[0])?.lane === node.lane,
          );
        }),
      ).toBe(true);

      for (let depth = 1; depth <= 6; depth += 1) {
        const rowX = mainNodes
          .filter((node) => node.depth === depth)
          .map((node) => node.mapPosition!.x)
          .sort((a, b) => a - b);
        expect(rowX[1]! - rowX[0]!).toBeGreaterThan(18);
        expect(rowX[2]! - rowX[1]!).toBeGreaterThan(18);
      }
      for (const style of Object.values(run.floorMap.connectionStyles!)) {
        curveDirections.add(Math.sign(style.startBend));
        expect(style.tension).toBeGreaterThanOrEqual(0.24);
        expect(style.tension).toBeLessThanOrEqual(0.43);
      }
    }
    expect(routeSignatures.size).toBeGreaterThan(9);
    expect(curveDirections).toEqual(new Set([-1, 1]));
  });

  it('assigns two, four, sixteen, and twenty-five cell footprints by enemy scale', () => {
    expect(getEnemy('charger').footprintWidth * getEnemy('charger').footprintHeight).toBe(2);
    expect(getEnemy('spider').footprintWidth * getEnemy('spider').footprintHeight).toBe(4);
    expect(bossForFloor(0).footprintWidth * bossForFloor(0).footprintHeight).toBe(16);
    expect(bossForFloor(5).footprintWidth * bossForFloor(5).footprintHeight).toBe(25);
  });

  it('gives every lane a shop, treasure, secret, and super-secret room', () => {
    const run = createRun('ROUTES-42');
    for (let lane = 0; lane < 3; lane += 1) {
      const rooms = run.floorMap.nodes.filter((node) => Math.floor(node.lane) === lane);
      expect(rooms.filter((room) => room.kind === RoomKind.Shop)).toHaveLength(1);
      expect(rooms.filter((room) => room.kind === RoomKind.Treasure)).toHaveLength(1);
      expect(rooms.filter((room) => room.kind === RoomKind.Secret)).toHaveLength(1);
      expect(rooms.filter((room) => room.kind === RoomKind.SuperSecret)).toHaveLength(1);
    }
  });

  it('never lets a bomb-gated detour trap the route', () => {
    let run = createRun('NO-BOMBS');
    const anchor = run.floorMap.nodes.find((node) => node.lane === 1 && node.depth === 3)!;
    run.floorMap.currentNodeId = anchor.id;
    run.player.bombs = 0;
    const secret = run.floorMap.nodes.find(
      (node) => node.kind === RoomKind.Secret && node.anchorId === anchor.id,
    )!;
    expect(getAvailableNodes(run)).not.toContain(secret.id);
    expect(() => useMapBomb(run)).toThrow(/bomb/i);
    expect(anchor.connections.every((id) => getAvailableNodes(run).includes(id))).toBe(true);

    run.player.bombs = 1;
    run = useMapBomb(run);
    expect(run.player.bombs).toBe(0);
    expect(run.achievementState.lifetimeCounters[AchievementMetric.BombsUsed]).toBe(1);
    expect(run.mapBombResult).toMatchObject({
      currentNodeId: anchor.id,
      found: true,
      roomKind: RoomKind.Secret,
    });
    expect(run.floorMap.nodes.find((node) => node.id === secret.id)).toMatchObject({
      revealed: true,
      doorOpened: true,
    });
    expect(getAvailableNodes(run)).toContain(secret.id);
    run = enterRoom(run, secret.id);
    expect(run.player.bombs).toBe(0);
    expect(run.achievementState.lifetimeCounters[AchievementMetric.SecretRoomsEntered]).toBe(1);
  });

  it('keeps floor-one shops free and spends one key on locked shops and treasure rooms later', () => {
    let firstFloor = createRun('FIRST-FLOOR-DOOR');
    const freeShop = firstFloor.floorMap.nodes.find((node) => node.kind === RoomKind.Shop)!;
    firstFloor.floorMap.currentNodeId = firstFloor.floorMap.nodes.find((node) =>
      node.connections.includes(freeShop.id),
    )!.id;
    firstFloor.player.keys = 0;
    firstFloor = enterRoom(firstFloor, freeShop.id);
    expect(firstFloor.player.keys).toBe(0);

    let laterFloor = createRun('LOCKED-DOOR');
    laterFloor.floorIndex = 1;
    laterFloor.floorMap = createFloorMap(1, laterFloor.seed);
    const lockedTreasure = laterFloor.floorMap.nodes.find((node) => node.kind === RoomKind.Treasure)!;
    laterFloor.floorMap.currentNodeId = laterFloor.floorMap.nodes.find((node) =>
      node.connections.includes(lockedTreasure.id),
    )!.id;
    laterFloor.player.keys = 0;
    expect(() => enterRoom(laterFloor, lockedTreasure.id)).toThrow(/key/i);
    laterFloor.player.keys = 1;
    laterFloor = enterRoom(laterFloor, lockedTreasure.id);
    expect(laterFloor.player.keys).toBe(0);
  });

  it('passes a mandatory locked room without rewards when no key is available', () => {
    let run = createRun('LOCKED-ROOM-BYPASS');
    run.floorIndex = 1;
    run.floorMap = createFloorMap(1, run.seed);
    const lockedShop = run.floorMap.nodes.find((node) => node.kind === RoomKind.Shop)!;
    const anchor = run.floorMap.nodes.find((node) => node.connections.includes(lockedShop.id))!;
    run.floorMap.currentNodeId = anchor.id;
    run.player.keys = 0;
    run.lastReward = ['stale reward'];

    run = bypassLockedRoom(run, lockedShop.id);

    expect(run.phase).toBe(RunPhase.Map);
    expect(run.player.keys).toBe(0);
    expect(run.floorMap.currentNodeId).toBe(lockedShop.id);
    expect(run.floorMap.nodes.find((node) => node.id === lockedShop.id)).toMatchObject({
      visited: true,
      bypassed: true,
    });
    expect(run.currentRoomId).toBeUndefined();
    expect(run.lastReward).toEqual([]);
    expect(getAvailableNodes(run)).toEqual(lockedShop.connections);
  });

  it('makes high-quality rewards rarer and more expensive to play', () => {
    let qualityTwoOffers = 0;
    let qualityFourOffers = 0;
    for (let index = 0; index < 60; index += 1) {
      let run = createRun(`QUALITY-${index}`);
      const treasure = run.floorMap.nodes.find((node) => node.lane === 0 && node.depth === 2)!;
      const anchor = run.floorMap.nodes.find((node) => node.connections.includes(treasure.id))!;
      run.floorMap.currentNodeId = anchor.id;
      run = enterRoom(run, treasure.id);
      for (const option of run.choice!.options) {
        const quality = option.itemId ? ITEMS[option.itemId]?.quality : undefined;
        if (quality === 2) qualityTwoOffers += 1;
        if (quality === 4) qualityFourOffers += 1;
      }
    }

    expect(qualityTwoOffers).toBeGreaterThan(qualityFourOffers * 2);
    expect(CARDS['skill-d6']!.cost).toBe(3);
    expect(CARDS['item:magic-mushroom']!.cost).toBe(3);
    expect(CARDS['item:breakfast']!.cost).toBe(1);
  });

  it('can leave a shop after purchasing an option', () => {
    let run = createRun('SHOP-LEAVE-AFTER-BUYING');
    const shop = run.floorMap.nodes.find((node) => node.lane === 1 && node.depth === 2)!;
    const anchor = run.floorMap.nodes.find((node) => node.connections.includes(shop.id))!;
    run.floorMap.currentNodeId = anchor.id;
    run.player.coins = 100;
    run = enterRoom(run, shop.id);
    const purchase = run.choice!.options.find((option) => option.upgrade === UpgradeKind.Heart)!;
    const purchasePrice = purchase.price!;
    run = chooseOption(run, purchase.id);
    expect(run.phase).toBe(RunPhase.Choice);
    expect(run.choice!.options.find((option) => option.id === purchase.id)?.sold).toBe(true);
    expect(run.achievementState.lifetimeCounters[AchievementMetric.CoinsSpent]).toBe(purchasePrice);

    run = skipChoice(run);
    expect(run.phase).toBe(RunPhase.Map);
    expect(run.choice).toBeUndefined();
  });

  it('offers four upgrade services and three new item-card slots in every shop', () => {
    let run = createRun('SHOP-SEVEN-SLOTS');
    const shop = run.floorMap.nodes.find((node) => node.kind === RoomKind.Shop)!;
    run.floorMap.currentNodeId = run.floorMap.nodes.find((node) => node.connections.includes(shop.id))!.id;
    run = enterRoom(run, shop.id);

    const upgrades = run.choice!.options.filter((option) => option.type === RewardOptionType.Upgrade);
    const items = run.choice!.options.filter((option) => option.type === RewardOptionType.Item);

    expect(run.choice!.options).toHaveLength(7);
    expect(upgrades.map((option) => option.upgrade)).toEqual([
      UpgradeKind.Card,
      UpgradeKind.Heart,
      UpgradeKind.Shield,
      UpgradeKind.Armor,
    ]);
    expect(
      upgrades
        .filter((option) =>
          [UpgradeKind.Heart, UpgradeKind.Shield, UpgradeKind.Armor].includes(option.upgrade!),
        )
        .map((option) => option.price),
    ).toEqual([5, 5, 5]);
    expect(items).toHaveLength(3);
    for (const option of items) {
      const item = ITEMS[option.itemId!]!;
      expect(
        itemUsesCombatCard(item) || (item.kind === ItemKind.Active && Boolean(item.skillCardId)),
        item.id,
      ).toBe(true);
    }
  });

  it('prices every permanent stat-upgrade service at 15 coins after the first floor', () => {
    let run = createRun('SHOP-LATER-FLOOR-STAT-PRICES');
    const shop = run.floorMap.nodes.find((node) => node.kind === RoomKind.Shop)!;
    run.floorMap.currentNodeId = run.floorMap.nodes.find((node) => node.connections.includes(shop.id))!.id;
    run.floorIndex = 1;
    run.player.stats.shopDiscount = 0.5;

    run = enterRoom(run, shop.id);

    for (const upgrade of [UpgradeKind.Heart, UpgradeKind.Shield, UpgradeKind.Armor]) {
      expect(run.choice!.options.find((option) => option.upgrade === upgrade)?.price).toBe(15);
    }
  });

  it('purchases a targeted deck-card upgrade only after a card is selected', () => {
    let run = createRun('SHOP-CARD-UPGRADE');
    const shop = run.floorMap.nodes.find((node) => node.kind === RoomKind.Shop)!;
    run.floorMap.currentNodeId = run.floorMap.nodes.find((node) => node.connections.includes(shop.id))!.id;
    run.player.coins = 100;
    run = enterRoom(run, shop.id);
    const option = run.choice!.options.find((entry) => entry.upgrade === UpgradeKind.Card)!;
    const card = run.player.deck.find((entry) => entry.definitionId === 'item:sad-onion')!;
    const attack = run.player.deck.find((entry) => entry.definitionId === 'basic-attack')!;
    const baseFusion = getAttackFusionPreview(run, attack.instanceId, [card.instanceId])!;
    const coinsBefore = run.player.coins;

    expect(() => chooseOption(run, option.id)).toThrow(/choose a deck card/i);
    expect(run.player.coins).toBe(coinsBefore);

    run = purchaseShopCardUpgrade(run, option.id, card.instanceId);

    expect(run.player.deck.find((entry) => entry.instanceId === card.instanceId)?.upgraded).toBe(true);
    expect(run.player.coins).toBe(coinsBefore - option.price!);
    expect(run.choice!.options.find((entry) => entry.id === option.id)?.sold).toBe(true);
    expect(run.achievementState.lifetimeCounters[AchievementMetric.CoinsSpent]).toBe(option.price);
    expect(
      getAttackFusionPreview(run, attack.instanceId, [card.instanceId])!.damageMultiplier,
    ).toBeGreaterThan(baseFusion.damageMultiplier);
    expect(() => purchaseShopCardUpgrade(run, option.id, card.instanceId)).toThrow(/unavailable/i);
  });

  it('sells permanent heart, shield-capacity, and armor upgrades', () => {
    let run = createRun('SHOP-STAT-UPGRADES');
    const shop = run.floorMap.nodes.find((node) => node.kind === RoomKind.Shop)!;
    run.floorMap.currentNodeId = run.floorMap.nodes.find((node) => node.connections.includes(shop.id))!.id;
    run.player.coins = 200;
    run.player.redHp = 1;
    run = enterRoom(run, shop.id);
    const heartSize = run.player.stats.heartSize;
    const shieldCapacity = run.player.stats.maxShield;
    const armor = run.player.stats.armor;

    for (const upgrade of [UpgradeKind.Heart, UpgradeKind.Shield, UpgradeKind.Armor]) {
      const option = run.choice!.options.find((entry) => entry.upgrade === upgrade)!;
      run = chooseOption(run, option.id);
    }

    expect(run.player.stats.heartSize).toBe(heartSize + HEART_SIZE_UPGRADE_AMOUNT);
    expect(run.player.redHp).toBe(run.player.redContainers * run.player.stats.heartSize);
    expect(run.player.stats.maxShield).toBe(shieldCapacity + SHIELD_CAPACITY_UPGRADE_AMOUNT);
    expect(run.player.stats.armor).toBe(armor + ARMOR_UPGRADE_AMOUNT);
  });

  it('records health offered through the real sacrifice-room command', () => {
    let run = createRun('SACRIFICE-ACHIEVEMENT-EVENT');
    const room = run.floorMap.nodes.find((node) => node.kind === RoomKind.Sacrifice)!;
    const anchor = run.floorMap.nodes.find((node) => node.connections.includes(room.id))!;
    run.floorMap.currentNodeId = anchor.id;
    run.player.redHp = 60;

    run = enterRoom(run, room.id);
    const sacrifice = run.choice!.options.find((option) => option.action === ChoiceAction.Sacrifice)!;
    run = chooseOption(run, sacrifice.id);

    expect(run.player.redHp).toBe(45);
    expect(run.achievementState.lifetimeCounters[AchievementMetric.SacrificeHp]).toBe(15);
  });

  it.each([
    RoomKind.Shop,
    RoomKind.Treasure,
    RoomKind.Planetarium,
    RoomKind.Curse,
    RoomKind.Sacrifice,
    RoomKind.Secret,
    RoomKind.SuperSecret,
  ])('can leave the %s without taking an offered reward', (roomKind) => {
    let run = createRun(`LEAVE-${roomKind}`);
    const room = run.floorMap.nodes.find((node) => node.kind === roomKind)!;
    if (room.optional) {
      run.floorMap.currentNodeId = room.anchorId!;
      room.doorOpened = true;
      room.revealed = true;
    } else {
      const anchor = run.floorMap.nodes.find((node) => node.connections.includes(room.id))!;
      run.floorMap.currentNodeId = anchor.id;
    }

    run = enterRoom(run, room.id);
    const playerBeforeLeaving = structuredClone(run.player);
    expect(run.choice?.canSkip).toBe(true);

    run = skipChoice(run);
    expect(run.phase).toBe(RunPhase.Map);
    expect(run.choice).toBeUndefined();
    expect(run.player).toEqual(playerBeforeLeaving);
    expect(run.player.activeItemId).toBe('d6');
  });
});

describe('combat', () => {
  it.each([RoomKind.Combat, RoomKind.Elite, RoomKind.Boss])(
    'can leave the %s reward without taking a card or item',
    (roomKind) => {
      let run = createRun(`LEAVE-${roomKind}-REWARD`);
      const room = run.floorMap.nodes.find((node) => node.kind === roomKind)!;
      const anchor = run.floorMap.nodes.find((node) => node.connections.includes(room.id))!;
      run.floorMap.currentNodeId = anchor.id;
      run = confirmPlayerDeployment(enterRoom(run, room.id));
      run = instantlyWinCombat(run);

      expect(run.choice?.canSkip).toBe(true);
      const playerBeforeLeaving = structuredClone(run.player);
      run = skipChoice(acknowledgeRoomReward(run));

      expect(run.player).toEqual(playerBeforeLeaving);
      expect(run.player.activeItemId).toBe('d6');
    },
  );

  it('uses one bomb for a 3 by 3 blast and damages a large enemy once per occupied tile', () => {
    let run = createRun('COMBAT-BOMB');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    run = confirmPlayerDeployment(run);
    run.combat!.roomLayout = { ...DEFAULT_COMBAT_ROOM_LAYOUT };
    run.player.bombs = 2;
    const target = run.combat!.enemies[0]!;
    run.combat!.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    target.position = { x: 5, y: 3 };
    target.footprintWidth = 2;
    target.footprintHeight = 2;
    target.hp = 1000;
    target.maxHp = 1000;
    target.shield = 0;
    target.armor = 0;

    run = useCombatBomb(run, 5, 3);

    expect(run.player.bombs).toBe(1);
    expect(run.achievementState.lifetimeCounters[AchievementMetric.BombsUsed]).toBe(1);
    expect(run.combat!.vitality).toBe(run.player.stats.maxVitality);
    expect(run.combat!.enemies.find((enemy) => enemy.instanceId === target.instanceId)!.hp).toBe(915);
    expect(run.combat!.animationEvents.slice(-2)).toMatchObject([
      { kind: CombatAnimationKind.BombBlast, toX: 5, toY: 3, value: 30 },
      {
        kind: CombatAnimationKind.BombHit,
        targetId: target.instanceId,
        value: 85,
        secondaryValue: 0,
        rawValue: 85,
        armorValue: 0,
        hitCount: 4,
      },
    ]);
  });

  it('hydrates movement and grid defaults in runs saved by older versions', () => {
    let run = createRun('LEGACY-COMBAT');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    delete (run.player.stats as Partial<typeof run.player.stats>).movementSpeed;
    delete (run.player.stats as Partial<typeof run.player.stats>).attackRange;
    delete run.combat!.deploymentPending;
    delete (run.combat as Partial<typeof run.combat>).roomLayout;
    delete (run.combat as Partial<typeof run.combat>).animationSequence;
    delete (run.combat as Partial<typeof run.combat>).animationEvents;
    delete (run.combat!.enemies[0] as { movementSpeed?: number }).movementSpeed;
    delete (run.combat!.enemies[0] as { visionRange?: number }).visionRange;
    delete (run.combat!.enemies[0] as { footprintWidth?: number }).footprintWidth;
    delete (run.combat!.enemies[0] as { footprintHeight?: number }).footprintHeight;
    delete (run.combat!.enemies[0] as { alerted?: boolean }).alerted;

    const hydrated = hydrateRunState(run);
    expect(getPlayerMovementSpeed(hydrated)).toBe(3);
    expect(hydrated.player.stats.attackRange).toBe(5);
    expect(hydrated.combat!.deploymentPending).toBe(false);
    expect(hydrated.combat!.animationSequence).toBe(0);
    expect(hydrated.combat!.animationEvents).toEqual([]);
    expect(hydrated.combat!.roomLayout).toMatchObject({
      shape: CombatRoomShape.Standard,
      width: 17,
      height: 9,
      unitCount: 1,
    });
    expect(getEnemyMovementSpeed(hydrated.combat!.enemies[0]!)).toBe(3);
    expect(hydrated.combat!.enemies[0]!.visionRange).toBeGreaterThan(1);
    expect(hydrated.combat!.enemies[0]!.footprintWidth).toBeGreaterThanOrEqual(1);
    expect(hydrated.combat!.enemies[0]!.alerted).toBe(false);
  });

  it('migrates 30-HP hearts and newly permanent health pickups into the compact health model', () => {
    const run = createRun('LEGACY-HEART-SCALE');
    run.version = 1;
    run.player.stats.heartSize = 30;
    run.player.redHp = 45;
    run.player.pocketHearts = [{ id: 'legacy-soul', kind: HeartKind.Soul, hp: 15, maxHp: 30 }];
    run.player.items.push('breakfast');
    run.player.deck.push(createCard(run, 'item:breakfast'));

    const hydrated = hydrateRunState(run);

    expect(hydrated.version).toBe(CURRENT_RUN_VERSION);
    expect(hydrated.player.stats.heartSize).toBe(10);
    expect(hydrated.player.redContainers).toBe(4);
    expect(hydrated.player.redHp).toBe(25);
    expect(hydrated.player.pocketHearts[0]).toMatchObject({ hp: 5, maxHp: 10 });
    expect(hydrated.player.deck.some((card) => card.definitionId === 'item:breakfast')).toBe(false);
  });

  it('migrates newly permanent heart-capacity items without replaying the version-two health migration', () => {
    const run = createRun('LEGACY-HEART-CAPACITY');
    run.version = 2;
    run.player.redHp = 17;
    run.player.pocketHearts = [{ id: 'legacy-black', kind: HeartKind.Black, hp: 5, maxHp: 10 }];
    run.player.items.push('placenta');
    run.player.deck.push(createCard(run, 'item:placenta'));

    const hydrated = hydrateRunState(run);

    expect(hydrated.version).toBe(CURRENT_RUN_VERSION);
    expect(hydrated.player.redContainers).toBe(3);
    expect(hydrated.player.stats.heartSize).toBe(13);
    expect(hydrated.player.redHp).toBe(26);
    expect(hydrated.player.pocketHearts[0]).toMatchObject({ hp: 8, maxHp: 13 });
    expect(hydrated.player.deck.some((card) => card.definitionId === 'item:placenta')).toBe(false);
  });

  it('migrates legacy familiar cards into autonomous combat assistants', () => {
    let run = createRun('LEGACY-FAMILIAR-CARD');
    equipItem(run, 'harlequin-baby');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const legacyCard = createCard(run, 'item:harlequin-baby');
    run.player.deck.push(legacyCard);
    run.combat!.drawPile.push(legacyCard.instanceId);
    run.version = 3;
    delete (run.combat as Partial<typeof run.combat>).familiars;

    const hydrated = hydrateRunState(run);

    expect(hydrated.version).toBe(CURRENT_RUN_VERSION);
    expect(hydrated.player.deck.some((card) => card.definitionId === 'item:harlequin-baby')).toBe(false);
    expect(hydrated.combat!.drawPile).not.toContain(legacyCard.instanceId);
    expect(hydrated.combat!.familiars).toEqual([
      expect.objectContaining({ itemId: 'harlequin-baby', hits: 2 }),
    ]);
  });

  it('migrates legacy tear-named combat data to attack semantics', () => {
    let run = createRun('LEGACY-ATTACK-NAMES');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    run.player.deck.find((card) => card.definitionId === 'basic-attack')!.definitionId = 'isaacs-tears';
    run.player.deck.push({ instanceId: 'legacy-wide-attack', definitionId: 'wide-tears', upgraded: false });
    (run.player.stats as unknown as { attackMode: string }).attackMode = 'tears';
    const legacyCombat = run.combat! as unknown as { attackMeter?: number; tearMeter?: number };
    delete legacyCombat.attackMeter;
    legacyCombat.tearMeter = 0.75;

    const hydrated = hydrateRunState(run);

    expect(hydrated.player.stats.attackMode).toBe(AttackMode.Basic);
    expect(hydrated.combat!.attackMeter).toBe(0.75);
    expect(hydrated.player.deck.some((card) => card.definitionId === 'basic-attack')).toBe(true);
    expect(hydrated.player.deck.some((card) => card.definitionId === 'sweeping-attack')).toBe(true);
    expect('tearMeter' in hydrated.combat!).toBe(false);
  });

  it('lets Isaac deploy on every unoccupied cell across the whole room', () => {
    let run = createRun('FREE-DEPLOYMENT');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    expect(run.combat!.deploymentPending).toBe(true);
    const cells = getPlayerDeploymentCells(run);
    const occupied = new Set(
      run
        .combat!.enemies.filter((enemy) => enemy.hp > 0)
        .flatMap((enemy) => getEnemyOccupiedCells(enemy))
        .map((cell) => `${cell.x}:${cell.y}`),
    );
    expect(cells).toHaveLength(getCombatRoomCells(run.combat!).length - occupied.size);
    expect(cells.some((cell) => cell.x >= Math.floor(run.combat!.roomLayout.width / 2))).toBe(true);

    const vitality = run.combat!.vitality;
    const destination = cells.find((cell) => cell.x >= Math.floor(run.combat!.roomLayout.width / 2))!;
    run = placePlayerForDeployment(run, destination.x, destination.y);
    expect(run.combat!.playerPosition).toEqual(destination);
    expect(run.combat!.vitality).toBe(vitality);
    expect(run.combat!.deploymentPending).toBe(true);
    expect(() => placePlayerForDeployment(run, run.combat!.roomLayout.width, 0)).toThrow(
      'outside the deployment zone',
    );

    run = confirmPlayerDeployment(run);
    expect(run.combat!.deploymentPending).toBe(false);
    expect(run.combat!.log[0]?.messageKey).toBe('deploymentConfirmed');
    expect(getPlayerDeploymentCells(run)).toHaveLength(0);
  });

  it('generates deterministic standard, double, large, and L-shaped combat rooms', () => {
    const leftSeed = createRun('VARIABLE-ROOM-DETERMINISM');
    const left = enterRoom(leftSeed, getAvailableNodes(leftSeed)[0]!);
    const rightSeed = createRun('VARIABLE-ROOM-DETERMINISM');
    const right = enterRoom(rightSeed, getAvailableNodes(rightSeed)[0]!);
    expect(left.combat!.roomLayout).toEqual(right.combat!.roomLayout);
    expect(left.combat!.enemies.map((enemy) => ({ id: enemy.id, position: enemy.position }))).toEqual(
      right.combat!.enemies.map((enemy) => ({ id: enemy.id, position: enemy.position })),
    );

    const shapes = new Set<string>();
    const anchors = new Set<string>();
    let largestEncounter = 0;
    let sawLeftHalfEnemy = false;
    let sawRightHalfEnemy = false;
    let sawLShape = false;
    for (let index = 0; index < 160; index += 1) {
      let run = createRun(`VARIABLE-ROOM-${index}`);
      run.floorIndex = index % 6;
      run = enterRoom(run, getAvailableNodes(run)[0]!);
      const combat = run.combat!;
      const roomCells = getCombatRoomCells(combat);
      const occupied = new Set<string>();
      shapes.add(combat.roomLayout.shape);
      largestEncounter = Math.max(largestEncounter, combat.enemies.length);
      if (combat.roomLayout.shape === CombatRoomShape.LShaped) {
        sawLShape = true;
        expect(combat.roomLayout.width * combat.roomLayout.height - roomCells.length).toBe(17 * 9);
      }
      for (const enemy of combat.enemies) {
        anchors.add(`${enemy.position.x}:${enemy.position.y}`);
        sawLeftHalfEnemy ||= enemy.position.x < combat.roomLayout.width / 2;
        sawRightHalfEnemy ||= enemy.position.x >= combat.roomLayout.width / 2;
        for (const cell of getEnemyOccupiedCells(enemy)) {
          const key = `${cell.x}:${cell.y}`;
          expect(roomCells).toContainEqual(cell);
          expect(occupied.has(key)).toBe(false);
          occupied.add(key);
        }
      }
      const capacity = Math.max(3, Math.floor(roomCells.length / 50));
      expect(combat.enemies.length).toBeLessThanOrEqual(capacity);
      if (combat.roomLayout.unitCount > 1) {
        if (run.floorIndex < 2) expect(combat.enemies.length).toBeGreaterThanOrEqual(3);
        else expect(combat.enemies.length).toBeGreaterThan(3);
      }
    }

    expect(shapes).toEqual(new Set(['standard', 'wide', 'tall', 'large', 'l-shaped']));
    expect(largestEncounter).toBeGreaterThan(3);
    expect(anchors.size).toBeGreaterThan(24);
    expect(sawLeftHalfEnemy && sawRightHalfEnemy && sawLShape).toBe(true);
  });

  it('keeps all multi-unit rooms uncommon while the opening deck is still developing', () => {
    const sampleRoomRates = (floorIndex: number) => {
      let multiUnitRooms = 0;
      let tripleOrLargerRooms = 0;
      let totalUnits = 0;
      const samples = 360;
      for (let index = 0; index < samples; index += 1) {
        let run = createRun(`ROOM-PROGRESSION-${floorIndex}-${index}`);
        run.floorIndex = floorIndex;
        run = enterRoom(run, getAvailableNodes(run)[0]!);
        const units = run.combat!.roomLayout.unitCount;
        if (units > 1) multiUnitRooms += 1;
        if (units >= 3) tripleOrLargerRooms += 1;
        totalUnits += units;
      }
      return {
        multiUnitRate: multiUnitRooms / samples,
        tripleOrLargerRate: tripleOrLargerRooms / samples,
        averageUnits: totalUnits / samples,
      };
    };

    const basementOne = sampleRoomRates(0);
    const basementTwo = sampleRoomRates(1);
    const cavesOne = sampleRoomRates(2);
    const depthsTwo = sampleRoomRates(5);
    expect(basementOne.multiUnitRate).toBeLessThan(0.15);
    expect(basementOne.tripleOrLargerRate).toBeLessThan(0.05);
    expect(basementTwo.multiUnitRate).toBeLessThan(0.3);
    expect(basementTwo.averageUnits).toBeLessThan(1.4);
    expect(cavesOne.multiUnitRate).toBeGreaterThan(basementTwo.multiUnitRate);
    expect(depthsTwo.tripleOrLargerRate).toBeGreaterThan(0.3);
    expect(depthsTwo.averageUnits).toBeGreaterThan(cavesOne.averageUnits);
  });

  it('can reward a large normal room with a permanent stat item outside the combat deck', () => {
    let rewarded: ReturnType<typeof createRun> | undefined;
    for (let index = 0; index < 40 && !rewarded; index += 1) {
      let run = createRun(`LARGE-ROOM-TREASURE-${index}`);
      run = enterRoom(run, getAvailableNodes(run)[0]!);
      run.combat!.roomLayout = { shape: CombatRoomShape.Large, width: 34, height: 18, unitCount: 4 };
      run = instantlyWinCombat(run);
      if (run.choice?.rewardContext === RewardContext.LargeRoom) rewarded = run;
    }

    expect(rewarded?.choice).toMatchObject({
      kind: ChoiceKind.Item,
      rewardContext: RewardContext.LargeRoom,
      canSkip: true,
    });
    expect(rewarded!.choice!.options).toHaveLength(3);
    expect(
      rewarded!.choice!.options.every((option) => {
        const item = option.itemId ? ITEMS[option.itemId] : undefined;
        return item?.pool.includes(RewardPool.LargeRoom) && item.combatCard === false;
      }),
    ).toBe(true);

    const option = rewarded!.choice!.options[0]!;
    const deckSize = rewarded!.player.deck.length;
    const statsBefore = { ...rewarded!.player.stats };
    const chosen = chooseOption(acknowledgeRoomReward(rewarded!), option.id);
    expect(chosen.player.items).toContain(option.itemId);
    expect(chosen.player.deck).toHaveLength(deckSize);
    expect(chosen.player.stats).not.toEqual(statsBefore);
  });

  it('moves distant enemies toward Isaac on the opening enemy turn', () => {
    let run = createRun('ENEMIES-ATTACK');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    run.player.stats.dodgeChance = 0;
    run.combat!.hand = run.combat!.hand.slice(0, 5);
    run.combat!.enemies.forEach((enemy) => {
      enemy.alerted = true;
    });
    const positionsBefore = new Map(
      run.combat!.enemies.map((enemy) => [
        enemy.instanceId,
        Math.abs(enemy.position.x - run.combat!.playerPosition.x) +
          Math.abs(enemy.position.y - run.combat!.playerPosition.y),
      ]),
    );

    run = endTurn(run);
    expect(run.phase).toBe(RunPhase.Discard);
    run = finishDiscard(run);

    expect(
      run.combat!.enemies.some((enemy) => {
        const distance =
          Math.abs(enemy.position.x - run.combat!.playerPosition.x) +
          Math.abs(enemy.position.y - run.combat!.playerPosition.y);
        return distance < positionsBefore.get(enemy.instanceId)!;
      }),
    ).toBe(true);
    expect(run.combat!.log.some((entry) => entry.messageKey === 'enemyMoved')).toBe(true);
  });

  it('uses every occupied footprint cell for collision and straight-line targeting', () => {
    let run = createRun('MULTI-CELL-ENEMY');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const target = run.combat!.enemies[0]!;
    run.combat!.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    target.position = { x: 5, y: 3 };
    target.footprintWidth = 2;
    target.footprintHeight = 2;
    const occupied = getEnemyOccupiedCells(target);
    expect(occupied).toEqual(
      expect.arrayContaining([
        { x: 5, y: 3 },
        { x: 6, y: 3 },
        { x: 5, y: 4 },
        { x: 6, y: 4 },
      ]),
    );
    const reachable = getReachablePlayerCells(run);
    expect(reachable).not.toContainEqual({ x: 5, y: 4 });

    const attack = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    run.combat!.hand = [attack.instanceId];
    expect(canPlayCard(run, attack.instanceId, target.instanceId)).toEqual({ ok: true });
  });

  it('caps shield at 15 and disables shield or recovery cards when their resource is full', () => {
    let run = createRun('PLAYER-RESOURCE-CAPS');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const crosses = run.player.deck.filter((card) => card.definitionId === 'wooden-cross');
    const treatment = run.player.deck.find((card) => card.definitionId === 'half-heart')!;
    run.combat!.hand = [crosses[0]!.instanceId, crosses[1]!.instanceId, treatment.instanceId];
    run.combat!.vitality = 5;

    expect(getPlayerShieldCapacity(run)).toBe(15);
    expect(run.combat!.playerShield).toBe(10);
    expect(canPlayCard(run, treatment.instanceId)).toEqual({
      ok: false,
      reason: 'Red-heart HP is already full',
    });

    run = playCard(run, crosses[0]!.instanceId);
    expect(run.combat!.playerShield).toBe(15);
    expect(canPlayCard(run, crosses[1]!.instanceId)).toEqual({
      ok: false,
      reason: 'Shield is already at maximum',
    });

    run.player.stats.maxShield += 5;
    expect(getPlayerShieldCapacity(run)).toBe(20);
    expect(canPlayCard(run, crosses[1]!.instanceId)).toEqual({ ok: true });

    run.player.redHp -= 4;
    expect(canPlayCard(run, treatment.instanceId)).toEqual({ ok: true });
    run = playCard(run, treatment.instanceId);
    expect(run.player.redHp).toBe(30);
    expect(run.combat!.log[0]).toMatchObject({ messageKey: 'heal', params: { amount: 4 } });
  });

  it('makes an upgraded Treatment heal exactly three more HP', () => {
    let run = createRun('UPGRADED-TREATMENT');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const treatment = run.player.deck.find((card) => card.definitionId === 'half-heart')!;
    treatment.upgraded = true;
    run.player.redHp = 10;
    run.combat!.hand = [treatment.instanceId];
    run.combat!.vitality = 5;

    run = playCard(run, treatment.instanceId);

    expect(run.player.redHp).toBe(23);
    expect(run.combat!.log[0]).toMatchObject({ messageKey: 'heal', params: { amount: 13 } });
  });

  it('uses the zero-cost starter Vitality Shot once to gain two vitality for the current turn', () => {
    let run = createRun('STARTER-VITALITY-SHOT');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const shot = run.player.deck.find((card) => card.definitionId === 'vitality-shot')!;
    const maxVitality = run.player.stats.maxVitality;
    run.combat!.hand = [shot.instanceId];
    run.combat!.vitality = maxVitality;

    run = playCard(run, shot.instanceId);

    expect(run.combat!.vitality).toBe(maxVitality + 2);
    expect(run.player.stats.maxVitality).toBe(maxVitality);
    expect(run.player.deck.some((card) => card.instanceId === shot.instanceId)).toBe(false);
    expect(run.combat!.discardPile).not.toContain(shot.instanceId);
    expect(run.combat!.exhausted).toContain(shot.instanceId);
    expect(run.combat!.log[0]).toMatchObject({ messageKey: 'vitality', params: { amount: 2 } });
  });

  it('lets item cards overflow the shield capacity while Wooden Cross remains capped', () => {
    let run = createRun('ITEM-SHIELD-OVERFLOW');
    equipItem(run, 'holy-mantle');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const mantle = run.player.deck.find((card) => card.definitionId === 'item:holy-mantle')!;
    const cross = run.player.deck.find((card) => card.definitionId === 'wooden-cross')!;
    run.combat!.hand = [mantle.instanceId, cross.instanceId];
    run.combat!.playerShield = getPlayerShieldCapacity(run);
    run.combat!.vitality = 5;

    expect(canPlayCard(run, mantle.instanceId)).toEqual({ ok: true });
    run = playCard(run, mantle.instanceId);

    expect(getPlayerShieldCapacity(run)).toBe(15);
    expect(run.combat!.playerShield).toBe(45);
    expect(canPlayCard(run, cross.instanceId)).toEqual({
      ok: false,
      reason: 'Shield is already at maximum',
    });
  });

  it('wanders randomly instead of attacking while Isaac is outside sight and it has not been hit', () => {
    let run = createRun('ENEMY-WANDER');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const enemy = run.combat!.enemies[0]!;
    run.combat!.enemies.slice(1).forEach((entry) => {
      entry.hp = 0;
    });
    enemy.position = { x: 13, y: 0 };
    enemy.visionRange = 1;
    enemy.alerted = false;
    enemy.intent = {
      kind: IntentKind.Attack,
      value: 99,
      label: 'Attack',
      actions: [{ kind: IntentKind.Attack, value: 99 }],
    };
    run.combat!.hand = run.combat!.hand.slice(0, 5);
    expect(isPlayerInEnemyVision(run, enemy.instanceId)).toBe(false);
    const redHpBefore = run.player.redHp;
    const shieldBefore = run.combat!.playerShield;

    run = finishDiscard(endTurn(run));
    expect(run.player.redHp).toBe(redHpBefore);
    expect(run.combat!.playerShield).toBe(shieldBefore);
    expect(
      run.combat!.log.some(
        (entry) => entry.messageKey === 'enemyWandered' || entry.messageKey === 'enemyWanderIdle',
      ),
    ).toBe(true);
  });

  it('lets jumping enemies cross diagonally and deal contact damage', () => {
    let run = createRun('DIAGONAL-JUMPER');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const enemy = run.combat!.enemies[0]!;
    run.combat!.enemies.slice(1).forEach((entry) => {
      entry.hp = 0;
    });
    run.combat!.playerPosition = { x: 2, y: 4 };
    run.combat!.playerShield = 0;
    run.player.stats.dodgeChance = 0;
    enemy.position = { x: 6, y: 0 };
    enemy.footprintWidth = 2;
    enemy.footprintHeight = 2;
    enemy.movementPattern = EnemyMovementPattern.DiagonalJump;
    enemy.movementSpeed = 3;
    enemy.attackRange = 1;
    enemy.visionRange = 10;
    enemy.alerted = true;
    enemy.intent = {
      kind: IntentKind.Attack,
      value: 12,
      label: 'Attack',
      actions: [{ kind: IntentKind.Attack, value: 12 }],
    };
    run.combat!.hand = run.combat!.hand.slice(0, 5);
    const redHpBefore = run.player.redHp;

    run = finishDiscard(endTurn(run));
    expect(
      run.combat!.animationEvents.some(
        (event) =>
          event.kind === CombatAnimationKind.Move &&
          event.sourceId === enemy.instanceId &&
          event.movementStyle === CombatMovementStyle.Jump,
      ),
    ).toBe(true);
    expect(run.player.redHp).toBeLessThan(redHpBefore);
    expect(run.combat!.log.some((entry) => entry.messageKey === 'enemyAttack')).toBe(true);
  });

  it('spends one vitality to move up to Isaac movement speed on the 17 by 9 grid', () => {
    let run = createRun('TACTICAL-MOVE');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    expect(run.combat!.playerPosition).toEqual({ x: 0, y: 4 });
    const reachable = getReachablePlayerCells(run);
    expect(reachable).toContainEqual({ x: 3, y: 4 });
    expect(reachable).not.toContainEqual({ x: 4, y: 4 });

    const vitalityBefore = run.combat!.vitality;
    run = movePlayer(run, 2, 4);
    expect(run.combat!.playerPosition).toEqual({ x: 2, y: 4 });
    expect(run.combat!.vitality).toBe(vitalityBefore - 1);
    expect(run.combat!.animationEvents.at(-1)).toMatchObject({
      kind: CombatAnimationKind.Move,
      sourceId: 'isaac',
      fromX: 0,
      fromY: 4,
      toX: 2,
      toY: 4,
    });
  });

  it('requires Isaac to move into range before playing an attack', () => {
    let run = createRun('TACTICAL-RANGE');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const target = run.combat!.enemies[0]!;
    target.position = { x: 11, y: 4 };
    run.combat!.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    const attack = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    run.combat!.hand = [attack.instanceId];
    expect(() => playCard(run, attack.instanceId, target.instanceId)).toThrow(/outside attack range/i);

    run = movePlayer(run, 3, 4);
    run = movePlayer(run, 6, 4);
    const hpBefore = target.hp;
    run = playCard(run, attack.instanceId, target.instanceId);
    expect(run.combat!.enemies[0]!.hp).toBeLessThan(hpBefore);
  });

  it('calculates Double Shot and Sweeping Attack from attack damage', () => {
    let run = createRun('ATTACK-DAMAGE-RATIOS');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    run.player.stats.baseDamage = 20;
    run.player.stats.critChance = 0;
    const first = run.combat!.enemies[0]!;
    const second = run.combat!.enemies[1]!;
    first.position = { x: 4, y: 4 };
    second.position = { x: 5, y: 4 };
    [first, second].forEach((enemy) => {
      enemy.maxHp = 100;
      enemy.hp = 100;
      enemy.armor = 0;
      enemy.shield = 0;
      enemy.footprintWidth = 1;
      enemy.footprintHeight = 1;
    });
    run.combat!.enemies.slice(2).forEach((enemy) => {
      enemy.hp = 0;
    });
    const doubleShot = createCard(run, 'double-shot');
    const sweepingAttack = createCard(run, 'sweeping-attack');
    run.player.deck.push(doubleShot, sweepingAttack);
    run.combat!.hand = [doubleShot.instanceId, sweepingAttack.instanceId];

    run = playCard(run, doubleShot.instanceId, first.instanceId);
    expect(run.combat!.enemies[0]!.hp).toBe(72);
    expect(run.combat!.enemies[1]!.hp).toBe(100);

    run = playCard(run, sweepingAttack.instanceId);
    expect(run.combat!.enemies[0]!.hp).toBe(59);
    expect(run.combat!.enemies[1]!.hp).toBe(87);
  });

  it('keeps the final defeat event available before the room reward choice', () => {
    let run = createRun('FINAL-DEFEAT-TRANSITION');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const target = run.combat!.enemies[0]!;
    target.position = { x: 4, y: 4 };
    target.hp = 1;
    target.armor = 0;
    target.shield = 0;
    run.combat!.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    const attack = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    run.combat!.hand = [attack.instanceId];
    const previousSequence = run.combat!.animationSequence;

    run = playCard(run, attack.instanceId, target.instanceId);

    expect(run.phase).toBe(RunPhase.Choice);
    expect(run.choice?.requiresRewardConfirmation).toBe(true);
    expect(() => chooseOption(run, run.choice!.options[0]!.id)).toThrow(/acknowledge/i);
    run = acknowledgeRoomReward(run);
    expect(run.choice?.requiresRewardConfirmation).toBe(false);
    expect(
      run
        .combat!.animationEvents.filter((event) => event.sequence > previousSequence)
        .map((event) => event.kind),
    ).toEqual([CombatAnimationKind.CardPlay, CombatAnimationKind.PlayerAttack, CombatAnimationKind.Defeat]);
  });

  it('records the complete player attack calculation for the slower damage animation', () => {
    let run = createRun('PLAYER-ATTACK-CALCULATION');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const target = run.combat!.enemies[0]!;
    target.position = { x: 4, y: 4 };
    target.hp = 100;
    target.maxHp = 100;
    target.armor = 2;
    target.shield = 4;
    run.combat!.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    run.player.stats.critChance = 0;
    const attack = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    run.combat!.hand = [attack.instanceId];

    run = playCard(run, attack.instanceId, target.instanceId);

    expect(run.combat!.enemies[0]).toMatchObject({ hp: 100, shield: 0 });
    expect(run.combat!.animationEvents.at(-1)).toMatchObject({
      kind: CombatAnimationKind.PlayerAttack,
      targetId: target.instanceId,
      rawValue: 6,
      armorValue: 2,
      secondaryValue: 4,
      value: 0,
      hitCount: 1,
    });
  });

  it('never changes targets automatically when another enemy enters the firing line', () => {
    let run = createRun('MOVE-RETARGET');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    expect(run.combat!.selectedEnemyId).toBeUndefined();
    const previousTarget = run.combat!.enemies[0]!;
    const alignedTarget = run.combat!.enemies[1]!;
    previousTarget.position = { x: 15, y: 0 };
    alignedTarget.position = { x: 6, y: 4 };
    run.combat!.enemies.slice(2).forEach((enemy) => {
      enemy.hp = 0;
    });
    run.combat!.selectedEnemyId = previousTarget.instanceId;
    const attack = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    run.combat!.hand = [attack.instanceId];

    run = movePlayer(run, 1, 4);

    expect(run.combat!.selectedEnemyId).toBe(previousTarget.instanceId);
    expect(canPlayCard(run, attack.instanceId)).toEqual({ ok: true });
    expect(() => playCard(run, attack.instanceId)).toThrow(/choose an enemy target/i);
    expect(canPlayCard(run, attack.instanceId, run.combat!.selectedEnemyId)).toEqual({
      ok: false,
      reason: 'Target is outside attack range',
    });
    run = selectEnemy(run, alignedTarget.instanceId);
    expect(canPlayCard(run, attack.instanceId, run.combat!.selectedEnemyId)).toEqual({ ok: true });
    const hpBefore = alignedTarget.hp;
    run = playCard(run, attack.instanceId, run.combat!.selectedEnemyId);
    expect(run.combat!.enemies[1]!.hp).toBeLessThan(hpBefore);
  });

  it('lets the player choose which of multiple enemies in range receives a targeted attack', () => {
    let run = createRun('CHOOSE-RANGED-TARGET');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const first = run.combat!.enemies[0]!;
    const second = run.combat!.enemies[1]!;
    run.combat!.playerPosition = { x: 0, y: 4 };
    first.footprintWidth = 1;
    first.footprintHeight = 1;
    second.footprintWidth = 1;
    second.footprintHeight = 1;
    first.position = { x: 0, y: 1 };
    second.position = { x: 5, y: 4 };
    run.combat!.enemies.slice(2).forEach((enemy) => {
      enemy.hp = 0;
    });
    run.combat!.selectedEnemyId = undefined;
    const attack = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    run.combat!.hand = [attack.instanceId];
    const firstHp = first.hp;
    const secondHp = second.hp;

    expect(canPlayCard(run, attack.instanceId)).toEqual({ ok: true });
    expect(() => playCard(run, attack.instanceId)).toThrow(/choose an enemy target/i);
    run = playCard(run, attack.instanceId, second.instanceId);

    expect(run.combat!.enemies[0]!.hp).toBe(firstHp);
    expect(run.combat!.enemies[1]!.hp).toBeLessThan(secondHp);
    expect(run.combat!.selectedEnemyId).toBe(second.instanceId);
  });

  it('deals reduced contact damage to an enemy crossed before the selected target', () => {
    let run = createRun('PROJECTILE-GRAZE-CONTACT');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const crossed = run.combat!.enemies[0]!;
    const target = run.combat!.enemies[1]!;
    run.combat!.playerPosition = { x: 0, y: 4 };
    [crossed, target].forEach((enemy) => {
      enemy.maxHp = 100;
      enemy.hp = 100;
      enemy.armor = 0;
      enemy.shield = 0;
      enemy.footprintWidth = 1;
      enemy.footprintHeight = 1;
    });
    crossed.position = { x: 3, y: 4 };
    target.position = { x: 5, y: 4 };
    run.combat!.enemies.slice(2).forEach((enemy) => {
      enemy.hp = 0;
    });
    run.player.stats.critChance = 0;
    const attack = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    run.combat!.hand = [attack.instanceId];

    run = playCard(run, attack.instanceId, target.instanceId);

    expect(run.combat!.enemies[0]!.hp).toBe(97);
    expect(run.combat!.enemies[1]!.hp).toBe(94);
    expect(run.combat!.log.some((entry) => entry.messageKey === 'projectileGraze')).toBe(true);
    expect(
      run.combat!.animationEvents.some(
        (event) => event.targetId === crossed.instanceId && event.contactDamageScale === 0.5,
      ),
    ).toBe(true);
  });

  it('fuses an item card into one attack while only charging the attack vitality', () => {
    let run = createRun('FUSION-KNOCKBACK');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    equipItem(run, 'terra');
    const combat = run.combat!;
    const target = combat.enemies[0]!;
    target.position = { x: 4, y: 4 };
    target.maxHp = 100;
    target.hp = 100;
    target.armor = 0;
    target.shield = 0;
    combat.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    run.player.stats.critChance = 0;
    const attack = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    const terra = run.player.deck.find((card) => card.definitionId === 'item:terra')!;
    combat.hand = [attack.instanceId, terra.instanceId];
    combat.drawPile = combat.drawPile.filter((id) => !combat.hand.includes(id));
    combat.discardPile = [];
    combat.vitality = 5;

    expect(getAttackFusionPreview(run, attack.instanceId, [terra.instanceId])).toMatchObject({
      totalCost: 1,
      flatDamage: 3,
      projectileScale: 1.35,
      projectileDiameter: 0.4 * 1.35,
      contactDamageRatio: 0.5,
      knockback: 2,
    });
    run = playFusedAttack(run, attack.instanceId, [terra.instanceId], target.instanceId);

    expect(run.combat!.vitality).toBe(4);
    expect(run.combat!.enemies[0]!.hp).toBe(91);
    expect(run.combat!.enemies[0]!.position).toEqual({ x: 6, y: 4 });
    expect(run.combat!).toMatchObject({ playerDamageBuff: 0, playerArmorBuff: 0, usedPassiveItems: [] });
    expect(run.combat!.hand).toEqual([]);
    expect(run.combat!.discardPile).toEqual(expect.arrayContaining([attack.instanceId, terra.instanceId]));
  });

  it('only reports a fusion opportunity when a compatible item card is actually in hand', () => {
    let run = createRun('FUSION-OPPORTUNITY');
    equipItem(run, 'terra');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const attack = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    const terra = run.player.deck.find((card) => card.definitionId === 'item:terra')!;
    run.combat!.hand = [attack.instanceId];
    expect(getAttackFusionMaterialIds(run, attack.instanceId)).toEqual([]);

    run.combat!.hand.push(terra.instanceId);
    expect(getAttackFusionMaterialIds(run, attack.instanceId)).toEqual([terra.instanceId]);
  });

  it('stacks fusion multipliers geometrically and applies poison and slow over enemy turns', () => {
    let run = createRun('FUSION-STATUS');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    equipItem(run, 'pentagram');
    equipItem(run, 'squeezy');
    const combat = run.combat!;
    const target = combat.enemies[0]!;
    target.position = { x: 4, y: 4 };
    target.maxHp = 100;
    target.hp = 100;
    target.armor = 0;
    target.shield = 0;
    target.intent = {
      kind: IntentKind.Idle,
      value: 0,
      label: 'Idle',
      actions: [{ kind: IntentKind.Idle, value: 0 }],
    };
    combat.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    run.player.stats.critChance = 0;
    const attack = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    const pentagram = run.player.deck.find((card) => card.definitionId === 'item:pentagram')!;
    const squeezy = run.player.deck.find((card) => card.definitionId === 'item:squeezy')!;
    const fusedItems = [pentagram.instanceId, squeezy.instanceId];
    combat.hand = [attack.instanceId, ...fusedItems];
    combat.drawPile = combat.drawPile.filter((id) => !combat.hand.includes(id));
    combat.discardPile = [];
    const preview = getAttackFusionPreview(run, attack.instanceId, fusedItems)!;
    expect(preview.totalCost).toBe(1);
    expect(preview.damageMultiplier).toBeCloseTo(1.32);
    expect(preview.projectileScale).toBeCloseTo(1.3);
    expect(preview.projectileDiameter).toBeCloseTo(0.4 * 1.3);
    expect(preview.contactDamageRatio).toBe(0.5);
    expect(preview).toMatchObject({ poisonTurns: 2, poisonDamage: 3, slowTurns: 2 });
    combat.vitality = 0;
    expect(canPlayFusedAttack(run, attack.instanceId, fusedItems, target.instanceId)).toMatchObject({
      ok: false,
    });
    combat.vitality = 1;

    run = playFusedAttack(run, attack.instanceId, fusedItems, target.instanceId);
    expect(run.combat!.vitality).toBe(0);
    expect(run.combat!.enemies[0]!.hp).toBe(92);
    expect(run.combat!.enemies[0]).toMatchObject({ poisonTurns: 2, poisonDamage: 3, slowedTurns: 2 });
    expect(getEnemyMovementSpeed(run.combat!.enemies[0]!)).toBe(
      Math.max(1, Math.ceil(target.movementSpeed / 2)),
    );
    expect(run.combat!).toMatchObject({
      playerDamageMultiplier: 1,
      playerFireRateBuff: 0,
      usedPassiveItems: [],
    });

    run = endTurn(run);
    run = finishDiscard(run);
    expect(run.combat!.enemies[0]!.hp).toBe(89);
    expect(run.combat!.enemies[0]).toMatchObject({ poisonTurns: 1, slowedTurns: 1 });
    expect(run.combat!.log.some((entry) => entry.messageKey === 'enemyPoisoned')).toBe(true);
  });

  it('only allows straight-line attacks until Spoon Bender is played', () => {
    let run = createRun('CURVED-SHOTS');
    equipItem(run, 'spoon-bender');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const target = run.combat!.enemies[0]!;
    target.position = { x: 3, y: 2 };
    run.combat!.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    const attack = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    const spoonBender = run.player.deck.find((card) => card.definitionId === 'item:spoon-bender')!;
    run.combat!.hand = [attack.instanceId, spoonBender.instanceId];

    expect(() => playCard(run, attack.instanceId, target.instanceId)).toThrow(/outside attack range/i);
    run = playCard(run, spoonBender.instanceId);
    const hpBefore = target.hp;
    run = playCard(run, attack.instanceId, target.instanceId);
    expect(run.combat!.enemies[0]!.hp).toBeLessThan(hpBefore);
  });

  it('turns preparation into a guaranteed doubled attack', () => {
    let run = createRun('PREPARE-THEN-HIT');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const enemyId = run.combat!.enemies[0]!.instanceId;
    run.combat!.enemies[0]!.position = { x: 1, y: 4 };
    run.combat!.enemies.forEach((enemy, index) => {
      enemy.intent =
        index === 0
          ? {
              kind: IntentKind.Prepare,
              value: 0,
              label: 'Preparing…',
              actions: [{ kind: IntentKind.Prepare, value: 0 }],
            }
          : {
              kind: IntentKind.Idle,
              value: 0,
              label: 'Staggered',
              actions: [{ kind: IntentKind.Idle, value: 0 }],
            };
    });
    run.combat!.hand = [];
    run = endTurn(run);
    run = finishDiscard(run);
    const prepared = run.combat!.enemies.find((enemy) => enemy.instanceId === enemyId)!;
    expect(prepared.intent.actions).toEqual([{ kind: IntentKind.Attack, value: prepared.attack * 2 }]);

    const durabilityBefore = run.player.redHp + run.combat!.playerShield;
    run.combat!.hand = [];
    run = endTurn(run);
    run = finishDiscard(run);
    expect(run.player.redHp + run.combat!.playerShield).toBeLessThan(durabilityBefore);
  });

  it('lets wounded enemies react with one recovery action after moving', () => {
    let run = createRun('REACTIVE-ENEMY');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const enemy = run.combat!.enemies[0]!;
    enemy.position = { x: 10, y: 3 };
    enemy.behavior = 'hexer';
    enemy.hp -= 12;
    enemy.damageTakenThisRound = 12;
    enemy.reactionCooldown = 0;
    enemy.alerted = true;
    run.combat!.enemies.forEach((entry) => {
      entry.intent =
        entry.instanceId === enemy.instanceId
          ? {
              kind: IntentKind.Attack,
              value: 1,
              label: 'Attack 1',
              actions: [{ kind: IntentKind.Attack, value: 1 }],
            }
          : {
              kind: IntentKind.Idle,
              value: 0,
              label: 'Staggered',
              actions: [{ kind: IntentKind.Idle, value: 0 }],
            };
    });
    run.combat!.hand = [];
    run = endTurn(run);
    run = finishDiscard(run);
    const reacting = run.combat!.enemies.find((entry) => entry.instanceId === enemy.instanceId)!;
    expect(reacting.intent.actions).toEqual([{ kind: IntentKind.Heal, value: 10 }]);

    const hpBefore = reacting.hp;
    const deckBefore = run.player.deck.length;
    const positionBefore = { ...reacting.position };
    run.combat!.hand = [];
    run = endTurn(run);
    run = finishDiscard(run);
    const recovered = run.combat!.enemies.find((entry) => entry.instanceId === enemy.instanceId)!;
    expect(recovered.hp).toBeGreaterThan(hpBefore);
    expect(run.player.deck.length).toBe(deckBefore);
    expect(recovered.position).not.toEqual(positionBefore);
  });

  it('moves and executes one defensive intent without an extra counterattack', () => {
    let run = createRun('SAVED-DEFENSE-BUNDLE');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const enemy = run.combat!.enemies[0]!;
    enemy.position = { x: 10, y: 4 };
    enemy.alerted = true;
    run.combat!.enemies.slice(1).forEach((entry) => {
      entry.hp = 0;
    });
    enemy.intent = {
      kind: IntentKind.Shield,
      value: 9,
      label: 'Guard 9 + Recover 8',
      actions: [
        { kind: IntentKind.Shield, value: 9 },
        { kind: IntentKind.Heal, value: 8 },
      ],
    };
    run.player.stats.dodgeChance = 0;
    run.combat!.playerShield = 0;
    run.combat!.hand = [];
    const hpBefore = run.player.redHp;
    const positionBefore = { ...enemy.position };

    run = endTurn(run);
    run = finishDiscard(run);

    expect(run.player.redHp).toBe(hpBefore);
    expect(run.combat!.enemies[0]!.shield).toBe(9);
    expect(run.combat!.enemies[0]!.position).not.toEqual(positionBefore);
    expect(run.combat!.log.some((entry) => entry.messageKey === 'enemyAttack')).toBe(false);
  });

  it('resolves both telegraphed boss instructions in order', () => {
    let run = createRun('BOSS-DOUBLE-ACTION');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const boss = run.combat!.enemies[0]!;
    run.combat!.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    Object.assign(boss, {
      boss: true,
      behavior: 'boss',
      position: { x: 1, y: 4 },
      attackRange: 5,
      movementPattern: EnemyMovementPattern.Cardinal,
      alerted: true,
      intent: {
        kind: IntentKind.Attack,
        value: 8,
        label: 'Attack 8 + Attack 6',
        actions: [
          { kind: IntentKind.Attack, value: 8 },
          { kind: IntentKind.Attack, value: 6 },
        ],
      },
    });
    run.player.stats.armor = 0;
    run.player.stats.dodgeChance = 0;
    run.combat!.playerShield = 0;
    run.combat!.hand = [];
    const hpBefore = run.player.redHp;

    run = finishDiscard(endTurn(run));

    expect(run.player.redHp).toBe(hpBefore - 14);
    expect(run.combat!.log.filter((entry) => entry.messageKey === 'enemyAttack')).toHaveLength(2);
    expect(
      run.combat!.animationEvents.filter((event) => event.kind === CombatAnimationKind.EnemyAttack),
    ).toHaveLength(2);
    expect(run.combat!.enemies[0]!.intent.actions).toHaveLength(2);
  });

  it('lets Isaac dodge a boss attack by leaving its telegraphed target cells', () => {
    let run = createRun('BOSS-TELEGRAPH-DODGE');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const boss = run.combat!.enemies[0]!;
    run.combat!.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    Object.assign(boss, {
      boss: true,
      alerted: true,
      position: { x: 8, y: 3 },
      intent: {
        kind: IntentKind.Attack,
        value: 20,
        label: 'ground-stomp 20 @ (0, 4)',
        actions: [
          {
            kind: IntentKind.Attack,
            value: 20,
            pattern: BossAttackPattern.GroundStomp,
            targetX: 0,
            targetY: 4,
            radius: 1,
          },
        ],
      },
    });
    run.combat!.playerPosition = { x: 3, y: 4 };
    run.combat!.playerShield = 0;
    run.combat!.hand = [];
    const hpBefore = run.player.redHp;

    run = finishDiscard(endTurn(run));

    expect(run.player.redHp).toBe(hpBefore);
    expect(run.combat!.log.some((entry) => entry.messageKey === 'bossPatternDodged')).toBe(true);
    expect(
      run.combat!.animationEvents.some(
        (event) =>
          event.kind === CombatAnimationKind.EnemyAttack &&
          event.bossPattern === BossAttackPattern.GroundStomp &&
          event.value === 0,
      ),
    ).toBe(true);
  });

  it('uses a boss charge as a doubled first attack on the following turn', () => {
    let run = createRun('BOSS-CHARGE-NEXT-ATTACK');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const boss = run.combat!.enemies[0]!;
    run.combat!.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    Object.assign(boss, {
      boss: true,
      behavior: 'boss',
      attack: 10,
      position: { x: 1, y: 4 },
      attackRange: 5,
      movementPattern: EnemyMovementPattern.Cardinal,
      alerted: true,
      behaviorStep: 0,
      intent: {
        kind: IntentKind.Attack,
        value: 10,
        label: 'Attack 10 + Preparing…',
        actions: [
          { kind: IntentKind.Attack, value: 10 },
          { kind: IntentKind.Prepare, value: 0 },
        ],
      },
    });
    run.player.stats.armor = 0;
    run.player.stats.dodgeChance = 0;
    run.combat!.playerShield = 0;
    run.combat!.hand = [];

    run = finishDiscard(endTurn(run));

    const chargedBoss = run.combat!.enemies[0]!;
    expect(chargedBoss.prepared).toBe(true);
    expect(chargedBoss.intent.actions?.[0]).toEqual({ kind: IntentKind.Attack, value: 20 });
    expect(chargedBoss.intent.actions).toHaveLength(2);
  });

  it('lets a boss summon a minion without granting it an immediate action', () => {
    let run = createRun('BOSS-SUMMON');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const boss = run.combat!.enemies[0]!;
    run.combat!.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    Object.assign(boss, {
      boss: true,
      behavior: 'boss',
      position: { x: 1, y: 4 },
      attackRange: 5,
      movementPattern: EnemyMovementPattern.Cardinal,
      alerted: true,
      intent: {
        kind: IntentKind.Summon,
        value: 1,
        label: 'Summon 1 + Guard 4',
        actions: [
          { kind: IntentKind.Summon, value: 1 },
          { kind: IntentKind.Shield, value: 4 },
        ],
      },
    });
    run.combat!.hand = [];

    run = finishDiscard(endTurn(run));

    expect(run.combat!.enemies.filter((enemy) => enemy.hp > 0 && !enemy.boss)).toHaveLength(1);
    expect(run.combat!.enemies[0]!.shield).toBe(4);
    expect(run.combat!.animationEvents.some((event) => event.kind === CombatAnimationKind.Summon)).toBe(true);
    expect(run.combat!.log.some((entry) => entry.messageKey === 'bossSummon')).toBe(true);
    expect(run.combat!.log.some((entry) => entry.messageKey === 'enemyAttack')).toBe(false);
  });

  it('moves into a straight firing line and attacks in the same enemy turn', () => {
    let run = createRun('MOVE-THEN-ATTACK');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const enemy = run.combat!.enemies[0]!;
    run.combat!.enemies.slice(1).forEach((entry) => {
      entry.hp = 0;
    });
    enemy.position = { x: 7, y: 4 };
    enemy.movementSpeed = 2;
    enemy.attackRange = 5;
    enemy.alerted = true;
    enemy.intent = {
      kind: IntentKind.Attack,
      value: 12,
      label: 'Attack 12',
      actions: [{ kind: IntentKind.Attack, value: 12 }],
    };
    run.player.stats.dodgeChance = 0;
    run.combat!.playerShield = 0;
    run.combat!.hand = [];
    const hpBefore = run.player.redHp;

    run = endTurn(run);
    run = finishDiscard(run);

    expect(run.combat!.enemies[0]!.position).toEqual({ x: 5, y: 4 });
    expect(run.player.redHp).toBeLessThan(hpBefore);
    expect(run.combat!.log.some((entry) => entry.messageKey === 'enemyMoved')).toBe(true);
    expect(run.combat!.log.some((entry) => entry.messageKey === 'enemyAttack')).toBe(true);
  });

  it('turns fire rate into predictable echo hits', () => {
    let run = createRun('FAST-ATTACKS');
    run = enterRoom(
      run,
      getAvailableNodes(run).find((id) => id.includes('l1'))!,
    );
    run.player.stats.fireRate = 1.5;
    run.player.stats.critChance = 0;
    const target = run.combat!.enemies[0]!;
    target.position = { x: 4, y: 4 };
    run.combat!.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    target.maxHp = 100;
    target.hp = 100;
    target.armor = 0;
    target.shield = 0;
    const attacks = run.player.deck.filter((card) => card.definitionId === 'basic-attack').slice(0, 2);
    run.combat!.hand = attacks.map((card) => card.instanceId);
    run.combat!.drawPile = run.combat!.drawPile.filter((id) => !run.combat!.hand.includes(id));
    run.combat!.selectedEnemyId = target.instanceId;
    run = playCard(run, attacks[0]!.instanceId, target.instanceId);
    run = playCard(run, attacks[1]!.instanceId, target.instanceId);
    expect(run.combat!.enemies[0]!.hp).toBe(82);
    expect(new Set(run.combat!.log.map((entry) => entry.id)).size).toBe(run.combat!.log.length);
  });

  it('always enters a discard stage and requires retaining no more than five before enemies act', () => {
    let run = createRun('RETAIN-5');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    expect(run.combat!.hand).toHaveLength(7);
    run = endTurn(run);
    expect(run.phase).toBe(RunPhase.Discard);
    const discardable = run.combat!.hand.filter(
      (id) =>
        CARDS[run.player.deck.find((card) => card.instanceId === id)!.definitionId]!.type !== CardType.Skill,
    );
    run = discardCard(run, discardable[0]!);
    run = discardCard(run, discardable[1]!);
    expect(run.combat!.hand.length).toBeLessThanOrEqual(5);
    run = finishDiscard(run);
    expect(run.combat!.round).toBe(2);
    expect(run.combat!.vitality).toBe(5);
  });

  it('offers the discard stage even when the hand is already under the retain limit', () => {
    let run = createRun('OPTIONAL-DISCARD');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    run.combat!.hand = run.combat!.hand.slice(0, 4);
    run = endTurn(run);
    expect(run.phase).toBe(RunPhase.Discard);
    expect(run.combat!.round).toBe(1);
    run = finishDiscard(run);
    expect(run.combat!.round).toBe(2);
  });

  it('makes a curse replace a special intent with one weakened attack', () => {
    let run = createRun('CURSE-IS-NOT-A-STUN');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const target = run.combat!.enemies[0]!;
    target.position = { x: 1, y: 4 };
    run.combat!.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    target.intent = {
      kind: IntentKind.Attack,
      value: 20,
      label: 'Attack 20 + Guard 9',
      actions: [
        { kind: IntentKind.Attack, value: 20 },
        { kind: IntentKind.Shield, value: 9 },
      ],
    };
    const curse = createCard(run, 'bad-trip');
    run.player.deck.push(curse);
    run.combat!.hand = [curse.instanceId];
    run.player.stats.armor = 0;
    run.player.stats.dodgeChance = 0;
    run.combat!.playerShield = 0;

    run = playCard(run, curse.instanceId, target.instanceId);
    run = endTurn(run);
    run = finishDiscard(run);

    expect(run.player.redHp).toBe(18);
    expect(run.combat!.enemies[0]!.shield).toBe(0);
    expect(run.combat!.enemies[0]!.cursedTurns).toBe(1);
    expect(run.combat!.log.some((entry) => entry.messageKey === 'enemyWeakened')).toBe(true);
  });

  it('detonates an emptied black heart against the whole room', () => {
    let run = createRun('BLACK-HEART');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    addPocketHeart(run, HeartKind.Black);
    run.player.pocketHearts.at(-1)!.hp = 1;
    run.player.stats.armor = 0;
    run.combat!.playerShield = 0;
    run.combat!.hand = run.combat!.hand.slice(0, 5);
    run.combat!.enemies.forEach((enemy, index) => {
      enemy.position = index === 0 ? { x: 1, y: 4 } : enemy.position;
      enemy.intent =
        index === 0
          ? { kind: IntentKind.Attack, value: 5, label: 'Attack 5' }
          : { kind: IntentKind.Idle, value: 0, label: 'Idle' };
    });
    run = endTurn(run);
    run = finishDiscard(run);
    expect(run.phase).toBe(RunPhase.Choice);
    expect(run.combat!.enemies.every((enemy) => enemy.hp === 0)).toBe(true);
  });

  it('keeps a player with empty red containers alive while a soul heart remains', () => {
    let run = createRun('SOUL-HEART-SURVIVAL');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const attacker = run.combat!.enemies[0]!;
    run.combat!.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    run.player.redHp = 0;
    addPocketHeart(run, HeartKind.Soul);
    run.player.stats.armor = 0;
    run.combat!.playerShield = 0;
    run.combat!.hand = run.combat!.hand.slice(0, 5);
    attacker.position = { x: 1, y: 4 };
    attacker.alerted = true;
    attacker.attackRange = 5;
    attacker.intent = { kind: IntentKind.Attack, value: 5, label: 'Attack 5' };

    run = finishDiscard(endTurn(run));

    expect(run.phase).toBe(RunPhase.Combat);
    expect(run.player.redHp).toBe(0);
    expect(run.player.pocketHearts[0]?.hp).toBe(5);
    expect(run.combat!.log.find((entry) => entry.messageKey === 'enemyAttack')?.params).toMatchObject({
      damage: 5,
      remainingHp: 5,
      maximumHp: 40,
    });
  });

  it('applies permanent health pickups outside combat without adding them to the deck', () => {
    const run = createRun('PERMANENT-HEALTH-PICKUP');
    const deckSize = run.player.deck.length;

    equipItem(run, 'raw-liver');

    expect(run.player.redContainers).toBe(5);
    expect(run.player.redHp).toBe(50);
    expect(run.player.deck).toHaveLength(deckSize);
    expect(run.player.deck.some((card) => card.definitionId === 'item:raw-liver')).toBe(false);

    equipItem(run, 'raw-liver');
    expect(run.player.redContainers).toBe(5);
    expect(run.player.redHp).toBe(50);
  });

  it('caps red-heart containers at twelve', () => {
    const run = createRun('RED-CONTAINER-CAP');
    run.player.redContainers = MAX_RED_CONTAINERS - 1;
    run.player.redHp = (MAX_RED_CONTAINERS - 1) * run.player.stats.heartSize;

    equipItem(run, 'raw-liver');

    expect(run.player.redContainers).toBe(MAX_RED_CONTAINERS);
    expect(run.player.redHp).toBe(MAX_RED_CONTAINERS * run.player.stats.heartSize);
  });

  it('uses permanent items to add three HP to every heart without adding combat cards', () => {
    const run = createRun('PERMANENT-HEART-CAPACITY');
    const deckSize = run.player.deck.length;
    run.player.redHp = 15;
    run.player.pocketHearts = [{ id: 'capacity-soul', kind: HeartKind.Soul, hp: 5, maxHp: 10 }];

    equipItem(run, 'stem-cells');

    expect(run.player.stats.heartSize).toBe(13);
    expect(run.player.redContainers).toBe(3);
    expect(run.player.redHp).toBe(24);
    expect(run.player.pocketHearts[0]).toMatchObject({ hp: 8, maxHp: 13 });
    expect(run.player.deck).toHaveLength(deckSize);
    expect(run.player.deck.some((card) => card.definitionId === 'item:stem-cells')).toBe(false);

    equipItem(run, 'stem-cells');
    expect(run.player.stats.heartSize).toBe(13);
  });

  it('makes Heart Training use the same three-HP heart-capacity increment', () => {
    const run = createRun('HEART-TRAINING-INCREMENT');
    run.player.redHp = 1;
    run.phase = RunPhase.Choice;
    run.choice = {
      kind: ChoiceKind.Upgrade,
      title: 'Heart Training',
      subtitle: '',
      options: [
        {
          id: 'heart-training',
          type: RewardOptionType.Upgrade,
          upgrade: UpgradeKind.Heart,
          label: 'Heart Training',
          description: '',
          icon: '♥',
        },
      ],
      canSkip: false,
      next: ChoiceNext.Map,
    };

    const upgraded = chooseOption(run, 'heart-training');

    expect(upgraded.player.stats.heartSize).toBe(13);
    expect(upgraded.player.redHp).toBe(39);
  });

  it('adds passive pickups as reusable cards instead of permanent stat boosts', () => {
    let run = createRun('PASSIVE-CARD');
    const baseDamage = run.player.stats.baseDamage;
    const baseArmor = run.player.stats.armor;
    equipItem(run, 'terra');
    expect(run.player.stats.baseDamage).toBe(baseDamage);
    expect(run.player.stats.armor).toBe(baseArmor);
    const itemCard = run.player.deck.find((card) => card.definitionId === 'item:terra')!;
    expect(itemCard).toBeTruthy();

    run = enterRoom(run, getAvailableNodes(run)[0]!);
    run.combat!.hand = [itemCard.instanceId];
    run.combat!.drawPile = [];
    run.combat!.discardPile = [];
    run = playCard(run, itemCard.instanceId);
    expect(run.combat!.playerDamageBuff).toBe(3);
    expect(run.combat!.playerArmorBuff).toBe(1);
    expect(run.combat!.discardPile).toContain(itemCard.instanceId);
    expect(run.player.deck).toContainEqual(itemCard);

    run.combat!.hand = [];
    run = endTurn(run);
    run = finishDiscard(run);
    expect(run.combat!.hand).toContain(itemCard.instanceId);
  });

  it('keeps non-combat passives out of the deck and carries Steam Sale as a run-once pocket item', () => {
    let run = createRun('NON-COMBAT-ITEMS');
    equipItem(run, 'goat-head');
    equipItem(run, 'compass');
    equipItem(run, 'blue-map');
    equipItem(run, 'steam-sale');

    expect(run.player.items).toEqual(expect.arrayContaining(['goat-head', 'compass', 'blue-map']));
    expect(run.player.pocketItems.map((item) => item.itemId)).toContain('steam-sale');
    expect(
      run.player.deck.some((card) =>
        ['item:goat-head', 'item:compass', 'item:blue-map', 'item:steam-sale'].includes(card.definitionId),
      ),
    ).toBe(false);
    expect(CARDS['item:goat-head']).toBeDefined();
    expect(run.player.stats.shopDiscount).toBe(0);
    run = usePocketItem(run, run.player.pocketItems.find((item) => item.itemId === 'steam-sale')!.instanceId);
    expect(run.player.stats.shopDiscount).toBe(0.5);
  });

  it('applies permanent stat items once without adding item cards', () => {
    const run = createRun('PERMANENT-STAT-ITEM');
    const deckSize = run.player.deck.length;
    const baseDamage = run.player.stats.baseDamage;
    const armor = run.player.stats.armor;
    const movement = run.player.stats.movementSpeed;

    equipItem(run, 'small-rock');
    equipItem(run, 'small-rock');

    expect(run.player.stats.baseDamage).toBe(baseDamage + 2);
    expect(run.player.stats.armor).toBe(armor + 1);
    expect(run.player.stats.movementSpeed).toBe(movement - 1);
    expect(run.player.deck).toHaveLength(deckSize);
    expect(run.player.deck.some((card) => card.definitionId === 'item:small-rock')).toBe(false);
  });

  it('removes retired non-combat item cards when hydrating an older save', () => {
    const run = createRun('OLD-NON-COMBAT-CARD');
    const retired = { instanceId: 'legacy-goat-head-card', definitionId: 'item:goat-head', upgraded: false };
    run.player.deck.push(retired);
    const hydrated = hydrateRunState(run);
    expect(hydrated.player.deck).not.toContainEqual(retired);
  });

  it('cycles a discarded active item card without losing the equipped item', () => {
    let run = createRun('ACTIVE-DISCARD');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const activeCard = run.player.deck.find((card) => card.definitionId === 'skill-d6')!;
    run.combat!.hand = [activeCard.instanceId];
    run.combat!.cooldowns[activeCard.instanceId] = 2;
    run = endTurn(run);
    run = discardCard(run, activeCard.instanceId);

    expect(run.player.activeItemId).toBe('d6');
    expect(run.player.items).toContain('d6');
    expect(run.player.deck.some((card) => card.instanceId === activeCard.instanceId)).toBe(true);
    expect(run.combat!.discardPile).toContain(activeCard.instanceId);
    expect(run.combat!.exhausted).not.toContain(activeCard.instanceId);
    expect(run.combat!.cooldowns[activeCard.instanceId]).toBe(2);
  });

  it('lets the player choose which hand card to cycle, including the active item card', () => {
    let run = createRun('CHOOSE-HAND-CYCLE');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const activeCard = run.player.deck.find((card) => card.definitionId === 'skill-d6')!;
    const cycleCard = run.player.deck.find((card) => card.definitionId === 'item:starter-deck')!;
    const attack = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    const hand = [activeCard.instanceId, cycleCard.instanceId, attack.instanceId];
    run.combat!.hand = hand;
    run.combat!.drawPile = run.player.deck
      .filter((card) => !hand.includes(card.instanceId))
      .map((card) => card.instanceId);
    run.combat!.discardPile = [];

    run = playCard(run, cycleCard.instanceId);

    const drawSelection = run.combat!.pendingSelection!;
    expect(drawSelection.kind).toBe(CombatSelectionKind.Draw);
    expect(drawSelection.min).toBe(0);
    run = resolveCombatSelection(run, [drawSelection.candidateInstanceIds[0]!]);

    const cycleSelection = run.combat!.pendingSelection!;
    expect(cycleSelection.kind).toBe(CombatSelectionKind.Cycle);
    expect(cycleSelection.min).toBe(0);
    expect(cycleSelection.max).toBe(1);
    expect(cycleSelection.candidateInstanceIds).toEqual(
      expect.arrayContaining([activeCard.instanceId, attack.instanceId]),
    );

    run = resolveCombatSelection(run, [activeCard.instanceId]);

    expect(run.combat!.pendingSelection).toBeUndefined();
    expect(run.combat!.hand).not.toContain(activeCard.instanceId);
    expect(run.combat!.discardPile).toContain(activeCard.instanceId);
    expect(run.combat!.hand).toContain(attack.instanceId);
    expect(run.combat!.discardPile).not.toContain(attack.instanceId);
    expect(run.player.activeItemId).toBe('d6');
  });

  it('can skip a draw choice and therefore skips its dependent cycle choice', () => {
    let run = createRun('SKIP-DRAW-AND-CYCLE');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const cycleCard = run.player.deck.find((card) => card.definitionId === 'item:starter-deck')!;
    const retained = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    run.combat!.hand = [cycleCard.instanceId, retained.instanceId];
    run.combat!.drawPile = run.player.deck
      .filter((card) => !run.combat!.hand.includes(card.instanceId))
      .map((card) => card.instanceId);
    run.combat!.discardPile = [];

    run = playCard(run, cycleCard.instanceId);
    expect(run.combat!.pendingSelection).toMatchObject({ kind: CombatSelectionKind.Draw, min: 0 });

    run = cancelCombatSelection(run);

    expect(run.combat!.pendingSelection).toBeUndefined();
    expect(run.combat!.hand).toContain(retained.instanceId);
    expect(run.combat!.discardPile).not.toContain(retained.instanceId);
  });

  it('accepts fewer cycle cards than the maximum offered', () => {
    let run = createRun('PARTIAL-HAND-CYCLE');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const cycleCard = run.player.deck.find((card) => card.definitionId === 'item:starter-deck')!;
    const retainedCards = run.player.deck
      .filter((card) => card.instanceId !== cycleCard.instanceId)
      .slice(0, 3);
    run.combat!.hand = [cycleCard.instanceId, ...retainedCards.map((card) => card.instanceId)];
    run.combat!.drawPile = run.player.deck
      .filter((card) => !run.combat!.hand.includes(card.instanceId))
      .map((card) => card.instanceId);
    run.combat!.discardPile = [];

    run = playCard(run, cycleCard.instanceId);
    const drawSelection = run.combat!.pendingSelection!;
    const selectedDrawCards = drawSelection.candidateInstanceIds.slice(0, drawSelection.max);
    run = resolveCombatSelection(run, selectedDrawCards);
    const cycleSelection = run.combat!.pendingSelection!;
    expect(cycleSelection.kind).toBe(CombatSelectionKind.Cycle);
    expect(cycleSelection.max).toBe(selectedDrawCards.length);
    expect(cycleSelection.max).toBeGreaterThan(1);

    const cycledCard = cycleSelection.candidateInstanceIds[0]!;
    run = resolveCombatSelection(run, [cycledCard]);

    expect(run.combat!.pendingSelection).toBeUndefined();
    expect(run.combat!.discardPile).toContain(cycledCard);
  });

  it('opens the draw pile and lets the player choose cards for explicit draw effects', () => {
    let run = createRun('CHOOSE-DRAW');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const drawCard = run.player.deck.find((card) => card.definitionId === 'item:battery-pack')!;
    const candidates = run.player.deck
      .filter(
        (card) =>
          card.instanceId !== drawCard.instanceId && CARDS[card.definitionId]?.type !== CardType.Skill,
      )
      .slice(0, 2);
    run.combat!.hand = [drawCard.instanceId];
    run.combat!.drawPile = candidates.map((card) => card.instanceId);
    run.combat!.discardPile = [];

    run = playCard(run, drawCard.instanceId);

    expect(run.combat!.pendingSelection).toMatchObject({
      kind: CombatSelectionKind.Draw,
      candidateInstanceIds: candidates.map((card) => card.instanceId),
      min: 0,
      max: 1,
    });
    expect(run.combat!.hand).not.toContain(candidates[1]!.instanceId);

    run = resolveCombatSelection(run, [candidates[1]!.instanceId]);

    expect(run.combat!.pendingSelection).toBeUndefined();
    expect(run.combat!.hand).toContain(candidates[1]!.instanceId);
    expect(run.combat!.drawPile).toEqual([candidates[0]!.instanceId]);
    expect(run.combat!.discardPile).toContain(drawCard.instanceId);
  });

  it('limits interactive draw choices to the current draw pile without exposing discarded cards', () => {
    let run = createRun('CHOOSE-DRAW-PILE-ONLY');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const drawCard = run.player.deck.find((card) => card.definitionId === 'item:starter-deck')!;
    const available = run.player.deck.find(
      (card) =>
        card.instanceId !== drawCard.instanceId && CARDS[card.definitionId]?.type === CardType.Recovery,
    )!;
    const discarded = run.player.deck.find(
      (card) =>
        card.instanceId !== drawCard.instanceId &&
        card.instanceId !== available.instanceId &&
        CARDS[card.definitionId]?.type === CardType.Attack,
    )!;
    run.combat!.hand = [drawCard.instanceId];
    run.combat!.drawPile = [available.instanceId];
    run.combat!.discardPile = [discarded.instanceId];

    run = playCard(run, drawCard.instanceId);

    expect(run.combat!.pendingSelection).toMatchObject({
      kind: CombatSelectionKind.Draw,
      candidateInstanceIds: [available.instanceId],
      min: 0,
      max: 1,
    });
    expect(run.combat!.pendingSelection!.candidateInstanceIds).not.toContain(discarded.instanceId);
    expect(run.combat!.discardPile).toContain(discarded.instanceId);
    expect(run.combat!.discardPile).toContain(drawCard.instanceId);
  });

  it('deploys a familiar as an autonomous assistant instead of adding its item card to the deck', () => {
    let run = createRun('FAMILIAR-AUTO-ATTACK');
    equipItem(run, 'harlequin-baby');
    expect(run.player.deck.some((card) => card.definitionId === 'item:harlequin-baby')).toBe(false);

    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const target = run.combat!.enemies[0]!;
    target.hp = 100;
    target.maxHp = 100;
    target.armor = 0;
    target.shield = 0;
    run.combat!.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });

    run = confirmPlayerDeployment(run);

    expect(run.combat!.familiars).toEqual([
      expect.objectContaining({ itemId: 'harlequin-baby', hits: 2, ring: 1 }),
    ]);
    expect(target.hp).toBe(100);
    expect(run.combat!.enemies[0]!.hp).toBeLessThan(100);
    expect(run.combat!.animationEvents).toContainEqual(
      expect.objectContaining({
        kind: CombatAnimationKind.FamiliarAttack,
        sourceId: 'familiar:harlequin-baby',
        targetId: target.instanceId,
      }),
    );
  });

  it('keeps exactly one active item card when a new active item replaces it', () => {
    const run = createRun('ACTIVE-REPLACEMENT');

    equipItem(run, 'yum-heart');

    expect(run.player.activeItemId).toBe('yum-heart');
    expect(run.player.items).toContain('yum-heart');
    expect(run.player.items).not.toContain('d6');
    expect(run.player.deck.some((card) => card.definitionId === 'skill-d6')).toBe(false);
    expect(run.player.deck.filter((card) => CARDS[card.definitionId]?.type === CardType.Skill)).toEqual([
      expect.objectContaining({ definitionId: 'skill-yum-heart' }),
    ]);
  });

  it('makes The D6 exchange hand Item cards with physical draw and discard pile cards', () => {
    let run = createRun('D6-TRUE-REROLL');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const d6 = run.player.deck.find((card) => card.definitionId === 'skill-d6')!;
    const itemCards = run.player.deck
      .filter((card) => CARDS[card.definitionId]?.type === CardType.Item)
      .slice(0, 2);
    const attack = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    const recovery = run.player.deck.find((card) => card.definitionId === 'half-heart')!;
    const shield = run.player.deck.find((card) => card.definitionId === 'wooden-cross')!;
    const hand = [d6.instanceId, attack.instanceId, ...itemCards.map((card) => card.instanceId)];
    const definitionsBefore = new Map(run.player.deck.map((card) => [card.instanceId, card.definitionId]));
    run.combat!.hand = hand;
    run.combat!.drawPile = [recovery.instanceId];
    run.combat!.discardPile = [shield.instanceId];

    run = playCard(run, d6.instanceId);

    expect(run.combat!.hand.slice(0, 2)).toEqual([d6.instanceId, attack.instanceId]);
    expect(new Set(run.combat!.hand.slice(2))).toEqual(new Set([recovery.instanceId, shield.instanceId]));
    expect(new Set([...run.combat!.drawPile, ...run.combat!.discardPile])).toEqual(
      new Set(itemCards.map((card) => card.instanceId)),
    );
    expect(
      run.player.deck.every((card) => card.definitionId === definitionsBefore.get(card.instanceId)),
    ).toBe(true);
    expect(run.combat!.log[0]).toMatchObject({
      messageKey: 'd6Exchange',
      params: { count: 2, draw: 1, discard: 1 },
    });
    expect(run.combat!.animationEvents.at(-1)).toMatchObject({
      kind: CombatAnimationKind.CardExchange,
      value: 2,
      secondaryValue: 1,
      rawValue: 1,
    });
    expect(run.combat!.cooldowns[d6.instanceId]).toBe(3);
  });

  it('prevents The D6 from spending vitality when no exchange can occur', () => {
    let run = createRun('D6-NO-EXCHANGE');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const d6 = run.player.deck.find((card) => card.definitionId === 'skill-d6')!;
    const attack = run.player.deck.find((card) => card.definitionId === 'basic-attack')!;
    const item = run.player.deck.find((card) => CARDS[card.definitionId]?.type === CardType.Item)!;
    const recovery = run.player.deck.find((card) => card.definitionId === 'half-heart')!;

    run.combat!.hand = [d6.instanceId, attack.instanceId];
    run.combat!.drawPile = [recovery.instanceId];
    run.combat!.discardPile = [];
    expect(canPlayCard(run, d6.instanceId)).toEqual({
      ok: false,
      reason: 'The D6 has no Item card in hand to exchange',
    });

    run.combat!.hand = [d6.instanceId, item.instanceId];
    run.combat!.drawPile = [];
    expect(canPlayCard(run, d6.instanceId)).toEqual({
      ok: false,
      reason: 'The D6 has no draw or discard pile card to exchange',
    });
  });
});

describe('first run', () => {
  it('can traverse all six floors and defeat Mom', () => {
    let run = createRun('FULL-MOM-RUN');
    run.player.keys = 99;
    let guard = 0;
    const provisionFloors = new Set([0]);
    while (run.phase !== RunPhase.Victory && guard < 200) {
      guard += 1;
      if (run.phase === RunPhase.Map) {
        const available = getAvailableNodes(run).map((id) =>
          run.floorMap.nodes.find((node) => node.id === id)!,
        );
        const center = available.find(
          (node) => !node.optional && (node.kind === RoomKind.Boss || node.lane === 1),
        );
        run = enterRoom(run, (center ?? available.find((node) => !node.optional))!.id);
      } else if (run.phase === RunPhase.Combat) {
        run = instantlyWinCombat(run);
      } else if (run.phase === RunPhase.Choice) {
        run = settleChoice(run, (choiceRun) => {
          if (choiceRun.choice?.rewardContext === RewardContext.FloorStart)
            provisionFloors.add(choiceRun.floorIndex);
        });
      } else {
        throw new Error(`Unexpected phase ${run.phase}`);
      }
    }
    expect(guard).toBeLessThan(200);
    expect(run.phase).toBe(RunPhase.Victory);
    expect(run.floorIndex).toBe(5);
    expect([...provisionFloors]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(run.unlocks).toContain('moms-knife');
    expect(run.unlocks).toContain('brimstone');
  });
});
