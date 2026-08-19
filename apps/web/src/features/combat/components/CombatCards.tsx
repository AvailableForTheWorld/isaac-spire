import { type CSSProperties, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CardType,
  CombatSelectionKind,
  ITEMS,
  ItemKind,
  StatusKind,
  canPlayCard,
  canPlayFusedAttack,
  getAttackFusionMaterialIds,
  getCardDefinition,
  type CardInstance,
  type RunState,
} from '@isaac-spire/game';
import {
  cardDescription,
  cardName,
  cardTypeName,
  errorText,
  itemDescription,
  itemName,
} from '../../../localize';
import { cardAppearanceClass, itemForCard } from '../../cards/cardAppearance';
import { CombatCardMode, CombatPileKind } from '../combat-ui.enums';

export function CardView({
  run,
  instance,
  mode,
  index,
  animating,
  targeting,
  locked,
  onPlay,
  onDiscard,
}: {
  run: RunState;
  instance: CardInstance;
  mode: CombatCardMode;
  index: number;
  animating: boolean;
  targeting: boolean;
  locked: boolean;
  onPlay: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const definition = getCardDefinition(run, instance.instanceId);
  if (!definition) return null;
  const blinded =
    mode === CombatCardMode.Play && (run.combat?.playerStatuses[StatusKind.Blind] ?? 0) > 0 && !targeting;
  const directPlayable = canPlayCard(run, instance.instanceId);
  const fusionStarter =
    definition.type === CardType.Attack
      ? getAttackFusionMaterialIds(run, instance.instanceId).find(
          (id) => canPlayFusedAttack(run, instance.instanceId, [id]).ok,
        )
      : undefined;
  const playable = directPlayable.ok || fusionStarter ? { ok: true } : directPlayable;
  const cooldown = run.combat?.cooldowns[instance.instanceId] ?? 0;
  const isSkill = definition.type === CardType.Skill;
  const item = itemForCard(definition);
  const maxCharge = isSkill && item ? Math.max(1, (item.chargeRounds ?? 3) - (instance.upgraded ? 1 : 0)) : 0;
  const charge = Math.max(0, maxCharge - cooldown);
  const disabled = locked || (mode === CombatCardMode.Play ? !playable.ok : false);
  return (
    <button
      className={`game-card ${definition.type} ${cardAppearanceClass(definition, item)} ${instance.upgraded ? 'upgraded' : ''} ${targeting ? 'targeting' : ''} ${animating ? (mode === CombatCardMode.Discard ? 'discarding-out' : 'playing-out') : ''}`}
      style={{ '--card-index': index } as CSSProperties}
      disabled={disabled}
      onClick={mode === CombatCardMode.Play ? onPlay : onDiscard}
      title={disabled && playable.reason ? errorText(t, playable.reason) : cardDescription(t, definition.id)}
    >
      <span className="card-cost">{blinded ? '?' : definition.cost}</span>
      <span className="card-type">
        {blinded ? t('combat.blindedCard') : cardTypeName(t, definition.type)}
      </span>
      {item && (
        <span className={`card-quality quality-${item.quality}`}>
          {t('choice.quality', { quality: item.quality })}
        </span>
      )}
      <b className="card-icon">{blinded ? '？' : definition.icon}</b>
      <strong>
        {blinded ? t('combat.blindedCard') : cardName(t, definition.id)}
        {instance.upgraded ? '+' : ''}
      </strong>
      <p>{blinded ? t('combat.blindedCardHint') : cardDescription(t, definition.id)}</p>
      {isSkill && (
        <small>
          {cooldown > 0 ? t('combat.recharging', { rounds: cooldown }) : t('combat.activeRetained')}
        </small>
      )}
      {definition.exhaust && <small>{t('combat.oneOff')}</small>}
      {isSkill && item && (
        <div
          className={`charge-meter ${cooldown === 0 ? 'ready' : ''}`}
          role="progressbar"
          aria-label={t('combat.chargeProgress', { current: charge, max: maxCharge })}
          aria-valuemin={0}
          aria-valuemax={maxCharge}
          aria-valuenow={charge}
          title={t('combat.chargeProgress', { current: charge, max: maxCharge })}
        >
          <span className="charge-cells" style={{ '--charge-max': maxCharge } as CSSProperties}>
            {Array.from({ length: maxCharge }, (_, chargeIndex) => (
              <i key={chargeIndex} className={chargeIndex < charge ? 'filled' : ''} />
            ))}
          </span>
          <b>
            {charge}/{maxCharge}
          </b>
        </div>
      )}
    </button>
  );
}

export function PileViewer({
  run,
  pile,
  onClose,
}: {
  run: RunState;
  pile: CombatPileKind;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ids = run.combat?.[pile === CombatPileKind.Draw ? 'drawPile' : 'discardPile'] ?? [];
  const cards = ids
    .map((id) => run.player.deck.find((card) => card.instanceId === id))
    .filter((card): card is CardInstance => Boolean(card));
  return (
    <div className="pile-backdrop" role="presentation" onClick={onClose}>
      <section
        className="pile-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={t(pile === CombatPileKind.Draw ? 'combat.drawPileTitle' : 'combat.discardPileTitle', {
          count: cards.length,
        })}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>{t('combat.pileInspect')}</span>
            <h2>
              {t(pile === CombatPileKind.Draw ? 'combat.drawPileTitle' : 'combat.discardPileTitle', {
                count: cards.length,
              })}
            </h2>
          </div>
          <button onClick={onClose} aria-label={t('combat.closePile')}>
            ×
          </button>
        </header>
        <p>{t(pile === CombatPileKind.Draw ? 'combat.drawPileHint' : 'combat.discardPileHint')}</p>
        <div className="pile-card-grid">
          {cards.map((instance, index) => {
            const definition = getCardDefinition(run, instance.instanceId);
            const item = definition ? itemForCard(definition) : undefined;
            return definition ? (
              <article
                className={`pile-card ${definition.type} ${cardAppearanceClass(definition, item)}`}
                key={instance.instanceId}
              >
                <span>{index + 1}</span>
                <b>{definition.icon}</b>
                <strong>{cardName(t, definition.id)}</strong>
                <small>
                  {cardTypeName(t, definition.type)} · {definition.cost}
                </small>
                <p>{cardDescription(t, definition.id)}</p>
              </article>
            ) : null;
          })}
          {!cards.length && <div className="empty-pile">{t('combat.emptyPile')}</div>}
        </div>
      </section>
    </div>
  );
}

