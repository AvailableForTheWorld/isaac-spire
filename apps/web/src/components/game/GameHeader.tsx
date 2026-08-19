import { useTranslation } from 'react-i18next';
import type { RunState } from '@isaac-spire/game';
import { floorName } from '../../localize';
import { LanguageToggle } from './LanguageToggle';

export function GameHeader({ run, onAbandon }: { run: RunState; onAbandon: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="game-header">
      <div className="brand-lockup">
        <span className="brand-mark">B</span>
        <div>
          <strong>{t('brand.title')}</strong>
          <small>{t('brand.subtitle')}</small>
        </div>
      </div>
      <div className="floor-heading">
        <span>{t('header.floor', { current: run.floorIndex + 1, total: 6 })}</span>
        <strong>{floorName(t, run.floorIndex)}</strong>
      </div>
      <div className="resource-row" aria-label={t('resources.label')}>
        <span title={t('resources.coins')}>
          <b>¢</b>
          {run.player.coins}
        </span>
        <span title={t('resources.bombs')}>
          <b>●</b>
          {run.player.bombs}
        </span>
        <span title={t('resources.keys')}>
          <b>⚿</b>
          {run.player.keys}
        </span>
        <span title={t('resources.score')}>
          <b>◆</b>
          {run.score}
        </span>
      </div>
      <LanguageToggle compact />
      <button
        className="icon-button"
        onClick={onAbandon}
        title={t('header.abandon')}
        aria-label={t('header.abandon')}
      >
        ×
      </button>
    </header>
  );
}
