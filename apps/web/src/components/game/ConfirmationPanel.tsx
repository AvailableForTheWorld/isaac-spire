import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export interface ConfirmationItem {
  icon: string;
  name: string;
  note: string;
}

export function ConfirmationPanel({
  eyebrow,
  title,
  message,
  items,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  eyebrow: string;
  title: string;
  message: string;
  items: ConfirmationItem[];
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmButton.current?.focus();
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [onCancel]);
  return (
    <div
      className="confirmation-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="confirmation-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-message"
      >
        <header>
          <span>{eyebrow}</span>
          <button onClick={onCancel} aria-label={t('confirmation.close')}>
            ×
          </button>
        </header>
        <div className="confirmation-copy">
          <b aria-hidden="true">!</b>
          <div>
            <h2 id="confirmation-title">{title}</h2>
            <p id="confirmation-message">{message}</p>
          </div>
        </div>
        <div className={`confirmation-items ${items.length === 1 ? 'single' : ''}`}>
          {items.map((item, index) => (
            <div key={`${item.name}-${index}`}>
              <b>{item.icon}</b>
              <span>
                <small>{item.note}</small>
                <strong>{item.name}</strong>
              </span>
            </div>
          ))}
          {items.length === 2 && <i aria-hidden="true">→</i>}
        </div>
        <footer>
          <button className="text-button" onClick={onCancel}>
            {t('confirmation.cancel')}
          </button>
          <button ref={confirmButton} className="primary-button confirmation-submit" onClick={onConfirm}>
            {confirmLabel}
            <span>→</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
