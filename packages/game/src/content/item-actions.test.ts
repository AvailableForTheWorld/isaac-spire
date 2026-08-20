import { describe, expect, it } from 'vitest';
import { CARDS, ITEMS } from '../catalog.js';
import {
  ItemActionMethod,
  ItemActionTrigger,
  IntentKind,
  PocketItemAction,
  RewardOptionType,
  RoomKind,
} from '../domain/enums.js';
import {
  chooseOption,
  confirmPlayerDeployment,
  createRun,
  endTurn,
  enterRoom,
  finishDiscard,
  getAvailableNodes,
  playCard,
} from '../engine.js';
import { createCard, equipItem } from '../player.js';
import type { RunState } from '../types.js';
import { CUSTOM_ITEM_DEFINITIONS } from './custom-items.js';
import { ISAAC_ACTION_ITEM_DEFINITIONS } from './isaac-action-items.js';

function leaveFloorProvisionChoice(run: RunState): RunState {
  const resource = run.choice?.options.find((option) => option.type === RewardOptionType.Resource);
  if (!resource) throw new Error('Expected a floor provision resource');
  return chooseOption(run, resource.id);
}

function enterFirstCombat(run: RunState): RunState {
  const available = new Set(getAvailableNodes(run));
  const node = run.floorMap.nodes.find((entry) => available.has(entry.id) && entry.kind === RoomKind.Combat);
  if (!node) throw new Error('Expected an available combat room');
  return confirmPlayerDeployment(enterRoom(run, node.id));
}

function putCardInHand(run: RunState, definitionId: string): string {
  const combat = run.combat!;
  let instance = run.player.deck.find((card) => card.definitionId === definitionId);
  if (!instance) {
    instance = createCard(run, definitionId);
    run.player.deck.push(instance);
  }
  combat.drawPile = combat.drawPile.filter((id) => id !== instance!.instanceId);
  combat.discardPile = combat.discardPile.filter((id) => id !== instance!.instanceId);
  if (!combat.hand.includes(instance.instanceId)) combat.hand.push(instance.instanceId);
  return instance.instanceId;
}

function isolateEnemy(run: RunState, hp = 250): void {
  const combat = run.combat!;
  combat.enemies.slice(1).forEach((enemy) => {
    enemy.hp = 0;
    combat.observedDefeatIds.push(enemy.instanceId);
  });
  const enemy = combat.enemies[0]!;
  enemy.maxHp = hp;
  enemy.hp = hp;
  enemy.armor = 0;
  enemy.position = {
    x: Math.min(combat.roomLayout.width - 1, combat.playerPosition.x + 1),
    y: combat.playerPosition.y,
  };
}

