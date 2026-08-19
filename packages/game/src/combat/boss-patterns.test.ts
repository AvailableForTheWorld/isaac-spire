import { describe, expect, it } from 'vitest';
import { DEFAULT_UNLOCKS, getEnemy } from '../catalog.js';
import { chooseOption, createRun, enterRoom, getAvailableNodes } from '../engine.js';
import { BossAttackPattern, RewardContext, RewardOptionType } from '../types.js';
import { bossIntentActions } from './boss-patterns.js';

function playableRun() {
  let run = createRun('BOSS-PATTERN-CATALOG', DEFAULT_UNLOCKS);
  if (run.choice?.rewardContext === RewardContext.FloorStart) {
    run = chooseOption(
      run,
      run.choice.options.find((option) => option.type === RewardOptionType.Resource)!.id,
    );
  }
  return enterRoom(run, getAvailableNodes(run)[0]!);
}

describe('boss attack profiles', () => {
  it('gives every first-run boss multi-stage, spatially telegraphed attacks', () => {
    const run = playableRun();
    const enemy = run.combat!.enemies[0]!;
    const bossIds = ['monstro', 'duke', 'gurdy', 'fatty', 'cage', 'mom'];
    const allPatterns = new Set<BossAttackPattern>();

    for (const bossId of bossIds) {
      const definition = getEnemy(bossId);
      const bossPatterns = new Set<BossAttackPattern>();
      Object.assign(enemy, definition, { prepared: false, reactionCooldown: 0 });
      for (const hpRatio of [1, 0.5, 0.2]) {
        enemy.hp = Math.round(enemy.maxHp * hpRatio);
        enemy.behaviorStep = 0;
        for (let sequence = 0; sequence < 2; sequence += 1) {
          const actions = bossIntentActions(run, enemy, false);
          expect(actions).toHaveLength(2);
          actions.forEach((action) => {
            if (!action.pattern) return;
            bossPatterns.add(action.pattern);
            allPatterns.add(action.pattern);
          });
        }
      }
      expect(bossPatterns.size).toBeGreaterThanOrEqual(3);
    }

    expect(allPatterns).toEqual(
      new Set([
        BossAttackPattern.ProjectileSpread,
        BossAttackPattern.RadialBurst,
        BossAttackPattern.SpiralBarrage,
        BossAttackPattern.LaserLine,
        BossAttackPattern.LeapSlam,
        BossAttackPattern.GroundStomp,
        BossAttackPattern.ChargeLane,
        BossAttackPattern.RockWave,
        BossAttackPattern.ProjectileRain,
      ]),
    );
  });
});
