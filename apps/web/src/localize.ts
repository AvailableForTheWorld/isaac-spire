import type { TFunction } from 'i18next';
import {
  CARDS, FLOORS, ITEMS,
  type CardType, type ChoiceState, type EnemyIntent, type EnemyState, type RewardOption,
  type RoomKind, type RunState,
} from '@isaac-spire/game';

export function floorName(t: TFunction, index: number): string {
  return t(`floors.${index}.name`, { defaultValue: FLOORS[index]?.name ?? `Floor ${index + 1}` });
}

export function floorSubtitle(t: TFunction, index: number): string {
  return t(`floors.${index}.subtitle`, { defaultValue: FLOORS[index]?.subtitle ?? '' });
}

export function floorBoss(t: TFunction, index: number): string {
  return t(`floors.${index}.boss`, { defaultValue: FLOORS[index]?.bossName ?? '' });
}

export function roomName(t: TFunction, kind: RoomKind): string {
  return t(`rooms.${kind}.name`, { defaultValue: kind });
}

export function roomHint(t: TFunction, kind: RoomKind): string {
  return t(`rooms.${kind}.hint`, { defaultValue: '' });
}

export function cardName(t: TFunction, id: string): string {
  return t(`cards.${id}.name`, { defaultValue: CARDS[id]?.name ?? id });
}

export function cardDescription(t: TFunction, id: string): string {
  return t(`cards.${id}.description`, { defaultValue: CARDS[id]?.description ?? '' });
}

export function cardTypeName(t: TFunction, type: CardType): string {
  return t(`cardTypes.${type}`, { defaultValue: type });
}

export function itemName(t: TFunction, id: string): string {
  return t(`items.${id}.name`, { defaultValue: ITEMS[id]?.name ?? id });
}

export function itemDescription(t: TFunction, id: string): string {
  return t(`items.${id}.description`, { defaultValue: ITEMS[id]?.description ?? '' });
}

export function enemyName(t: TFunction, enemy: Pick<EnemyState, 'id' | 'name'>): string {
  return t(`enemies.${enemy.id}.name`, { defaultValue: enemy.name });
}

export function intentLabel(t: TFunction, intent: EnemyIntent): string {
  const actions = intent.actions ?? [{ kind: intent.kind, value: intent.value }];
  return actions.map((entry) => t(`intents.${entry.kind}`, { value: entry.value, defaultValue: entry.kind })).join(' + ');
}

export function rewardText(t: TFunction, reward: string): string {
  const item = Object.values(ITEMS).find((entry) => entry.name === reward);
  if (item) return itemName(t, item.id);
  const card = Object.values(CARDS).find((entry) => entry.name === reward);
  if (card) return cardName(t, card.id);
  let match = reward.match(/^(\d+)¢$/);
  if (match) return t('rewards.coins', { amount: Number(match[1]) });
  match = reward.match(/^(\d+) bombs?$/);
  if (match) return t('rewards.bombs', { amount: Number(match[1]), count: Number(match[1]) });
  match = reward.match(/^(\d+) keys?$/);
  if (match) return t('rewards.keys', { amount: Number(match[1]), count: Number(match[1]) });
  match = reward.match(/^(\d+) red-heart HP$/);
  if (match) return t('rewards.redHp', { amount: Number(match[1]) });
  match = reward.match(/^(\d+) soul hearts?$/);
  if (match) return t('rewards.soul', { amount: Number(match[1]), count: Number(match[1]) });
  match = reward.match(/^(\d+) black hearts?$/);
  if (match) return t('rewards.black', { amount: Number(match[1]), count: Number(match[1]) });
  const upgrade = (['damage', 'heart', 'armor', 'vitality', 'speed', 'skill'] as const)
    .find((key) => t(`upgrades.${key}.name`, { lng: 'en' }) === reward);
  return upgrade ? t(`upgrades.${upgrade}.name`) : reward;
}

