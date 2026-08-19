import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SOURCES = {
  metadata:
    'https://gist.githubusercontent.com/akex06/72e80fefae5ac2f7f28e8f710c730544/raw/9230c04b98ac8a6c5d93700d3cbfaec4a8e4ec32/items.json',
  chineseNames:
    'https://raw.githubusercontent.com/wofsauge/External-Item-Descriptions/b6010e390ef2f429d4d4659974a5d505fba89b43/descriptions/names/zh_cn.lua',
  repentancePlus:
    'https://raw.githubusercontent.com/wofsauge/External-Item-Descriptions/b6010e390ef2f429d4d4659974a5d505fba89b43/descriptions/rep%2B/en_us.lua',
};

const EXISTING_IDS = new Map(
  Object.entries({
    'The D6': 'd6',
    'Book of Belial': 'book-belial',
    'Book of Shadows': 'book-shadows',
    'The Nail': 'the-nail',
    'Glowing Hour Glass': 'glowing-hourglass',
    'The Sad Onion': 'sad-onion',
    'The Compass': 'compass',
    'The Belt': 'the-belt',
    'The Wafer': 'wafer',
  }),
);

const POOL_MAP = [
  [/angel/i, 'RewardPool.Angel'],
  [/devil|demon beggar|krampus/i, 'RewardPool.Devil'],
  [/planetarium/i, 'RewardPool.Planetarium'],
  [/ultra secret/i, 'RewardPool.SuperSecret'],
  [/secret|shopkeeper|mushroom|tinted rock/i, 'RewardPool.Secret'],
  [/library/i, 'RewardPool.Library'],
  [/curse|red chest/i, 'RewardPool.Curse'],
  [/challenge/i, 'RewardPool.Challenge'],
  [/boss|chad|gish|steven|horsemen|conquest|mom's foot/i, 'RewardPool.Boss'],
  [/shop/i, 'RewardPool.Shop'],
  [/item room/i, 'RewardPool.Treasure'],
  [/chest/i, 'RewardPool.Vault'],
  [/beggar|arcade|crane|machine|shell game/i, 'RewardPool.Arcade'],
  [/miniboss|envy|gluttony|greed|lust|pride|sloth|wrath/i, 'RewardPool.Elite'],
];

const MECHANICS = [
  ['ItemMechanic.Revival', /reviv|extra life|respawn|1up/i],
  ['ItemMechanic.RiskReward', /kills? isaac|damage to isaac|sacrifice|in exchange|at a cost/i],
  ['ItemMechanic.Reroll', /reroll|re-roll|dice|d6|d20|d100|transform(?:s|ed)? (?:all )?items?/i],
  ['ItemMechanic.Deck', /\bcard\b|cards|rune|soul stone|duplicate|copy the effect|hand held/i],
  ['ItemMechanic.Map', /secret room|map|compass|reveal|teleport|trapdoor|crawl space|portal/i],
  ['ItemMechanic.Economy', /shop|price|money|coins?|beggar|donation|purchase/i],
  ['ItemMechanic.Bomb', /bomb|explosion|explode|blast/i],
  ['ItemMechanic.Familiar', /familiar|orbital|blue fl(?:y|ies)|spider|wisp|locust/i],
  ['ItemMechanic.Health', /heart|health|heal|hp\b|red hearts?|soul hearts?|black hearts?/i],
  ['ItemMechanic.Defense', /shield|invincib|damage reduction|block|immune|holy mantle|armor/i],
  ['ItemMechanic.Movement', /speed|flight|fly over|dash|movement/i],
  ['ItemMechanic.Range', /range|shot speed/i],
  ['ItemMechanic.Status', /poison|slow|fear|charm|freeze|petrif|confus|stun|burn/i],
  ['ItemMechanic.FireRate', /tears up|fire rate|tear delay|rate of fire|tears multiplier/i],
  [
    'ItemMechanic.AttackPattern',
    /homing|pierc|spectral|split|burst|laser|beam|brimstone|knife|triple shot|double shot/i,
  ],
  ['ItemMechanic.Attack', /damage|tears?|attack|laser|beam|brimstone|knife|contact/i],
  ['ItemMechanic.Resource', /pickup|drop|spawn|keys?|bombs?|coins?|pills?/i],
  ['ItemMechanic.RoomControl', /enemy|enemies|current room|room effect/i],
  ['ItemMechanic.Wildcard', /random|varies|different effect/i],
];

const TRAITS = [
  ['ItemTrait.DamageDown', /damage down|decreas(?:e|es|ed|ing)[^.!#]{0,30}damage|-[\d.]+ damage/i],
  ['ItemTrait.FireRateDown', /tears down|fire rate down|increas(?:e|es|ed|ing)[^.!#]{0,25}tear delay/i],
  ['ItemTrait.RangeDown', /range down|decreas(?:e|es|ed|ing)[^.!#]{0,25}range|-[\d.]+ range/i],
  [
    'ItemTrait.MovementDown',
    /speed down|decreas(?:e|es|ed|ing)[^.!#]{0,25}(?:speed|movement)|-[\d.]+ speed/i,
  ],
  [
    'ItemTrait.DamageUp',
    /damage up|increas(?:e|es|ed|ing)[^.!#]{0,30}damage|\+[\d.]+ damage|damage multiplier/i,
  ],
  [
    'ItemTrait.FireRateUp',
    /tears up|fire rate up|rate of fire|decreas(?:e|es|ed|ing)[^.!#]{0,25}tear delay|\+[\d.]+ tears/i,
  ],
  ['ItemTrait.RangeUp', /range up|increas(?:e|es|ed|ing)[^.!#]{0,25}range|\+[\d.]+ range/i],
  ['ItemTrait.MovementUp', /speed up|movement speed|increas(?:e|es|ed|ing)[^.!#]{0,25}speed|\+[\d.]+ speed/i],
  ['ItemTrait.Homing', /homing|homes? (?:in|towards?)/i],
  ['ItemTrait.Piercing', /pierc(?:e|es|ing)|passes? through enem/i],
  ['ItemTrait.Spectral', /spectral|passes? through (?:rocks|obstacles|walls)/i],
  [
    'ItemTrait.MultiShot',
    /double shot|triple shot|quad shot|multiple tears|fires? (?:two|three|four|five|six|eight) (?:tears|shots)/i,
  ],
  ['ItemTrait.SplitShot', /split(?:s|ting)?|burst into|creates? (?:two|three|four) (?:tears|shots)/i],
  ['ItemTrait.Brimstone', /brimstone|blood laser/i],
  ['ItemTrait.Knife', /mom'?s knife|throw(?:s|ing)? (?:a )?knife|knife attack/i],
  ['ItemTrait.Laser', /laser|beam|tech x|technology/i],
  ['ItemTrait.Explosive', /explos(?:ion|ive|ions)|explode(?:s|d)?|blast damage/i],
  ['ItemTrait.Poison', /poison|toxic/i],
  ['ItemTrait.Slow', /slow(?:s|ed|ing)?|creep/i],
  ['ItemTrait.Fear', /fear|flee/i],
  ['ItemTrait.Charm', /charm(?:s|ed|ing)?/i],
  ['ItemTrait.Freeze', /freez(?:e|es|ing)|frozen|petrif/i],
  ['ItemTrait.Burn', /burn(?:s|ed|ing)?|fire damage/i],
  ['ItemTrait.MaxHealth', /health up|hp up|heart container|max(?:imum)? health/i],
  ['ItemTrait.Heal', /heal(?:s|ed|ing)?|restore(?:s|d)? health|recover(?:s|ed)? health|full health/i],
  ['ItemTrait.SoulHeart', /soul hearts?/i],
  ['ItemTrait.BlackHeart', /black hearts?/i],
  ['ItemTrait.Invincible', /invincib|immune to damage|holy mantle/i],
  ['ItemTrait.DamageReduction', /damage reduction|reduces? damage|half damage|damage cap/i],
  ['ItemTrait.Shield', /shield|barrier|block(?:s|ed|ing)? damage/i],
  ['ItemTrait.Orbital', /orbital|orbits? isaac/i],
  ['ItemTrait.Familiar', /familiar|blue fl(?:y|ies)|spider|wisp|locust/i],
  ['ItemTrait.Coins', /coins?|money|penn(?:y|ies)|nickel|dime/i],
  ['ItemTrait.Bombs', /bombs?|explosive pickup/i],
  ['ItemTrait.Keys', /keys?|golden key/i],
  ['ItemTrait.Discount', /discount|half price|prices? (?:are )?(?:reduced|lower)|shop items cost/i],
  ['ItemTrait.RevealSecret', /reveal[^.!#]{0,30}secret|secret rooms? (?:are )?(?:shown|revealed)|blue map/i],
  ['ItemTrait.RevealMap', /reveal[^.!#]{0,30}(?:map|rooms)|compass effect|full map/i],
  ['ItemTrait.Teleport', /teleport|portal|trapdoor|crawl space/i],
  ['ItemTrait.Reroll', /reroll|re-roll|d6|d20|d100|dice room/i],
  ['ItemTrait.Copy', /duplicate|copy (?:an?|the|all)|diplopia/i],
  ['ItemTrait.CardGeneration', /\bcards?\b|runes?|soul stones?|tarot/i],
  ['ItemTrait.Revival', /reviv|extra life|respawn|1up/i],
  [
    'ItemTrait.Retaliation',
    /when (?:isaac|the player) (?:is )?(?:hit|takes damage)|upon taking damage|contact damage/i,
  ],
  [
    'ItemTrait.RiskReward',
    /kills? isaac|damage to isaac|sacrifice|in exchange|at a cost|chance to (?:die|kill)/i,
  ],
  ['ItemTrait.Random', /random|varies|different effect/i],
];

function parseAlmostJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(`${text.trimEnd()}\n}`);
  }
}

function parseChineseNames(text) {
  return new Map(
    [...text.matchAll(/\[C_ID \.\. (\d+)\]\s*=\s*"((?:[^"\\]|\\.)*)"/g)].map((match) => [
      Number(match[1]),
      match[2].replaceAll('\\"', '"'),
    ]),
  );
}

function parseRepentancePlus(text) {
  const effects = new Map();
  const section = text.match(/local collectibles = \{([\s\S]*?)\n\}/)?.[1] ?? '';
  for (const match of section.matchAll(
    /\[(\d+)\]\s*=\s*\{\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\}/g,
  )) {
    effects.set(Number(match[1]), match[2].replaceAll('#', ' ').replace(/\{\{[^}]+\}\}/g, ' '));
  }
  return effects;
}

function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function rewardPools(pools) {
  const mapped = new Set();
  for (const pool of pools ?? []) {
    const mapping = POOL_MAP.find(([pattern]) => pattern.test(pool));
    if (mapping) mapped.add(mapping[1]);
  }
  if (!mapped.size) mapped.add('RewardPool.Treasure');
  return [...mapped];
}

function itemMechanics(item, repentancePlusEffect) {
  const search = [item.name, item.pickup, item.type, ...(item.description ?? []), repentancePlusEffect]
    .filter(Boolean)
    .join(' ');
  const mechanics = MECHANICS.filter(([, pattern]) => pattern.test(search)).map(([mechanic]) => mechanic);
  return mechanics.length ? mechanics : ['ItemMechanic.Wildcard'];
}

function itemTraits(item, repentancePlusEffect) {
  const search = [item.name, item.pickup, ...(item.description ?? []), repentancePlusEffect]
    .filter(Boolean)
    .join(' ');
  return TRAITS.filter(([, pattern]) => pattern.test(search)).map(([trait]) => trait);
}

function familyFor(mechanics, id) {
  const has = (mechanic) => mechanics.includes(`ItemMechanic.${mechanic}`);
  if (has('Reroll')) return 'ItemEffectFamily.Reroll';
  if (has('Deck')) return id % 3 === 0 ? 'ItemEffectFamily.Cycle' : 'ItemEffectFamily.Draw';
  if (has('Map')) return 'ItemEffectFamily.Mapping';
  if (has('Economy') && !has('Attack')) return 'ItemEffectFamily.Economy';
  if (has('Bomb')) return 'ItemEffectFamily.Bomb';
  if (has('Familiar')) return 'ItemEffectFamily.Familiar';
  if (has('Health')) return 'ItemEffectFamily.Sustain';
  if (has('Defense')) return 'ItemEffectFamily.Defense';
  if (has('Movement') || has('Range')) return 'ItemEffectFamily.Mobility';
  if (has('Status')) return 'ItemEffectFamily.Status';
  if (has('FireRate') || has('AttackPattern')) return 'ItemEffectFamily.Volley';
  if (has('Attack')) return 'ItemEffectFamily.Assault';
  if (has('Resource')) return 'ItemEffectFamily.Draw';
  if (has('Wildcard')) return 'ItemEffectFamily.Wildcard';
  return id % 2 === 0 ? 'ItemEffectFamily.Draw' : 'ItemEffectFamily.Cycle';
}

function qualityFor(value) {
  return [
    'RewardQuality.Poor',
    'RewardQuality.Common',
    'RewardQuality.Uncommon',
    'RewardQuality.Rare',
    'RewardQuality.Legendary',
  ][Math.max(0, Math.min(4, Number(value) || 0))];
}

function chargeRounds(value) {
  if (!value) return 3;
  if (/one time/i.test(value)) return 6;
  if (/instant|timed/i.test(value)) return 1;
  const amount = Number(value.match(/\d+/)?.[0]);
  return Number.isFinite(amount) ? Math.max(1, Math.min(6, amount)) : 3;
}

async function main() {
  const [metadataText, chineseText, repentancePlusText] = await Promise.all(
    Object.values(SOURCES).map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to download ${url}: ${response.status}`);
      return response.text();
    }),
  );
  const metadata = parseAlmostJson(metadataText);
  const chineseNames = parseChineseNames(chineseText);
  const repentancePlus = parseRepentancePlus(repentancePlusText);
  const usedIds = new Set();
  const entries = Object.values(metadata.items)
    .sort((left, right) => left.id - right.id)
    .map((item) => {
      let id = EXISTING_IDS.get(item.name) ?? (slugify(item.name) || `collectible-${item.id}`);
      if (usedIds.has(id)) id = `${id}-${item.id}`;
      usedIds.add(id);
      const mechanics = itemMechanics(item, repentancePlus.get(item.id));
      const traits = itemTraits(item, repentancePlus.get(item.id));
      const active = String(item.type).startsWith('Active');
      return {
        isaacId: item.id,
        id,
        name: item.name,
        nameZh: chineseNames.get(item.id) || item.name,
        kind: active ? 'ItemKind.Active' : 'ItemKind.Passive',
        quality: qualityFor(item.quality),
        pools: rewardPools(item.item_pool),
        mechanics,
        traits,
        family: familyFor(mechanics, item.id),
        chargeRounds: active ? chargeRounds(item.recharge_time) : undefined,
      };
    });

  if (entries.length !== 718) throw new Error(`Expected 718 collectibles, received ${entries.length}`);
  const rows = entries.map((entry) => {
    const fields = [
      `isaacId:${entry.isaacId}`,
      `id:${JSON.stringify(entry.id)}`,
      `name:${JSON.stringify(entry.name)}`,
      `nameZh:${JSON.stringify(entry.nameZh)}`,
      `kind:${entry.kind}`,
      `quality:${entry.quality}`,
      `pools:[${entry.pools.join(',')}]`,
      `mechanics:[${entry.mechanics.join(',')}]`,
      `traits:[${entry.traits.join(',')}]`,
      `family:${entry.family}`,
      ...(entry.chargeRounds ? [`chargeRounds:${entry.chargeRounds}`] : []),
    ];
    return `  {${fields.join(',')}},`;
  });
  const output = `/**\n * GENERATED FILE — do not hand edit.\n * 718 Repentance/Repentance+ collectible records, generated by scripts/generate-isaac-item-manifest.mjs.\n */\nimport { ItemEffectFamily, ItemKind, ItemMechanic, ItemTrait, RewardPool, RewardQuality } from '../domain/enums.js';\nimport { adaptIsaacItem, type IsaacItemManifestEntry } from './item-adaptation.js';\n\nexport const FULL_ISAAC_ITEM_MANIFEST: readonly IsaacItemManifestEntry[] = [\n${rows.join('\n')}\n];\n\nexport const FULL_ISAAC_ITEMS = Object.fromEntries(\n  FULL_ISAAC_ITEM_MANIFEST.map((entry) => {\n    const item = adaptIsaacItem(entry);\n    return [item.id, item];\n  }),\n);\n`;
  const target = fileURLToPath(
    new URL('../packages/game/src/content/isaac-items.generated.ts', import.meta.url),
  );
  await writeFile(target, output, 'utf8');
  console.log(`Generated ${entries.length} collectibles at ${target}`);
}

await main();
