import { useTranslation } from 'react-i18next';
import { RunPhase, type RunState } from '@isaac-spire/game';
import type { SaveStatus } from '../../features/run/save-status';
import { floorName } from '../../localize';
import { LanguageToggle } from './LanguageToggle';

export function GameHeader({
  run,
  saveStatus,
  onSave,
  onSaveAndExit,
  onAbandon,
}: {
  run: RunState;
  saveStatus: SaveStatus;
  onSave: () => void;
  onSaveAndExit: () => void;
  onAbandon: () => void;
}) {
  const { t } = useTranslation();
  const resumable = ![RunPhase.Victory, RunPhase.Defeat].includes(run.phase);
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
      <div className="header-actions">
        {resumable && (
          <>
            <span className={`save-state ${saveStatus}`} role="status" aria-live="polite">
              <i />
              {t(`header.saveStatus.${saveStatus}`)}
            </span>
            <button className="header-save-button" onClick={onSave} title={t('header.save')}>
              <b>⇩</b>
              <span>{t('header.save')}</span>
            </button>
            <button
              className="header-save-button exit"
              onClick={onSaveAndExit}
              title={t('header.saveAndExit')}
            >
              <b>⌂</b>
              <span>{t('header.saveAndExit')}</span>
            </button>
          </>
        )}
        <LanguageToggle compact />
        <button
          className="icon-button"
          onClick={onAbandon}
          title={t('header.abandon')}
          aria-label={t('header.abandon')}
        >
          ×
        </button>
      </div>
    </header>
  );
}
