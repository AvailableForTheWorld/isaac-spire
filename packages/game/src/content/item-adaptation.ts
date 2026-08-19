import type { AttackFusionEffect, CardEffect, ItemDefinition } from '../domain/player.js';
import {
  AttackMode,
  CardEffectOpcode,
  CardTarget,
  ItemEffectFamily,
  ItemKind,
  type ItemMechanic,
  ItemTrait,
  ItemUseTiming,
  RewardPool,
  type RewardQuality,
  StatusKind,
} from '../domain/enums.js';

export interface IsaacItemManifestEntry {
  isaacId: number;
  id: string;
  name: string;
  nameZh: string;
  kind: ItemKind.Active | ItemKind.Passive;
  quality: RewardQuality;
  pools: RewardPool[];
  mechanics: ItemMechanic[];
  traits: ItemTrait[];
  family: ItemEffectFamily;
  chargeRounds?: number;
}

const FAMILY_ICONS: Record<ItemEffectFamily, string> = {
  [ItemEffectFamily.Assault]: '✦',
  [ItemEffectFamily.Volley]: '◉',
  [ItemEffectFamily.Familiar]: '♟',
  [ItemEffectFamily.Defense]: '◈',
  [ItemEffectFamily.Sustain]: '♥',
  [ItemEffectFamily.Mobility]: '➟',
  [ItemEffectFamily.Status]: '☠',
  [ItemEffectFamily.Bomb]: '●',
  [ItemEffectFamily.Economy]: '¢',
  [ItemEffectFamily.Mapping]: '⌖',
  [ItemEffectFamily.Reroll]: '⚄',
  [ItemEffectFamily.Draw]: '▤',
  [ItemEffectFamily.Cycle]: '↻',
  [ItemEffectFamily.Wildcard]: '✺',
};

const ATTACK_MODE_LABELS: Record<AttackMode, { en: string; zh: string }> = {
  [AttackMode.Basic]: { en: 'basic', zh: '基础攻击' },
  [AttackMode.Knife]: { en: "Mom's Knife", zh: '妈妈的菜刀' },
  [AttackMode.Brimstone]: { en: 'Brimstone', zh: '硫磺火' },
  [AttackMode.TechX]: { en: 'Tech X', zh: '科技 X' },
};

const STATUS_LABELS: Record<StatusKind, { en: string; zh: string }> = {
  [StatusKind.Silence]: { en: 'Silence', zh: '沉默' },
  [StatusKind.Poison]: { en: 'Poison', zh: '中毒' },
  [StatusKind.Blind]: { en: 'Blind', zh: '致盲' },
  [StatusKind.ArmorBreak]: { en: 'Armor Break', zh: '破防' },
  [StatusKind.Weak]: { en: 'Weak', zh: '虚弱' },
  [StatusKind.ItemLock]: { en: 'Item Lock', zh: '禁身' },
};

function qualityPower(quality: RewardQuality): number {
  return Math.max(0, Number(quality));
}

