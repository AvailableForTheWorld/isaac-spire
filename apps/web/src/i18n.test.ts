import { describe, expect, it } from 'vitest';
import { CardType, RewardPool, UpgradeKind, type RunState } from '@isaac-spire/game';
import i18n from './i18n';
import { cardDescription, cardName, logText } from './localize';

describe('game localization', () => {
  it('uses Simplified Chinese when no saved browser preference exists', () => {
    expect(i18n.resolvedLanguage).toBe('zh-CN');
    expect(cardName(i18n.t, 'basic-attack')).toBe('攻击');
    expect(cardName(i18n.t, 'sweeping-attack')).toBe('横扫攻击');
    expect(cardName(i18n.t, 'half-heart')).toBe('治疗');
    expect(cardDescription(i18n.t, 'half-heart')).toContain('恢复 10 点');
    expect(cardDescription(i18n.t, 'half-heart')).toContain('额外恢复 3 点');
    expect(cardName(i18n.t, 'vitality-shot')).toBe('体力针');
    expect(cardDescription(i18n.t, 'vitality-shot')).toContain('本回合获得 2 点体力');
    expect(i18n.t(`cardTypes.${CardType.Vitality}`)).toBe('体力');
    expect(cardDescription(i18n.t, 'double-shot')).toContain('70% 攻击伤害');
    expect(i18n.t('fusion.free')).toBe('融合不消耗体力');
    expect(i18n.t('fusion.description')).toContain('不会留下持续属性');
    expect(i18n.t('fusion.diameter', { value: '2.00' })).toBe('弹体直径 2.00 格');
    expect(i18n.t('fusion.contactDamage', { value: 50 })).toBe('擦碰伤害 50% × 重叠面积');
    expect(i18n.t('combat.roomClearTitle')).toBe('房间已清理');
    expect(i18n.t('rewardReveal.confirm')).toBe('打开选牌奖励');
    expect(i18n.t(`rewardPools.${RewardPool.SuperSecret}`)).toBe('超级隐藏房');
    expect(cardName(i18n.t, 'item:goat-head')).toBe('山羊头');
    expect(cardDescription(i18n.t, 'skill-d6')).toBe(
      '将手牌中的其他道具与抽牌堆、弃牌堆中的随机牌交换位置。',
    );
    expect(cardDescription(i18n.t, 'item:starter-deck')).not.toMatch(/依据原作|根据原作|改编/);
    expect(i18n.t('choice.replaceActiveConfirm', { current: '六面骰', next: '美味的心' })).toContain(
      '确认要拾取吗',
    );
    expect(i18n.t('confirmation.replaceActiveTitle')).toBe('要替换当前主动道具吗？');
    expect(i18n.t('choice.leaveEmpty')).toBe('什么也不拿，直接离开');
    expect(i18n.t(`upgrades.${UpgradeKind.Card}.name`)).toBe('牌组锻造');
    expect(i18n.t(`upgrades.${UpgradeKind.Shield}.description`)).toContain('+5');
    expect(i18n.t('combatSelection.drawHint', { count: 2 })).toBe(
      '从抽牌堆中选择至多 2 张牌，也可以跳过本阶段。',
    );
    expect(i18n.t('combatSelection.cycleHint', { count: 2 })).toBe(
      '选择至多 2 张手牌进行置换，也可以跳过；数量不会超过前一阶段实际抽牌数。',
    );
    expect(i18n.t('combatSelection.skip')).toBe('跳过本阶段');
    expect(i18n.t('map.noKeyBypass')).toBe('缺少钥匙 · 点击路过');
    expect(i18n.t('errors.shieldFull')).toBe('护盾已达到上限');
    expect(i18n.t('errors.redHeartFull')).toBe('红心生命已满');
  });

  it('provides Chinese save, exit, and continue-copy for the persistent run flow', () => {
    expect(i18n.t('header.save', { lng: 'zh-CN' })).toBe('保存');
    expect(i18n.t('header.saveAndExit', { lng: 'zh-CN' })).toBe('保存并返回主界面');
    expect(i18n.t('header.saveStatus.saved', { lng: 'zh-CN' })).toBe('已保存');
    expect(i18n.t('home.continue', { lng: 'zh-CN', floor: 3 })).toBe('继续第 3 层');
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
    expect(
      logText(i18n.t, run, '', 'enemyAttack', {
        enemyId: 'pooter',
        damage: 5,
        shield: 3,
        remainingHp: 25,
        maximumHp: 120,
      }),
    ).toBe('喷射蝇发动攻击：造成 5 点生命伤害（护盾抵挡 3 点）。剩余生命：25/120。');
  });
});
