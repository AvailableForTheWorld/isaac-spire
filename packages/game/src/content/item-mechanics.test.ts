import { describe, expect, it } from 'vitest';
import { CARDS } from '../catalog.js';
import { CardType, IntentKind, RewardOptionType, RoomKind, StatusKind } from '../domain/enums.js';
import {
  canPlayCard,
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

describe('adapted collectible mechanics', () => {
  it('executes a generated multi-trait passive card inside the current combat', () => {
    let run = leaveFloorProvisionChoice(createRun('INNER-EYE-GENERATED-CARD'));
    equipItem(run, 'the-inner-eye');
    expect(run.player.deck.some((card) => card.definitionId === 'item:the-inner-eye')).toBe(true);
    run = enterFirstCombat(run);
    const instanceId = putCardInHand(run, 'item:the-inner-eye');
    const handBefore = run.combat!.hand.length;
    run = playCard(run, instanceId);

    expect(run.combat!.playerDamageBuff).toBeGreaterThan(0);
    expect(run.combat!.playerFireRateBuff).toBeLessThan(0);
    expect(run.combat!.hand.length).toBeGreaterThanOrEqual(handBefore - 1);
    expect(run.combat!.discardPile).toContain(instanceId);
  });

  it('derives homing and poison behavior from the original item traits', () => {
    let homingRun = leaveFloorProvisionChoice(createRun('SPOON-BENDER-TRAIT'));
    equipItem(homingRun, 'spoon-bender');
    homingRun = enterFirstCombat(homingRun);
    const spoon = putCardInHand(homingRun, 'item:spoon-bender');
    homingRun = playCard(homingRun, spoon);
    expect(
      homingRun.combat!.curvedShotsOverride || homingRun.combat!.usedPassiveItems.includes('spoon-bender'),
    ).toBe(true);

    let poisonRun = leaveFloorProvisionChoice(createRun('SCORPIO-TRAIT'));
    equipItem(poisonRun, 'scorpio');
    poisonRun = enterFirstCombat(poisonRun);
    const enemy = poisonRun.combat!.enemies[0]!;
    poisonRun.combat!.enemies.slice(1).forEach((entry) => {
      entry.hp = 0;
    });
    enemy.position = {
      x: Math.min(poisonRun.combat!.roomLayout.width - 1, poisonRun.combat!.playerPosition.x + 1),
      y: poisonRun.combat!.playerPosition.y,
    };
    const scorpio = putCardInHand(poisonRun, 'item:scorpio');
    poisonRun = playCard(poisonRun, scorpio, enemy.instanceId);
    expect(poisonRun.combat!.enemies[0]!.statuses[StatusKind.Poison]).toBeGreaterThan(0);
  });

  it('applies stack-based silence and suppresses an enemy attack action', () => {
    let run = enterFirstCombat(leaveFloorProvisionChoice(createRun('SILENCE-STATUS')));
    const combat = run.combat!;
    const enemy = combat.enemies[0]!;
    combat.enemies.slice(1).forEach((entry) => {
      entry.hp = 0;
    });
    enemy.position = { x: combat.playerPosition.x + 1, y: combat.playerPosition.y };
    enemy.alerted = true;
    enemy.intent = {
      kind: IntentKind.Attack,
      value: enemy.attack,
      label: 'Attack',
      actions: [{ kind: IntentKind.Attack, value: enemy.attack }],
    };
    const silence = putCardInHand(run, 'silence');
    run = playCard(run, silence, enemy.instanceId);
    expect(run.combat!.enemies[0]!.statuses[StatusKind.Silence]).toBe(2);
    const hpBefore = run.player.redHp;
    run.combat!.hand = [];
    run = finishDiscard(endTurn(run));
    expect(run.player.redHp).toBe(hpBefore);
    expect(run.combat!.enemies[0]!.statuses[StatusKind.Silence]).toBe(1);
  });

  it('blocks Item and Skill cards while the player has Item Lock', () => {
    const run = enterFirstCombat(leaveFloorProvisionChoice(createRun('ITEM-LOCK-STATUS')));
    equipItem(run, 'terra');
    const itemCard = putCardInHand(run, 'item:terra');
    run.combat!.playerStatuses[StatusKind.ItemLock] = 2;
    expect(CARDS[run.player.deck.find((card) => card.instanceId === itemCard)!.definitionId]!.type).toBe(
      CardType.Item,
    );
    expect(canPlayCard(run, itemCard)).toMatchObject({ ok: false, reason: 'Item Lock disables item cards' });
  });

  it('doubles subsequent item-card values while Damocles is hanging', () => {
    let run = leaveFloorProvisionChoice(createRun('DAMOCLES-DOUBLE'));
    equipItem(run, 'damocles');
    equipItem(run, 'terra');
    run = enterFirstCombat(run);
    const damocles = putCardInHand(run, 'item:damocles');
    const terra = putCardInHand(run, 'item:terra');
    run = playCard(run, damocles);
    run = playCard(run, terra);
    expect(run.combat!.damoclesActive).toBe(true);
    expect(run.combat!.playerDamageBuff).toBe(6);
    expect(run.combat!.playerArmorBuff).toBe(2);
    expect(canPlayCard(run, damocles).ok).toBe(false);
  });

  it('restores the room checkpoint once with Regret Medicine', () => {
    let run = leaveFloorProvisionChoice(createRun('REGRET-MEDICINE'));
    equipItem(run, 'regret-medicine');
    run = enterFirstCombat(run);
    const fullHp = run.player.redHp;
    run.player.redHp = 5;
    run.combat!.playerPosition = { x: 3, y: 3 };
    const medicine = putCardInHand(run, 'item:regret-medicine');
    run = playCard(run, medicine);
    expect(run.player.redHp).toBe(fullHp);
    expect(run.combat!.deploymentPending).toBe(true);
    expect(run.combat!.usedPassiveItems).toContain('regret-medicine');
    const restoredMedicine = run.player.deck.find((card) => card.definitionId === 'item:regret-medicine')!;
    expect(canPlayCard(run, restoredMedicine.instanceId).ok).toBe(false);
  });
});