describe('authored Isaac item actions', () => {
  it('keeps authored project definitions unique and higher priority than generated source records', () => {
    expect(Object.keys(ISAAC_ACTION_ITEM_DEFINITIONS).length).toBeGreaterThanOrEqual(110);
    for (const [id, definition] of Object.entries(ISAAC_ACTION_ITEM_DEFINITIONS)) {
      expect(definition.actions?.length, id).toBeGreaterThan(0);
      expect(CUSTOM_ITEM_DEFINITIONS[id], id).toBe(definition);
      expect(ITEMS[id], id).toBe(definition);
    }
    expect(ISAAC_ACTION_ITEM_DEFINITIONS['r-key']).toBeUndefined();
    expect(ISAAC_ACTION_ITEM_DEFINITIONS.damocles).toBeUndefined();
    expect(ITEMS['r-key']!.pocketAction).toBe(PocketItemAction.RestartRun);
    expect(ITEMS.damocles!.actions).toBeUndefined();
  });

  it('keeps exactly one runtime definition for every Isaac collectible ID', () => {
    const seen = new Map<number, string>();
    for (const item of Object.values(ITEMS)) {
      if (item.isaacId === undefined) continue;
      expect(
        seen.get(item.isaacId),
        `${item.isaacId}: ${seen.get(item.isaacId)} / ${item.id}`,
      ).toBeUndefined();
      seen.set(item.isaacId, item.id);
    }
    expect(ITEMS['book-belial']?.isaacId).toBe(34);
    expect(ITEMS['the-book-of-belial']).toBeUndefined();
  });

  it('uses stable enums for every custom trigger and runtime method', () => {
    const triggers = new Set(Object.values(ItemActionTrigger));
    const methods = new Set(Object.values(ItemActionMethod));
    for (const item of Object.values(ISAAC_ACTION_ITEM_DEFINITIONS)) {
      for (const action of item.actions ?? []) {
        expect(triggers.has(action.trigger), `${item.id}:${action.id}`).toBe(true);
        expect(methods.has(action.method), `${item.id}:${action.id}`).toBe(true);
      }
    }
  });

  it('lets Car Battery execute a method-driven active item twice', () => {
    let run = leaveFloorProvisionChoice(createRun('CAR-BATTERY-ACTIONS'));
    equipItem(run, 'car-battery');
    equipItem(run, 'mr-boom');
    run = enterFirstCombat(run);
    isolateEnemy(run);
    const battery = putCardInHand(run, 'item:car-battery');
    run = playCard(run, battery);
    const hpBefore = run.combat!.enemies[0]!.hp;
    const boom = putCardInHand(run, ITEMS['mr-boom']!.skillCardId!);
    run = playCard(run, boom);
    expect(hpBefore - run.combat!.enemies[0]!.hp).toBe(100);
  });

  it('repeats only half of the previous numeric effect with Placebo', () => {
    let run = leaveFloorProvisionChoice(createRun('PLACEBO-BALANCE'));
    equipItem(run, 'placebo');
    run = enterFirstCombat(run);
    run.player.redHp = 10;

    const treatment = putCardInHand(run, 'half-heart');
    run = playCard(run, treatment);
    expect(run.player.redHp).toBe(20);

    const placebo = putCardInHand(run, ITEMS.placebo!.skillCardId!);
    run = playCard(run, placebo);
    expect(run.player.redHp).toBe(25);
    expect(run.combat!.cooldowns[placebo]).toBe(4);
  });

  it('combines a permanent familiar retaliation with its automatic next-round attack', () => {
    let run = leaveFloorProvisionChoice(createRun('DEAD-BIRD-ACTIONS'));
    equipItem(run, 'dead-bird');
    run = enterFirstCombat(run);
    isolateEnemy(run, 120);
    run.combat!.playerShield = 0;
    const enemy = run.combat!.enemies[0]!;
    enemy.intent = {
      kind: IntentKind.Attack,
      value: 20,
      label: 'Attack',
      actions: [{ kind: IntentKind.Attack, value: 20 }],
    };
    const hpBefore = enemy.hp;
    run.combat!.hand = [];
    run = finishDiscard(endTurn(run));
    const familiarDamage = run.combat!.familiars[0]!.damage * run.combat!.familiars[0]!.hits;
    expect(hpBefore - run.combat!.enemies[0]!.hp).toBe(8 + familiarDamage);
  });

  it('lets Dull Razor invoke damage-listener methods without removing player health', () => {
    let run = leaveFloorProvisionChoice(createRun('DULL-RAZOR-ACTIONS'));
    equipItem(run, 'dead-bird');
    equipItem(run, 'dull-razor');
    run = enterFirstCombat(run);
    isolateEnemy(run, 120);
    const hpBefore = run.player.redHp;
    const enemyHpBefore = run.combat!.enemies[0]!.hp;
    run = playCard(run, putCardInHand(run, ITEMS['dull-razor']!.skillCardId!));
    expect(run.player.redHp).toBe(hpBefore);
    expect(enemyHpBefore - run.combat!.enemies[0]!.hp).toBe(8);
  });

  it('runs a one-use revival method at the fatal-damage boundary', () => {
    let run = leaveFloorProvisionChoice(createRun('ONE-UP-ACTIONS'));
    equipItem(run, '1up');
    run = enterFirstCombat(run);
    isolateEnemy(run, 120);
    const oneUp = putCardInHand(run, 'item:1up');
    run = playCard(run, oneUp);
    run.player.redHp = 1;
    run.combat!.playerShield = 0;
    const enemy = run.combat!.enemies[0]!;
    enemy.intent = {
      kind: IntentKind.Attack,
      value: 80,
      label: 'Attack',
      actions: [{ kind: IntentKind.Attack, value: 80 }],
    };
    run.combat!.hand = [];
    run = finishDiscard(endTurn(run));
    expect(run.player.redHp).toBe(30);
    expect(run.player.items).not.toContain('1up');
    expect(run.player.deck.some((card) => CARDS[card.definitionId]?.itemId === '1up')).toBe(false);
  });
});
