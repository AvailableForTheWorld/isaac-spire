import { describe, expect, it } from 'vitest';
import {
  BossAttackPattern,
  CardPileKind,
  CardTarget,
  CardType,
  ChoiceKind,
  CombatAnimationKind,
  CombatSelectionKind,
  IntentKind,
  ItemKind,
  RewardOptionType,
  RoomKind,
  RunPhase,
  RunStatus,
  UnlockEvent,
} from './enums.js';

describe('stable domain enum wire values', () => {
  it('keeps persisted and API discriminants backward compatible', () => {
    expect(CardType.Attack).toBe('attack');
    expect(CardType.Vitality).toBe('vitality');
    expect(CardTarget.Enemy).toBe('enemy');
    expect(CardPileKind.Discard).toBe('discard');
    expect(ItemKind.Active).toBe('active');
    expect(RoomKind.SuperSecret).toBe('super-secret');
    expect(IntentKind.Prepare).toBe('prepare');
    expect(BossAttackPattern.LeapSlam).toBe('leap-slam');
    expect(CombatAnimationKind.PlayerAttack).toBe('player-attack');
    expect(CombatAnimationKind.CardExchange).toBe('card-exchange');
    expect(CombatSelectionKind.Cycle).toBe('cycle');
    expect(ChoiceKind.Loot).toBe('loot');
    expect(RewardOptionType.Resource).toBe('resource');
    expect(RunPhase.Combat).toBe('combat');
    expect(RunStatus.Active).toBe('active');
    expect(UnlockEvent.MomClear).toBe('mom-clear');
  });
});
