import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CARDS, type RewardOption, type RunState } from '@isaac-spire/game';
import { cardDescription, cardName, cardTypeName } from '../../localize';

export function ShopCardUpgradeModal({
  run,
  option,
  onCancel,
  onConfirm,
}: {
  run: RunState;
  option: RewardOption;
  onCancel: () => void;
  onConfirm: (cardInstanceId: string) => void;
}) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string>();
  const candidates = run.player.deck.filter((card) => !card.upgraded && CARDS[card.definitionId]);

  return (
    <div className="pocket-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="pocket-deck-panel shop-card-upgrade-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('choice.shopCardUpgradeTitle')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>{t('choice.shopUpgradeKicker')}</span>
            <h2>{t('choice.shopCardUpgradeTitle')}</h2>
            <p>{t('choice.shopCardUpgradeHint')}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label={t('confirmation.close')}>
            ×
          </button>
        </header>
        <div className="pocket-deck-grid shop-card-upgrade-grid">
          {candidates.map((instance) => {
            const card = CARDS[instance.definitionId]!;
            const selected = selectedId === instance.instanceId;
            return (
              <button
                type="button"
                key={instance.instanceId}
                className={selected ? 'selected' : ''}
                onClick={() => setSelectedId(instance.instanceId)}
                title={cardDescription(t, card.id)}
              >
                <span>{card.icon}</span>
                <b>{cardName(t, card.id)}</b>
                <small>
                  {cardTypeName(t, card.type)} · {t('pocket.cardCost', { cost: card.cost })}
                </small>
                <i>{selected ? '✓' : '+'}</i>
              </button>
            );
          })}
          {!candidates.length && <div className="empty-pile">{t('choice.noUpgradeableCards')}</div>}
        </div>
        <footer>
          <button type="button" className="text-button" onClick={onCancel}>
            {t('confirmation.cancel')}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!selectedId}
            onClick={() => selectedId && onConfirm(selectedId)}
          >
            {t('choice.shopCardUpgradeConfirm', { price: option.price ?? 0 })}
          </button>
        </footer>
      </section>
    </div>
  );
}
