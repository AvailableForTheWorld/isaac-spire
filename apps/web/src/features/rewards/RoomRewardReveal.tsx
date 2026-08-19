import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { ACHIEVEMENTS, type RunState } from '@isaac-spire/game';
import { rewardText } from '../../localize';

function rewardIcon(reward: string): string {
  if (/¢$/.test(reward)) return '¢';
  if (/bomb/.test(reward)) return '●';
  if (/key/.test(reward)) return '⚿';
  if (/black heart/.test(reward)) return '♥';
  if (/soul heart/.test(reward)) return '♡';
  if (/red-heart/.test(reward)) return '♥';
  return '✦';
}

export function RoomRewardReveal({ run, onConfirm }: { run: RunState; onConfirm: () => void }) {
  const { t, i18n } = useTranslation();
  const chinese = i18n.resolvedLanguage?.startsWith('zh') ?? false;
  const pendingAchievements = run.achievementNotices
    .filter((notice) => !notice.acknowledgedAt)
    .map((notice) => ACHIEVEMENTS[notice.achievementId]);
  return (
    <div className="reward-reveal" role="dialog" aria-modal="true" aria-labelledby="room-reward-title">
      <div className="reward-rays" />
      <div className="reward-chest" aria-hidden="true">
        <i />
        <b>◆</b>
      </div>
      <div className="reward-title" id="room-reward-title">
        <span>{t('rewardReveal.cleared')}</span>
        <strong>{t('rewardReveal.open')}</strong>
      </div>
      <div className="reward-drops">
        {run.lastReward.map((reward, index) => (
          <div key={`${reward}-${index}`} style={{ '--reward-index': index } as CSSProperties}>
            <b>{rewardIcon(reward)}</b>
            <span>{rewardText(t, reward)}</span>
          </div>
        ))}
      </div>
      {pendingAchievements.length > 0 && (
        <div className="reward-achievements" role="status">
          <span>★</span>
          <div>
            <small>{t('achievements.reachedWithReward')}</small>
            {pendingAchievements.map((achievement) => (
              <strong key={achievement.id}>
                {achievement.icon} {chinese ? achievement.nameZh : achievement.name}
              </strong>
            ))}
          </div>
        </div>
      )}
      <button className="primary-button reward-confirm" onClick={onConfirm} autoFocus>
        {t('rewardReveal.confirm')} <span>→</span>
      </button>
    </div>
  );
}