function familyFallbackEffectsFor(entry: IsaacItemManifestEntry): CardEffect[] {
  const quality = qualityPower(entry.quality);
  switch (entry.family) {
    case ItemEffectFamily.Assault:
      return [
        { opcode: CardEffectOpcode.GainDamage, amount: 1 + Math.ceil(quality / 2), target: CardTarget.Self },
      ];
    case ItemEffectFamily.Volley:
      return [
        { opcode: CardEffectOpcode.GainFireRate, amount: 0.1 + quality * 0.05, target: CardTarget.Self },
        ...(quality >= 3
          ? [{ opcode: CardEffectOpcode.Draw, amount: 1, target: CardTarget.Self } satisfies CardEffect]
          : []),
      ];
    case ItemEffectFamily.Familiar:
      return [
        { opcode: CardEffectOpcode.DamageAll, amount: 3 + quality * 2, target: CardTarget.AllEnemies },
        ...(quality >= 2
          ? [{ opcode: CardEffectOpcode.Draw, amount: 1, target: CardTarget.Self } satisfies CardEffect]
          : []),
      ];
    case ItemEffectFamily.Defense:
      return [
        { opcode: CardEffectOpcode.GainShield, amount: 5 + quality * 3, target: CardTarget.Self },
        ...(quality >= 4
          ? [{ opcode: CardEffectOpcode.GainArmor, amount: 1, target: CardTarget.Self } satisfies CardEffect]
          : []),
      ];
    case ItemEffectFamily.Sustain:
      return [
        { opcode: CardEffectOpcode.Heal, amount: 5 + quality * 3, target: CardTarget.Self },
        ...(quality >= 4
          ? [{ opcode: CardEffectOpcode.GainShield, amount: 8, target: CardTarget.Self } satisfies CardEffect]
          : []),
      ];
    case ItemEffectFamily.Mobility:
      return [
        { opcode: CardEffectOpcode.GainRange, amount: 1 + Math.floor(quality / 3), target: CardTarget.Self },
        { opcode: CardEffectOpcode.GainMovement, amount: 1, target: CardTarget.Self },
      ];
    case ItemEffectFamily.Status:
      return [
        {
          opcode: CardEffectOpcode.ApplyStatus,
          turns: 1 + Math.ceil(quality / 2),
          status: StatusKind.Weak,
          target: CardTarget.Enemy,
        },
      ];
    case ItemEffectFamily.Bomb:
      return [{ opcode: CardEffectOpcode.DamageAll, amount: 7 + quality * 5, target: CardTarget.AllEnemies }];
    case ItemEffectFamily.Economy:
      return [{ opcode: CardEffectOpcode.GainCoins, amount: 2 + quality * 2, target: CardTarget.Self }];
    case ItemEffectFamily.Mapping:
      return [{ opcode: CardEffectOpcode.RevealMap, amount: quality >= 3 ? 2 : 1, target: CardTarget.Self }];
    case ItemEffectFamily.Reroll:
      return [
        { opcode: CardEffectOpcode.RerollHand, amount: 1 + Math.ceil(quality / 2), target: CardTarget.Self },
      ];
    case ItemEffectFamily.Draw:
      return [
        { opcode: CardEffectOpcode.Draw, amount: 1 + Math.floor(quality / 2), target: CardTarget.Self },
      ];
    case ItemEffectFamily.Cycle:
      return [
        { opcode: CardEffectOpcode.Cycle, amount: 1 + Math.floor(quality / 2), target: CardTarget.Self },
      ];
    case ItemEffectFamily.Wildcard:
      return [
        { opcode: CardEffectOpcode.Draw, amount: 1, target: CardTarget.Self },
        { opcode: CardEffectOpcode.GainShield, amount: 3 + quality * 2, target: CardTarget.Self },
      ];
  }
}

function appendEffect(effects: CardEffect[], incoming: CardEffect): void {
  const current = effects.find(
    (effect) =>
      effect.opcode === incoming.opcode &&
      effect.target === incoming.target &&
      effect.status === incoming.status &&
      effect.attackMode === incoming.attackMode,
  );
  if (!current) {
    effects.push(incoming);
    return;
  }
  if (incoming.amount !== undefined) current.amount = (current.amount ?? 0) + incoming.amount;
  if (incoming.turns !== undefined) current.turns = Math.max(current.turns ?? 0, incoming.turns);
}