export function rewardsText(t: TFunction, run: RunState): string {
  return run.lastReward.map((reward) => rewardText(t, reward)).join(' · ');
}

function currentRoomKind(run: RunState): RoomKind | undefined {
  return run.floorMap.nodes.find((node) => node.id === run.currentRoomId)?.kind;
}

export function choiceTitle(t: TFunction, run: RunState): string {
  const choice = run.choice;
  if (!choice) return '';
  const room = currentRoomKind(run);
  if (choice.kind === 'upgrade') return t('choice.floorCleared', { floor: floorName(t, run.floorIndex) });
  if (choice.kind === 'deal') return t(choice.dealType === 'angel' ? 'choice.angelGateTitle' : 'choice.devilGateTitle');
  if (choice.dealType) return t(choice.dealType === 'angel' ? 'choice.angelRoom' : 'choice.devilRoom');
  if (choice.kind === 'shop') return t('choice.shopTitle');
  if (choice.kind === 'sacrifice') return t('choice.sacrificeTitle');
  if (room === 'treasure') return t('choice.treasureTitle');
  if (room === 'planetarium') return t('choice.planetariumTitle');
  if (room === 'curse') return t('choice.curseTitle');
  if (room === 'secret') return t('choice.secretTitle');
  if (room === 'super-secret') return t('choice.superSecretTitle');
  if (run.combat?.roomKind === 'boss') return t('choice.bossTitle', { boss: floorBoss(t, run.floorIndex) });
  if (run.combat?.roomKind === 'elite') return t('choice.eliteTitle');
  if (choice.kind === 'card') return t('choice.clearedTitle');
  return choice.title;
}

export function choiceSubtitle(t: TFunction, run: RunState): string {
  const choice = run.choice;
  if (!choice) return '';
  const room = currentRoomKind(run);
  const reward = rewardsText(t, run);
  if (choice.kind === 'upgrade') return t(run.floorIndex === 5 ? 'choice.finalBlessing' : 'choice.floorBlessing');
  if (choice.kind === 'deal') return t('choice.gateSubtitle');
  if (choice.dealType) return t(choice.dealType === 'angel' ? 'choice.angelSubtitle' : 'choice.devilSubtitle');
  if (choice.kind === 'shop') return t('choice.shopSubtitle', { coins: run.player.coins });
  if (choice.kind === 'sacrifice') return t('choice.sacrificeSubtitle');
  if (room === 'treasure') return t('choice.treasureSubtitle');
  if (room === 'planetarium') return t('choice.planetariumSubtitle');
  if (room === 'curse') {
    const hp = Number(choice.subtitle.match(/\d+/)?.[0] ?? 0);
    return t('choice.curseSubtitle', { hp });
  }
  if (room === 'secret') return t('choice.secretSubtitle');
  if (room === 'super-secret') return t('choice.superSecretSubtitle');
  if (run.combat?.roomKind === 'boss') return t('choice.bossSubtitle', { reward });
  if (run.combat?.roomKind === 'elite') return t('choice.eliteSubtitle', { reward });
  if (choice.kind === 'card') return t('choice.clearedSubtitle', { reward });
  return choice.subtitle;
}

function actionKey(option: RewardOption, choice: ChoiceState): string {
  if (option.action === 'enter-deal') return choice.dealType === 'angel' ? 'enterAngel' : 'enterDevil';
  if (option.action === 'skip-deal') return choice.dealType === 'angel' ? 'skipAngel' : 'skipDevil';
  if (option.action === 'sacrifice') return 'sacrifice';
  if (option.action === 'leave') return choice.kind === 'shop' ? 'leaveShop' : 'walkAway';
  return 'walkAway';
}

export function optionLabel(t: TFunction, option: RewardOption, choice: ChoiceState): string {
  if (option.itemId) return itemName(t, option.itemId);
  if (option.cardId) return cardName(t, option.cardId);
  if (option.upgrade) return t(`upgrades.${option.upgrade}.name`);
  if (option.action) return t(`options.${actionKey(option, choice)}.label`);
  if (option.resource) return t(`options.${option.resource}.label`);
  return option.label;
}