export function CombatCardSelectionModal({
  run,
  onResolve,
  onCancel,
}: {
  run: RunState;
  onResolve: (selectedIds: string[]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const pending = run.combat?.pendingSelection;
  const [selected, setSelected] = useState<string[]>([]);
  if (!pending) return null;
  const title =
    pending.kind === CombatSelectionKind.Draw
      ? t('combatSelection.drawTitle', { count: pending.max })
      : pending.kind === CombatSelectionKind.Transposition
        ? t('combatSelection.transpositionTitle')
        : t('combatSelection.blankTitle');
  const hint =
    pending.kind === CombatSelectionKind.Draw
      ? t('combatSelection.drawHint', { count: pending.max })
      : pending.kind === CombatSelectionKind.Transposition
        ? t('combatSelection.transpositionHint')
        : t('combatSelection.blankHint');
  const toggle = (instanceId: string) => {
    setSelected((current) => {
      if (current.includes(instanceId)) return current.filter((id) => id !== instanceId);
      if (pending.max === 1) return [instanceId];
      return current.length < pending.max ? [...current, instanceId] : current;
    });
  };
  return (
    <div className="pile-backdrop combat-selection-backdrop" role="presentation">
      <section
        className="pile-viewer combat-selection-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <span>{t('combatSelection.kicker')}</span>
            <h2>{title}</h2>
          </div>
          {pending.min === 0 && (
            <button type="button" onClick={onCancel} aria-label={t('confirmation.close')}>
              ×
            </button>
          )}
        </header>
        <p>{hint}</p>
        <div className="pile-card-grid selectable">
          {pending.candidateInstanceIds.map((instanceId) => {
            const definition = getCardDefinition(run, instanceId);
            if (!definition) return null;
            const item = itemForCard(definition);
            const active = selected.includes(instanceId);
            return (
              <button
                type="button"
                className={`pile-card ${definition.type} ${cardAppearanceClass(definition, item)} ${active ? 'selected' : ''}`}
                key={instanceId}
                onClick={() =>
                  pending.kind === CombatSelectionKind.Draw && pending.max === 1
                    ? onResolve([instanceId])
                    : toggle(instanceId)
                }
              >
                <b>{definition.icon}</b>
                <strong>{cardName(t, definition.id)}</strong>
                <small>
                  {cardTypeName(t, definition.type)} · {definition.cost}
                </small>
                <p>{cardDescription(t, definition.id)}</p>
                <i>{active ? '✓' : '+'}</i>
              </button>
            );
          })}
        </div>
        {!(pending.kind === CombatSelectionKind.Draw && pending.max === 1) && (
          <footer>
            {pending.min === 0 && (
              <button type="button" className="text-button" onClick={onCancel}>
                {t('confirmation.cancel')}
              </button>
            )}
            <button
              type="button"
              className="primary-button"
              disabled={selected.length < pending.min || selected.length > pending.max}
              onClick={() => onResolve(selected)}
            >
              {t('combatSelection.confirm', { count: selected.length })}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

export function CombatItemRail({ run }: { run: RunState }) {
  const { t } = useTranslation();
  const passives = run.player.items.filter((id) => ITEMS[id]?.kind === ItemKind.Passive);
  return (
    <aside className="combat-item-rail" aria-label={t('combat.passiveItems')}>
      <strong>{t('combat.passiveItems')}</strong>
      <div>
        {passives.map((id) => (
          <span key={id} title={`${itemName(t, id)}：${itemDescription(t, id)}`}>
            <b>{ITEMS[id]?.icon ?? '?'}</b>
            <small>{itemName(t, id)}</small>
          </span>
        ))}
        {!passives.length && <em>{t('combat.noPassiveItems')}</em>}
      </div>
    </aside>
  );
}
