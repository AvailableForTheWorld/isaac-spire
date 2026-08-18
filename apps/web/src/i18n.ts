import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { CARDS, FLOORS, ITEMS, enemyPoolForFloor, eliteForFloor, bossForFloor } from '@isaac-spire/game';

export const LANGUAGE_STORAGE_KEY = 'isaac-spire.language';

const englishCatalog = {
  cards: Object.fromEntries(Object.values(CARDS).map((card) => [card.id, { name: card.name, description: card.description }])),
  items: Object.fromEntries(Object.values(ITEMS).map((item) => [item.id, {
    name: item.name,
    description: item.description,
    unlock: item.unlock?.label ?? '',
  }])),
  floors: Object.fromEntries(FLOORS.map((floor) => [floor.index, {
    name: floor.name, subtitle: floor.subtitle, boss: floor.bossName,
  }])),
  enemies: Object.fromEntries(
    [...new Map(Array.from({ length: 6 }, (_, floor) => [
      ...enemyPoolForFloor(floor), eliteForFloor(floor), bossForFloor(floor),
    ]).flat().map((enemy) => [enemy.id, enemy.name])).entries()]
      .map(([id, name]) => [id, { name }]),
  ),
};

const en = {
  translation: {
    brand: { title: 'BELOW', subtitle: 'AN ISAAC DECKBUILDER', pageTitle: 'Below · An Isaac Deckbuilder' },
    language: { label: 'Language', switchTo: '中文', current: 'EN' },
    header: { floor: 'FLOOR {{current}} / {{total}}', abandon: 'Abandon run', abandonConfirm: 'Abandon this run? The current descent will be recorded as a loss.' },
    resources: { label: 'Resources', coins: 'Coins', bombs: 'Bombs', keys: 'Keys', score: 'Score' },
    home: {
      kicker: 'THE BASEMENT IS', intro: 'Build a deck. Break the route. Descend six shifting floors and face Mom.',
      seed: 'RUN SEED', rerollSeed: 'Roll a new seed', begin: 'Begin descent', continue: 'Continue floor {{floor}}',
      momKills: 'MOM KILLS', bestScore: 'BEST SCORE', itemsUnlocked: 'ITEMS UNLOCKED', firstRun: 'FIRST RUN · MOM',
      tagline1: 'Six floors.', tagline2: 'Five vitality.', tagline3: 'One way down.',
      ruleRoute: 'ROUTE', ruleRouteBody: 'Choose among three interwoven branches. Every lane holds treasure, a shop, and bomb-gated secrets.',
      ruleFight: 'FIGHT', ruleFightBody: 'Draw seven cards and spend five vitality. Read six enemy intents, then retain up to five cards.',
      ruleBreak: 'BREAK', ruleBreakBody: 'Items rewrite the deck: active items become rechargeable skill cards, while passive pickups become reusable item cards.',
      basement: 'BASEMENT', caves: 'CAVES', depths: 'DEPTHS', mom: 'MOM',
      disclaimer: 'Fan-made gameplay prototype · Not affiliated with Edmund McMillen, Nicalis, or Mega Crit.',
    },
    map: {
      choose: 'CHOOSE YOUR DESCENT', description: '{{subtitle}}. Every branch contains a Shop, Treasure Room, Secret Room, and Super Secret Room.',
      current: 'Current room', progress: 'Six-floor run progress',
      note: 'Secret doors appear only when you reach an adjacent room. Opening one consumes a bomb but never blocks the main route.',
      left: 'LEFT BRANCH', center: 'CENTER BRANCH', right: 'RIGHT BRANCH', thisFloor: 'THIS FLOOR', bossDoor: 'BOSS DOOR',
      hidden: 'A hidden room may be nearby', hiddenLabel: 'Hidden room', needBomb: 'You need a bomb.', noBomb: 'NO BOMB',
    },
    rooms: {
      entrance: { name: 'Entrance', hint: 'The floor begins here.' }, combat: { name: 'Battle', hint: 'A standard combat room.' },
      elite: { name: 'Elite', hint: 'A champion guards an item.' }, shop: { name: 'Shop', hint: 'Spend coins on items and cards.' },
      treasure: { name: 'Treasure', hint: 'Choose a passive or active item.' }, curse: { name: 'Curse', hint: 'Pay blood for dark treasure.' },
      sacrifice: { name: 'Sacrifice', hint: 'Optional blood offering.' }, secret: { name: 'Secret', hint: 'Costs one bomb to open.' },
      'super-secret': { name: 'Super Secret', hint: 'Costs one bomb. Better loot.' }, planetarium: { name: 'Planetarium', hint: 'Choose a celestial item.' },
      boss: { name: 'Boss', hint: 'Defeat the floor guardian.' },
    },
    combat: {
      room: '{{room}} ROOM', round: 'Round {{round}}', vitality: '{{value}} VITALITY', vitalityHint: 'Vitality refreshes each player round',
      animatedRoom: 'Animated combat room', hp: 'HP', armor: 'armor', shield: 'shield', cursed: 'CURSED {{turns}}', weakened: 'CURSED · 40% LESS DAMAGE · {{turns}}', staggered: 'STAGGERED · ACTION LOST',
      hand: 'YOUR HAND · {{count}}/{{max}}', target: 'Targeting {{enemy}}', chooseTarget: 'Choose a target', chooseCard: 'Choose a card', chooseCardTarget: 'Choose a target for {{card}}',
      discardPrompt: 'Discard any cards, then retain up to {{count}}', draw: 'DRAW {{count}}', discard: 'DISCARD {{count}}', deck: 'DECK {{count}}',
      discardAll: 'Discard all', faceEnemy: 'Face enemy turn', endTurn: 'End player turn', preparing: 'Preparing the room…',
      activeRetained: 'ACTIVE · RETAINED', recharging: 'RECHARGING · {{rounds}}', oneOff: 'ONE-OFF', passiveItems: 'ITEM CARDS', noPassiveItems: 'NO ITEM CARDS',
      playerTurn: 'PLAYER TURN', enemyTurn: 'ENEMY TURN', discardPhase: 'DISCARD PHASE', armorBlocked: 'ARMOR', shieldBlocked: 'SHIELD', resolving: 'RESOLVING ACTIONS',
      range: 'RANGE {{value}}', moveSpeed: 'MOVE {{value}}', enemyMoveAction: 'MOVE ≤{{value}}', inRange: 'IN LINE', outOfRange: 'NO LINE', battleGrid: '17 by 9 square tactical room grid', gridCell: 'Grid cell {{x}}, {{y}}', moveHere: 'Move to ({{x}}, {{y}}) · costs 1 vitality', attackRangeLegend: 'Straight attack line', movementLegend: 'Movement',
      activeDiscardWarning: 'DISCARDING DESTROYS THIS ACTIVE ITEM', pileInspect: 'PILE INSPECTION', drawPileTitle: 'DRAW PILE · {{count}}', discardPileTitle: 'DISCARD PILE · {{count}}', drawPileHint: 'Cards are drawn from the start of this ordered list.', discardPileHint: 'These cards return when the draw pile is empty and reshuffled.', closePile: 'Close pile', emptyPile: 'This pile is empty.',
    },
    intents: { attack: 'Attack {{value}}', shield: 'Guard {{value}}', curse: 'Curse', heal: 'Recover {{value}}', prepare: 'Preparing…', idle: 'Staggered' },
    cardTypes: { attack: 'attack', skill: 'active item', item: 'item', recovery: 'recovery', shield: 'shield', hex: 'hex', tarot: 'tarot', curse: 'curse' },
    itemKinds: { active: 'ACTIVE', passive: 'PASSIVE' },
    attackModes: { tears: 'TEARS', knife: 'KNIFE', brimstone: 'BRIMSTONE', 'tech-x': 'TECH X' },
    choice: {
      floorReward: 'FLOOR REWARD', chooseReward: 'CHOOSE A REWARD', roomDrop: 'ROOM DROP · {{rewards}}', shopPurse: 'YOUR PURSE',
      leaveEmpty: 'Leave without taking anything', floorCleared: '{{floor}} cleared', finalBlessing: "Mom's shadow lifts. Take one final blessing.",
      floorBlessing: 'Choose one permanent floor blessing.', shopTitle: 'Shop', shopSubtitle: '{{coins}}¢ in your pocket',
      treasureTitle: 'Treasure Room', treasureSubtitle: 'Choose one item. Active items replace the one you hold.',
      planetariumTitle: 'Planetarium', planetariumSubtitle: 'The heavens offer one impossible instrument.',
      curseTitle: 'Curse Room', curseSubtitle: 'The spikes took {{hp}} HP. Choose what waited inside.',
      sacrificeTitle: 'Sacrifice Room', sacrificeSubtitle: 'Offer 15 red-heart HP for a soul heart and a Tarot card.',
      secretTitle: 'Secret Room', secretSubtitle: 'A hollow wall concealed a small cache.',
      superSecretTitle: 'Super Secret Room', superSecretSubtitle: 'Something precious has been waiting here.',
      eliteTitle: 'Champion defeated', eliteSubtitle: 'Room drop: {{reward}}. Choose one elite item.',
      clearedTitle: 'Room cleared', clearedSubtitle: 'Room drop: {{reward}}. Add one card, or skip.',
      bossTitle: '{{boss}} defeated', bossSubtitle: 'Boss drop: {{reward}}. Choose one item before the exit door opens.',
      devilGateTitle: 'A trapdoor exhales heat…', angelGateTitle: 'A white door opens…',
      gateSubtitle: 'Devil and Angel rooms can never appear together.', devilRoom: 'Devil Room', angelRoom: 'Angel Room',
      devilSubtitle: 'Power always has a price.', angelSubtitle: 'Faith is rewarded freely.',
      devilCost: 'Cost: 1 red-heart container.', quality: 'QUALITY {{quality}}', cardLabel: '{{type}} CARD', sold: 'SOLD', needContainers: 'NEED 2 RED CONTAINERS', notEnoughCoins: 'NOT ENOUGH COINS',
      addsItemCard: 'ADDS A REUSABLE CARD',
    },
    options: {
      leaveShop: { label: 'Leave shop', description: 'Keep your coins and return to the route.' },
      sacrifice: { label: 'Step on the spikes', description: 'Lose 15 red HP; gain a soul heart and a Tarot card.' },
      walkAway: { label: 'Walk away', description: 'Return to the map unharmed.' },
      enterDevil: { label: 'Enter Devil room', description: 'See three powerful items offered for heart containers.' },
      enterAngel: { label: 'Enter Angel room', description: 'Receive a free holy item.' },
      skipDevil: { label: 'Descend without entering', description: 'Build Angel favor for later floors.' },
      skipAngel: { label: 'Descend without entering', description: 'Leave the blessing untouched.' },
      coins: { label: 'Coin cache', description: 'Take the loose change.' }, bombs: { label: 'Bomb bundle', description: 'Bombs for future hidden doors.' },
      keys: { label: 'Key ring', description: 'Keys for locked rewards.' }, 'red-heart': { label: 'Full Red Heart', description: 'Recover one heart container.' },
      'soul-heart': { label: 'Soul Heart', description: 'Add a 30 HP soul heart.' }, 'black-heart': { label: 'Black Heart', description: 'Explodes when emptied.' },
    },
    upgrades: {
      damage: { name: 'Tears Up', description: '+2 base attack damage.' }, heart: { name: 'Heart Training', description: '+5 HP per red container and fully heal.' },
      armor: { name: 'Tough Skin', description: '+1 permanent armor.' }, speed: { name: 'Tears Accelerator', description: '+0.25 fire rate.' },
      skill: { name: 'Battery Pack', description: 'Reduce active recharge by one round.' }, vitality: { name: 'Adrenaline', description: '+1 maximum vitality.' },
    },
    stats: {
      character: 'ISAAC', title: 'STATS', damage: 'Damage', armor: 'Armor', startShield: 'Start shield', fireRate: 'Fire rate',
      vitality: 'Vitality', draw: 'Draw', critical: 'Critical', tearForm: 'Tear form', items: 'ITEMS', run: 'RUN',
      roomsCleared: '{{count}} rooms cleared', dealChance: '{{chance}}% deal chance', angelFavor: '{{count}} Angel favor', pocketHp: '{{count}} pocket-heart HP',
    },
    result: {
      wonKicker: 'FIRST DESCENT COMPLETE', lostKicker: 'THE BASEMENT CLAIMED ANOTHER', wonTitle: "Mom's Leg is defeated", lostTitle: 'Isaac was lost below',
      wonBody: "The chest unlocks deeper destinies: Brimstone and Mom’s Knife can now appear in future runs.", lostBody: 'The layout will change, but what you learned remains.',
      score: 'SCORE', rooms: 'ROOMS', items: 'ITEMS', floors: 'FLOORS', unlocks: 'UNLOCKED THIS RUN', return: 'Return to title', newUnlock: 'NEW UNLOCK · {{message}}',
    },
    unlockMessage: '{{item}} unlocked — {{condition}}',
    rewards: { coins: '{{amount}}¢', bombs_one: '{{amount}} bomb', bombs_other: '{{amount}} bombs', keys_one: '{{amount}} key', keys_other: '{{amount}} keys', redHp: '{{amount}} red-heart HP', soul_one: '{{amount}} soul heart', soul_other: '{{amount}} soul hearts', black_one: '{{amount}} black heart', black_other: '{{amount}} black hearts' },
    errors: {
      notInCombat: 'Not in combat', cardNotInHand: 'Card is not in hand', unknownCard: 'Unknown card', curseUnplayable: 'Curse cards are unplayable',
      vitality: 'Not enough vitality', recharging: 'Active item is recharging', coins: 'Not enough coins', bomb: 'A bomb is required to open this room',
      chooseTarget: 'Choose an enemy before playing this card', range: 'The selected enemy is outside Isaac’s straight attack line', movement: 'That cell is outside the current movement range',
      containers: 'A Devil deal needs a spare red-heart container', sacrifice: 'Not enough red-heart HP to survive the sacrifice', unavailable: 'That action is unavailable',
    },
    logs: {
      enter: 'Round 1 — {{enemies}} entered the room.', attack: '{{card}} dealt {{damage}} damage{{mode}}{{echo}}.', echo: ' with {{count}} echo hit',
      reroll: 'The D6 rerolled {{count}} cards.', heal: '{{source}} recovered {{amount}} HP.', belial: 'Book of Belial granted +2 room damage.',
      shadows: 'Book of Shadows granted 20 shield.', tammy: "Tammy's Head burst for {{damage}} damage to all enemies.", nail: 'The Nail granted a black heart and +2 room armor.',
      hourglass: 'Time folds. Every enemy loses its next action.', fizzled: 'The active item fizzled.', shield: '{{source}} granted {{amount}} shield.',
      cursed: '{{enemy}} was cursed.', tarot: '{{card}} consumed in a burst of power.', discard: 'Choose any cards to discard, then retain no more than {{count}}.',
      deadWeight: 'A Dead Weight curse was added to your deck.', blackBurst: 'A black heart shattered: normal enemies died and champions took 100 damage!',
      dodge: 'Isaac slipped past the attack.', playerHit: 'Isaac took {{damage}} heart damage ({{shield}} blocked by shield).', enemyAttack: '{{enemy}} attacked: {{damage}} heart damage ({{shield}} blocked by shield).', enemyCursed: '{{enemy}} is cursed and does nothing.',
      enemyWeakened: '{{enemy}}\'s curse suppresses its special action; it attacks for {{damage}}.', enemyStaggered: '{{enemy}} is staggered and loses its action.',
      enemyShield: '{{enemy}} gained {{amount}} shield.', enemyHeal: '{{enemy}} restored {{amount}} HP to {{target}}.', prepare: '{{enemy}} prepares a doubled attack!',
      hesitate: '{{enemy}} hesitates.', nextRound: 'Round {{round}} — vitality restored to {{vitality}}.',
      playerMoved: 'Isaac moved from ({{fromX}}, {{fromY}}) to ({{x}}, {{y}}).', enemyMoved: '{{enemy}} moved to ({{x}}, {{y}}).', enemyOutOfRange: '{{enemy}} is still outside attack range.', passiveUsed: '{{item}} activated from the deck.', activeDiscarded: '{{item}} was discarded and permanently lost.',
    },
    ...englishCatalog,
  },
};

