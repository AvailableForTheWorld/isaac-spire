import { ITEMS, itemUsesCombatCard, passiveCardId } from '../catalog.js';
import type { CombatState, RunState } from '../types.js';
import { AttackMode, ItemKind } from '../types.js';

const LEGACY_CARD_IDS: Readonly<Record<string, string>> = {
  'isaacs-tears': 'basic-attack',
  'wide-tears': 'sweeping-attack',
};

function currentCardId(id: string): string {
  return LEGACY_CARD_IDS[id] ?? id;
}

/**
 * Pure, idempotent save migration. Schema-specific migrations can be appended
 * here as the game gains acts and multiplayer state.
 */
export function migrateRunSnapshot(state: RunState): RunState {
  const run = structuredClone(state);
  run.floorBombSearches ??= [];
  run.player.deck.forEach((card) => {
    card.definitionId = currentCardId(card.definitionId);
  });
  if ((run.player.stats.attackMode as string) === 'tears') run.player.stats.attackMode = AttackMode.Basic;
  run.choice?.options.forEach((option) => {
    if (option.cardId) option.cardId = currentCardId(option.cardId);
  });

  if (run.combat) {
    const legacyCombat = run.combat as CombatState & { tearMeter?: number };
    legacyCombat.attackMeter ??= legacyCombat.tearMeter ?? 0;
    delete legacyCombat.tearMeter;
    if ((legacyCombat.attackModeOverride as string | undefined) === 'tears')
      legacyCombat.attackModeOverride = AttackMode.Basic;
    (legacyCombat.animationEvents ?? []).forEach((event) => {
      if ((event.attackMode as string | undefined) === 'tears') event.attackMode = AttackMode.Basic;
    });
    (legacyCombat.log ?? []).forEach((entry) => {
      if (typeof entry.params?.cardId === 'string') entry.params.cardId = currentCardId(entry.params.cardId);
      if (entry.params?.mode === 'tears') entry.params.mode = AttackMode.Basic;
    });
  }

  const retiredCardIds = new Set(
    Object.values(ITEMS)
      .filter((item) => item.kind === ItemKind.Passive && !itemUsesCombatCard(item))
      .map((item) => passiveCardId(item.id)),
  );
  const retiredInstances = new Set(
    run.player.deck.filter((card) => retiredCardIds.has(card.definitionId)).map((card) => card.instanceId),
  );
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
    retiredInstances.forEach((id) => {
      delete run.combat!.cooldowns[id];
    });
  }
  return run;
}
