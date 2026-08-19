import { describe, expect, it } from 'vitest';
import type { RunState } from '@isaac-spire/game';
import i18n from './i18n';
import { cardDescription, cardName, logText } from './localize';

describe('game localization', () => {
  it('uses Simplified Chinese when no saved browser preference exists', () => {
    expect(i18n.resolvedLanguage).toBe('zh-CN');
    expect(cardName(i18n.t, 'basic-attack')).toBe('攻击');
    expect(cardName(i18n.t, 'sweeping-attack')).toBe('横扫攻击');
    expect(cardDescription(i18n.t, 'double-shot')).toContain('70% 攻击伤害');
    expect(i18n.t('fusion.free')).toBe('融合不消耗体力');
    expect(i18n.t('fusion.description')).toContain('不会留下持续属性');
    expect(i18n.t('combat.roomClearTitle')).toBe('房间已清理');
    expect(cardName(i18n.t, 'item:goat-head')).toBe('山羊头');
    expect(i18n.t('combat.confirmActiveDiscard', { item: '六面骰' })).toContain('不再出现在本局战斗中');
    expect(i18n.t('choice.replaceActiveConfirm', { current: '六面骰', next: '美味的心' })).toContain(
      '确认要拾取吗',
    );
    expect(i18n.t('confirmation.replaceActiveTitle')).toBe('要替换当前主动道具吗？');
    expect(i18n.t('confirmation.discardActive')).toBe('永久弃掉');
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

    expect(logText(i18n.t, run, 'Round 1 — Pooter, Attack Fly entered the room.')).toBe(
      '第 1 回合 — 喷射蝇、攻击蝇 进入了房间。',
    );
  });
});
