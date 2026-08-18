import { describe, expect, it } from 'vitest';
import type { RunState } from '@isaac-spire/game';
import i18n from './i18n';
import { cardName, logText } from './localize';

describe('game localization', () => {
  it('uses Simplified Chinese when no saved browser preference exists', () => {
    expect(i18n.resolvedLanguage).toBe('zh-CN');
    expect(cardName(i18n.t, 'isaacs-tears')).toBe('泪弹');
    expect(cardName(i18n.t, 'item:goat-head')).toBe('山羊头');
  });

  it('localizes combat logs from runs saved before semantic log keys', () => {
    const run = {
      combat: {
        enemies: [
          { id: 'pooter', name: 'Pooter' },
          { id: 'fly', name: 'Attack Fly' },
        ],
      },
    } as unknown as RunState;

    expect(logText(i18n.t, run, 'Round 1 — Pooter, Attack Fly entered the room.'))
      .toBe('第 1 回合 — 喷射蝇、攻击蝇 进入了房间。');
  });
});
