import { describe, expect, it } from 'vitest';
import {
  CardTarget,
  CardType,
  ChoiceKind,
  CombatAnimationKind,
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
    expect(CardTarget.Enemy).toBe('enemy');
    expect(ItemKind.Active).toBe('active');
    expect(RoomKind.SuperSecret).toBe('super-secret');
    expect(IntentKind.Prepare).toBe('prepare');
    expect(CombatAnimationKind.PlayerAttack).toBe('player-attack');
    expect(ChoiceKind.Loot).toBe('loot');
    expect(RewardOptionType.Resource).toBe('resource');
    expect(RunPhase.Combat).toBe('combat');
    expect(RunStatus.Active).toBe('active');
    expect(UnlockEvent.MomClear).toBe('mom-clear');
  });
});