export function optionDescription(t: TFunction, option: RewardOption, choice: ChoiceState): string {
  if (option.itemId) {
    const description = itemDescription(t, option.itemId);
    return choice.dealType === 'devil' ? `${description} ${t('choice.devilCost')}` : description;
  }
  if (option.cardId) return cardDescription(t, option.cardId);
  if (option.upgrade) return t(`upgrades.${option.upgrade}.description`);
  if (option.action) return t(`options.${actionKey(option, choice)}.description`);
  if (option.resource) return t(`options.${option.resource}.description`);
  return option.description;
}

export function unlockText(t: TFunction, itemId: string): string {
  const condition = t(`items.${itemId}.unlock`, { defaultValue: ITEMS[itemId]?.unlock?.label ?? '' });
  return t('unlockMessage', { item: itemName(t, itemId), condition });
}

export function errorText(t: TFunction, message: string): string {
  const keyByMessage: Record<string, string> = {
    'Not in combat': 'notInCombat', 'Card is not in hand': 'cardNotInHand', 'Unknown card': 'unknownCard',
    'Curse cards are unplayable': 'curseUnplayable', 'Not enough vitality': 'vitality',
    'Active item is recharging': 'recharging', 'Not enough coins': 'coins',
    'A bomb is required to open this room': 'bomb', 'A Devil deal needs a spare red-heart container': 'containers',
    'Not enough red-heart HP to survive the sacrifice': 'sacrifice',
  };
  const key = keyByMessage[message];
  return key ? t(`errors.${key}`) : t('errors.unavailable');
}

