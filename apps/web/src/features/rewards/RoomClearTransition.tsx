import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

export function RoomClearTransition({ delayMs }: { delayMs: number }) {
  const { t } = useTranslation();
  return (
    <div
      className="room-clear-transition"
      role="status"
      aria-live="assertive"
      style={{ '--room-clear-delay': `${delayMs}ms` } as CSSProperties}
    >
      <div className="room-clear-sigil" aria-hidden="true">
        <i />
        <b>✦</b>
        <i />
      </div>
      <div className="room-clear-copy">
        <span>{t('combat.roomClearKicker')}</span>
        <strong>{t('combat.roomClearTitle')}</strong>
        <small>{t('combat.roomClearNext')}</small>
      </div>
    </div>
  );
}