const chinesePassiveCards = {
  'item:sad-onion': { name: '悲伤洋葱', description: '本场战斗射速 +0.25。进入弃牌堆后可重新洗入。' },
  'item:spoon-bender': { name: '弯勺者', description: '本场战斗获得追踪眼泪，可以瞄准斜向敌人。进入弃牌堆后可重新洗入。' },
  'item:crickets-head': { name: '蟋蟀的头', description: '本场战斗伤害倍率 ×1.5。进入弃牌堆后可重新洗入。' },
  'item:magic-mushroom': { name: '魔法蘑菇', description: '本场战斗伤害 ×1.25、护甲 +1、射速 +0.15，并恢复 15 点生命。' },
  'item:breakfast': { name: '早餐', description: '恢复一整颗红心。进入弃牌堆后可重新洗入。' },
  'item:squeezy': { name: '挤压玩具', description: '本场战斗射速 +0.2，并获得 20 点护盾。' },
  'item:holy-mantle': { name: '神圣斗篷', description: '获得 15 点护盾。进入弃牌堆后可重新洗入。' },
  'item:steam-sale': { name: '大甩卖', description: '获得 2 枚硬币。进入弃牌堆后可重新洗入。' },
  'item:compass': { name: '指南针', description: '显示本层全部普通房间。进入弃牌堆后可重新洗入。' },
  'item:blue-map': { name: '蓝地图', description: '显示本层隐藏房与超级隐藏房。进入弃牌堆后可重新洗入。' },
  'item:pentagram': { name: '五芒星', description: '本场战斗伤害倍率 ×1.2。进入弃牌堆后可重新洗入。' },
  'item:goat-head': { name: '山羊头', description: '本层首领战后必定出现恶魔房或天使房入口。' },
  'item:wafer': { name: '圣饼', description: '本场战斗单次攻击在护甲前最多造成 15 点伤害。' },
  'item:sacred-heart': { name: '圣心', description: '本场战斗伤害 ×1.6、暴击率 +15%。' },
  'item:brimstone': { name: '硫磺火', description: '本场战斗将攻击形态切换为硫磺火。' },
  'item:moms-knife': { name: '妈妈的菜刀', description: '本场战斗将攻击形态切换为妈妈的菜刀。' },
  'item:tech-x': { name: '科技 X', description: '本场战斗将攻击形态切换为科技 X。' },
  'item:terra': { name: '地球', description: '本场战斗伤害 +3、护甲 +1。' },
  'item:luna': { name: '月亮', description: '抽取一张牌，并显示本层两类隐藏房。' },
};