export function logText(t: TFunction, run: RunState, message: string, key?: string, params?: Record<string, string | number>): string {
  if (key) {
    const localizedParams = { ...params };
    if (typeof localizedParams.cardId === 'string') localizedParams.card = cardName(t, localizedParams.cardId);
    if (typeof localizedParams.sourceCardId === 'string') localizedParams.source = cardName(t, localizedParams.sourceCardId);
    if (typeof localizedParams.enemyId === 'string') localizedParams.enemy = t(`enemies.${localizedParams.enemyId}.name`, { defaultValue: localizedParams.enemy });
    if (typeof localizedParams.targetId === 'string') localizedParams.target = t(`enemies.${localizedParams.targetId}.name`, { defaultValue: localizedParams.target });
    if (typeof localizedParams.enemies === 'string') {
      localizedParams.enemies = localizedParams.enemies.split('|').map((id) => t(`enemies.${id}.name`, { defaultValue: id })).join('、');
    }
    if (typeof localizedParams.mode === 'string' && localizedParams.mode) localizedParams.mode = ` · ${t(`attackModes.${localizedParams.mode}`)}`;
    if (typeof localizedParams.echoCount === 'number' && localizedParams.echoCount > 0) localizedParams.echo = t('logs.echo', { count: localizedParams.echoCount });
    else localizedParams.echo = '';
    return t(`logs.${key}`, localizedParams);
  }

  // Migrate visible logs from runs saved before semantic log keys were introduced.
  const cardId = (name: string) => Object.values(CARDS).find((card) => card.name === name)?.id;
  const enemyId = (name: string) => run.combat?.enemies.find((enemy) => enemy.name === name)?.id;
  let match = message.match(/^Round 1 — (.+) entered the room\.$/);
  if (match) {
    const enemies = match[1]!.split(', ').map((name) => enemyId(name) ?? name).join('|');
    return logText(t, run, message, 'enter', { enemies });
  }
  match = message.match(/^(.+?) dealt (\d+)(?: (knife|brimstone|tech-x))? damage(?: with (\d+) echo hit)?\.$/);
  if (match) return logText(t, run, message, 'attack', {
    cardId: cardId(match[1]!) ?? match[1]!, card: match[1]!, damage: Number(match[2]), mode: match[3] ?? '', echoCount: Number(match[4] ?? 0),
  });
  match = message.match(/^The D6 rerolled (\d+) cards\.$/);
  if (match) return logText(t, run, message, 'reroll', { count: Number(match[1]) });
  match = message.match(/^(.+?) recovered (\d+) HP\.$/);
  if (match) return logText(t, run, message, 'heal', { sourceCardId: cardId(match[1]!) ?? '', source: match[1]!, amount: Number(match[2]) });
  match = message.match(/^(.+?) granted (\d+) shield\.$/);
  if (match) return logText(t, run, message, 'shield', { sourceCardId: cardId(match[1]!) ?? '', source: match[1]!, amount: Number(match[2]) });
  match = message.match(/^(.+?) was cursed\.$/);
  if (match) return logText(t, run, message, 'cursed', { enemyId: enemyId(match[1]!) ?? '', enemy: match[1]! });
  match = message.match(/^(.+?) consumed in a burst of power\.$/);
  if (match) return logText(t, run, message, 'tarot', { cardId: cardId(match[1]!) ?? '', card: match[1]! });
  match = message.match(/^Discard down to (\d+) cards, or discard everything\.$/);
  if (match) return logText(t, run, message, 'discard', { count: Number(match[1]) });
  match = message.match(/^Isaac took (\d+) heart damage \((\d+) blocked by shield\)\.$/);
  if (match) return logText(t, run, message, 'playerHit', { damage: Number(match[1]), shield: Number(match[2]) });
  match = message.match(/^(.+?) is cursed and does nothing\.$/);
  if (match) return logText(t, run, message, 'enemyCursed', { enemyId: enemyId(match[1]!) ?? '', enemy: match[1]! });
  match = message.match(/^(.+?) gained (\d+) shield\.$/);
  if (match) return logText(t, run, message, 'enemyShield', { enemyId: enemyId(match[1]!) ?? '', enemy: match[1]!, amount: Number(match[2]) });
  match = message.match(/^(.+?) restored (\d+) HP to (.+)\.$/);
  if (match) return logText(t, run, message, 'enemyHeal', {
    enemyId: enemyId(match[1]!) ?? '', enemy: match[1]!, amount: Number(match[2]), targetId: enemyId(match[3]!) ?? '', target: match[3]!,
  });
  match = message.match(/^(.+?) prepares a doubled attack!$/);
  if (match) return logText(t, run, message, 'prepare', { enemyId: enemyId(match[1]!) ?? '', enemy: match[1]! });
  match = message.match(/^(.+?) hesitates\.$/);
  if (match) return logText(t, run, message, 'hesitate', { enemyId: enemyId(match[1]!) ?? '', enemy: match[1]! });
  match = message.match(/^Round (\d+) — vitality restored to (\d+)\.$/);
  if (match) return logText(t, run, message, 'nextRound', { round: Number(match[1]), vitality: Number(match[2]) });

  const fixedKeys: Record<string, string> = {
    'Book of Belial granted +2 room damage.': 'belial', 'Book of Shadows granted 20 shield.': 'shadows',
    'The Nail granted a black heart and +2 room armor.': 'nail', 'Time folds. Every enemy loses its next action.': 'hourglass',
    'The active item fizzled.': 'fizzled', 'A Dead Weight curse was added to your deck.': 'deadWeight',
    'A black heart shattered: normal enemies died and champions took 100 damage!': 'blackBurst', 'Isaac slipped past the attack.': 'dodge',
  };
  match = message.match(/^Tammy's Head burst for (\d+) damage to all enemies\.$/);
  if (match) return logText(t, run, message, 'tammy', { damage: Number(match[1]) });
  if (fixedKeys[message]) return logText(t, run, message, fixedKeys[message]);
  return message;
}
