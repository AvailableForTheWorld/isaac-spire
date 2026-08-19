import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { HeartKind, type RunState } from '@isaac-spire/game';

export function HeartMeter({ run, shield, armor }: { run: RunState; shield?: number; armor?: number }) {
  const { t } = useTranslation();
  const maxRed = run.player.redContainers * run.player.stats.heartSize;
  return (
    <div className="heart-meter">
      <div className="health-line">
        <span className="heart-icon">♥</span>
        <strong>
          {run.player.redHp}/{maxRed} {t('combat.hp')}
        </strong>
      </div>
      <div className="heart-units">
        {Array.from({ length: run.player.redContainers }, (_, index) => {
          const hp = Math.max(
            0,
            Math.min(run.player.stats.heartSize, run.player.redHp - index * run.player.stats.heartSize),
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
        {run.player.pocketHearts.map((heart) => (
          <span
            className={`heart-unit ${heart.kind}`}
            key={heart.id}
            title={`${heart.hp}/${heart.maxHp} ${t('combat.hp')}`}
          >
            <b>{heart.kind === HeartKind.Soul ? '♡' : '♥'}</b>
            <small>
              {heart.hp}/{heart.maxHp}
            </small>
          </span>
        ))}
        {shield !== undefined && (
          <span className={`defense-unit shield ${shield > 0 ? 'active' : ''}`} title={t('combat.shield')}>
            <b>⬡</b>
            <small>{shield}</small>
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
