import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CardTarget,
  CardType,
  IntentKind,
  RoomKind,
  RunPhase,
  StatusKind,
  canPlayCard,
  canPlayFusedAttack,
  confirmPlayerDeployment,
  discardCard,
  endTurn,
  finishDiscard,
  getAttackFusionMaterialIds,
  getCardDefinition,
  getEnemyMovementSpeed,
  getPlayerAttackRange,
  getPlayerMovementSpeed,
  isEnemyInPlayerRange,
  isPlayerInEnemyVision,
  movePlayer,
  placePlayerForDeployment,
  playCard,
  playFusedAttack,
  resolveCombatSelection,
  cancelCombatSelection,
  useCombatBomb as deployCombatBomb,
  type CardInstance,
  type EnemyIntent,
  type RunState,
} from '@isaac-spire/game';
import { HeartMeter } from '../../components/game/HeartMeter';
import { cardName, enemyName, floorBoss, intentLabel, logText, roomName } from '../../localize';

const PhaserStage = lazy(() =>
  import('../../phaser/PhaserStage').then((module) => ({ default: module.PhaserStage })),
);
import { CombatCardSelectionModal, CombatItemRail, CardView, PileViewer } from './components/CombatCards';
import { FusionAttackModal } from './components/FusionAttackModal';
import { TargetingGuide } from './components/TargetingGuide';
import { CombatCardMode, CombatPileKind } from './combat-ui.enums';

