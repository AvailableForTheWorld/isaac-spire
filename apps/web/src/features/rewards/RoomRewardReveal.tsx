import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { RunState } from '@isaac-spire/game';
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
  const { t } = useTranslation();
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
      <button className="primary-button reward-confirm" onClick={onConfirm} autoFocus>
        {t('rewardReveal.confirm')} <span>→</span>
      </button>
    </div>
  );
}
