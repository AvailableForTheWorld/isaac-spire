import type { CardEffect, ItemActionDefinition, ItemDefinition } from '../domain/player.js';
import {
  CardEffectOpcode,
  CardTarget,
  ItemActionMethod,
  ItemActionTrigger,
  StatusKind,
} from '../domain/enums.js';
import { FULL_ISAAC_ITEMS } from './isaac-items.generated.js';

type ActionOptions = Omit<ItemActionDefinition, 'id' | 'trigger' | 'method' | 'effects'>;

const self = (opcode: CardEffectOpcode, amount?: number, turns?: number): CardEffect => ({
  opcode,
  amount,
  turns,
  target: CardTarget.Self,
});

const all = (opcode: CardEffectOpcode, amount?: number, turns?: number): CardEffect => ({
  opcode,
  amount,
  turns,
  target: CardTarget.AllEnemies,
});

const allStatus = (status: StatusKind, turns: number, amount?: number): CardEffect => ({
  opcode: CardEffectOpcode.ApplyStatus,
  status,
  turns,
  amount,
  target: CardTarget.AllEnemies,
});

function effectsAction(
  id: string,
  trigger: ItemActionTrigger,
  effects: CardEffect[],
  options: ActionOptions = {},
): ItemActionDefinition {
  return { id, trigger, method: ItemActionMethod.ApplyEffects, effects, ...options };
}

function methodAction(
  id: string,
  trigger: ItemActionTrigger,
  method: ItemActionMethod,
  options: ActionOptions & { effects?: CardEffect[] } = {},
): ItemActionDefinition {
  return { id, trigger, method, ...options };
}

function specialize(
  id: string,
  descriptionZh: string,
  actions: ItemActionDefinition[],
  patch: Partial<ItemDefinition> = {},
): ItemDefinition {
  const base = FULL_ISAAC_ITEMS[id];
  if (!base) throw new Error(`Cannot specialize unknown Isaac collectible: ${id}`);
  return {
    ...base,
    ...patch,
    description: patch.description ?? base.description,
    descriptionZh,
    cardEffects: [],
    actions,
  };
}

/**
 * Hand-authored lifecycle overrides for collectibles whose identity depends on
 * a trigger, state transition, reroll, revival, duplication, or room method.
 * Plain stat collectibles intentionally stay in the generated catalog.
 */