function enemyIntentIcon(kind: EnemyIntent['kind']): string {
  return kind === IntentKind.Attack
    ? '⚔'
    : kind === IntentKind.Shield
      ? '⬡'
      : kind === IntentKind.Curse
        ? '☠'
        : kind === IntentKind.Heal
          ? '♥'
          : kind === IntentKind.Prepare
            ? '!'
            : kind === IntentKind.Summon
              ? '♟'
              : '…';
}
export function CombatView({
  run,
  commit,
}: {
  run: RunState;
  commit: (action: (state: RunState) => RunState) => void;
}) {
  const { t } = useTranslation();
  const [animatingCardId, setAnimatingCardId] = useState<string>();
  const [animationLocked, setAnimationLocked] = useState(false);
  const [viewingPile, setViewingPile] = useState<CombatPileKind>();
  const [targetingCardId, setTargetingCardId] = useState<string>();
  const [fusionAttackId, setFusionAttackId] = useState<string>();
  const [fusionItemIds, setFusionItemIds] = useState<string[]>([]);
  const [pendingFusionItemIds, setPendingFusionItemIds] = useState<string[]>([]);
  const [hoveredTargetId, setHoveredTargetId] = useState<string>();
  const [bombTargeting, setBombTargeting] = useState(false);
  const combat = run.combat!;
  const deploymentPending = Boolean(combat.deploymentPending);
  const discardMode = run.phase === RunPhase.Discard;
  const handCards = combat.hand
    .map((id) => run.player.deck.find((card) => card.instanceId === id))
    .filter((card): card is CardInstance => Boolean(card));
  const selected = combat.enemies.find((enemy) => enemy.instanceId === combat.selectedEnemyId);
  const targetingCard = targetingCardId
    ? run.player.deck.find((card) => card.instanceId === targetingCardId)
    : undefined;
  const targetingDefinition = targetingCard ? getCardDefinition(run, targetingCard.instanceId) : undefined;
  const hoveredTarget = hoveredTargetId
    ? combat.enemies.find((enemy) => enemy.instanceId === hoveredTargetId)
    : undefined;
  const discardable = handCards;
  const cardsToDiscard = combat.ragnarokActive
    ? 0
    : Math.max(0, handCards.length - run.player.stats.maxRetain);
  useEffect(() => {
    if (targetingCardId && (discardMode || !combat.hand.includes(targetingCardId))) {
      setTargetingCardId(undefined);
      setPendingFusionItemIds([]);
      setHoveredTargetId(undefined);
    }
    if (fusionAttackId && (discardMode || !combat.hand.includes(fusionAttackId))) {
      setFusionAttackId(undefined);
      setFusionItemIds([]);
    }
  }, [combat.hand, discardMode, fusionAttackId, targetingCardId]);
  useEffect(() => {
    if (!targetingCardId) return;
    const clearTargeting = () => {
      setTargetingCardId(undefined);
      setPendingFusionItemIds([]);
      setHoveredTargetId(undefined);
    };
    const cancelTargetingWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      clearTargeting();
    };
    const cancelTargetingOutsideTarget = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : undefined;
      if (target?.closest('.game-card.targeting, .enemy-panel.targetable')) return;
      clearTargeting();
    };
    window.addEventListener('keydown', cancelTargetingWithKeyboard);
    window.addEventListener('pointerdown', cancelTargetingOutsideTarget, true);
    return () => {
      window.removeEventListener('keydown', cancelTargetingWithKeyboard);
      window.removeEventListener('pointerdown', cancelTargetingOutsideTarget, true);
    };
  }, [targetingCardId]);
  useEffect(() => {
    if (discardMode || deploymentPending || run.player.bombs < 1) setBombTargeting(false);
  }, [deploymentPending, discardMode, run.player.bombs]);
  useEffect(() => {
    if (!bombTargeting) return;
    const cancelBombWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBombTargeting(false);
    };
    window.addEventListener('keydown', cancelBombWithKeyboard);
    return () => window.removeEventListener('keydown', cancelBombWithKeyboard);
  }, [bombTargeting]);
  const animateCardAction = (instanceId: string, action: (state: RunState) => RunState) => {
    if (animatingCardId || animationLocked) return;
    setAnimatingCardId(instanceId);
    window.setTimeout(() => {
      commit(action);
      setAnimatingCardId(undefined);
    }, 220);
  };
  const discardAllCards = () => {
    commit((state) => {
      let next = state;
      const ids = [...(next.combat?.hand ?? [])];
      for (const id of ids) next = discardCard(next, id);
      return next;
    });
  };
  return (
    <main
      className={`combat-page ${targetingCardId ? 'targeting-active' : ''} ${bombTargeting ? 'bomb-targeting-active' : ''}`}
    >
      <section className="combat-arena-layout">
        <aside className="combat-side-hud">
          <div className="combat-heading">
            <p className="eyebrow">{t('combat.room', { room: roomName(t, combat.roomKind) })}</p>
            <h1>
              {deploymentPending
                ? t('combat.deploymentTitle')
                : combat.roomKind === RoomKind.Boss
                  ? floorBoss(t, run.floorIndex)
                  : t('combat.round', { round: combat.round })}
            </h1>
          </div>
          <div className="combat-player-hud">
            <span className="hud-name">{t('stats.character')}</span>
            <HeartMeter
              run={run}
              shield={combat.playerShield}
              armor={run.player.stats.armor + combat.playerArmorBuff}
            />
            <div className="tactical-stats">
              <span>◎ {t('combat.range', { value: getPlayerAttackRange(run) })}</span>
              <span>↝ {t('combat.moveSpeed', { value: getPlayerMovementSpeed(run) })}</span>
              <span>
                ⌖ ({combat.playerPosition?.x ?? 0},{combat.playerPosition?.y ?? 4})
              </span>
            </div>
            <div className="combat-status-list">
              {Object.entries(combat.playerStatuses)
                .filter(([, turns]) => (turns ?? 0) > 0)
                .map(([status, turns]) => (
                  <span key={status}>{t(`statuses.${status}`, { turns })}</span>
                ))}
              {combat.damoclesActive && !combat.damoclesFallen && <span>{t('statuses.damocles')}</span>}
              {combat.ragnarokActive && <span>{t('statuses.ragnarok')}</span>}
              {combat.unlimitedVitalityTurns > 0 && (
                <span>{t('statuses.stimulant', { turns: combat.unlimitedVitalityTurns })}</span>
              )}
            </div>
          </div>
          <div className="hud-vitality-block">
            <span>{t('combat.vitalityLabel')}</span>
            <div className="vitality-orbs" title={t('combat.vitalityHint')}>
              {Array.from({ length: run.player.stats.maxVitality }, (_, index) => (
                <i key={index} className={index < combat.vitality ? 'full' : ''} />
              ))}
              <strong>{t('combat.vitality', { value: combat.vitality })}</strong>
            </div>
          </div>
          <div className="combat-log">
            {combat.log.slice(0, 4).map((entry) => (
              <p className={entry.tone} key={entry.id}>
                {logText(t, run, entry.message, entry.messageKey, entry.params)}
              </p>
            ))}
          </div>
        </aside>
        <div className={`combat-stage-stack ${deploymentPending ? 'deploying' : ''}`}>
          <Suspense fallback={<div className="phaser-stage stage-loading">{t('combat.preparing')}</div>}>
            <PhaserStage
              run={run}
              onAnimationStateChange={setAnimationLocked}
              highlightedEnemyId={targetingCardId ? hoveredTargetId : undefined}
              bombTargeting={bombTargeting}
              movementDisabled={animationLocked || discardMode || deploymentPending || bombTargeting}
              onMove={(x, y) => commit((state) => movePlayer(state, x, y))}
              onDeploy={(x, y) => commit((state) => placePlayerForDeployment(state, x, y))}
              onBomb={(x, y) => {
                setBombTargeting(false);
                commit((state) => deployCombatBomb(state, x, y));
              }}
            />
          </Suspense>
          {deploymentPending && (
            <div className="deployment-panel" role="status">
              <span>{t('combat.deploymentKicker')}</span>
              <strong>{t('combat.deploymentPrompt')}</strong>
              <p>{t('combat.deploymentHint')}</p>
              <small>
                ⌖ ({combat.playerPosition.x},{combat.playerPosition.y})
              </small>
              <button className="primary-button" onClick={() => commit(confirmPlayerDeployment)}>
                {t('combat.confirmDeployment')} <b>→</b>
              </button>
            </div>
          )}
          {targetingCardId && (
            <div className="targeting-instruction">
              <span>↗</span>
              <div>
                <strong>{t('combat.targetGuideTitle')}</strong>
                <small>{t('combat.targetGuideHint')}</small>
              </div>
            </div>
          )}
          {bombTargeting && (
            <div className="targeting-instruction bomb-targeting-instruction">
              <span>●</span>
              <div>
                <strong>{t('combat.bombTargetTitle')}</strong>
                <small>{t('combat.bombTargetHint')}</small>
              </div>
              <button className="target-cancel" onClick={() => setBombTargeting(false)}>
                {t('combat.cancelBomb')}
              </button>
            </div>
          )}
          <div
            className={`enemy-strip ${targetingCardId ? 'targeting' : ''} ${combat.enemies.filter((enemy) => enemy.hp > 0).length > 3 ? 'crowded' : ''}`}
          >
            {combat.enemies.map((enemy, enemyIndex) => {
              const intendedActions = enemy.intent.actions?.length
                ? enemy.intent.actions
                : [{ kind: enemy.intent.kind, value: enemy.intent.value }];
              const intendedAttacks = intendedActions.filter((entry) => entry.kind === IntentKind.Attack);
              const weakenedActions = Array.from({ length: enemy.boss ? 2 : 1 }, (_, index) => ({
                kind: IntentKind.Attack,
                value: Math.max(
                  1,
                  Math.round(
                    (intendedAttacks[index]?.value ?? intendedAttacks[0]?.value ?? enemy.attack) * 0.6,
                  ),
                ),
              }));
              const shownIntent: EnemyIntent =
                (enemy.staggeredTurns ?? 0) > 0
                  ? {
                      kind: IntentKind.Idle,
                      value: 0,
                      label: '',
                      actions: [{ kind: IntentKind.Idle, value: 0 }],
                    }
                  : enemy.cursedTurns > 0
                    ? {
                        kind: IntentKind.Attack,
                        value: weakenedActions[0]!.value,
                        label: '',
                        actions: weakenedActions,
                      }
                    : enemy.intent;
              const shownActions = shownIntent.actions?.length
                ? shownIntent.actions
                : [{ kind: shownIntent.kind, value: shownIntent.value }];
              const inRange = isEnemyInPlayerRange(run, enemy.instanceId);
              const seesPlayer = isPlayerInEnemyVision(run, enemy.instanceId);
              const enemyMoveSpeed = getEnemyMovementSpeed(enemy);
              const duplicateEnemies = combat.enemies.filter(
                (entry) => entry.hp > 0 && entry.id === enemy.id,
              );
              const duplicateIndex = combat.enemies
                .slice(0, enemyIndex + 1)
                .filter((entry) => entry.hp > 0 && entry.id === enemy.id).length;
              const identityNumber = duplicateEnemies.length > 1 ? duplicateIndex : undefined;
              const targetable = Boolean(
                targetingCardId &&
                (targetingDefinition?.type === CardType.Attack
                  ? pendingFusionItemIds.length
                    ? canPlayFusedAttack(run, targetingCardId, pendingFusionItemIds, enemy.instanceId).ok
                    : canPlayCard(run, targetingCardId, enemy.instanceId).ok
                  : canPlayCard(run, targetingCardId, enemy.instanceId).ok),
              );
              return (
                <button
                  key={enemy.instanceId}
                  data-enemy-instance-id={enemy.instanceId}
                  disabled={!targetable}
                  className={`enemy-panel ${selected?.instanceId === enemy.instanceId ? 'selected' : ''} ${targetable ? 'targetable' : ''} ${hoveredTargetId === enemy.instanceId ? 'aimed' : ''} ${enemy.hp <= 0 ? 'dead' : ''} ${inRange ? 'in-range' : 'out-of-range'}`}
                  onPointerEnter={() => {
                    if (targetable) setHoveredTargetId(enemy.instanceId);
                  }}
                  onPointerLeave={() =>
                    setHoveredTargetId((current) => (current === enemy.instanceId ? undefined : current))
                  }
                  onFocus={() => {
                    if (targetable) setHoveredTargetId(enemy.instanceId);
                  }}
                  onBlur={() =>
                    setHoveredTargetId((current) => (current === enemy.instanceId ? undefined : current))
                  }
                  onClick={() => {
                    if (!targetingCardId || !targetable) return;
                    const cardId = targetingCardId;
                    const fusedIds = [...pendingFusionItemIds];
                    setTargetingCardId(undefined);
                    setPendingFusionItemIds([]);
                    setHoveredTargetId(undefined);
                    animateCardAction(cardId, (state) =>
                      targetingDefinition?.type === CardType.Attack
                        ? fusedIds.length
                          ? playFusedAttack(state, cardId, fusedIds, enemy.instanceId)
                          : playCard(state, cardId, enemy.instanceId)
                        : playCard(state, cardId, enemy.instanceId),
                    );
                  }}
                >
                  {targetable && (
                    <span className="targeting-marker">
                      {hoveredTargetId === enemy.instanceId
                        ? t('combat.targetReady')
                        : t('combat.targetAvailable')}
                    </span>
                  )}
                  <span className={`intent ${shownIntent.kind}`}>
                    <span className="intent-movement">
                      ↝ {t('combat.enemyMoveAction', { value: enemyMoveSpeed })}
                    </span>
                    {enemy.boss && <b className="boss-action-count">{t('combat.bossDoubleAction')}</b>}
                    <span className="intent-actions">
                      {shownActions.map((entry, index) => (
                        <span className={`intent-action ${entry.kind}`} key={`${entry.kind}-${index}`}>
                          {enemy.boss && <b>{index + 1}</b>}
                          {enemyIntentIcon(entry.kind)} {intentLabel(t, { ...entry, label: '' })}
                        </span>
                      ))}
                    </span>
                  </span>
                  <strong>
                    {enemyName(t, enemy)}
                    {identityNumber && <b className="enemy-identity">#{identityNumber}</b>}
                  </strong>
                  <span>
                    {enemy.hp}/{enemy.maxHp} {t('combat.hp')} · {enemy.armor} {t('combat.armor')}{' '}
                    {enemy.shield ? `· ${enemy.shield} ${t('combat.shield')}` : ''}
                  </span>
                  <span className="enemy-grid-stats">
                    ⌖ ({enemy.position?.x ?? 15},{enemy.position?.y ?? 4}) · {enemy.footprintWidth}×
                    {enemy.footprintHeight} · ◎ {enemy.attackRange ?? 1} · ◉{' '}
                    {t('combat.vision', { value: enemy.visionRange })} · ↝ {enemyMoveSpeed}
                  </span>
                  <span
                    className={`enemy-awareness ${enemy.alerted || seesPlayer ? 'alerted' : 'wandering'}`}
                  >
                    {enemy.alerted
                      ? t('combat.enemyAlerted')
                      : seesPlayer
                        ? t('combat.enemyWatching')
                        : t('combat.enemyWandering')}{' '}
                    · {inRange ? t('combat.inRange') : t('combat.outOfRange')}
                  </span>
                  {enemy.cursedTurns > 0 && <em>{t('combat.weakened', { turns: enemy.cursedTurns })}</em>}
                  {(enemy.staggeredTurns ?? 0) > 0 && <em>{t('combat.staggered')}</em>}
                  {(enemy.poisonTurns ?? 0) > 0 && (
                    <em className="poisoned">
                      {t('combat.poisoned', { turns: enemy.poisonTurns, damage: enemy.poisonDamage })}
                    </em>
                  )}
                  {(enemy.slowedTurns ?? 0) > 0 && (
                    <em className="slowed">{t('combat.slowed', { turns: enemy.slowedTurns })}</em>
                  )}
                  {Object.entries(enemy.statuses)
                    .filter(([, turns]) => (turns ?? 0) > 0)
                    .filter(([status]) => status !== StatusKind.Poison)
                    .map(([status, turns]) => (
                      <em className="adapted-status" key={status}>
                        {t(`statuses.${status}`, { turns })}
                      </em>
                    ))}
                </button>
              );
            })}
          </div>
        </div>
      </section>
      <section className={`hand-zone ${discardMode ? 'discarding' : ''}`}>
        <div className="hand-heading">
          <div>
            <span className="eyebrow">
              {t('combat.hand', { count: handCards.length, max: run.player.stats.drawCount })}
            </span>
            <strong>
              {deploymentPending ? (
                t('combat.cardsLockedDuringDeployment')
              ) : discardMode ? (
                t('combat.discardPrompt', { count: run.player.stats.maxRetain })
              ) : targetingDefinition ? (
                <>
                  {t('combat.chooseCardTarget', { card: cardName(t, targetingDefinition.id) })}{' '}
                  <button
                    className="target-cancel"
                    onClick={() => {
                      setTargetingCardId(undefined);
                      setPendingFusionItemIds([]);
                      setHoveredTargetId(undefined);
                    }}
                  >
                    {t('fusion.cancelTarget')}
                  </button>
                </>
              ) : (
                t('combat.chooseCard')
              )}
            </strong>
          </div>
          <div className="pile-counts">
            <button onClick={() => setViewingPile(CombatPileKind.Draw)}>
              {t('combat.draw', { count: combat.drawPile.length })}
            </button>
            <button onClick={() => setViewingPile(CombatPileKind.Discard)}>
              {t('combat.discard', { count: combat.discardPile.length })}
            </button>
            <span>{t('combat.deck', { count: run.player.deck.length })}</span>
          </div>
        </div>
        <div className="card-hand">
          {handCards.map((instance, index) => (
            <CardView
              key={instance.instanceId}
              run={run}
              instance={instance}
              mode={discardMode ? CombatCardMode.Discard : CombatCardMode.Play}
              index={index}
              animating={animatingCardId === instance.instanceId}
              targeting={targetingCardId === instance.instanceId}
              locked={
                deploymentPending ||
                bombTargeting ||
                Boolean(animatingCardId) ||
                animationLocked ||
                Boolean(combat.pendingSelection)
              }
              onPlay={() => {
                const definition = getCardDefinition(run, instance.instanceId);
                if (definition?.type === CardType.Attack) {
                  if (targetingCardId === instance.instanceId) {
                    setTargetingCardId(undefined);
                    setPendingFusionItemIds([]);
                    setHoveredTargetId(undefined);
                    return;
                  }
                  setTargetingCardId(undefined);
                  setPendingFusionItemIds([]);
                  if (getAttackFusionMaterialIds(run, instance.instanceId).length) {
                    setFusionAttackId(instance.instanceId);
                    setFusionItemIds([]);
                  } else if (definition.target === CardTarget.Enemy) {
                    setTargetingCardId(instance.instanceId);
                  } else {
                    animateCardAction(instance.instanceId, (state) => playCard(state, instance.instanceId));
                  }
                  return;
                }
                if (definition?.target === CardTarget.Enemy) {
                  setTargetingCardId((current) =>
                    current === instance.instanceId ? undefined : instance.instanceId,
                  );
                  return;
                }
                setTargetingCardId(undefined);
                animateCardAction(instance.instanceId, (state) => playCard(state, instance.instanceId));
              }}
              onDiscard={() => {
                animateCardAction(instance.instanceId, (state) => discardCard(state, instance.instanceId));
              }}
            />
          ))}
        </div>
        <div className={`turn-actions ${discardMode ? 'discard-actions' : ''}`}>
          {discardMode ? (
            <>
              <div
                className={`discard-phase-callout ${cardsToDiscard === 0 ? 'ready' : 'waiting'}`}
                role="status"
                aria-live="polite"
              >
                <span aria-hidden="true">{cardsToDiscard === 0 ? '!' : cardsToDiscard}</span>
                <div>
                  <strong>
                    {cardsToDiscard === 0
                      ? t('combat.discardReadyTitle')
                      : t('combat.discardNeededTitle', { count: cardsToDiscard })}
                  </strong>
                  <small>
                    {cardsToDiscard === 0
                      ? t('combat.discardReadyHint')
                      : t('combat.discardNeededHint', { count: run.player.stats.maxRetain })}
                  </small>
                </div>
              </div>
              <button
                className="text-button"
                disabled={!discardable.length || animationLocked}
                onClick={discardAllCards}
              >
                {t('combat.discardAll')}
              </button>
              <button
                className="primary-button enemy-phase-button"
                disabled={animationLocked || cardsToDiscard > 0}
                onClick={() => commit(finishDiscard)}
              >
                {t('combat.faceEnemy')} <span>→</span>
              </button>
            </>
          ) : (
            <>
              <button
                className={`resource-action bomb-action ${bombTargeting ? 'active' : ''}`}
                disabled={
                  deploymentPending || animationLocked || Boolean(targetingCardId) || run.player.bombs < 1
                }
                onClick={() => {
                  setTargetingCardId(undefined);
                  setPendingFusionItemIds([]);
                  setHoveredTargetId(undefined);
                  setBombTargeting((current) => !current);
                }}
              >
                <span>●</span>
                {t('combat.useBomb')} <b>×{run.player.bombs}</b>
              </button>
              <button
                className="primary-button danger-button"
                disabled={deploymentPending || animationLocked || Boolean(targetingCardId) || bombTargeting}
                onClick={() => commit(endTurn)}
              >
                {t('combat.endTurn')} <span>→</span>
              </button>
            </>
          )}
        </div>
      </section>
      {animationLocked && (
        <div className="animation-status">
          <i />
          {t('combat.resolving')}
        </div>
      )}
      <CombatItemRail run={run} />
      {targetingCardId && (
        <TargetingGuide
          hoveredTargetId={hoveredTargetId}
          targetName={hoveredTarget ? enemyName(t, hoveredTarget) : undefined}
        />
      )}
      {viewingPile && <PileViewer run={run} pile={viewingPile} onClose={() => setViewingPile(undefined)} />}
      {combat.pendingSelection && (
        <CombatCardSelectionModal
          run={run}
          onResolve={(selectedIds) => commit((state) => resolveCombatSelection(state, selectedIds))}
          onCancel={() => commit(cancelCombatSelection)}
        />
      )}
      {fusionAttackId && (
        <FusionAttackModal
          run={run}
          attackInstanceId={fusionAttackId}
          selectedItemIds={fusionItemIds}
          onToggle={(instanceId) =>
            setFusionItemIds((current) =>
              current.includes(instanceId)
                ? current.filter((id) => id !== instanceId)
                : [...current, instanceId],
            )
          }
          onCancel={() => {
            setFusionAttackId(undefined);
            setFusionItemIds([]);
          }}
          onConfirm={() => {
            const attackId = fusionAttackId;
            const selectedFusionIds = [...fusionItemIds];
            const definition = getCardDefinition(run, attackId);
            setFusionAttackId(undefined);
            setFusionItemIds([]);
            if (definition?.target === CardTarget.Enemy) {
              setPendingFusionItemIds(selectedFusionIds);
              setTargetingCardId(attackId);
            } else {
              animateCardAction(attackId, (state) =>
                selectedFusionIds.length
                  ? playFusedAttack(state, attackId, selectedFusionIds)
                  : playCard(state, attackId),
              );
            }
          }}
        />
      )}
    </main>
  );
}
