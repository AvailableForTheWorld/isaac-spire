import { describe, expect, it } from 'vitest';
import { CARDS, DEFAULT_UNLOCKS } from './catalog.js';
import {
  chooseOption, createRun, discardCard, endTurn, enterRoom, finishDiscard,
  getAvailableNodes, playCard, skipChoice,
} from './engine.js';
import { addPocketHeart } from './player.js';

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
  it('guarantees visible enemy pressure on the opening enemy turn', () => {
    let run = createRun('ENEMIES-ATTACK');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    run.player.stats.dodgeChance = 0;
    run.combat!.hand = run.combat!.hand.slice(0, 5);
    const durabilityBefore = run.player.redHp
      + run.player.pocketHearts.reduce((sum, heart) => sum + heart.hp, 0)
      + run.combat!.playerShield;

    run = endTurn(run);
    expect(run.phase).toBe('discard');
    run = finishDiscard(run);

    const durabilityAfter = run.player.redHp
      + run.player.pocketHearts.reduce((sum, heart) => sum + heart.hp, 0)
      + run.combat!.playerShield;
    expect(durabilityAfter).toBeLessThan(durabilityBefore);
    expect(run.combat!.log.some((entry) => entry.messageKey === 'enemyAttack')).toBe(true);
    expect(run.combat!.animationEvents.some((event) => event.kind === 'enemy-attack')).toBe(true);
  });

  it('turns preparation into a guaranteed doubled attack', () => {
    let run = createRun('PREPARE-THEN-HIT');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const enemyId = run.combat!.enemies[0]!.instanceId;
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

  it('lets wounded enemies react with multi-action recovery bundles', () => {
    let run = createRun('REACTIVE-ENEMY');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const enemy = run.combat!.enemies[0]!;
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
    expect(reacting.intent.actions?.map((entry) => entry.kind)).toEqual(['heal', 'curse', 'attack']);

    const hpBefore = reacting.hp;
    const deckBefore = run.player.deck.length;
    run.combat!.hand = [];
    run = endTurn(run);
    run = finishDiscard(run);
    const recovered = run.combat!.enemies.find((entry) => entry.instanceId === enemy.instanceId)!;
    expect(recovered.hp).toBeGreaterThan(hpBefore);
    expect(run.player.deck.length).toBe(deckBefore + 1);
  });

  it('upgrades defensive intents from active saves with a counterattack', () => {
    let run = createRun('SAVED-DEFENSE-BUNDLE');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const enemy = run.combat!.enemies[0]!;
    run.combat!.enemies.slice(1).forEach((entry) => { entry.hp = 0; });
    enemy.intent = {
      kind: 'shield', value: 9, label: 'Guard 9 + Recover 8',
      actions: [{ kind: 'shield', value: 9 }, { kind: 'heal', value: 8 }],
    };
    run.player.stats.dodgeChance = 0;
    run.combat!.playerShield = 0;
    run.combat!.hand = [];
    const hpBefore = run.player.redHp;

    run = endTurn(run);
    run = finishDiscard(run);

    expect(run.player.redHp).toBeLessThan(hpBefore);
    expect(run.combat!.log.some((entry) => entry.messageKey === 'enemyAttack')).toBe(true);
  });

  it('turns fire rate into predictable echo hits', () => {
    let run = createRun('FAST-TEARS');
    run = enterRoom(run, getAvailableNodes(run).find((id) => id.includes('l1'))!);
    run.player.stats.fireRate = 1.5;
    run.player.stats.critChance = 0;
    const target = run.combat!.enemies[0]!;
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

  it('makes a curse weaken attacks and suppress special bundles without stunning the enemy', () => {
    let run = createRun('CURSE-IS-NOT-A-STUN');
    run = enterRoom(run, getAvailableNodes(run)[0]!);
    const target = run.combat!.enemies[0]!;
    run.combat!.enemies.slice(1).forEach((enemy) => { enemy.hp = 0; });
    target.intent = {
      kind: 'shield', value: 9, label: 'Guard 9 + Attack 20',
      actions: [{ kind: 'shield', value: 9 }, { kind: 'attack', value: 20 }],
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
      enemy.intent = index === 0
        ? { kind: 'attack', value: 5, label: 'Attack 5' }
        : { kind: 'idle', value: 0, label: 'Idle' };
    });
    run = endTurn(run);
    run = finishDiscard(run);
    expect(run.phase).toBe('choice');
    expect(run.combat!.enemies.every((enemy) => enemy.hp === 0)).toBe(true);
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
