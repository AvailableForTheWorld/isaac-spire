import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CARDS,
  ITEMS,
  ItemUseTiming,
  PocketItemAction,
  type RunState,
  usePocketItem as applyPocketItem,
} from '@isaac-spire/game';
import { ConfirmationPanel } from '../../components/game/ConfirmationPanel';
import { cardDescription, cardName, itemDescription, itemName } from '../../localize';

type Commit = (operation: (run: RunState) => RunState) => void;

function DeckPicker({
  run,
  pocketInstanceId,
  action,
  onCancel,
  onCommit,
}: {
  run: RunState;
  pocketInstanceId: string;
  action: PocketItemAction.DeckEdit | PocketItemAction.DuplicateDeck;
  onCancel: () => void;
  onCommit: Commit;
}) {
  const { t } = useTranslation();
  const initial =
    action === PocketItemAction.DeckEdit ? run.player.deck.slice(0, 30).map((card) => card.instanceId) : [];
  const [selected, setSelected] = useState<string[]>(initial);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const limit = action === PocketItemAction.DeckEdit ? 30 : Number.POSITIVE_INFINITY;
  const toggle = (instanceId: string) => {
    setSelected((current) => {
      if (current.includes(instanceId)) return current.filter((id) => id !== instanceId);
      return current.length < limit ? [...current, instanceId] : current;
    });
  };
  const title = action === PocketItemAction.DeckEdit ? t('pocket.travelTitle') : t('pocket.diplopiaTitle');
  const hint =
    action === PocketItemAction.DeckEdit
      ? t('pocket.travelHint', { count: selected.length })
      : t('pocket.diplopiaHint', { count: selected.length });

  return (
    <div className="pocket-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="pocket-deck-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>{t('pocket.deckWorkshop')}</span>
            <h2>{title}</h2>
            <p>{hint}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label={t('confirmation.close')}>
            ×
          </button>
        </header>
        <div className="pocket-deck-grid">
          {run.player.deck.map((instance) => {
            const card = CARDS[instance.definitionId];
            if (!card) return null;
            const active = selectedSet.has(instance.instanceId);
            return (
              <button
                type="button"
                key={instance.instanceId}
                className={active ? 'selected' : ''}
                onClick={() => toggle(instance.instanceId)}
                title={cardDescription(t, card.id)}
              >
                <span>{card.icon}</span>
                <b>{cardName(t, card.id)}</b>
                <small>{t('pocket.cardCost', { cost: card.cost })}</small>
                <i>{active ? '✓' : '+'}</i>
              </button>
            );
          })}
        </div>
        <footer>
          <button type="button" className="text-button" onClick={onCancel}>
            {t('confirmation.cancel')}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={action === PocketItemAction.DuplicateDeck && selected.length === 0}
            onClick={() => {
              onCommit((state) => applyPocketItem(state, pocketInstanceId, selected));
              onCancel();
            }}
          >
            {t('pocket.confirmUse', { count: selected.length })}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function PocketItemBar({ run, commit }: { run: RunState; commit: Commit }) {
  const { t } = useTranslation();
  const [deckPicker, setDeckPicker] = useState<{
    instanceId: string;
    action: PocketItemAction.DeckEdit | PocketItemAction.DuplicateDeck;
  }>();
  const [confirmationId, setConfirmationId] = useState<string>();
  const confirmation = confirmationId
    ? run.player.pocketItems.find((entry) => entry.instanceId === confirmationId)
    : undefined;
  const confirmationItem = confirmation ? ITEMS[confirmation.itemId] : undefined;

  const requestUse = (instanceId: string) => {
    const pocket = run.player.pocketItems.find((entry) => entry.instanceId === instanceId);
    const item = pocket ? ITEMS[pocket.itemId] : undefined;
    if (!item?.pocketAction) return;
    if (
      item.pocketAction === PocketItemAction.DeckEdit ||
      item.pocketAction === PocketItemAction.DuplicateDeck
    ) {
      setDeckPicker({ instanceId, action: item.pocketAction });
      return;
    }
    setConfirmationId(instanceId);
  };

  return (
    <>
      <aside className="pocket-item-bar" aria-label={t('pocket.title')}>
        <span>{t('pocket.title')}</span>
        <div>
          {Array.from({ length: run.player.pocketItemSlots }, (_, index) => {
            const pocket = run.player.pocketItems[index];
            const item = pocket ? ITEMS[pocket.itemId] : undefined;
            const floorSpent = Boolean(
              pocket && item?.timing === ItemUseTiming.FloorOnce && pocket.lastUsedFloor === run.floorIndex,
            );
            return item && pocket ? (
              <button
                type="button"
                key={pocket.instanceId}
                className={floorSpent ? 'spent' : ''}
                disabled={floorSpent}
                onClick={() => requestUse(pocket.instanceId)}
                title={`${itemName(t, item.id)}：${itemDescription(t, item.id)}`}
              >
                <b>{item.icon}</b>
                <small>{itemName(t, item.id)}</small>
                <i>{floorSpent ? t('pocket.usedThisFloor') : t(`pocket.timing.${item.timing}`)}</i>
              </button>
            ) : (
              <span className="pocket-empty" key={`empty-${index}`}>
                <b>＋</b>
                <small>{t('pocket.empty')}</small>
              </span>
            );
          })}
        </div>
      </aside>

      {deckPicker && (
        <DeckPicker
          run={run}
          pocketInstanceId={deckPicker.instanceId}
          action={deckPicker.action}
          onCancel={() => setDeckPicker(undefined)}
          onCommit={commit}
        />
      )}
      {confirmation && confirmationItem && (
        <ConfirmationPanel
          eyebrow={t('pocket.confirmEyebrow')}
          title={itemName(t, confirmationItem.id)}
          message={itemDescription(t, confirmationItem.id)}
          items={[
            {
              icon: confirmationItem.icon,
              name: itemName(t, confirmationItem.id),
              note: t(`pocket.timing.${confirmationItem.timing}`),
            },
          ]}
          confirmLabel={t('pocket.use')}
          onCancel={() => setConfirmationId(undefined)}
          onConfirm={() => {
            commit((state) => applyPocketItem(state, confirmation.instanceId));
            setConfirmationId(undefined);
          }}
        />
      )}
    </>
  );
}
