import { useTranslation } from 'react-i18next';
import {
  CARDS,
  CardType,
  ITEMS,
  canPlayFusedAttack,
  getAttackFusionMaterialIds,
  getAttackFusionPreview,
  type CardInstance,
  type RunState,
} from '@isaac-spire/game';
import { cardName, itemName } from '../../../localize';

export function FusionAttackModal({
  run,
  attackInstanceId,
  selectedItemIds,
  onToggle,
  onCancel,
  onConfirm,
}: {
  run: RunState;
  attackInstanceId: string;
  selectedItemIds: string[];
  onToggle: (instanceId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const attack = run.player.deck.find((card) => card.instanceId === attackInstanceId);
  const attackDefinition = attack ? CARDS[attack.definitionId] : undefined;
  const compatible = getAttackFusionMaterialIds(run, attackInstanceId)
    .map((id) => run.player.deck.find((card) => card.instanceId === id))
    .filter((card): card is CardInstance => Boolean(card))
    .map((card) => ({ card, definition: CARDS[card.definitionId] }))
    .filter(
      ({ definition }) =>
        definition?.type === CardType.Item && Boolean(definition.itemId && ITEMS[definition.itemId]?.fusion),
    );
  const preview = getAttackFusionPreview(run, attackInstanceId, selectedItemIds);
  const playable = canPlayFusedAttack(run, attackInstanceId, selectedItemIds);
  if (!attackDefinition || !preview) return null;
  const summary = [
    preview.damageMultiplier !== 1
      ? t('fusion.damage', { value: preview.damageMultiplier.toFixed(2) })
      : undefined,
    preview.flatDamage ? t('fusion.flatDamage', { value: preview.flatDamage }) : undefined,
    preview.projectileScale !== 1
      ? t('fusion.size', { value: preview.projectileScale.toFixed(2) })
      : undefined,
    preview.knockback ? t('fusion.knockback', { value: preview.knockback }) : undefined,
    preview.poisonTurns
      ? t('fusion.poison', { turns: preview.poisonTurns, damage: preview.poisonDamage })
      : undefined,
    preview.slowTurns ? t('fusion.slow', { turns: preview.slowTurns }) : undefined,
    preview.curvedShots ? t('fusion.homing') : undefined,
    preview.attackMode ? t('fusion.form', { form: t(`attackModes.${preview.attackMode}`) }) : undefined,
  ].filter((value): value is string => Boolean(value));
  return (
    <div className="fusion-backdrop" role="presentation">
      <section className="fusion-modal" role="dialog" aria-modal="true" aria-label={t('fusion.title')}>
        <header>
          <div>
            <span>{t('fusion.kicker')}</span>
            <h2>{t('fusion.title')}</h2>
            <p>{t('fusion.description')}</p>
          </div>
          <button onClick={onCancel} aria-label={t('fusion.cancel')}>
            ×
          </button>
        </header>
        <div className="fusion-equation">
          <article>
            <b>{attackDefinition.icon}</b>
            <span>{cardName(t, attackDefinition.id)}</span>
            <small>
              {attackDefinition.cost} {t('fusion.stamina')}
            </small>
          </article>
          <strong>＋</strong>
          <div className="fusion-slots">
            {selectedItemIds.map((id) => {
              const card = run.player.deck.find((entry) => entry.instanceId === id);
              const definition = card ? CARDS[card.definitionId] : undefined;
              return definition ? (
                <button key={id} onClick={() => onToggle(id)} title={t('fusion.remove')}>
                  <b>{definition.icon}</b>
                  <span>{cardName(t, definition.id)}</span>
                </button>
              ) : null;
            })}
            {!selectedItemIds.length && <em>{t('fusion.noSelection')}</em>}
          </div>
        </div>
        <div className="fusion-items">
          {compatible.map(({ card, definition }) => {
            if (!definition?.itemId) return null;
            const item = ITEMS[definition.itemId]!;
            const selected = selectedItemIds.includes(card.instanceId);
            return (
              <button
                key={card.instanceId}
                className={selected ? 'selected' : ''}
                aria-pressed={selected}
                onClick={() => onToggle(card.instanceId)}
              >
                <b>{item.icon}</b>
                <span>
                  <strong>{itemName(t, item.id)}</strong>
                  <small>
                    {t('choice.quality', { quality: item.quality })} · {t('fusion.free')}
                  </small>
                </span>
                <em>{t(`fusion.items.${item.id}`)}</em>
              </button>
            );
          })}
          {!compatible.length && <div className="fusion-empty">{t('fusion.empty')}</div>}
        </div>
        <div className="fusion-summary">
          <div>
            {summary.length ? (
              summary.map((entry) => <span key={entry}>{entry}</span>)
            ) : (
              <span>{t('fusion.basic')}</span>
            )}
          </div>
          <strong>
            {t('fusion.total', {
              cost: preview.totalCost,
              remaining: (run.combat?.vitality ?? 0) - preview.totalCost,
            })}
          </strong>
        </div>
        <footer>
          <button className="text-button" onClick={onCancel}>
            {t('fusion.cancel')}
          </button>
          <button className="primary-button" disabled={!playable.ok} onClick={onConfirm}>
            {selectedItemIds.length ? t('fusion.confirm') : t('fusion.direct')} <span>→</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