export const ISAAC_ACTION_ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  'the-bible': specialize('the-bible', '发动后对全体敌人造成40点神圣伤害，并获得10点护盾。', [
    effectsAction('holy-judgement', ItemActionTrigger.Activate, [
      all(CardEffectOpcode.DamageAll, 40),
      self(CardEffectOpcode.GainShield, 10),
    ]),
  ]),
  'the-necronomicon': specialize('the-necronomicon', '发动后对全体敌人造成30点伤害。', [
    effectsAction('mass-damage', ItemActionTrigger.Activate, [all(CardEffectOpcode.DamageAll, 30)]),
  ]),
  'mr-boom': specialize('mr-boom', '发动一次高威力房间爆炸，对全体敌人造成50点伤害。', [
    effectsAction('room-explosion', ItemActionTrigger.Activate, [all(CardEffectOpcode.DamageAll, 50)]),
  ]),
  'moms-bra': specialize('moms-bra', '使当前房间所有敌人沉默2回合。', [
    effectsAction('mass-petrify', ItemActionTrigger.Activate, [allStatus(StatusKind.Silence, 2)]),
  ]),
  kamikaze: specialize('kamikaze', '对全体敌人造成55点伤害，同时自己损失10点生命。', [
    effectsAction('self-explosion', ItemActionTrigger.Activate, [all(CardEffectOpcode.DamageAll, 55)]),
    methodAction('self-damage', ItemActionTrigger.Activate, ItemActionMethod.SacrificeHeart, { amount: 10 }),
  ]),
  'moms-pad': specialize('moms-pad', '恐吓全体敌人，使其沉默2回合并陷入虚弱。', [
    effectsAction('mass-fear', ItemActionTrigger.Activate, [
      allStatus(StatusKind.Silence, 2),
      allStatus(StatusKind.Weak, 2),
    ]),
  ]),
  teleport: specialize('teleport', '发动后揭示当前层地图，并获得2格临时移动距离。', [
    methodAction('teleport-map', ItemActionTrigger.Activate, ItemActionMethod.RevealMap, {
      effects: [self(CardEffectOpcode.GainMovement, 2)],
    }),
  ]),
  'doctors-remote': specialize('doctors-remote', '选择射程内一个敌人，呼叫导弹造成65点伤害。', [
    effectsAction('targeted-missile', ItemActionTrigger.Activate, [
      { opcode: CardEffectOpcode.DamageTarget, amount: 65, target: CardTarget.Enemy },
    ]),
  ]),
  'my-little-unicorn': specialize(
    'my-little-unicorn',
    '本场战斗获得25点护盾、15%闪避，并对全体造成15点伤害。',
    [
      effectsAction('unicorn-rush', ItemActionTrigger.Activate, [
        self(CardEffectOpcode.GainShield, 25),
        self(CardEffectOpcode.GainDodge, 0.15),
        all(CardEffectOpcode.DamageAll, 15),
      ]),
    ],
  ),
  'book-of-revelations': specialize('book-of-revelations', '获得20点护盾、恢复8点生命并抽1张牌。', [
    effectsAction('revelation', ItemActionTrigger.Activate, [
      self(CardEffectOpcode.GainShield, 20),
      self(CardEffectOpcode.Heal, 8),
      self(CardEffectOpcode.Draw, 1),
    ]),
  ]),
  'we-need-to-go-deeper': specialize('we-need-to-go-deeper', '揭示当前层全部路线并获得1点体力。', [
    methodAction('open-trapdoor', ItemActionTrigger.Activate, ItemActionMethod.RevealMap, {
      effects: [self(CardEffectOpcode.GainVitality, 1)],
    }),
  ]),
  'deck-of-cards': specialize('deck-of-cards', '从牌库额外抽2张牌，并过1张不需要的牌。', [
    effectsAction('deal-cards', ItemActionTrigger.Activate, [
      self(CardEffectOpcode.Draw, 2),
      self(CardEffectOpcode.Cycle, 1),
    ]),
  ]),
  'the-gamekid': specialize('the-gamekid', '进入狂暴：获得20点护盾、3点伤害，并伤害全体敌人。', [
    effectsAction('pacman', ItemActionTrigger.Activate, [
      self(CardEffectOpcode.GainShield, 20),
      self(CardEffectOpcode.GainDamage, 3),
      all(CardEffectOpcode.DamageAll, 12),
    ]),
  ]),
  'the-book-of-sin': specialize('the-book-of-sin', '随机触发另一件已解锁道具的牌面效果。', [
    methodAction('random-sin', ItemActionTrigger.Activate, ItemActionMethod.RandomItemEffect),
  ]),
  'monster-manual': specialize(
    'monster-manual',
    '召唤一名随机跟班：生成一张道具牌并对全体敌人造成6点伤害。',
    [
      methodAction('summon-familiar', ItemActionTrigger.Activate, ItemActionMethod.GenerateItemCard, {
        effects: [all(CardEffectOpcode.DamageAll, 6)],
      }),
    ],
  ),
  'dead-sea-scrolls': specialize('dead-sea-scrolls', '随机执行另一件主动或被动道具的牌面效果。', [
    methodAction('unknown-scripture', ItemActionTrigger.Activate, ItemActionMethod.RandomItemEffect),
  ]),
  'razor-blade': specialize('razor-blade', '损失10点生命，本场战斗获得3点攻击伤害。', [
    methodAction('blood-for-power', ItemActionTrigger.Activate, ItemActionMethod.SacrificeHeart, {
      amount: 10,
      effects: [self(CardEffectOpcode.GainDamage, 3)],
    }),
  ]),
  'remote-detonator': specialize('remote-detonator', '遥控引爆房间炸弹，对全体敌人造成35点伤害。', [
    effectsAction('detonate-room', ItemActionTrigger.Activate, [all(CardEffectOpcode.DamageAll, 35)]),
  ]),
  'crystal-ball': specialize('crystal-ball', '揭示本层全部路线、抽2张牌并获得6点护盾。', [
    methodAction('divine-floor', ItemActionTrigger.Activate, ItemActionMethod.RevealMap, {
      effects: [self(CardEffectOpcode.Draw, 2), self(CardEffectOpcode.GainShield, 6)],
    }),
  ]),
  'dads-key': specialize('dads-key', '揭示本层路线和隐藏房，并获得1把钥匙。', [
    methodAction('open-floor', ItemActionTrigger.Activate, ItemActionMethod.RevealMap, {
      effects: [self(CardEffectOpcode.GainKeys, 1)],
    }),
  ]),
  'blood-rights': specialize('blood-rights', '损失10点生命，对全体敌人造成30点无目标伤害。', [
    methodAction('blood-room-damage', ItemActionTrigger.Activate, ItemActionMethod.SacrificeHeart, {
      amount: 10,
      effects: [all(CardEffectOpcode.DamageAll, 30)],
    }),
  ]),
  'forget-me-now': specialize('forget-me-now', '消耗本主动道具，保留角色构筑并重新生成当前层。', [
    methodAction('restart-floor', ItemActionTrigger.Activate, ItemActionMethod.RestartFloor, {
      consumeItem: true,
    }),
  ]),
  d20: specialize('d20', '重置当前手牌的非主动牌。', [
    methodAction('reroll-hand', ItemActionTrigger.Activate, ItemActionMethod.TransformHand),
  ]),
  d100: specialize('d100', '同时重置角色战斗属性、敌人和手牌中的道具牌。', [
    methodAction('reroll-stats', ItemActionTrigger.Activate, ItemActionMethod.RerollPlayerStats),
    methodAction('reroll-enemies', ItemActionTrigger.Activate, ItemActionMethod.RerollEnemies),
    methodAction('reroll-items', ItemActionTrigger.Activate, ItemActionMethod.RerollItemCards),
  ]),
  d4: specialize('d4', '将手牌中的被动道具牌全部重置为其他已解锁道具牌。', [
    methodAction('reroll-items', ItemActionTrigger.Activate, ItemActionMethod.RerollItemCards),
  ]),
  d10: specialize('d10', '将房间内所有非首领敌人重置为本层其他敌人。', [
    methodAction('reroll-enemies', ItemActionTrigger.Activate, ItemActionMethod.RerollEnemies),
  ]),
  'clear-rune': specialize('clear-rune', '重复上一张非主动牌的效果，用牌组中的上一张牌模拟符文。', [
    methodAction('repeat-rune', ItemActionTrigger.Activate, ItemActionMethod.ReplayPreviousCard),
  ]),
  undefined: specialize('undefined', '揭示本层地图并重置当前手牌。', [
    methodAction('unknown-map', ItemActionTrigger.Activate, ItemActionMethod.RevealMap),
    methodAction('unknown-hand', ItemActionTrigger.Activate, ItemActionMethod.TransformHand),
  ]),
  placebo: specialize('placebo', '免费重复上一张非主动牌的效果，用于模拟复制药丸效果。', [
    methodAction('repeat-consumable', ItemActionTrigger.Activate, ItemActionMethod.ReplayPreviousCard),
  ]),
  'book-of-secrets': specialize('book-of-secrets', '揭示当前层全部普通、隐藏与特殊房间。', [
    methodAction('read-floor-map', ItemActionTrigger.Activate, ItemActionMethod.RevealMap),
  ]),
  'magic-fingers': specialize(
    'magic-fingers',
    '消耗1枚硬币，对房间内所有敌人造成18点伤害；硬币不足时无效果。',
    [
      methodAction('pay-for-damage', ItemActionTrigger.Activate, ItemActionMethod.SpendCoins, {
        amount: 1,
        secondaryAmount: 18,
      }),
    ],
  ),
  converter: specialize('converter', '消耗10点护盾并恢复15点红心生命；护盾不足时无效果。', [
    methodAction('shield-to-heart', ItemActionTrigger.Activate, ItemActionMethod.ConvertShieldToHealth, {
      amount: 10,
      secondaryAmount: 15,
    }),
  ]),
  'blank-card': specialize('blank-card', '重复上一张非主动牌的效果，不再次消耗那张牌。', [
    methodAction('copy-previous-card', ItemActionTrigger.Activate, ItemActionMethod.ReplayPreviousCard),
  ]),
  'pandoras-box': specialize('pandoras-box', '消耗后生成两张随机道具牌并放入弃牌堆。', [
    methodAction('gift-one', ItemActionTrigger.Activate, ItemActionMethod.GenerateItemCard),
    methodAction('gift-two', ItemActionTrigger.Activate, ItemActionMethod.GenerateItemCard, {
      consumeItem: true,
    }),
  ]),
  d1: specialize('d1', '随机复制当前手牌中的一张牌，并永久加入牌组。', [
    methodAction('duplicate-card', ItemActionTrigger.Activate, ItemActionMethod.DuplicateRandomHandCard),
  ]),
  void: specialize('void', '吞噬手牌中的其他道具牌；每张造成8点全体伤害并获得4点护盾。', [
    methodAction('consume-items', ItemActionTrigger.Activate, ItemActionMethod.ConsumeItemCards, {
      amount: 8,
      secondaryAmount: 4,
    }),
  ]),
  'box-of-friends': specialize('box-of-friends', '复制一张随机手牌并永久加入牌组，用于模拟跟班数量翻倍。', [
    methodAction(
      'double-familiar-card',
      ItemActionTrigger.Activate,
      ItemActionMethod.DuplicateRandomHandCard,
    ),
  ]),
  d12: specialize('d12', '重置当前房间的所有非首领敌人，并保留其相对生命比例。', [
    methodAction('reroll-room-obstacles', ItemActionTrigger.Activate, ItemActionMethod.RerollEnemies),
  ]),
  d8: specialize('d8', '随机重置本场战斗的基础攻击、护甲、射速、移动和射程。', [
    methodAction('reroll-combat-stats', ItemActionTrigger.Activate, ItemActionMethod.RerollPlayerStats),
  ]),
  'teleport-2-0': specialize('teleport-2-0', '揭示本层全部路线并重置当前手牌，模拟向未探索房间传送。', [
    methodAction('route-teleport', ItemActionTrigger.Activate, ItemActionMethod.RevealMap),
    methodAction('teleport-refresh', ItemActionTrigger.Activate, ItemActionMethod.TransformHand),
  ]),
  d7: specialize('d7', '把当前房间恢复至进入时的部署状态，重新挑战并重新结算房间。', [
    methodAction('restart-current-room', ItemActionTrigger.Activate, ItemActionMethod.RestartRoom),
  ]),
  pause: specialize('pause', '暂停敌人行动，使全体敌人沉默1回合。', [
    effectsAction('pause-room', ItemActionTrigger.Activate, [allStatus(StatusKind.Silence, 1)]),
  ]),
  compost: specialize('compost', '复制一张随机手牌，并对全体敌人造成8点跟班伤害。', [
    methodAction('duplicate-card', ItemActionTrigger.Activate, ItemActionMethod.DuplicateRandomHandCard, {
      effects: [all(CardEffectOpcode.DamageAll, 8)],
    }),
  ]),
  clicker: specialize('clicker', '重新洗牌当前手牌，并获得1点体力。', [
    methodAction('transform-hand', ItemActionTrigger.Activate, ItemActionMethod.TransformHand, {
      effects: [self(CardEffectOpcode.GainVitality, 1)],
    }),
  ]),
  'mama-mega': specialize('mama-mega', '消耗后引爆房间，对全体敌人造成9999点伤害。', [
    methodAction('floor-explosion', ItemActionTrigger.Activate, ItemActionMethod.DestroyAllEnemies, {
      consumeItem: true,
    }),
  ]),
  'crooked-penny': specialize('crooked-penny', '50%概率翻倍硬币、炸弹和钥匙，否则这些资产减半。', [
    methodAction('crooked-roll', ItemActionTrigger.Activate, ItemActionMethod.CrookedPenny),
  ]),
  metronome: specialize('metronome', '随机触发一件其他道具的可执行牌面效果。', [
    methodAction('random-item', ItemActionTrigger.Activate, ItemActionMethod.RandomItemEffect),
  ]),
  smelter: specialize('smelter', '熔化手牌中的其他道具牌；每张转化为3点伤害与3点护盾。', [
    methodAction('smelt-items', ItemActionTrigger.Activate, ItemActionMethod.ConsumeItemCards, {
      amount: 3,
      secondaryAmount: 3,
    }),
  ]),
  dataminer: specialize('dataminer', '随机重置本场战斗属性，并对全体敌人造成8点故障伤害。', [
    methodAction('corrupt-stats', ItemActionTrigger.Activate, ItemActionMethod.RerollPlayerStats, {
      effects: [all(CardEffectOpcode.DamageAll, 8)],
    }),
  ]),
  'dull-razor': specialize('dull-razor', '不损失生命，触发一次“玩家受到生命伤害”类道具的action。', [
    methodAction('fake-damage-event', ItemActionTrigger.Activate, ItemActionMethod.TriggerPlayerDamaged),
  ]),
  'd-infinity': specialize('d-infinity', '随机重置手牌、道具牌、敌人或角色战斗属性。', [
    methodAction('random-dice-effect', ItemActionTrigger.Activate, ItemActionMethod.RandomItemEffect),
    methodAction('reroll-hand', ItemActionTrigger.Activate, ItemActionMethod.TransformHand, { chance: 0.5 }),
  ]),
  'edens-soul': specialize('edens-soul', '消耗后生成两张随机道具牌。', [
    methodAction('eden-item-one', ItemActionTrigger.Activate, ItemActionMethod.GenerateItemCard),
    methodAction('eden-item-two', ItemActionTrigger.Activate, ItemActionMethod.GenerateItemCard, {
      consumeItem: true,
    }),
  ]),
  'mystery-gift': specialize('mystery-gift', '消耗后生成一张随机道具牌。', [
    methodAction('mystery-item', ItemActionTrigger.Activate, ItemActionMethod.GenerateItemCard, {
      consumeItem: true,
    }),
  ]),
  'moving-box': specialize('moving-box', '收纳手牌中其他道具牌，再生成一张代表打包结果的新道具牌。', [
    methodAction('pack-items', ItemActionTrigger.Activate, ItemActionMethod.ConsumeItemCards, {
      amount: 2,
      secondaryAmount: 2,
    }),
    methodAction('unpack-item', ItemActionTrigger.Activate, ItemActionMethod.GenerateItemCard),
  ]),
  'moms-shovel': specialize('moms-shovel', '揭示当前层全部路线并获得1枚炸弹，用于模拟挖掘暗门。', [
    methodAction('dig-floor-exit', ItemActionTrigger.Activate, ItemActionMethod.RevealMap, {
      effects: [self(CardEffectOpcode.GainBombs, 1)],
    }),
  ]),
  'everything-jar': specialize('everything-jar', '根据蓄力释放资源包：获得硬币、炸弹、钥匙并抽1张牌。', [
    effectsAction('release-jar', ItemActionTrigger.Activate, [
      self(CardEffectOpcode.GainCoins, 2),
      self(CardEffectOpcode.GainBombs, 1),
      self(CardEffectOpcode.GainKeys, 1),
      self(CardEffectOpcode.Draw, 1),
    ]),
  ]),
  coupon: specialize('coupon', '获得10枚硬币；用于模拟下一次商店免费领取。', [
    effectsAction('free-purchase', ItemActionTrigger.Activate, [self(CardEffectOpcode.GainCoins, 10)]),
  ]),
  'sacrificial-altar': specialize(
    'sacrificial-altar',
    '献祭手牌中的道具牌，每张转化为10点全体伤害和5点护盾。',
    [
      methodAction('sacrifice-items', ItemActionTrigger.Activate, ItemActionMethod.ConsumeItemCards, {
        amount: 10,
        secondaryAmount: 5,
      }),
    ],
  ),
  'book-of-the-dead': specialize('book-of-the-dead', '根据亡者强化自身：获得15点护盾并对全体造成15点伤害。', [
    effectsAction('raise-bones', ItemActionTrigger.Activate, [
      self(CardEffectOpcode.GainShield, 15),
      all(CardEffectOpcode.DamageAll, 15),
    ]),
  ]),
  'red-key': specialize('red-key', '揭示当前层路线与隐藏房，并获得1格移动距离。', [
    methodAction('open-red-room', ItemActionTrigger.Activate, ItemActionMethod.RevealMap, {
      effects: [self(CardEffectOpcode.GainMovement, 1)],
    }),
  ]),
  'eternal-d6': specialize('eternal-d6', '50%概率重置手牌中的道具牌；失败则本次不发生变化。', [
    methodAction('fragile-reroll', ItemActionTrigger.Activate, ItemActionMethod.RerollItemCards, {
      chance: 0.5,
    }),
  ]),
  genesis: specialize('genesis', '重构当前手牌，并生成两张新的随机道具牌。', [
    methodAction('rebuild-hand', ItemActionTrigger.Activate, ItemActionMethod.TransformHand),
    methodAction('genesis-item-one', ItemActionTrigger.Activate, ItemActionMethod.GenerateItemCard),
    methodAction('genesis-item-two', ItemActionTrigger.Activate, ItemActionMethod.GenerateItemCard),
  ]),
  'death-certificate': specialize('death-certificate', '消耗后生成一张已解锁随机道具牌。', [
    methodAction('certificate-item', ItemActionTrigger.Activate, ItemActionMethod.GenerateItemCard, {
      consumeItem: true,
    }),
  ]),
  eraser: specialize('eraser', '处决当前生命最低的敌人；生命过高时只造成18点伤害。', [
    methodAction('erase-weakest', ItemActionTrigger.Activate, ItemActionMethod.ExecuteWeakestEnemy, {
      amount: 18,
    }),
  ]),
  'magic-skin': specialize('magic-skin', '损失15点生命，生成一张随机道具牌，并向弃牌堆加入一张空白牌。', [
    methodAction('skin-payment', ItemActionTrigger.Activate, ItemActionMethod.SacrificeHeart, {
      amount: 15,
      effects: [self(CardEffectOpcode.AddBlank, 1)],
    }),
    methodAction('skin-item', ItemActionTrigger.Activate, ItemActionMethod.GenerateItemCard),
  ]),
  'plan-c': specialize('plan-c', '立即消灭房间内所有敌人，同时令玩家承受致命伤害。', [
    methodAction('mutual-destruction', ItemActionTrigger.Activate, ItemActionMethod.DestroyAllEnemies, {
      secondaryAmount: 9999,
      consumeItem: true,
    }),
  ]),
  'spindown-dice': specialize('spindown-dice', '将手牌道具牌转化为收藏编号前一位的道具。', [
    methodAction('spindown-items', ItemActionTrigger.Activate, ItemActionMethod.SpindownItemCards),
  ]),
  abyss: specialize('abyss', '吞噬其他道具牌，每张转化为7点全体伤害和3点护盾。', [
    methodAction('abyss-items', ItemActionTrigger.Activate, ItemActionMethod.ConsumeItemCards, {
      amount: 7,
      secondaryAmount: 3,
    }),
  ]),
  'bag-of-crafting': specialize('bag-of-crafting', '消耗手牌中的道具牌素材，并制作一张随机道具牌。', [
    methodAction('consume-materials', ItemActionTrigger.Activate, ItemActionMethod.ConsumeItemCards, {
      amount: 3,
      secondaryAmount: 2,
    }),
    methodAction('craft-item', ItemActionTrigger.Activate, ItemActionMethod.GenerateItemCard),
  ]),
  flip: specialize('flip', '重新洗牌手牌中的卡牌形态。', [
    methodAction('flip-hand', ItemActionTrigger.Activate, ItemActionMethod.TransformHand),
  ]),
  lemegeton: specialize('lemegeton', '生成一张随机道具牌，并获得5点护盾。', [
    methodAction('summon-item-wisp', ItemActionTrigger.Activate, ItemActionMethod.GenerateItemCard, {
      effects: [self(CardEffectOpcode.GainShield, 5)],
    }),
  ]),

  '1up': specialize('1up', '本场战斗受到致命伤害时，以30点生命复活一次，然后消耗该道具。', [
    methodAction('extra-life', ItemActionTrigger.FatalDamage, ItemActionMethod.Revive, {
      amount: 30,
      oncePerCombat: true,
      consumeItem: true,
    }),
  ]),
  'the-virus': specialize('the-virus', '受到生命伤害后，使全体敌人中毒2回合。', [
    effectsAction('contact-poison', ItemActionTrigger.PlayerDamaged, [allStatus(StatusKind.Poison, 2, 4)]),
  ]),
  'charm-of-the-vampire': specialize('charm-of-the-vampire', '每击杀3个敌人恢复6点生命。', [
    effectsAction('vampire-heal', ItemActionTrigger.EnemyKilled, [self(CardEffectOpcode.Heal, 6)], {
      every: 3,
    }),
  ]),
  'the-battery': specialize('the-battery', '每个敌方回合结束时，为主动道具恢复1格充能。', [
    methodAction('passive-charge', ItemActionTrigger.RoundEnd, ItemActionMethod.RechargeActive),
  ]),
  'missing-no': specialize('missing-no', '打出后重置手牌中的全部道具牌，结果进入正常抽弃牌循环。', [
    methodAction('missing-reroll', ItemActionTrigger.Activate, ItemActionMethod.RerollItemCards, {
      oncePerCombat: true,
    }),
  ]),
  'holy-mantle': specialize('holy-mantle', '每场战斗打出后获得30点神圣护盾，仅可触发一次。', [
    effectsAction('mantle-shield', ItemActionTrigger.Activate, [self(CardEffectOpcode.GainShield, 30)], {
      oncePerCombat: true,
    }),
  ]),
  'dead-cat': specialize('dead-cat', '受到致命伤害时以15点生命复活；该房间限一次并消耗道具。', [
    methodAction('cat-life', ItemActionTrigger.FatalDamage, ItemActionMethod.Revive, {
      amount: 15,
      oncePerCombat: true,
      consumeItem: true,
    }),
  ]),
  '9-volt': specialize('9-volt', '每次打出3张牌，为主动道具恢复1格充能。', [
    methodAction('trickle-charge', ItemActionTrigger.CardPlayed, ItemActionMethod.RechargeActive, {
      every: 3,
    }),
  ]),
  'dead-bird': specialize('dead-bird', '受到生命伤害后，死鸟对全体敌人造成8点伤害。', [
    effectsAction('dead-bird-retaliation', ItemActionTrigger.PlayerDamaged, [
      all(CardEffectOpcode.DamageAll, 8),
    ]),
  ]),
  habit: specialize('habit', '受到生命伤害后，为主动道具恢复1格充能。', [
    methodAction('damage-charge', ItemActionTrigger.PlayerDamaged, ItemActionMethod.RechargeActive),
  ]),
  'bloody-lust': specialize('bloody-lust', '受到生命伤害后，本场战斗攻击伤害+2，可重复叠加。', [
    effectsAction('rage-on-hit', ItemActionTrigger.PlayerDamaged, [self(CardEffectOpcode.GainDamage, 2)]),
  ]),
  ankh: specialize('ankh', '受到致命伤害时以30点生命复活，并获得10点护盾，然后消耗道具。', [
    methodAction('blue-baby-revive', ItemActionTrigger.FatalDamage, ItemActionMethod.Revive, {
      amount: 30,
      secondaryAmount: 10,
      oncePerCombat: true,
      consumeItem: true,
    }),
  ]),
  'celtic-cross': specialize('celtic-cross', '受到生命伤害时有30%概率获得18点护盾。', [
    effectsAction(
      'cross-protection',
      ItemActionTrigger.PlayerDamaged,
      [self(CardEffectOpcode.GainShield, 18)],
      { chance: 0.3 },
    ),
  ]),
  gimpy: specialize('gimpy', '受到生命伤害时有50%概率恢复5点生命并获得5点护盾。', [
    effectsAction(
      'gimpy-heart',
      ItemActionTrigger.PlayerDamaged,
      [self(CardEffectOpcode.Heal, 5), self(CardEffectOpcode.GainShield, 5)],
      { chance: 0.5 },
    ),
  ]),
  infestation: specialize('infestation', '受到生命伤害后抽1张牌，并对全体敌人造成4点伤害。', [
    effectsAction('spawn-flies', ItemActionTrigger.PlayerDamaged, [
      self(CardEffectOpcode.Draw, 1),
      all(CardEffectOpcode.DamageAll, 4),
    ]),
  ]),
  'guppys-collar': specialize('guppys-collar', '受到致命伤害时有50%概率以15点生命复活。', [
    methodAction('collar-revive', ItemActionTrigger.FatalDamage, ItemActionMethod.Revive, {
      amount: 15,
      chance: 0.5,
      oncePerCombat: true,
    }),
  ]),
  'piggy-bank': specialize('piggy-bank', '受到生命伤害后获得2枚硬币。', [
    effectsAction('drop-coins', ItemActionTrigger.PlayerDamaged, [self(CardEffectOpcode.GainCoins, 2)]),
  ]),
  'curse-of-the-tower': specialize('curse-of-the-tower', '受到生命伤害后引发爆炸，对全体敌人造成18点伤害。', [
    effectsAction('troll-bombs', ItemActionTrigger.PlayerDamaged, [all(CardEffectOpcode.DamageAll, 18)]),
  ]),
  'jumper-cables': specialize('jumper-cables', '每击杀5个敌人，为主动道具恢复1格充能。', [
    methodAction('kill-charge', ItemActionTrigger.EnemyKilled, ItemActionMethod.RechargeActive, {
      every: 5,
    }),
  ]),
  'charged-baby': specialize('charged-baby', '每3个回合开始时为主动道具恢复1格充能并获得3点护盾。', [
    methodAction('baby-charge', ItemActionTrigger.RoundStart, ItemActionMethod.RechargeActive, {
      every: 3,
      effects: [self(CardEffectOpcode.GainShield, 3)],
    }),
  ]),
  'lusty-blood': specialize('lusty-blood', '每击杀一个敌人，本场战斗攻击伤害+1。', [
    effectsAction('kill-rage', ItemActionTrigger.EnemyKilled, [self(CardEffectOpcode.GainDamage, 1)]),
  ]),
  contagion: specialize('contagion', '敌人死亡时传播疫病，对其他敌人造成5点伤害并中毒。', [
    effectsAction('spread-plague', ItemActionTrigger.EnemyKilled, [
      all(CardEffectOpcode.DamageAll, 5),
      allStatus(StatusKind.Poison, 2, 3),
    ]),
  ]),
  'deaths-list': specialize('deaths-list', '每击杀2个敌人获得1枚硬币并抽1张牌。', [
    effectsAction(
      'marked-kill',
      ItemActionTrigger.EnemyKilled,
      [self(CardEffectOpcode.GainCoins, 1), self(CardEffectOpcode.Draw, 1)],
      { every: 2 },
    ),
  ]),
  'echo-chamber': specialize('echo-chamber', '每打出3张牌，免费重复上一张非主动牌的效果。', [
    methodAction('echo-card', ItemActionTrigger.CardPlayed, ItemActionMethod.ReplayPreviousCard, {
      every: 3,
    }),
  ]),
  'rock-bottom': specialize('rock-bottom', '发动后锁定本场战斗已获得的属性下限，后续负数属性效果失效。', [
    methodAction('lock-stat-floor', ItemActionTrigger.Activate, ItemActionMethod.LockStatFloor),
  ]),
  'car-battery': specialize('car-battery', '发动后，本场战斗中主动道具的action额外执行一次。', [
    methodAction('double-active', ItemActionTrigger.Activate, ItemActionMethod.EnableActiveDoubling),
  ]),
  hypercoagulation: specialize('hypercoagulation', '受到生命伤害后立即恢复其中一半，至少1点。', [
    effectsAction('clot-heal', ItemActionTrigger.PlayerDamaged, [self(CardEffectOpcode.Heal, 3)]),
  ]),
  ibs: specialize('ibs', '每打出3张牌随机触发另一件道具效果。', [
    methodAction('random-bowel-effect', ItemActionTrigger.CardPlayed, ItemActionMethod.RandomItemEffect, {
      every: 3,
    }),
  ]),
  'ghost-bombs': specialize('ghost-bombs', '敌人死亡时，幽灵爆炸对剩余敌人造成6点伤害。', [
    effectsAction('ghost-explosion', ItemActionTrigger.EnemyKilled, [all(CardEffectOpcode.DamageAll, 6)]),
  ]),
  'inner-child': specialize('inner-child', '受到致命伤害时以20点生命复活并获得2格移动距离，然后消耗道具。', [
    methodAction('inner-revive', ItemActionTrigger.FatalDamage, ItemActionMethod.Revive, {
      amount: 20,
      secondaryAmount: 8,
      consumeItem: true,
      oncePerCombat: true,
      effects: [self(CardEffectOpcode.GainMovement, 2)],
    }),
  ]),
  'spirit-shackles': specialize('spirit-shackles', '受到致命伤害时以10点生命复活并获得20点护盾；每场一次。', [
    methodAction('spirit-revive', ItemActionTrigger.FatalDamage, ItemActionMethod.Revive, {
      amount: 10,
      secondaryAmount: 20,
      oncePerCombat: true,
    }),
  ]),
  heartbreak: specialize('heartbreak', '受到致命伤害时以5点生命存活并向弃牌堆加入2张空白牌；每场一次。', [
    methodAction('broken-heart-save', ItemActionTrigger.FatalDamage, ItemActionMethod.Revive, {
      amount: 5,
      oncePerCombat: true,
      effects: [self(CardEffectOpcode.AddBlank, 2)],
    }),
  ]),
  'vengeful-spirit': specialize('vengeful-spirit', '受到生命伤害后获得2点攻击伤害并对全体造成5点伤害。', [
    effectsAction('vengeance', ItemActionTrigger.PlayerDamaged, [
      self(CardEffectOpcode.GainDamage, 2),
      all(CardEffectOpcode.DamageAll, 5),
    ]),
  ]),
  'fanny-pack': specialize('fanny-pack', '受到生命伤害时有50%概率掉落补给：获得1枚硬币并抽1张牌。', [
    effectsAction(
      'damage-pickup',
      ItemActionTrigger.PlayerDamaged,
      [self(CardEffectOpcode.GainCoins, 1), self(CardEffectOpcode.Draw, 1)],
      { chance: 0.5 },
    ),
  ]),
  milk: specialize('milk', '受到生命伤害后，本场战斗射速提高0.2并抽1张牌。', [
    effectsAction('spilled-milk', ItemActionTrigger.PlayerDamaged, [
      self(CardEffectOpcode.GainFireRate, 0.2),
      self(CardEffectOpcode.Draw, 1),
    ]),
  ]),
  'shard-of-glass': specialize('shard-of-glass', '受到生命伤害后获得2点攻击伤害，但向弃牌堆加入1张空白牌。', [
    effectsAction('bleeding-shard', ItemActionTrigger.PlayerDamaged, [
      self(CardEffectOpcode.GainDamage, 2),
      self(CardEffectOpcode.AddBlank, 1),
    ]),
  ]),
  'my-shadow': specialize('my-shadow', '受到生命伤害后，影子对全体敌人造成7点伤害。', [
    effectsAction('shadow-retaliation', ItemActionTrigger.PlayerDamaged, [
      all(CardEffectOpcode.DamageAll, 7),
    ]),
  ]),
  'toxic-shock': specialize('toxic-shock', '发动后按攻击力污染房间：全体敌人受到12点伤害并中毒3回合。', [
    effectsAction(
      'toxic-room',
      ItemActionTrigger.Activate,
      [all(CardEffectOpcode.DamageAll, 12), allStatus(StatusKind.Poison, 3, 4)],
      { oncePerCombat: true },
    ),
  ]),
  'sack-of-pennies': specialize('sack-of-pennies', '每2个回合开始时获得1枚硬币。', [
    effectsAction('coin-drop', ItemActionTrigger.RoundStart, [self(CardEffectOpcode.GainCoins, 1)], {
      every: 2,
    }),
  ]),
  'bomb-bag': specialize('bomb-bag', '每3个回合开始时获得1枚炸弹。', [
    effectsAction('bomb-drop', ItemActionTrigger.RoundStart, [self(CardEffectOpcode.GainBombs, 1)], {
      every: 3,
    }),
  ]),
  'the-relic': specialize('the-relic', '每3个回合开始时获得8点护盾。', [
    effectsAction('soul-heart-drop', ItemActionTrigger.RoundStart, [self(CardEffectOpcode.GainShield, 8)], {
      every: 3,
    }),
  ]),
  'little-c-h-a-d': specialize('little-c-h-a-d', '每3个回合开始时恢复5点生命。', [
    effectsAction('heart-drop', ItemActionTrigger.RoundStart, [self(CardEffectOpcode.Heal, 5)], {
      every: 3,
    }),
  ]),
  'mystery-sack': specialize('mystery-sack', '每2个回合开始时随机获得抽牌与资源补给。', [
    effectsAction(
      'mystery-drop',
      ItemActionTrigger.RoundStart,
      [self(CardEffectOpcode.Draw, 1), self(CardEffectOpcode.GainCoins, 1)],
      { every: 2 },
    ),
  ]),
  'rune-bag': specialize('rune-bag', '每3个回合开始时额外抽2张牌。', [
    effectsAction('rune-drop', ItemActionTrigger.RoundStart, [self(CardEffectOpcode.Draw, 2)], {
      every: 3,
    }),
  ]),
  'sack-head': specialize('sack-head', '清理房间后获得1枚硬币，并有50%概率额外获得炸弹和钥匙。', [
    effectsAction('sack-room-drop', ItemActionTrigger.RoomCleared, [self(CardEffectOpcode.GainCoins, 1)]),
    effectsAction(
      'bonus-sack',
      ItemActionTrigger.RoomCleared,
      [self(CardEffectOpcode.GainBombs, 1), self(CardEffectOpcode.GainKeys, 1)],
      { chance: 0.5 },
    ),
  ]),
};
