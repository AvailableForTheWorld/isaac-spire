import { useTranslation } from 'react-i18next';
import { ITEMS, type RunState } from '@isaac-spire/game';
import { itemDescription, itemName } from '../../localize';

function totalPocketHp(run: RunState): number {
  return run.player.pocketHearts.reduce((sum, heart) => sum + heart.hp, 0);
}

export function StatsRail({ run }: { run: RunState }) {
  const { t } = useTranslation();
  const stats = run.player.stats;
  return (
    <aside className="stats-rail">
      <details>
        <summary>
          {t('stats.character')} <span>{t('stats.title')}</span>
        </summary>
        <div className="stats-grid">
          <span>
            {t('stats.damage')} <b>{(stats.baseDamage * stats.damageMultiplier).toFixed(1)}</b>
          </span>
          <span>
            {t('stats.armor')} <b>{stats.armor}</b>
          </span>
          <span>
            {t('stats.startShield')}{' '}
            <b>
              {stats.baseShield}/{stats.maxShield}
            </b>
          </span>
          <span>
            {t('stats.fireRate')} <b>{stats.fireRate.toFixed(2)}</b>
          </span>
          <span>
            {t('stats.vitality')} <b>{stats.maxVitality}</b>
          </span>
          <span>
            {t('stats.draw')} <b>{stats.drawCount}</b>
          </span>
          <span>
            {t('stats.critical')} <b>{Math.round(stats.critChance * 100)}%</b>
          </span>
          <span>
            {t('stats.attackForm')} <b>{t(`attackModes.${stats.attackMode}`)}</b>
          </span>
        </div>
      </details>
      <details>
        <summary>
          {t('stats.items')} <span>{run.player.items.length}</span>
        </summary>
        <div className="item-grid">
          {run.player.items.map((id) => (
            <span key={id} title={`${itemName(t, id)}：${itemDescription(t, id)}`}>
              {ITEMS[id]?.icon ?? '?'}
              <small>{itemName(t, id)}</small>
            </span>
          ))}
        </div>
      </details>
      <details>
        <summary>
          {t('stats.run')} <span>{run.seed}</span>
        </summary>
        <div className="run-facts">
          <p>{t('stats.roomsCleared', { count: run.clearedRooms })}</p>
          <p>{t('stats.dealChance', { chance: Math.round(run.devilChance * 100) })}</p>
          <p>{t('stats.angelFavor', { count: run.angelFavor })}</p>
          <p>{t('stats.pocketHp', { count: totalPocketHp(run) })}</p>
        </div>
      </details>
    </aside>
  );
}