function cardEffectsFor(entry: IsaacItemManifestEntry): CardEffect[] {
  const quality = qualityPower(entry.quality);
  const power = 1 + Math.ceil(quality / 2);
  const turns = 1 + Math.ceil(quality / 2);
  const traits = new Set(entry.traits);
  const effects: CardEffect[] = [];
  const add = (effect: CardEffect) => appendEffect(effects, effect);

  if (traits.has(ItemTrait.DamageUp))
    add({ opcode: CardEffectOpcode.GainDamage, amount: power, target: CardTarget.Self });
  if (traits.has(ItemTrait.DamageDown))
    add({ opcode: CardEffectOpcode.GainDamage, amount: -1, target: CardTarget.Self });
  if (traits.has(ItemTrait.FireRateUp))
    add({ opcode: CardEffectOpcode.GainFireRate, amount: 0.08 + quality * 0.04, target: CardTarget.Self });
  if (traits.has(ItemTrait.FireRateDown))
    add({ opcode: CardEffectOpcode.GainFireRate, amount: -0.1, target: CardTarget.Self });
  if (traits.has(ItemTrait.RangeUp))
    add({ opcode: CardEffectOpcode.GainRange, amount: 1 + Math.floor(quality / 4), target: CardTarget.Self });
  if (traits.has(ItemTrait.RangeDown))
    add({ opcode: CardEffectOpcode.GainRange, amount: -1, target: CardTarget.Self });
  if (traits.has(ItemTrait.MovementUp))
    add({ opcode: CardEffectOpcode.GainMovement, amount: 1, target: CardTarget.Self });
  if (traits.has(ItemTrait.MovementDown))
    add({ opcode: CardEffectOpcode.GainMovement, amount: -1, target: CardTarget.Self });

  if (traits.has(ItemTrait.Homing))
    add({ opcode: CardEffectOpcode.EnableCurvedShots, target: CardTarget.Self });
  if (traits.has(ItemTrait.Piercing)) {
    add({ opcode: CardEffectOpcode.GainDamage, amount: 1, target: CardTarget.Self });
    add({ opcode: CardEffectOpcode.GainRange, amount: 1, target: CardTarget.Self });
  }
  if (traits.has(ItemTrait.Spectral)) {
    add({ opcode: CardEffectOpcode.GainRange, amount: 1, target: CardTarget.Self });
    add({ opcode: CardEffectOpcode.GainDodge, amount: 0.04 + quality * 0.01, target: CardTarget.Self });
  }
  if (traits.has(ItemTrait.MultiShot)) {
    add({ opcode: CardEffectOpcode.GainDamage, amount: power, target: CardTarget.Self });
    add({ opcode: CardEffectOpcode.Draw, amount: 1, target: CardTarget.Self });
  }
  if (traits.has(ItemTrait.SplitShot))
    add({ opcode: CardEffectOpcode.DamageAll, amount: 3 + quality * 2, target: CardTarget.AllEnemies });
  if (traits.has(ItemTrait.Brimstone)) {
    add({
      opcode: CardEffectOpcode.SetAttackMode,
      attackMode: AttackMode.Brimstone,
      target: CardTarget.Self,
    });
    add({ opcode: CardEffectOpcode.GainDamage, amount: power, target: CardTarget.Self });
  } else if (traits.has(ItemTrait.Knife)) {
    add({ opcode: CardEffectOpcode.SetAttackMode, attackMode: AttackMode.Knife, target: CardTarget.Self });
    add({ opcode: CardEffectOpcode.GainDamage, amount: power + 1, target: CardTarget.Self });
  } else if (traits.has(ItemTrait.Laser)) {
    add({ opcode: CardEffectOpcode.SetAttackMode, attackMode: AttackMode.TechX, target: CardTarget.Self });
    add({ opcode: CardEffectOpcode.GainFireRate, amount: 0.05 + quality * 0.03, target: CardTarget.Self });
  }
  if (traits.has(ItemTrait.Explosive))
    add({ opcode: CardEffectOpcode.DamageAll, amount: 6 + quality * 4, target: CardTarget.AllEnemies });

  const statusTraits: ReadonlyArray<[ItemTrait, StatusKind]> = [
    [ItemTrait.Poison, StatusKind.Poison],
    [ItemTrait.Slow, StatusKind.Weak],
    [ItemTrait.Fear, StatusKind.Silence],
    [ItemTrait.Charm, StatusKind.Blind],
    [ItemTrait.Freeze, StatusKind.Silence],
    [ItemTrait.Burn, StatusKind.ArmorBreak],
  ];
  for (const [trait, status] of statusTraits) {
    if (!traits.has(trait)) continue;
    add({
      opcode: CardEffectOpcode.ApplyStatus,
      amount: status === StatusKind.Poison ? 2 + quality : undefined,
      turns,
      status,
      target: CardTarget.Enemy,
    });
  }

  if (traits.has(ItemTrait.Heal) || traits.has(ItemTrait.MaxHealth))
    add({ opcode: CardEffectOpcode.Heal, amount: 4 + quality * 3, target: CardTarget.Self });
  if (traits.has(ItemTrait.SoulHeart))
    add({ opcode: CardEffectOpcode.GainShield, amount: 6 + quality * 2, target: CardTarget.Self });
  if (traits.has(ItemTrait.BlackHeart)) {
    add({ opcode: CardEffectOpcode.GainShield, amount: 8 + quality * 2, target: CardTarget.Self });
    add({ opcode: CardEffectOpcode.DamageAll, amount: 3 + quality * 2, target: CardTarget.AllEnemies });
  }
  if (traits.has(ItemTrait.Shield) || traits.has(ItemTrait.DamageReduction))
    add({ opcode: CardEffectOpcode.GainShield, amount: 5 + quality * 3, target: CardTarget.Self });
  if (traits.has(ItemTrait.Invincible)) {
    add({ opcode: CardEffectOpcode.GainShield, amount: 10 + quality * 4, target: CardTarget.Self });
    add({ opcode: CardEffectOpcode.GainDodge, amount: 0.05 + quality * 0.02, target: CardTarget.Self });
  }
  if (traits.has(ItemTrait.Orbital)) {
    add({ opcode: CardEffectOpcode.GainArmor, amount: 1, target: CardTarget.Self });
    add({ opcode: CardEffectOpcode.DamageAll, amount: 3 + quality * 2, target: CardTarget.AllEnemies });
  } else if (traits.has(ItemTrait.Familiar)) {
    add({ opcode: CardEffectOpcode.DamageAll, amount: 3 + quality * 2, target: CardTarget.AllEnemies });
    if (quality >= 2) add({ opcode: CardEffectOpcode.Draw, amount: 1, target: CardTarget.Self });
  }

  if (traits.has(ItemTrait.Coins))
    add({ opcode: CardEffectOpcode.GainCoins, amount: 1 + Math.ceil(quality / 2), target: CardTarget.Self });
  if (traits.has(ItemTrait.Bombs))
    add({ opcode: CardEffectOpcode.GainBombs, amount: 1 + Math.floor(quality / 3), target: CardTarget.Self });
  if (traits.has(ItemTrait.Keys))
    add({ opcode: CardEffectOpcode.GainKeys, amount: 1 + Math.floor(quality / 4), target: CardTarget.Self });
  if (traits.has(ItemTrait.Discount))
    add({ opcode: CardEffectOpcode.GainCoins, amount: 2 + quality, target: CardTarget.Self });
  if (traits.has(ItemTrait.RevealMap) || traits.has(ItemTrait.RevealSecret))
    add({
      opcode: CardEffectOpcode.RevealMap,
      amount: traits.has(ItemTrait.RevealMap) ? 2 : 1,
      target: CardTarget.Self,
    });
  if (traits.has(ItemTrait.Teleport)) {
    add({
      opcode: CardEffectOpcode.GainMovement,
      amount: 1 + Math.floor(quality / 3),
      target: CardTarget.Self,
    });
    add({ opcode: CardEffectOpcode.Cycle, amount: 1, target: CardTarget.Self });
  }
  if (traits.has(ItemTrait.Reroll))
    add({ opcode: CardEffectOpcode.RerollHand, amount: 1 + Math.ceil(quality / 2), target: CardTarget.Self });
  if (traits.has(ItemTrait.Copy))
    add({ opcode: CardEffectOpcode.Draw, amount: 2 + Math.floor(quality / 3), target: CardTarget.Self });
  if (traits.has(ItemTrait.CardGeneration)) {
    add({ opcode: CardEffectOpcode.Draw, amount: 1 + Math.floor(quality / 2), target: CardTarget.Self });
    add({ opcode: CardEffectOpcode.Cycle, amount: 1, target: CardTarget.Self });
  }
  if (traits.has(ItemTrait.Revival)) {
    add({ opcode: CardEffectOpcode.Heal, amount: 8 + quality * 4, target: CardTarget.Self });
    add({ opcode: CardEffectOpcode.GainShield, amount: 6 + quality * 3, target: CardTarget.Self });
  }
  if (traits.has(ItemTrait.Retaliation)) {
    add({ opcode: CardEffectOpcode.GainArmor, amount: 1, target: CardTarget.Self });
    add({ opcode: CardEffectOpcode.DamageAll, amount: 4 + quality * 2, target: CardTarget.AllEnemies });
  }
  if (traits.has(ItemTrait.RiskReward)) {
    add({ opcode: CardEffectOpcode.GainDamage, amount: power + 1, target: CardTarget.Self });
    add({ opcode: CardEffectOpcode.AddBlank, amount: 1, target: CardTarget.Self });
  }
  if (traits.has(ItemTrait.Random))
    add({ opcode: CardEffectOpcode.Cycle, amount: 1 + Math.floor(quality / 2), target: CardTarget.Self });

  return effects.length ? effects : familyFallbackEffectsFor(entry);
}

