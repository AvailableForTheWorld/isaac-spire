import { describe, expect, it } from 'vitest';
import { CARDS, DEFAULT_UNLOCKS } from './catalog.js';
import {
  canPlayCard, chooseOption, createRun, discardCard, endTurn, enterRoom, finishDiscard,
  getAvailableNodes, getReachablePlayerCells, movePlayer, playCard, selectEnemy, skipChoice,
} from './engine.js';
import { addPocketHeart, equipItem } from './player.js';

function settleChoice(run: ReturnType<typeof createRun>) {
  let next = run;
  while (next.phase === 'choice') {
    const choice = next.choice!;
    if (choice.kind === 'shop') {
      next = chooseOption(next, choice.options.find((option) => option.action === 'leave')!.id);
    } else if (choice.kind === 'deal') {
      next = chooseOption(next, choice.options.find((option) => option.action === 'skip-deal')!.id);
    } else if (choice.canSkip && (choice.kind === 'card' || choice.kind === 'sacrifice')) {
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
  target.position = { x: 4, y: 4 };
  const attack = run.player.deck.find((card) => CARDS[card.definitionId]?.type === 'attack')!;
  combat.hand = combat.hand.filter((id) => id !== attack.instanceId);
  combat.hand.push(attack.instanceId);
  combat.drawPile = combat.drawPile.filter((id) => id !== attack.instanceId);
  combat.discardPile = combat.discardPile.filter((id) => id !== attack.instanceId);
  combat.vitality = run.player.stats.maxVitality;
  combat.selectedEnemyId = target.instanceId;
  return playCard(run, attack.instanceId, target.instanceId);
}

describe('run generation', () => {
  it('creates a deterministic six-floor first-run Isaac build', () => {
    const left = createRun('MOM-1001', DEFAULT_UNLOCKS);
    const right = createRun('MOM-1001', DEFAULT_UNLOCKS);
    expect(left.floorMap.nodes).toEqual(right.floorMap.nodes);
    expect(left.player.redContainers).toBe(3);
    expect(left.player.redHp).toBe(90);
    expect(left.player.stats.maxVitality).toBe(5);
    expect(left.player.stats.baseShield).toBe(10);
    expect(left.player.stats.movementSpeed).toBe(3);
    expect(left.player.stats.attackRange).toBe(5);
    expect(left.player.deck).toHaveLength(14);
    expect(left.player.activeItemId).toBe('d6');
  });

  it('gives every lane a shop, treasure, secret, and super-secret room', () => {
    const run = createRun('ROUTES-42');
    for (let lane = 0; lane < 3; lane += 1) {
      const rooms = run.floorMap.nodes.filter((node) => Math.floor(node.lane) === lane);
      expect(rooms.filter((room) => room.kind === 'shop')).toHaveLength(1);
      expect(rooms.filter((room) => room.kind === 'treasure')).toHaveLength(1);
      expect(rooms.filter((room) => room.kind === 'secret')).toHaveLength(1);
      expect(rooms.filter((room) => room.kind === 'super-secret')).toHaveLength(1);
    }
  });

  it('never lets a bomb-gated detour trap the route', () => {
    const run = createRun('NO-BOMBS');
    const anchor = run.floorMap.nodes.find((node) => node.lane === 1 && node.depth === 3)!;
    run.floorMap.currentNodeId = anchor.id;
    run.player.bombs = 0;
    const secret = run.floorMap.nodes.find((node) => node.kind === 'secret' && node.anchorId === anchor.id)!;
    expect(getAvailableNodes(run)).toContain(secret.id);
    expect(() => enterRoom(run, secret.id)).toThrow(/bomb/i);
    expect(anchor.connections.every((id) => getAvailableNodes(run).includes(id))).toBe(true);
  });
});

describe('combat', () => {
  it('moves distant enemies toward Isaac on the opening enemy turn', () => {
    let run = createRun('ENEMIES-ATTACK');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    run.player.stats.dodgeChance = 0;
    run.combat!.hand = run.combat!.hand.slice(0, 5);
    const positionsBefore = new Map(run.combat!.enemies.map((enemy) => [
      enemy.instanceId,
      Math.abs(enemy.position.x - run.combat!.playerPosition.x)
        + Math.abs(enemy.position.y - run.combat!.playerPosition.y),
    ]));

    run = endTurn(run);
    expect(run.phase).toBe('discard');
    run = finishDiscard(run);

    expect(run.combat!.enemies.some((enemy) => {
      const distance = Math.abs(enemy.position.x - run.combat!.playerPosition.x)
        + Math.abs(enemy.position.y - run.combat!.playerPosition.y);
      return distance < positionsBefore.get(enemy.instanceId)!;
    })).toBe(true);
    expect(run.combat!.log.some((entry) => entry.messageKey === 'enemyMoved')).toBe(true);
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
      kind: 'move', sourceId: 'isaac', fromX: 0, fromY: 4, toX: 2, toY: 4,
    });
  });

  it('requires Isaac to move into range before playing an attack', () => {
    let run = createRun('TACTICAL-RANGE');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const target = run.combat!.enemies[0]!;
    target.position = { x: 11, y: 4 };
    run.combat!.enemies.slice(1).forEach((enemy) => { enemy.hp = 0; });
    const attack = run.player.deck.find((card) => card.definitionId === 'isaacs-tears')!;
    run.combat!.hand = [attack.instanceId];
    expect(() => playCard(run, attack.instanceId, target.instanceId)).toThrow(/outside attack range/i);

    run = movePlayer(run, 3, 4);
    run = movePlayer(run, 6, 4);
    const hpBefore = target.hp;
    run = playCard(run, attack.instanceId, target.instanceId);
    expect(run.combat!.enemies[0]!.hp).toBeLessThan(hpBefore);
  });

  it('never changes targets automatically when another enemy enters the firing line', () => {
    let run = createRun('MOVE-RETARGET');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    expect(run.combat!.selectedEnemyId).toBeUndefined();
    const previousTarget = run.combat!.enemies[0]!;
    const alignedTarget = run.combat!.enemies[1]!;
    previousTarget.position = { x: 15, y: 0 };
    alignedTarget.position = { x: 6, y: 4 };
    run.combat!.enemies.slice(2).forEach((enemy) => { enemy.hp = 0; });
    run.combat!.selectedEnemyId = previousTarget.instanceId;
    const tearBomb = run.player.deck.find((card) => card.definitionId === 'isaacs-tears')!;
    run.combat!.hand = [tearBomb.instanceId];

    run = movePlayer(run, 1, 4);

    expect(run.combat!.selectedEnemyId).toBe(previousTarget.instanceId);
    expect(canPlayCard(run, tearBomb.instanceId)).toEqual({ ok: true });
    expect(() => playCard(run, tearBomb.instanceId)).toThrow(/choose an enemy target/i);
    expect(canPlayCard(run, tearBomb.instanceId, run.combat!.selectedEnemyId)).toEqual({
      ok: false, reason: 'Target is outside attack range',
    });
    run = selectEnemy(run, alignedTarget.instanceId);
    expect(canPlayCard(run, tearBomb.instanceId, run.combat!.selectedEnemyId)).toEqual({ ok: true });
    const hpBefore = alignedTarget.hp;
    run = playCard(run, tearBomb.instanceId, run.combat!.selectedEnemyId);
    expect(run.combat!.enemies[1]!.hp).toBeLessThan(hpBefore);
  });

  it('lets the player choose which of multiple enemies in range receives a targeted attack', () => {
    let run = createRun('CHOOSE-RANGED-TARGET');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const first = run.combat!.enemies[0]!;
    const second = run.combat!.enemies[1]!;
    first.position = { x: 4, y: 4 };
    second.position = { x: 5, y: 4 };
    run.combat!.enemies.slice(2).forEach((enemy) => { enemy.hp = 0; });
    run.combat!.selectedEnemyId = undefined;
    const tearBomb = run.player.deck.find((card) => card.definitionId === 'isaacs-tears')!;
    run.combat!.hand = [tearBomb.instanceId];
    const firstHp = first.hp;
    const secondHp = second.hp;

    expect(canPlayCard(run, tearBomb.instanceId)).toEqual({ ok: true });
    expect(() => playCard(run, tearBomb.instanceId)).toThrow(/choose an enemy target/i);
    run = playCard(run, tearBomb.instanceId, second.instanceId);

    expect(run.combat!.enemies[0]!.hp).toBe(firstHp);
    expect(run.combat!.enemies[1]!.hp).toBeLessThan(secondHp);
    expect(run.combat!.selectedEnemyId).toBe(second.instanceId);
  });

  it('only allows straight-line attacks until Spoon Bender is played', () => {
    let run = createRun('CURVED-SHOTS');
    equipItem(run, 'spoon-bender');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const target = run.combat!.enemies[0]!;
    target.position = { x: 3, y: 2 };
    run.combat!.enemies.slice(1).forEach((enemy) => { enemy.hp = 0; });
    const attack = run.player.deck.find((card) => card.definitionId === 'isaacs-tears')!;
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
      enemy.intent = index === 0
        ? { kind: 'prepare', value: 0, label: 'Preparing…', actions: [{ kind: 'prepare', value: 0 }] }
        : { kind: 'idle', value: 0, label: 'Staggered', actions: [{ kind: 'idle', value: 0 }] };
    });
    run.combat!.hand = [];
    run = endTurn(run);
    run = finishDiscard(run);
    const prepared = run.combat!.enemies.find((enemy) => enemy.instanceId === enemyId)!;
    expect(prepared.intent.actions).toEqual([{ kind: 'attack', value: prepared.attack * 2 }]);

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
    run.combat!.enemies.forEach((entry) => {
      entry.intent = entry.instanceId === enemy.instanceId
        ? { kind: 'attack', value: 1, label: 'Attack 1', actions: [{ kind: 'attack', value: 1 }] }
        : { kind: 'idle', value: 0, label: 'Staggered', actions: [{ kind: 'idle', value: 0 }] };
    });
    run.combat!.hand = [];
    run = endTurn(run);
    run = finishDiscard(run);
    const reacting = run.combat!.enemies.find((entry) => entry.instanceId === enemy.instanceId)!;
    expect(reacting.intent.actions).toEqual([{ kind: 'heal', value: 10 }]);

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
    run.combat!.enemies.slice(1).forEach((entry) => { entry.hp = 0; });
    enemy.intent = {
      kind: 'shield', value: 9, label: 'Guard 9 + Recover 8',
      actions: [{ kind: 'shield', value: 9 }, { kind: 'heal', value: 8 }],
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

  it('moves into a straight firing line and attacks in the same enemy turn', () => {
    let run = createRun('MOVE-THEN-ATTACK');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const enemy = run.combat!.enemies[0]!;
    run.combat!.enemies.slice(1).forEach((entry) => { entry.hp = 0; });
    enemy.position = { x: 7, y: 4 };
    enemy.movementSpeed = 2;
    enemy.attackRange = 5;
    enemy.intent = { kind: 'attack', value: 12, label: 'Attack 12', actions: [{ kind: 'attack', value: 12 }] };
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
    let run = createRun('FAST-TEARS');
    run = enterRoom(run, getAvailableNodes(run).find((id) => id.includes('l1'))!);
    run.player.stats.fireRate = 1.5;
    run.player.stats.critChance = 0;
    const target = run.combat!.enemies[0]!;
    target.position = { x: 4, y: 4 };
    run.combat!.enemies.slice(1).forEach((enemy) => { enemy.hp = 0; });
    target.maxHp = 100; target.hp = 100; target.armor = 0; target.shield = 0;
    const attacks = run.player.deck.filter((card) => card.definitionId === 'isaacs-tears').slice(0, 2);
    run.combat!.hand = attacks.map((card) => card.instanceId);
    run.combat!.drawPile = run.combat!.drawPile.filter((id) => !run.combat!.hand.includes(id));
    run.combat!.selectedEnemyId = target.instanceId;
    run = playCard(run, attacks[0]!.instanceId, target.instanceId);
    run = playCard(run, attacks[1]!.instanceId, target.instanceId);
    expect(run.combat!.enemies[0]!.hp).toBe(82);
  });

  it('always enters a discard stage and requires retaining no more than five before enemies act', () => {
    let run = createRun('RETAIN-5');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    expect(run.combat!.hand).toHaveLength(7);
    run = endTurn(run);
    expect(run.phase).toBe('discard');
    const discardable = run.combat!.hand.filter((id) => CARDS[run.player.deck.find((card) => card.instanceId === id)!.definitionId]!.type !== 'skill');
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
    expect(run.phase).toBe('discard');
    expect(run.combat!.round).toBe(1);
    run = finishDiscard(run);
    expect(run.combat!.round).toBe(2);
  });

  it('makes a curse replace a special intent with one weakened attack', () => {
    let run = createRun('CURSE-IS-NOT-A-STUN');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const target = run.combat!.enemies[0]!;
    target.position = { x: 1, y: 4 };
    run.combat!.enemies.slice(1).forEach((enemy) => { enemy.hp = 0; });
    target.intent = {
      kind: 'attack', value: 20, label: 'Attack 20 + Guard 9',
      actions: [{ kind: 'attack', value: 20 }, { kind: 'shield', value: 9 }],
    };
    const curse = run.player.deck.find((card) => card.definitionId === 'bad-trip')!;
    run.combat!.hand = [curse.instanceId];
    run.player.stats.armor = 0;
    run.player.stats.dodgeChance = 0;
    run.combat!.playerShield = 0;

    run = playCard(run, curse.instanceId, target.instanceId);
    run = endTurn(run);
    run = finishDiscard(run);

    expect(run.player.redHp).toBe(78);
    expect(run.combat!.enemies[0]!.shield).toBe(0);
    expect(run.combat!.enemies[0]!.cursedTurns).toBe(1);
    expect(run.combat!.log.some((entry) => entry.messageKey === 'enemyWeakened')).toBe(true);
  });

  it('detonates an emptied black heart against the whole room', () => {
    let run = createRun('BLACK-HEART');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    addPocketHeart(run, 'black');
    run.player.pocketHearts.at(-1)!.hp = 1;
    run.player.stats.armor = 0;
    run.combat!.playerShield = 0;
    run.combat!.hand = run.combat!.hand.slice(0, 5);
    run.combat!.enemies.forEach((enemy, index) => {
      enemy.position = index === 0 ? { x: 1, y: 4 } : enemy.position;
      enemy.intent = index === 0
        ? { kind: 'attack', value: 5, label: 'Attack 5' }
        : { kind: 'idle', value: 0, label: 'Idle' };
    });
    run = endTurn(run);
    run = finishDiscard(run);
    expect(run.phase).toBe('choice');
    expect(run.combat!.enemies.every((enemy) => enemy.hp === 0)).toBe(true);
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

  it('permanently loses an active item when its skill card is discarded', () => {
    let run = createRun('ACTIVE-DISCARD');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const activeCard = run.player.deck.find((card) => card.definitionId === 'skill-d6')!;
    run.combat!.hand = [activeCard.instanceId];
    run = endTurn(run);
    run = discardCard(run, activeCard.instanceId);

    expect(run.player.activeItemId).toBeUndefined();
    expect(run.player.items).not.toContain('d6');
    expect(run.player.deck.some((card) => card.instanceId === activeCard.instanceId)).toBe(false);
    expect(run.combat!.discardPile).not.toContain(activeCard.instanceId);
    expect(run.combat!.exhausted).toContain(activeCard.instanceId);
  });

  it('makes The D6 transform every other card in hand without discarding them', () => {
    let run = createRun('D6-TRUE-REROLL');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const d6 = run.player.deck.find((card) => card.definitionId === 'skill-d6')!;
    const otherCards = run.player.deck.filter((card) => card.instanceId !== d6.instanceId).slice(0, 4);
    const hand = [d6.instanceId, ...otherCards.map((card) => card.instanceId)];
    const definitionsBefore = new Map(otherCards.map((card) => [card.instanceId, card.definitionId]));
    run.combat!.hand = hand;
    run.combat!.drawPile = run.combat!.drawPile.filter((id) => !hand.includes(id));
    run.combat!.discardPile = run.combat!.discardPile.filter((id) => !hand.includes(id));

    run = playCard(run, d6.instanceId);

    expect(run.combat!.hand).toEqual(hand);
    expect(run.player.deck.find((card) => card.instanceId === d6.instanceId)?.definitionId).toBe('skill-d6');
    for (const card of otherCards) {
      const rerolled = run.player.deck.find((entry) => entry.instanceId === card.instanceId)!;
      expect(rerolled.definitionId).not.toBe(definitionsBefore.get(card.instanceId));
      expect(['skill', 'curse']).not.toContain(CARDS[rerolled.definitionId]!.type);
    }
    expect(run.combat!.discardPile).toHaveLength(0);
    expect(run.combat!.cooldowns[d6.instanceId]).toBe(3);
  });
});

describe('first run', () => {
  it('can traverse all six floors and defeat Mom', () => {
    let run = createRun('FULL-MOM-RUN');
    let guard = 0;
    while (run.phase !== 'victory' && guard < 200) {
      guard += 1;
      if (run.phase === 'map') {
        const available = getAvailableNodes(run).map((id) => run.floorMap.nodes.find((node) => node.id === id)!);
        const center = available.find((node) => !node.optional && (node.kind === 'boss' || node.lane === 1));
        run = enterRoom(run, (center ?? available.find((node) => !node.optional))!.id);
      } else if (run.phase === 'combat') {
        run = instantlyWinCombat(run);
      } else if (run.phase === 'choice') {
        run = settleChoice(run);
      } else {
        throw new Error(`Unexpected phase ${run.phase}`);
      }
    }
    expect(guard).toBeLessThan(200);
    expect(run.phase).toBe('victory');
    expect(run.floorIndex).toBe(5);
    expect(run.unlocks).toContain('moms-knife');
    expect(run.unlocks).toContain('brimstone');
  });
});
