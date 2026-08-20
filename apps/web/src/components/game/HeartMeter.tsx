import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { getPlayerHealth, getPlayerShieldCapacity, HeartKind, type RunState } from '@isaac-spire/game';

export function HeartMeter({ run, shield, armor }: { run: RunState; shield?: number; armor?: number }) {
  const { t } = useTranslation();
  const health = getPlayerHealth(run.player);
  const shieldCapacity = getPlayerShieldCapacity(run);
  return (
    <div className="heart-meter">
      <div className="health-line">
        <span className="heart-icon">♥</span>
        <strong>
          {health.current}/{health.maximum} {t('combat.hp')}
        </strong>
      </div>
      <div className="heart-units">
        {Array.from({ length: run.player.redContainers }, (_, index) => {
          const hp = Math.max(
            0,
            Math.min(run.player.stats.heartSize, health.redCurrent - index * run.player.stats.heartSize),
          );
          const filled = run.player.stats.heartSize ? hp / run.player.stats.heartSize : 0;
          return (
            <span
              className="heart-unit red"
              key={index}
              title={`${hp}/${run.player.stats.heartSize} ${t('combat.hp')}`}
            >
              <b style={{ '--heart-fill': `${filled * 100}%` } as CSSProperties}>♥</b>
              <small>
                {hp}/{run.player.stats.heartSize}
              </small>
            </span>
          );
        })}
        {run.player.pocketHearts.map((heart) => {
          const hp = Math.max(0, Math.min(heart.maxHp, heart.hp));
          const filled = heart.maxHp ? hp / heart.maxHp : 0;
          return (
            <span
              className={`heart-unit ${heart.kind}`}
              key={heart.id}
              title={`${hp}/${heart.maxHp} ${t('combat.hp')}`}
            >
              <b style={{ '--heart-fill': `${filled * 100}%` } as CSSProperties}>
                {heart.kind === HeartKind.Soul ? '♡' : '♥'}
              </b>
              <small>
                {hp}/{heart.maxHp}
              </small>
            </span>
          );
        })}
        {shield !== undefined && (
          <span
            className={`defense-unit shield ${shield > 0 ? 'active' : ''} ${shield > shieldCapacity ? 'over-cap' : ''}`}
            title={t('combat.shieldValue', { current: shield, maximum: shieldCapacity })}
          >
            <b>⬡</b>
            <small>
              {shield}/{shieldCapacity}
            </small>
          </span>
        )}
        {armor !== undefined && (
          <span className="defense-unit armor" title={t('combat.armor')}>
            <b>⛉</b>
            <small>{armor}</small>
          </span>
        )}
      </div>
    </div>
  );
}