function fusionFor(entry: IsaacItemManifestEntry): AttackFusionEffect | undefined {
  const quality = qualityPower(entry.quality);
  const traits = new Set(entry.traits);
  const attackRelated = [
    ItemEffectFamily.Assault,
    ItemEffectFamily.Volley,
    ItemEffectFamily.Status,
    ItemEffectFamily.Bomb,
  ].includes(entry.family);
  if (!attackRelated) return undefined;
  const fusion: AttackFusionEffect = {
    damageMultiplier: 1.03 + quality * 0.025,
    projectileScale: 1 + quality * 0.05,
  };
  if (entry.family === ItemEffectFamily.Assault || traits.has(ItemTrait.DamageUp)) {
    fusion.damageMultiplier = 1.05 + quality * 0.04;
    fusion.flatDamage = Math.floor(quality / 2);
  }
  if (traits.has(ItemTrait.MultiShot) || traits.has(ItemTrait.SplitShot)) {
    fusion.damageMultiplier = (fusion.damageMultiplier ?? 1) + 0.05 + quality * 0.015;
    fusion.projectileScale = 1.15 + quality * 0.08;
  }
  if (traits.has(ItemTrait.Homing)) fusion.curvedShots = true;
  if (traits.has(ItemTrait.Piercing)) fusion.flatDamage = (fusion.flatDamage ?? 0) + 1;
  if (traits.has(ItemTrait.Explosive)) fusion.knockback = 1 + Math.floor(quality / 3);
  if (traits.has(ItemTrait.Poison)) {
    fusion.poisonTurns = 1 + Math.ceil(quality / 2);
    fusion.poisonDamage = 2 + quality;
  }
  if (traits.has(ItemTrait.Slow) || traits.has(ItemTrait.Freeze))
    fusion.slowTurns = 1 + Math.floor(quality / 2);
  if (traits.has(ItemTrait.Brimstone)) fusion.attackMode = AttackMode.Brimstone;
  else if (traits.has(ItemTrait.Knife)) fusion.attackMode = AttackMode.Knife;
  else if (traits.has(ItemTrait.Laser)) fusion.attackMode = AttackMode.TechX;
  return fusion;
}