const zhCN = {
  translation: {
    brand: { title: '深渊之下', subtitle: '以撒牌组构筑', pageTitle: '深渊之下 · 以撒牌组构筑' },
    language: { label: '语言', switchTo: 'EN', current: '中文' },
    header: { floor: '第 {{current}} / {{total}} 层', abandon: '放弃本局', abandonConfirm: '确定要放弃本局吗？当前下潜将被记录为失败。' },
    resources: { label: '资源', coins: '硬币', bombs: '炸弹', keys: '钥匙', score: '分数' },
    home: {
      kicker: '地下室就在', intro: '构筑牌组，打破路线。穿过六层不断变化的地牢，直面妈妈。',
      seed: '本局种子', rerollSeed: '生成新种子', begin: '开始下潜', continue: '继续第 {{floor}} 层',
      momKills: '击败妈妈', bestScore: '最高分', itemsUnlocked: '已解锁道具', firstRun: '首次下潜 · 妈妈',
      tagline1: '六层地牢。', tagline2: '五点体力。', tagline3: '一路向下。',
      ruleRoute: '路线', ruleRouteBody: '在三条交织的分支间选择。每条路线都有宝箱房、商店和需要炸弹开启的隐藏房。',
      ruleFight: '战斗', ruleFightBody: '抽取七张牌并消耗五点体力。观察敌人的六类意图，回合结束时最多保留五张牌。',
      ruleBreak: '破局', ruleBreakBody: '道具会改写牌组：主动道具化为可充能技能牌，被动道具则成为可循环使用的道具卡。',
      basement: '地下室', caves: '洞穴', depths: '深牢', mom: '妈妈',
      disclaimer: '非商业同人玩法原型 · 与 Edmund McMillen、Nicalis 或 Mega Crit 无关。',
    },
    map: {
      choose: '选择下潜路线', description: '{{subtitle}}。每条分支都包含商店、宝箱房、隐藏房和超级隐藏房。',
      current: '当前位置', progress: '六层下潜进度', note: '只有到达相邻房间后，隐藏门才会显现。开启需要一枚炸弹，但绝不会阻断主路线。',
      left: '左侧分支', center: '中央分支', right: '右侧分支', thisFloor: '当前楼层', bossDoor: '首领大门',
      hidden: '附近似乎藏着一个房间', hiddenLabel: '未知隐藏房', needBomb: '需要一枚炸弹。', noBomb: '没有炸弹',
    },
    rooms: {
      entrance: { name: '入口', hint: '本层从这里开始。' }, combat: { name: '战斗', hint: '普通战斗房。' }, elite: { name: '精英', hint: '冠军敌人守护着一件道具。' },
      shop: { name: '商店', hint: '用硬币购买道具和卡牌。' }, treasure: { name: '宝箱房', hint: '选择一件主动或被动道具。' }, curse: { name: '诅咒房', hint: '用鲜血换取黑暗宝藏。' },
      sacrifice: { name: '献祭房', hint: '可选的鲜血献祭。' }, secret: { name: '隐藏房', hint: '消耗一枚炸弹开启。' }, 'super-secret': { name: '超级隐藏房', hint: '消耗一枚炸弹，奖励更好。' },
      planetarium: { name: '星象房', hint: '选择一件天体道具。' }, boss: { name: '首领', hint: '击败本层守卫。' },
    },
    combat: {
      room: '{{room}}房', round: '第 {{round}} 回合', vitality: '{{value}} 体力', vitalityHint: '每个玩家回合都会恢复体力', animatedRoom: '动态战斗房间',
      hp: '生命', armor: '护甲', shield: '护盾', cursed: '诅咒 {{turns}} 回合', weakened: '诅咒 · 攻击降低 40% · 剩余 {{turns}} 回合', staggered: '硬直 · 本次行动丢失', hand: '手牌 · {{count}}/{{max}}', target: '目标：{{enemy}}', chooseTarget: '选择一个目标', chooseCard: '请选择一张牌', chooseCardTarget: '请选择{{card}}的攻击目标',
      discardPrompt: '可任意弃牌，随后最多保留 {{count}} 张', draw: '抽牌堆 {{count}}', discard: '弃牌堆 {{count}}', deck: '牌组 {{count}}', discardAll: '全部弃掉',
      faceEnemy: '进入敌方回合', endTurn: '结束玩家回合', preparing: '正在准备房间…', activeRetained: '主动道具 · 保留', recharging: '充能中 · {{rounds}}', oneOff: '一次性', passiveItems: '道具卡', noPassiveItems: '暂无道具卡',
      playerTurn: '玩家回合', enemyTurn: '敌方回合', discardPhase: '弃牌阶段', armorBlocked: '护甲抵挡', shieldBlocked: '护盾抵挡', resolving: '正在结算行动',
      range: '射程 {{value}} 格', moveSpeed: '移动 {{value}} 格', enemyMoveAction: '移动≤{{value}}格', inRange: '直线可攻击', outOfRange: '不在直线上', battleGrid: '17 × 9 正方格战术房间', gridCell: '网格 ({{x}}, {{y}})', moveHere: '移动到 ({{x}}, {{y}}) · 消耗 1 点体力', attackRangeLegend: '直线攻击范围', movementLegend: '可移动范围',
      activeDiscardWarning: '弃掉后将永久失去该主动道具', pileInspect: '牌堆查看', drawPileTitle: '抽牌堆 · {{count}}', discardPileTitle: '弃牌堆 · {{count}}', drawPileHint: '卡牌将按照此处显示的顺序从顶部抽取。', discardPileHint: '抽牌堆耗尽后，这些卡牌会重新洗入抽牌堆。', closePile: '关闭牌堆', emptyPile: '牌堆为空。',
    },
    intents: { attack: '攻击 {{value}}', shield: '获得护盾 {{value}}', curse: '施加诅咒', heal: '恢复 {{value}}', prepare: '蓄力中…', idle: '无法行动' },
    cardTypes: { attack: '攻击', skill: '主动道具', item: '道具', recovery: '恢复', shield: '护盾', hex: '咒术', tarot: '塔罗牌', curse: '诅咒' },
    itemKinds: { active: '主动道具', passive: '被动道具' }, attackModes: { tears: '眼泪', knife: '菜刀', brimstone: '硫磺火', 'tech-x': '科技 X' },
    choice: {
      floorReward: '楼层奖励', chooseReward: '选择一项奖励', roomDrop: '房间掉落 · {{rewards}}', shopPurse: '持有硬币', leaveEmpty: '什么也不拿，直接离开', floorCleared: '已清除 {{floor}}',
      finalBlessing: '妈妈的阴影终于消散。接受最后一份祝福。', floorBlessing: '选择一项永久楼层强化。', shopTitle: '商店', shopSubtitle: '你口袋里有 {{coins}}¢',
      treasureTitle: '宝箱房', treasureSubtitle: '选择一件道具。新的主动道具会替换当前持有的主动道具。', planetariumTitle: '星象房', planetariumSubtitle: '群星赐下一件不可思议的造物。',
      curseTitle: '诅咒房', curseSubtitle: '尖刺夺走了 {{hp}} 点生命。选择藏在里面的东西。', sacrificeTitle: '献祭房', sacrificeSubtitle: '献出 15 点红心生命，换取一颗魂心和一张塔罗牌。',
      secretTitle: '隐藏房', secretSubtitle: '空心墙后藏着一小堆补给。', superSecretTitle: '超级隐藏房', superSecretSubtitle: '某件珍贵之物一直在这里等待。',
      eliteTitle: '冠军已被击败', eliteSubtitle: '房间掉落：{{reward}}。选择一件精英道具。', clearedTitle: '房间已清除', clearedSubtitle: '房间掉落：{{reward}}。添加一张卡牌，或直接跳过。',
      bossTitle: '{{boss}} 已被击败', bossSubtitle: '首领掉落：{{reward}}。出口开启前选择一件道具。', devilGateTitle: '活板门中涌出灼热气息…', angelGateTitle: '一道洁白的门缓缓开启…',
      gateSubtitle: '恶魔房与天使房绝不会同时出现。', devilRoom: '恶魔房', angelRoom: '天使房', devilSubtitle: '力量总要付出代价。', angelSubtitle: '虔诚会得到无偿回报。',
      devilCost: '代价：1 个红心上限。', quality: '品质 {{quality}}', cardLabel: '{{type}}牌', sold: '已售出', needContainers: '至少需要 2 个红心上限', notEnoughCoins: '硬币不足',
      addsItemCard: '加入一张可循环使用的道具卡',
    },
    options: {
      leaveShop: { label: '离开商店', description: '保留硬币，返回路线图。' }, sacrifice: { label: '踏上尖刺', description: '失去 15 点红心生命；获得一颗魂心和一张塔罗牌。' },
      walkAway: { label: '转身离开', description: '毫发无伤地返回地图。' }, enterDevil: { label: '进入恶魔房', description: '查看三件以红心上限标价的强大道具。' },
      enterAngel: { label: '进入天使房', description: '免费获得一件神圣道具。' }, skipDevil: { label: '不进入，继续下潜', description: '为后续楼层积累天使眷顾。' },
      skipAngel: { label: '不进入，继续下潜', description: '让这份祝福留在原处。' }, coins: { label: '硬币储藏', description: '拿走散落的零钱。' },
      bombs: { label: '炸弹包', description: '为之后的隐藏门准备炸弹。' }, keys: { label: '钥匙串', description: '用于开启上锁的奖励。' },
      'red-heart': { label: '完整红心', description: '恢复一整个红心容器。' }, 'soul-heart': { label: '魂心', description: '增加一颗 30 点生命的魂心。' },
      'black-heart': { label: '黑心', description: '耗尽时会引发爆炸。' },
    },
    upgrades: {
      damage: { name: '眼泪强化', description: '基础攻击伤害 +2。' }, heart: { name: '心脏训练', description: '每个红心上限 +5，并完全恢复生命。' },
      armor: { name: '坚韧皮肤', description: '永久护甲 +1。' }, speed: { name: '射速加速器', description: '射速 +0.25。' },
      skill: { name: '电池组', description: '主动道具充能时间减少一回合。' }, vitality: { name: '肾上腺素', description: '体力上限 +1。' },
    },
    stats: {
      character: '以撒', title: '属性', damage: '伤害', armor: '护甲', startShield: '初始护盾', fireRate: '射速', vitality: '体力', draw: '抽牌数', critical: '暴击率',
      tearForm: '攻击形态', items: '道具', run: '本局', roomsCleared: '已清除 {{count}} 个房间', dealChance: '特殊房概率 {{chance}}%', angelFavor: '天使眷顾 {{count}}', pocketHp: '额外心生命 {{count}}',
    },
    result: {
      wonKicker: '首次下潜完成', lostKicker: '地下室又吞噬了一位孩子', wonTitle: '妈妈的腿已被击败', lostTitle: '以撒迷失在深渊之下',
      wonBody: '宝箱解锁了更深的命运：硫磺火和妈妈的菜刀现在可以在未来的游戏中出现。', lostBody: '路线会再次改变，但你学到的一切都会留下。',
      score: '分数', rooms: '房间', items: '道具', floors: '楼层', unlocks: '本局解锁', return: '返回标题画面', newUnlock: '新解锁 · {{message}}',
    },
    unlockMessage: '已解锁{{item}} — {{condition}}',
    rewards: { coins: '{{amount}}¢', bombs_one: '{{amount}} 枚炸弹', bombs_other: '{{amount}} 枚炸弹', keys_one: '{{amount}} 把钥匙', keys_other: '{{amount}} 把钥匙', redHp: '{{amount}} 点红心生命', soul_one: '{{amount}} 颗魂心', soul_other: '{{amount}} 颗魂心', black_one: '{{amount}} 颗黑心', black_other: '{{amount}} 颗黑心' },
    errors: {
      notInCombat: '当前不在战斗中', cardNotInHand: '这张牌不在手中', unknownCard: '未知卡牌', curseUnplayable: '负面诅咒牌无法打出', vitality: '体力不足', recharging: '主动道具正在充能',
      coins: '硬币不足', bomb: '需要一枚炸弹才能开启这个房间', containers: '恶魔交易需要一个可供支付的红心上限', sacrifice: '红心生命不足，无法在献祭后存活', unavailable: '当前无法执行该操作',
      chooseTarget: '请先选择一个敌人', range: '选中的敌人不在以撒的直线攻击范围内', movement: '该格子超出本次移动范围',
    },
    logs: {
      enter: '第 1 回合 — {{enemies}} 进入了房间。', attack: '{{card}}造成了 {{damage}} 点伤害{{mode}}{{echo}}。', echo: '，并追加 {{count}} 次回响攻击', reroll: '六面骰重掷了 {{count}} 张牌。',
      heal: '{{source}}恢复了 {{amount}} 点生命。', belial: '贝利亚之书使本房间伤害 +2。', shadows: '影之书提供了 20 点护盾。', tammy: '塔米的头对所有敌人造成了 {{damage}} 点伤害。',
      nail: '钉子提供了一颗黑心和本房间 +2 护甲。', hourglass: '时间发生折叠。所有敌人都会失去下一次行动。', fizzled: '主动道具没有产生效果。', shield: '{{source}}提供了 {{amount}} 点护盾。',
      cursed: '{{enemy}}受到了诅咒。', tarot: '{{card}}在强大的能量中被消耗。', discard: '可任意弃牌，随后最多保留 {{count}} 张。', deadWeight: '一张“沉重诅咒”被加入牌组。',
      blackBurst: '一颗黑心破碎：普通敌人全部死亡，冠军与首领受到 100 点伤害！', dodge: '以撒躲开了攻击。', playerHit: '以撒受到 {{damage}} 点生命伤害（护盾抵挡 {{shield}} 点）。', enemyAttack: '{{enemy}}发动攻击：造成 {{damage}} 点生命伤害（护盾抵挡 {{shield}} 点）。',
      enemyCursed: '{{enemy}}受到诅咒，无法行动。', enemyWeakened: '{{enemy}}的诅咒压制了特殊行动，并以 {{damage}} 点威力发动攻击。', enemyStaggered: '{{enemy}}陷入硬直，失去了本次行动。', enemyShield: '{{enemy}}获得 {{amount}} 点护盾。', enemyHeal: '{{enemy}}为{{target}}恢复了 {{amount}} 点生命。',
      prepare: '{{enemy}}正在准备双倍伤害攻击！', hesitate: '{{enemy}}犹豫不决。', nextRound: '第 {{round}} 回合 — 体力恢复至 {{vitality}}。',
      playerMoved: '以撒从 ({{fromX}}, {{fromY}}) 移动到 ({{x}}, {{y}})。', enemyMoved: '{{enemy}}移动到了 ({{x}}, {{y}})。', enemyOutOfRange: '{{enemy}}仍在攻击射程之外。', passiveUsed: '道具卡{{item}}已发动。', activeDiscarded: '主动道具{{item}}被弃掉并永久失去。',
    },
    floors: {
      0: { name: '地下室 I', subtitle: '地底有什么正在蠢动', boss: '蒙斯特罗' }, 1: { name: '地下室 II', subtitle: '墙壁开始呼吸', boss: '苍蝇公爵' },
      2: { name: '洞穴 I', subtitle: '冰冷岩石，饥饿黑暗', boss: '咕迪' }, 3: { name: '洞穴 II', subtitle: '除了向下，别无出路', boss: '超级胖胖' },
      4: { name: '深牢 I', subtitle: '一个熟悉的声音', boss: '笼子' }, 5: { name: '深牢 II', subtitle: '妈妈正在注视', boss: '妈妈的腿' },
    },
    cards: {
      'isaacs-tears': { name: '泪弹', description: '发射一枚泪弹，造成 100% 伤害。射速可以触发回响攻击。' },
      'double-shot': { name: '双发', description: '连续两次造成 70% 眼泪伤害。' }, 'wide-tears': { name: '泪雨横扫', description: '对所有敌人造成 65% 眼泪伤害。' },
      'wooden-cross': { name: '木十字架', description: '获得 5 点护盾。护盾会在本房间持续存在。' }, 'half-heart': { name: '半颗红心', description: '恢复 10 点红心生命。' },
      'bad-trip': { name: '糟糕之旅', description: '诅咒一个敌人 2 回合：攻击降低 40%，并压制复杂行动组合。' }, 'the-empress': { name: 'III · 女皇', description: '本场战斗伤害 +3。永久消耗。' },
      death: { name: 'XIII · 死神', description: '对所有敌人造成 25 点伤害。永久消耗。' }, 'the-sun': { name: 'XIX · 太阳', description: '对所有敌人造成 30 点伤害，并恢复 20 点生命。永久消耗。' },
      'dead-weight': { name: '沉重诅咒', description: '无法打出。由敌人的诅咒加入牌组。' }, 'skill-d6': { name: '六面骰', description: '将手牌中除自身外的每张牌重掷为不同卡牌。3 回合后充能完毕。' },
      'skill-yum-heart': { name: '美味的心', description: '恢复一整颗红心。4 回合后充能完毕。' }, 'skill-belial': { name: '贝利亚之书', description: '本房间伤害 +2。3 回合后充能完毕。' },
      'skill-shadows': { name: '影之书', description: '获得 20 点护盾。3 回合后充能完毕。' }, 'skill-tammy': { name: '塔米的头', description: '对所有敌人造成眼泪伤害。3 回合后充能完毕。' },
      'skill-nail': { name: '钉子', description: '获得一颗黑心和本房间 +2 护甲。5 回合后充能完毕。' }, 'skill-hourglass': { name: '发光沙漏', description: '所有敌人失去下一次行动。5 回合后充能完毕。' },
      ...chinesePassiveCards,
    },
    items: {
      d6: { name: '六面骰', description: '将手牌中除自身外的所有牌变成其他卡牌。以撒初始携带。' }, 'yum-heart': { name: '美味的心', description: '恢复一整颗红心。' },
      'book-belial': { name: '贝利亚之书', description: '在本场战斗中持续提高伤害。' }, 'book-shadows': { name: '影之书', description: '为以撒提供 20 点护盾。' },
      'tammys-head': { name: '塔米的头', description: '向所有方向发射眼泪。' }, 'the-nail': { name: '钉子', description: '提供一颗黑心和本房间护甲。' },
      'glowing-hourglass': { name: '发光沙漏', description: '令所有敌人错过下一次行动。' }, 'sad-onion': { name: '悲伤洋葱', description: '射速 +0.25。每四张攻击牌产生一次免费回响。' },
      'spoon-bender': { name: '弯勺者', description: '追踪眼泪可以绕过直线限制，瞄准斜向敌人。' },
      'crickets-head': { name: '蟋蟀的头', description: '伤害倍率 ×1.5。' }, 'magic-mushroom': { name: '魔法蘑菇', description: '全属性提升，并增加一个红心上限。' },
      breakfast: { name: '早餐', description: '红心上限 +1，并完全恢复生命。' }, squeezy: { name: '挤压玩具', description: '射速 +0.2，并获得两颗魂心。' },
      'holy-mantle': { name: '神圣斗篷', description: '每个房间的初始护盾 +15。', unlock: '在不损失红心生命的情况下清除一层' },
      'steam-sale': { name: '大甩卖', description: '商店价格降低 50%。', unlock: '同时持有至少 15 枚硬币' }, compass: { name: '指南针', description: '显示本层所有普通房间。' },
      'blue-map': { name: '蓝地图', description: '显示隐藏房和超级隐藏房。', unlock: '在同一层开启两类隐藏房' }, pentagram: { name: '五芒星', description: '伤害 ×1.2，恶魔房概率 +10%。' },
      'goat-head': { name: '山羊头', description: '每个首领战后必定出现恶魔房或天使房。' }, wafer: { name: '圣饼', description: '敌人的单次攻击在护甲计算前最多造成 15 点伤害。' },
      'sacred-heart': { name: '圣心', description: '伤害 ×1.6，暴击率 +15%。', unlock: '在一局中跳过两个恶魔房' },
      brimstone: { name: '硫磺火', description: '眼泪变成光束，对所有敌人造成 85% 伤害。', unlock: '击败妈妈的腿' },
      'moms-knife': { name: '妈妈的菜刀', description: '眼泪变成穿透菜刀攻击，威力 ×1.6。', unlock: '击败妈妈的腿' },
      'tech-x': { name: '科技 X', description: '环形激光命中所有敌人并削除 3 点护盾。', unlock: '无伤击败一个精英敌人' },
      terra: { name: '地球', description: '基础伤害 +3，护甲 +1。' }, luna: { name: '月亮', description: '抽牌数 +1，并显示隐藏房。' },
    },
    enemies: {
      fly: { name: '攻击蝇' }, pooter: { name: '喷射蝇' }, spider: { name: '大蜘蛛' }, horf: { name: '喷吐怪' }, charger: { name: '冲锋怪' }, globin: { name: '血肉怪' },
      knight: { name: '骑士' }, vis: { name: '内脏眼' }, leaper: { name: '跳跃者' }, 'fat-bat': { name: '肥蝙蝠' }, 'champion-knight': { name: '冠军骑士' },
      monstro: { name: '蒙斯特罗' }, duke: { name: '苍蝇公爵' }, gurdy: { name: '咕迪' }, fatty: { name: '超级胖胖' }, cage: { name: '笼子' }, mom: { name: '妈妈的腿' },
    },
  },
};

const savedLanguage = typeof window !== 'undefined' ? window.localStorage.getItem(LANGUAGE_STORAGE_KEY) : null;

void i18n.use(initReactI18next).init({
  resources: { en, 'zh-CN': zhCN },
  lng: savedLanguage === 'en' ? 'en' : 'zh-CN',
  fallbackLng: 'en',
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (language) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.documentElement.lang = language;
});

if (typeof document !== 'undefined') document.documentElement.lang = i18n.resolvedLanguage ?? 'zh-CN';

export default i18n;
