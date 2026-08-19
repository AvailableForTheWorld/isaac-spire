import { useTranslation } from 'react-i18next';
import { ACHIEVEMENTS, ITEMS, RunPhase, type RunState } from '@isaac-spire/game';
import { unlockText } from '../../localize';

export function ResultView({ run, onHome }: { run: RunState; onHome: () => void }) {
  const { t, i18n } = useTranslation();
  const won = run.phase === RunPhase.Victory;
  return (
    <main className={`result-page ${won ? 'won' : 'lost'}`}>
      <div className="result-symbol">{won ? '♚' : '†'}</div>
      <p className="eyebrow">{t(won ? 'result.wonKicker' : 'result.lostKicker')}</p>
      <h1>{t(won ? 'result.wonTitle' : 'result.lostTitle')}</h1>
      <p>{t(won ? 'result.wonBody' : 'result.lostBody')}</p>
      <div className="result-stats">
        <span>
          <b>{run.score}</b>
          {t('result.score')}
        </span>
        <span>
          <b>{run.clearedRooms}</b>
          {t('result.rooms')}
        </span>
        <span>
          <b>{run.player.items.length}</b>
          {t('result.items')}
        </span>
        <span>
          <b>{run.floorIndex + 1}</b>
          {t('result.floors')}
        </span>
      </div>
      {run.achievementNotices.length > 0 && (
        <div className="unlock-list achievement-result-list">
          <strong>{t('achievements.newThisRun')}</strong>
          {run.achievementNotices.map((notice) => {
            const achievement = ACHIEVEMENTS[notice.achievementId];
            return (
              <span key={notice.achievementId}>
                {achievement.icon}{' '}
                {i18n.resolvedLanguage?.startsWith('zh') ? achievement.nameZh : achievement.name}
              </span>
            );
          })}
        </div>
      )}
      {run.unlockNotices.length > 0 && (
        <div className="unlock-list">
          <strong>{t('result.unlocks')}</strong>
          {run.unlockNotices.map((notice) => (
            <span key={notice.itemId}>
              {ITEMS[notice.itemId]?.icon} {unlockText(t, notice.itemId)}
            </span>
          ))}
        </div>
      )}
      <button className="primary-button" onClick={onHome}>
        {t('result.return')} <span>→</span>
      </button>
    </main>
  );
}