function timingFor(entry: IsaacItemManifestEntry): ItemUseTiming {
  if (entry.kind === ItemKind.Active) return ItemUseTiming.ActiveCharge;
  return ItemUseTiming.CombatCard;
}

function effectDescription(effects: CardEffect[], language: 'en' | 'zh'): string {
  const rendered = effects
    .map((effect) => {
      const amount = effect.amount ?? 0;
      const turns = effect.turns ?? 0;
      if (language === 'zh') {
        switch (effect.opcode) {
          case CardEffectOpcode.GainDamage:
            return `本场战斗攻击伤害 ${amount >= 0 ? '+' : ''}${amount}`;
          case CardEffectOpcode.GainFireRate:
            return `本场战斗射速 ${amount >= 0 ? '+' : ''}${amount.toFixed(2)}`;
          case CardEffectOpcode.GainArmor:
            return `本场战斗护甲 +${amount}`;
          case CardEffectOpcode.GainShield:
            return `获得 ${amount} 点护盾`;
          case CardEffectOpcode.Heal:
            return `恢复 ${amount} 点生命`;
          case CardEffectOpcode.GainRange:
            return `本场战斗射程 ${amount >= 0 ? '+' : ''}${amount}`;
          case CardEffectOpcode.GainMovement:
            return `本场战斗移动距离 ${amount >= 0 ? '+' : ''}${amount}`;
          case CardEffectOpcode.GainCritical:
            return `本场战斗暴击率 +${Math.round(amount * 100)}%`;
          case CardEffectOpcode.GainDodge:
            return `本场战斗闪避率 +${Math.round(amount * 100)}%`;
          case CardEffectOpcode.EnableCurvedShots:
            return '本场战斗攻击可以斜向追踪目标';
          case CardEffectOpcode.SetAttackMode:
            return `本场战斗攻击形态变为 ${ATTACK_MODE_LABELS[effect.attackMode ?? AttackMode.Basic].zh}`;
          case CardEffectOpcode.Draw:
            return `抽 ${amount} 张牌`;
          case CardEffectOpcode.Cycle:
            return `优先丢弃空白/诅咒牌并过 ${amount} 张牌`;
          case CardEffectOpcode.DamageAll:
            return `对所有敌人造成 ${amount} 点伤害`;
          case CardEffectOpcode.ApplyStatus:
            return `${effect.status ? STATUS_LABELS[effect.status].zh : '负面状态'} ${turns} 回合`;
          case CardEffectOpcode.GainCoins:
            return `获得 ${amount} 枚硬币`;
          case CardEffectOpcode.GainBombs:
            return `获得 ${amount} 枚炸弹`;
          case CardEffectOpcode.GainKeys:
            return `获得 ${amount} 把钥匙`;
          case CardEffectOpcode.AddBlank:
            return `向弃牌堆加入 ${amount} 张空白牌`;
          case CardEffectOpcode.RevealMap:
            return amount >= 2 ? '显示本层全部房间' : '显示本层隐藏房';
          case CardEffectOpcode.RerollHand:
            return `重置至多 ${amount} 张手牌`;
          default:
            return `触发 ${effect.opcode}`;
        }
      }
      switch (effect.opcode) {
        case CardEffectOpcode.GainDamage:
          return `gain ${amount >= 0 ? '+' : ''}${amount} combat damage`;
        case CardEffectOpcode.GainFireRate:
          return `gain ${amount >= 0 ? '+' : ''}${amount.toFixed(2)} combat fire rate`;
        case CardEffectOpcode.GainArmor:
          return `gain +${amount} combat armor`;
        case CardEffectOpcode.GainShield:
          return `gain ${amount} shield`;
        case CardEffectOpcode.Heal:
          return `recover ${amount} HP`;
        case CardEffectOpcode.GainRange:
          return `gain ${amount >= 0 ? '+' : ''}${amount} combat range`;
        case CardEffectOpcode.GainMovement:
          return `gain ${amount >= 0 ? '+' : ''}${amount} combat movement`;
        case CardEffectOpcode.GainCritical:
          return `gain +${Math.round(amount * 100)}% critical chance this combat`;
        case CardEffectOpcode.GainDodge:
          return `gain +${Math.round(amount * 100)}% dodge this combat`;
        case CardEffectOpcode.EnableCurvedShots:
          return 'allow attacks to home diagonally this combat';
        case CardEffectOpcode.SetAttackMode:
          return `change attacks to ${ATTACK_MODE_LABELS[effect.attackMode ?? AttackMode.Basic].en} this combat`;
        case CardEffectOpcode.Draw:
          return `draw ${amount}`;
        case CardEffectOpcode.Cycle:
          return `cycle ${amount}, prioritizing Blank and Curse cards`;
        case CardEffectOpcode.DamageAll:
          return `deal ${amount} to all enemies`;
        case CardEffectOpcode.ApplyStatus:
          return `apply ${turns} ${effect.status ? STATUS_LABELS[effect.status].en : 'status'}`;
        case CardEffectOpcode.GainCoins:
          return `gain ${amount} coins`;
        case CardEffectOpcode.GainBombs:
          return `gain ${amount} bombs`;
        case CardEffectOpcode.GainKeys:
          return `gain ${amount} keys`;
        case CardEffectOpcode.AddBlank:
          return `add ${amount} Blank cards to the discard pile`;
        case CardEffectOpcode.RevealMap:
          return amount >= 2 ? 'reveal the floor' : 'reveal secret rooms';
        case CardEffectOpcode.RerollHand:
          return `reroll up to ${amount} cards in hand`;
        default:
          return `trigger ${effect.opcode}`;
      }
    })
    .join(language === 'zh' ? '；' : '; ');
  if (language === 'zh') return `${rendered}。`;
  return `${rendered.charAt(0).toUpperCase()}${rendered.slice(1)}.`;
}

export function adaptIsaacItem(entry: IsaacItemManifestEntry): ItemDefinition {
  const timing = timingFor(entry);
  const cardEffects = cardEffectsFor(entry);
  const active = entry.kind === ItemKind.Active;
  return {
    id: entry.id,
    isaacId: entry.isaacId,
    name: entry.name,
    nameZh: entry.nameZh,
    kind: entry.kind,
    pool: entry.pools.length ? [...entry.pools] : [RewardPool.Treasure],
    description: effectDescription(cardEffects, 'en'),
    descriptionZh: effectDescription(cardEffects, 'zh'),
    icon: FAMILY_ICONS[entry.family],
    quality: entry.quality,
    timing,
    family: entry.family,
    originalMechanics: [...entry.mechanics],
    originalTraits: [...entry.traits],
    chargeRounds: active ? (entry.chargeRounds ?? 3) : undefined,
    skillCardId: active ? `skill:${entry.id}` : undefined,
    cardCost: Math.max(0, Math.min(3, 1 + Math.floor(qualityPower(entry.quality) / 2))),
    combatCard: !active,
    effects: entry.traits.includes(ItemTrait.Homing) ? [{ curvedShots: true }] : undefined,
    cardEffects,
    fusion: fusionFor(entry),
  };
}
