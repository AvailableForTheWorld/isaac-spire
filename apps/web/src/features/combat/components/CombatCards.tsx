import { type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CARDS,
  ITEMS,
  canPlayCard,
  canPlayFusedAttack,
  getAttackFusionMaterialIds,
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
  mode: 'play' | 'discard';
  index: number;
  animating: boolean;
  targeting: boolean;
  locked: boolean;
  onPlay: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const definition = CARDS[instance.definitionId];
  if (!definition) return null;
  const directPlayable = canPlayCard(run, instance.instanceId);
  const fusionStarter =
    definition.type === 'attack'
      ? getAttackFusionMaterialIds(run, instance.instanceId).find(
          (id) => canPlayFusedAttack(run, instance.instanceId, [id]).ok,
        )
      : undefined;
  const playable = directPlayable.ok || fusionStarter ? { ok: true } : directPlayable;
  const cooldown = run.combat?.cooldowns[instance.instanceId] ?? 0;
  const isSkill = definition.type === 'skill';
  const item = definition.itemId
    ? ITEMS[definition.itemId]
    : Object.values(ITEMS).find((entry) => entry.skillCardId === definition.id);
  const maxCharge = isSkill && item ? Math.max(1, (item.chargeRounds ?? 3) - (instance.upgraded ? 1 : 0)) : 0;
  const charge = Math.max(0, maxCharge - cooldown);
  const disabled = locked || (mode === 'play' ? !playable.ok : false);
  return (
    <button
      className={`game-card ${definition.type} ${instance.upgraded ? 'upgraded' : ''} ${targeting ? 'targeting' : ''} ${animating ? (mode === 'discard' ? 'discarding-out' : 'playing-out') : ''}`}
      style={{ '--card-index': index } as CSSProperties}
      disabled={disabled}
      onClick={mode === 'play' ? onPlay : onDiscard}
      title={disabled && playable.reason ? errorText(t, playable.reason) : cardDescription(t, definition.id)}
    >
      <span className="card-cost">{definition.cost}</span>
      <span className="card-type">{cardTypeName(t, definition.type)}</span>
      {item && (
        <span className={`card-quality quality-${item.quality}`}>
          {t('choice.quality', { quality: item.quality })}
        </span>
      )}
      <b className="card-icon">{definition.icon}</b>
      <strong>
        {cardName(t, definition.id)}
        {instance.upgraded ? '+' : ''}
      </strong>
      <p>{cardDescription(t, definition.id)}</p>
      {isSkill && (
        <small>
          {cooldown > 0 ? t('combat.recharging', { rounds: cooldown }) : t('combat.activeRetained')}
        </small>
      )}
      {isSkill && mode === 'discard' && (
        <small className="active-loss">{t('combat.activeDiscardWarning')}</small>
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
  pile: 'draw' | 'discard';
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ids = run.combat?.[pile === 'draw' ? 'drawPile' : 'discardPile'] ?? [];
  const cards = ids
    .map((id) => run.player.deck.find((card) => card.instanceId === id))
    .filter((card): card is CardInstance => Boolean(card));
  return (
    <div className="pile-backdrop" role="presentation" onClick={onClose}>
      <section
        className="pile-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={t(pile === 'draw' ? 'combat.drawPileTitle' : 'combat.discardPileTitle', {
          count: cards.length,
        })}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>{t('combat.pileInspect')}</span>
            <h2>
              {t(pile === 'draw' ? 'combat.drawPileTitle' : 'combat.discardPileTitle', {
                count: cards.length,
              })}
            </h2>
          </div>
          <button onClick={onClose} aria-label={t('combat.closePile')}>
            ×
          </button>
        </header>
        <p>{t(pile === 'draw' ? 'combat.drawPileHint' : 'combat.discardPileHint')}</p>
        <div className="pile-card-grid">
          {cards.map((instance, index) => {
            const definition = CARDS[instance.definitionId];
            return definition ? (
              <article className={`pile-card ${definition.type}`} key={instance.instanceId}>
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

export function CombatItemRail({ run }: { run: RunState }) {
  const { t } = useTranslation();
  const passives = run.player.items.filter((id) => ITEMS[id]?.kind === 'passive');
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
