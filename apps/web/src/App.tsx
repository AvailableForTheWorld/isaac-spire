import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CARDS, DEFAULT_PROFILE, FLOORS, ITEMS, abandonRun, canPlayCard, chooseOption, createRun,
  discardCard, endTurn, enterRoom, finishDiscard, getAvailableNodes,
  getPlayerAttackRange, getPlayerMovementSpeed, isEnemyInPlayerRange, movePlayer, playCard, selectEnemy, skipChoice,
  type CardInstance, type MapNode, type PersistedRun, type ProfileState, type RewardOption,
  type RoomKind, type RunState,
} from '@isaac-spire/game';
import { loadProfile, loadRecentRuns, saveRun } from './api';
import {
  cardDescription, cardName, cardTypeName, choiceSubtitle, choiceTitle, enemyName,
  errorText, floorBoss, floorName, floorSubtitle, intentLabel, itemDescription, itemName,
  logText, optionDescription, optionLabel, rewardsText, roomHint, roomName, unlockText,
} from './localize';

const PhaserStage = lazy(() => import('./phaser/PhaserStage').then((module) => ({ default: module.PhaserStage })));

const LOCAL_RUN_KEY = 'isaac-spire.active-run.v1';

const ROOM_META: Record<RoomKind, { icon: string }> = {
  entrance: { icon: '↓' }, combat: { icon: '⚔' }, elite: { icon: '♛' }, shop: { icon: '¢' },
  treasure: { icon: '▣' }, curse: { icon: '☠' }, sacrifice: { icon: '♱' }, secret: { icon: '✦' },
  'super-secret': { icon: '✺' }, planetarium: { icon: '☾' }, boss: { icon: '♚' },
};

function readLocalRun(): RunState | null {
  try {
    const raw = localStorage.getItem(LOCAL_RUN_KEY);
    return raw ? JSON.parse(raw) as RunState : null;
  } catch {
    return null;
  }
}

function shortSeed(): string {
  const words = ['CELLAR', 'TEARS', 'LAMB', 'MOTHER', 'DICE', 'SPIDER', 'ANGEL', 'STATIC'];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function totalPocketHp(run: RunState): number {
  return run.player.pocketHearts.reduce((sum, heart) => sum + heart.hp, 0);
}

function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const isChinese = i18n.resolvedLanguage !== 'en';
  return (
    <button
      className={`language-toggle ${compact ? 'compact' : ''}`}
      onClick={() => void i18n.changeLanguage(isChinese ? 'en' : 'zh-CN')}
      title={t('language.label')}
      aria-label={`${t('language.label')}: ${t('language.switchTo')}`}
    >
      <span>{t('language.current')}</span><b>{t('language.switchTo')}</b>
    </button>
  );
}

function Header({ run, onAbandon }: { run: RunState; onAbandon: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="game-header">
      <div className="brand-lockup">
        <span className="brand-mark">B</span>
        <div><strong>{t('brand.title')}</strong><small>{t('brand.subtitle')}</small></div>
      </div>
      <div className="floor-heading">
        <span>{t('header.floor', { current: run.floorIndex + 1, total: 6 })}</span>
        <strong>{floorName(t, run.floorIndex)}</strong>
      </div>
      <div className="resource-row" aria-label={t('resources.label')}>
        <span title={t('resources.coins')}><b>¢</b>{run.player.coins}</span>
        <span title={t('resources.bombs')}><b>●</b>{run.player.bombs}</span>
        <span title={t('resources.keys')}><b>⚿</b>{run.player.keys}</span>
        <span title={t('resources.score')}><b>◆</b>{run.score}</span>
      </div>
      <LanguageToggle compact />
      <button className="icon-button" onClick={onAbandon} title={t('header.abandon')} aria-label={t('header.abandon')}>×</button>
    </header>
  );
}

function HeartMeter({ run, shield, armor }: { run: RunState; shield?: number; armor?: number }) {
  const { t } = useTranslation();
  const maxRed = run.player.redContainers * run.player.stats.heartSize;
  return (
    <div className="heart-meter">
      <div className="health-line">
        <span className="heart-icon">♥</span>
        <strong>{run.player.redHp}/{maxRed} {t('combat.hp')}</strong>
      </div>
      <div className="heart-units">
        {Array.from({ length: run.player.redContainers }, (_, index) => {
          const hp = Math.max(0, Math.min(run.player.stats.heartSize, run.player.redHp - index * run.player.stats.heartSize));
          const filled = run.player.stats.heartSize ? hp / run.player.stats.heartSize : 0;
          return (
            <span className="heart-unit red" key={index} title={`${hp}/${run.player.stats.heartSize} ${t('combat.hp')}`}>
              <b style={{ '--heart-fill': `${filled * 100}%` } as React.CSSProperties}>♥</b>
              <small>{hp}/{run.player.stats.heartSize}</small>
            </span>
          );
        })}
        {run.player.pocketHearts.map((heart) => (
          <span className={`heart-unit ${heart.kind}`} key={heart.id} title={`${heart.hp}/${heart.maxHp} ${t('combat.hp')}`}>
            <b>{heart.kind === 'soul' ? '♡' : '♥'}</b>
            <small>{heart.hp}/{heart.maxHp}</small>
          </span>
        ))}
        {shield !== undefined && <span className={`defense-unit shield ${shield > 0 ? 'active' : ''}`} title={t('combat.shield')}><b>⬡</b><small>{shield}</small></span>}
        {armor !== undefined && <span className="defense-unit armor" title={t('combat.armor')}><b>⛉</b><small>{armor}</small></span>}
      </div>
    </div>
  );
}

function nodePoint(node: MapNode): { x: number; y: number } {
  const optionalOffset = node.kind === 'secret' ? -0.34 : node.kind === 'super-secret' ? 0.34 : 0;
  return { x: 20 + (node.lane + optionalOffset) * 30, y: 5 + node.depth * 12.6 };
}

function RouteMap({ run, onEnter }: { run: RunState; onEnter: (id: string) => void }) {
  const { t } = useTranslation();
  const [enteringNode, setEnteringNode] = useState<string>();
  const available = useMemo(() => new Set(getAvailableNodes(run)), [run]);
  const current = run.floorMap.nodes.find((node) => node.id === run.floorMap.currentNodeId);
  const visibleNodes = run.floorMap.nodes.filter((node) => node.revealed || node.optional);
  return (
    <main className="map-layout">
      <section className="map-copy">
        <p className="eyebrow">{t('map.choose')}</p>
        <h1>{floorName(t, run.floorIndex)}</h1>
        <p>{t('map.description', { subtitle: floorSubtitle(t, run.floorIndex) })}</p>
        <div className="map-current">
          <span>{t('map.current')}</span>
          <strong>{current ? roomName(t, current.kind) : '?'}</strong>
        </div>
        <HeartMeter run={run} />
        <div className="floor-progress" aria-label={t('map.progress')}>
          {FLOORS.map((floor) => <i key={floor.index} className={floor.index < run.floorIndex ? 'done' : floor.index === run.floorIndex ? 'active' : ''} title={floorName(t, floor.index)} />)}
        </div>
        <p className="map-note">{t('map.note')}</p>
      </section>
      <section className={`route-board ${enteringNode ? 'route-entering' : ''}`} style={{ '--floor-color': FLOORS[run.floorIndex]?.palette } as React.CSSProperties}>
        <div className="route-labels"><span>{t('map.left')}</span><span>{t('map.center')}</span><span>{t('map.right')}</span></div>
        <svg className="route-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {run.floorMap.nodes.filter((node) => !node.optional).flatMap((node) => node.connections.map((targetId) => {
            const target = run.floorMap.nodes.find((entry) => entry.id === targetId);
            if (!target) return null;
            const from = nodePoint(node); const to = nodePoint(target);
            const active = node.visited && (target.visited || available.has(target.id));
            return <line key={`${node.id}-${target.id}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={active ? 'active' : ''} />;
          }))}
          {run.floorMap.nodes.filter((node) => node.optional).map((node) => {
            const anchor = run.floorMap.nodes.find((entry) => entry.id === node.anchorId);
            if (!anchor || !node.revealed) return null;
            const from = nodePoint(anchor); const to = nodePoint(node);
            return <line key={`optional-${node.id}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="secret-line" />;
          })}
        </svg>
        {visibleNodes.map((node) => {
          const point = nodePoint(node);
          const meta = ROOM_META[node.kind];
          const canEnter = available.has(node.id);
          const noBomb = node.optional && run.player.bombs < 1;
          const hidden = node.optional && !node.revealed;
          return (
            <button
              key={node.id}
              className={`map-node ${node.kind} ${node.visited ? 'visited' : ''} ${canEnter ? 'available' : ''} ${hidden ? 'hidden' : ''} ${enteringNode === node.id ? 'choosing' : ''}`}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              disabled={!canEnter || noBomb}
              onClick={() => {
                if (enteringNode) return;
                setEnteringNode(node.id);
                window.setTimeout(() => onEnter(node.id), 420);
              }}
              title={hidden ? t('map.hidden') : `${roomName(t, node.kind)}：${roomHint(t, node.kind)}${noBomb ? ` ${t('map.needBomb')}` : ''}`}
              aria-label={hidden ? t('map.hiddenLabel') : roomName(t, node.kind)}
            >
              <span>{hidden ? '?' : meta.icon}</span>
              {!hidden && <small>{roomName(t, node.kind)}</small>}
              {canEnter && noBomb && <em>{t('map.noBomb')}</em>}
            </button>
          );
        })}
        <div className="route-depth-label top">{t('map.thisFloor')}</div>
        <div className="route-depth-label bottom">{t('map.bossDoor')}</div>
      </section>
    </main>
  );
}

function CardView({ run, instance, mode, index, animating, targeting, locked, onPlay, onDiscard }: {
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
  const playable = canPlayCard(run, instance.instanceId);
  const cooldown = run.combat?.cooldowns[instance.instanceId] ?? 0;
  const isSkill = definition.type === 'skill';
  const disabled = locked || (mode === 'play' ? !playable.ok : false);
  return (
    <button
      className={`game-card ${definition.type} ${instance.upgraded ? 'upgraded' : ''} ${targeting ? 'targeting' : ''} ${animating ? (mode === 'discard' ? 'discarding-out' : 'playing-out') : ''}`}
      style={{ '--card-index': index } as React.CSSProperties}
      disabled={disabled}
      onClick={mode === 'play' ? onPlay : onDiscard}
      title={disabled && playable.reason ? errorText(t, playable.reason) : cardDescription(t, definition.id)}
    >
      <span className="card-cost">{isSkill && cooldown > 0 ? cooldown : definition.cost}</span>
      <span className="card-type">{cardTypeName(t, definition.type)}</span>
      <b className="card-icon">{definition.icon}</b>
      <strong>{cardName(t, definition.id)}{instance.upgraded ? '+' : ''}</strong>
      <p>{cardDescription(t, definition.id)}</p>
      {isSkill && <small>{cooldown > 0 ? t('combat.recharging', { rounds: cooldown }) : t('combat.activeRetained')}</small>}
      {isSkill && mode === 'discard' && <small className="active-loss">{t('combat.activeDiscardWarning')}</small>}
      {definition.exhaust && <small>{t('combat.oneOff')}</small>}
    </button>
  );
}

function PileViewer({ run, pile, onClose }: { run: RunState; pile: 'draw' | 'discard'; onClose: () => void }) {
  const { t } = useTranslation();
  const ids = run.combat?.[pile === 'draw' ? 'drawPile' : 'discardPile'] ?? [];
  const cards = ids.map((id) => run.player.deck.find((card) => card.instanceId === id)).filter((card): card is CardInstance => Boolean(card));
  return (
    <div className="pile-backdrop" role="presentation" onClick={onClose}>
      <section className="pile-viewer" role="dialog" aria-modal="true" aria-label={t(pile === 'draw' ? 'combat.drawPileTitle' : 'combat.discardPileTitle', { count: cards.length })} onClick={(event) => event.stopPropagation()}>
        <header><div><span>{t('combat.pileInspect')}</span><h2>{t(pile === 'draw' ? 'combat.drawPileTitle' : 'combat.discardPileTitle', { count: cards.length })}</h2></div><button onClick={onClose} aria-label={t('combat.closePile')}>×</button></header>
        <p>{t(pile === 'draw' ? 'combat.drawPileHint' : 'combat.discardPileHint')}</p>
        <div className="pile-card-grid">
          {cards.map((instance, index) => {
            const definition = CARDS[instance.definitionId];
            return definition ? <article className={`pile-card ${definition.type}`} key={instance.instanceId}><span>{index + 1}</span><b>{definition.icon}</b><strong>{cardName(t, definition.id)}</strong><small>{cardTypeName(t, definition.type)} · {definition.cost}</small><p>{cardDescription(t, definition.id)}</p></article> : null;
          })}
          {!cards.length && <div className="empty-pile">{t('combat.emptyPile')}</div>}
        </div>
      </section>
    </div>
  );
}

function CombatItemRail({ run }: { run: RunState }) {
  const { t } = useTranslation();
  const passives = run.player.items.filter((id) => ITEMS[id]?.kind === 'passive');
  return (
    <aside className="combat-item-rail" aria-label={t('combat.passiveItems')}>
      <strong>{t('combat.passiveItems')}</strong>
      <div>
        {passives.map((id) => (
          <span key={id} title={`${itemName(t, id)}：${itemDescription(t, id)}`}>
            <b>{ITEMS[id]?.icon ?? '?'}</b><small>{itemName(t, id)}</small>
          </span>
        ))}
        {!passives.length && <em>{t('combat.noPassiveItems')}</em>}
      </div>
    </aside>
  );
}

function CombatView({ run, commit }: { run: RunState; commit: (action: (state: RunState) => RunState) => void }) {
  const { t } = useTranslation();
  const [animatingCardId, setAnimatingCardId] = useState<string>();
  const [animationLocked, setAnimationLocked] = useState(false);
  const [viewingPile, setViewingPile] = useState<'draw' | 'discard'>();
  const [targetingCardId, setTargetingCardId] = useState<string>();
  const combat = run.combat!;
  const lastAnimationSequence = useRef(combat.animationSequence);
  const discardMode = run.phase === 'discard';
  const handCards = combat.hand.map((id) => run.player.deck.find((card) => card.instanceId === id)).filter((card): card is CardInstance => Boolean(card));
  const selected = combat.enemies.find((enemy) => enemy.instanceId === combat.selectedEnemyId);
  const targetingCard = targetingCardId ? run.player.deck.find((card) => card.instanceId === targetingCardId) : undefined;
  const targetingDefinition = targetingCard ? CARDS[targetingCard.definitionId] : undefined;
  const discardable = handCards;
  useEffect(() => {
    const events = combat.animationEvents.filter((event) => event.sequence > lastAnimationSequence.current);
    lastAnimationSequence.current = combat.animationSequence;
    if (!events.length) return;
    const blockingEvents = events.filter((event) => event.kind !== 'move' || event.sourceId !== 'isaac');
    if (!blockingEvents.length) return;
    const durations: Record<string, number> = {
      'card-play': 460, 'card-discard': 440, 'discard-phase': 850, 'enemy-phase': 850, 'round-start': 850,
      move: 520, 'player-attack': 650, 'enemy-attack': 1150, shield: 520, heal: 520, curse: 560, prepare: 600, idle: 420,
      defeat: 420, 'black-heart': 560,
    };
    const duration = blockingEvents.reduce((sum, event) => sum + (durations[event.kind] ?? 450), 0);
    setAnimationLocked(true);
    const timer = window.setTimeout(() => setAnimationLocked(false), duration);
    return () => window.clearTimeout(timer);
  }, [combat.animationSequence]);
  useEffect(() => {
    if (targetingCardId && (discardMode || !combat.hand.includes(targetingCardId))) setTargetingCardId(undefined);
  }, [combat.hand, discardMode, targetingCardId]);
  const animateCardAction = (instanceId: string, action: (state: RunState) => RunState) => {
    if (animatingCardId || animationLocked) return;
    setAnimatingCardId(instanceId);
    window.setTimeout(() => {
      commit(action);
      setAnimatingCardId(undefined);
    }, 220);
  };
  const discardAll = () => commit((state) => {
    let next = state;
    const ids = [...(next.combat?.hand ?? [])];
    for (const id of ids) next = discardCard(next, id);
    return next;
  });
  return (
    <main className="combat-page">
      <div className="combat-topline">
        <div className="combat-player-hud">
          <span className="hud-name">{t('stats.character')}</span>
          <HeartMeter run={run} shield={combat.playerShield} armor={run.player.stats.armor + combat.playerArmorBuff} />
          <div className="tactical-stats"><span>◎ {t('combat.range', { value: getPlayerAttackRange(run) })}</span><span>↝ {t('combat.moveSpeed', { value: getPlayerMovementSpeed(run) })}</span><span>⌖ ({combat.playerPosition?.x ?? 0},{combat.playerPosition?.y ?? 4})</span></div>
        </div>
        <div className="combat-heading">
          <p className="eyebrow">{t('combat.room', { room: roomName(t, combat.roomKind) })}</p>
          <h1>{combat.roomKind === 'boss' ? floorBoss(t, run.floorIndex) : t('combat.round', { round: combat.round })}</h1>
        </div>
        <div className="vitality-orbs" title={t('combat.vitalityHint')}>
          {Array.from({ length: run.player.stats.maxVitality }, (_, index) => <i key={index} className={index < combat.vitality ? 'full' : ''} />)}
          <strong>{t('combat.vitality', { value: combat.vitality })}</strong>
        </div>
      </div>
      <Suspense fallback={<div className="phaser-stage stage-loading">{t('combat.preparing')}</div>}>
        <PhaserStage run={run} movementDisabled={animationLocked || discardMode} onMove={(x, y) => commit((state) => movePlayer(state, x, y))} />
      </Suspense>
      <div className={`enemy-strip ${targetingCardId ? 'targeting' : ''}`}>
        {combat.enemies.map((enemy) => {
          const intendedAttack = enemy.intent.actions?.find((entry) => entry.kind === 'attack')?.value ?? enemy.attack;
          const shownIntent = (enemy.staggeredTurns ?? 0) > 0
            ? { kind: 'idle' as const, value: 0, label: '' }
            : enemy.cursedTurns > 0
              ? { kind: 'attack' as const, value: Math.max(1, Math.round(intendedAttack * 0.6)), label: '' }
              : enemy.intent;
          const inRange = isEnemyInPlayerRange(run, enemy.instanceId);
          const targetable = Boolean(targetingCardId && canPlayCard(run, targetingCardId, enemy.instanceId).ok);
          return <button
            key={enemy.instanceId}
            disabled={enemy.hp <= 0 || animationLocked || Boolean(targetingCardId && !targetable)}
            className={`enemy-panel ${selected?.instanceId === enemy.instanceId ? 'selected' : ''} ${targetable ? 'targetable' : ''} ${enemy.hp <= 0 ? 'dead' : ''} ${inRange ? 'in-range' : 'out-of-range'}`}
            onClick={() => {
              if (targetingCardId) {
                const cardId = targetingCardId;
                setTargetingCardId(undefined);
                animateCardAction(cardId, (state) => playCard(state, cardId, enemy.instanceId));
              } else {
                commit((state) => selectEnemy(state, enemy.instanceId));
              }
            }}
          >
            <span className={`intent ${shownIntent.kind}`}>↝ {t('combat.enemyMoveAction', { value: enemy.movementSpeed })} + {shownIntent.kind === 'attack' ? '⚔' : shownIntent.kind === 'shield' ? '⬡' : shownIntent.kind === 'curse' ? '☠' : shownIntent.kind === 'heal' ? '♥' : shownIntent.kind === 'prepare' ? '!' : '…'} {intentLabel(t, shownIntent)}</span>
            <strong>{enemyName(t, enemy)}</strong>
            <span>{enemy.hp}/{enemy.maxHp} {t('combat.hp')} · {enemy.armor} {t('combat.armor')} {enemy.shield ? `· ${enemy.shield} ${t('combat.shield')}` : ''}</span>
            <span className="enemy-grid-stats">⌖ ({enemy.position?.x ?? 15},{enemy.position?.y ?? 4}) · ◎ {enemy.attackRange ?? 1} · ↝ {enemy.movementSpeed ?? 3} · {inRange ? t('combat.inRange') : t('combat.outOfRange')}</span>
            {enemy.cursedTurns > 0 && <em>{t('combat.weakened', { turns: enemy.cursedTurns })}</em>}
            {(enemy.staggeredTurns ?? 0) > 0 && <em>{t('combat.staggered')}</em>}
          </button>;
        })}
      </div>
      <section className={`hand-zone ${discardMode ? 'discarding' : ''}`}>
        <div className="hand-heading">
          <div>
            <span className="eyebrow">{t('combat.hand', { count: handCards.length, max: run.player.stats.drawCount })}</span>
            <strong>{discardMode
              ? t('combat.discardPrompt', { count: run.player.stats.maxRetain })
              : targetingDefinition
                ? t('combat.chooseCardTarget', { card: cardName(t, targetingDefinition.id) })
                : t('combat.chooseCard')}</strong>
          </div>
          <div className="pile-counts"><button onClick={() => setViewingPile('draw')}>{t('combat.draw', { count: combat.drawPile.length })}</button><button onClick={() => setViewingPile('discard')}>{t('combat.discard', { count: combat.discardPile.length })}</button><span>{t('combat.deck', { count: run.player.deck.length })}</span></div>
        </div>
        <div className="card-hand">
          {handCards.map((instance, index) => (
            <CardView
              key={instance.instanceId}
              run={run}
              instance={instance}
              mode={discardMode ? 'discard' : 'play'}
              index={index}
              animating={animatingCardId === instance.instanceId}
              targeting={targetingCardId === instance.instanceId}
              locked={Boolean(animatingCardId) || animationLocked}
              onPlay={() => {
                const definition = CARDS[instance.definitionId];
                if (definition?.target === 'enemy' && ['attack', 'hex'].includes(definition.type)) {
                  setTargetingCardId((current) => current === instance.instanceId ? undefined : instance.instanceId);
                  return;
                }
                setTargetingCardId(undefined);
                animateCardAction(instance.instanceId, (state) => playCard(state, instance.instanceId));
              }}
              onDiscard={() => animateCardAction(instance.instanceId, (state) => discardCard(state, instance.instanceId))}
            />
          ))}
        </div>
        <div className="turn-actions">
          {discardMode ? (
            <>
              <button className="text-button" disabled={!discardable.length || animationLocked} onClick={discardAll}>{t('combat.discardAll')}</button>
              <button className="primary-button" disabled={animationLocked || handCards.length > run.player.stats.maxRetain} onClick={() => commit(finishDiscard)}>{t('combat.faceEnemy')} <span>→</span></button>
            </>
          ) : (
            <button className="primary-button danger-button" disabled={animationLocked} onClick={() => commit(endTurn)}>{t('combat.endTurn')} <span>→</span></button>
          )}
        </div>
      </section>
      {animationLocked && <div className="animation-status"><i />{t('combat.resolving')}</div>}
      <aside className="combat-log">
        {combat.log.slice(0, 4).map((entry) => <p className={entry.tone} key={entry.id}>{logText(t, run, entry.message, entry.messageKey, entry.params)}</p>)}
      </aside>
      <CombatItemRail run={run} />
      {viewingPile && <PileViewer run={run} pile={viewingPile} onClose={() => setViewingPile(undefined)} />}
    </main>
  );
}

function ChoiceCard({ option, run, dealType, onChoose }: { option: RewardOption; run: RunState; dealType?: 'devil' | 'angel'; onChoose: () => void }) {
  const { t } = useTranslation();
  const choice = run.choice!;
  const unaffordable = (option.price ?? 0) > run.player.coins || (dealType === 'devil' && option.type === 'item' && run.player.redContainers <= 1);
  return (
    <button className={`choice-card ${option.type} ${option.sold ? 'sold' : ''}`} disabled={option.sold || unaffordable} onClick={onChoose}>
      {option.price !== undefined && <span className="price">{option.price}¢</span>}
      <b>{option.icon}</b>
      <strong>{optionLabel(t, option, choice)}</strong>
      <p>{optionDescription(t, option, choice)}</p>
      {option.type === 'item' && option.itemId && <small>{t(`itemKinds.${ITEMS[option.itemId]?.kind}`)} · {t('choice.quality', { quality: ITEMS[option.itemId]?.quality })}{ITEMS[option.itemId]?.kind === 'passive' ? ` · ${t('choice.addsItemCard')}` : ''}</small>}
      {option.type === 'card' && option.cardId && <small>{t('choice.cardLabel', { type: cardTypeName(t, CARDS[option.cardId]!.type) })}</small>}
      {option.sold && <em>{t('choice.sold')}</em>}
      {unaffordable && !option.sold && <em>{dealType === 'devil' && run.player.redContainers <= 1 ? t('choice.needContainers') : t('choice.notEnoughCoins')}</em>}
    </button>
  );
}

function ChoiceView({ run, commit }: { run: RunState; commit: (action: (state: RunState) => RunState) => void }) {
  const { t } = useTranslation();
  const [choosingId, setChoosingId] = useState<string>();
  const choice = run.choice!;
  return (
    <main className={`choice-page ${choice.dealType ?? choice.kind}`}>
      <div className="choice-aura" />
      <section className="choice-copy">
        <p className="eyebrow">{choice.kind === 'upgrade' ? t('choice.floorReward') : t('choice.chooseReward')}</p>
        <h1>{choiceTitle(t, run)}</h1>
        <p>{choiceSubtitle(t, run)}</p>
        {run.lastReward.length > 0 && <div className="drop-notice">{t('choice.roomDrop', { rewards: rewardsText(t, run) })}</div>}
      </section>
      <section className="choice-grid">
        {choice.options.map((option) => <div className={choosingId === option.id ? 'choice-selecting' : ''} key={option.id}><ChoiceCard option={option} run={run} dealType={choice.dealType} onChoose={() => {
          if (choosingId) return;
          setChoosingId(option.id);
          window.setTimeout(() => commit((state) => chooseOption(state, option.id)), 340);
        }} /></div>)}
      </section>
      {choice.canSkip && <button className="text-button choice-skip" onClick={() => commit(skipChoice)}>{t('choice.leaveEmpty')} <span>→</span></button>}
      {choice.kind === 'shop' && <div className="shop-purse">{t('choice.shopPurse')} <strong>{run.player.coins}¢</strong></div>}
    </main>
  );
}

function StatsRail({ run }: { run: RunState }) {
  const { t } = useTranslation();
  const stats = run.player.stats;
  return (
    <aside className="stats-rail">
      <details>
        <summary>{t('stats.character')} <span>{t('stats.title')}</span></summary>
        <div className="stats-grid">
          <span>{t('stats.damage')} <b>{(stats.baseDamage * stats.damageMultiplier).toFixed(1)}</b></span>
          <span>{t('stats.armor')} <b>{stats.armor}</b></span>
          <span>{t('stats.startShield')} <b>{stats.baseShield}</b></span>
          <span>{t('stats.fireRate')} <b>{stats.fireRate.toFixed(2)}</b></span>
          <span>{t('stats.vitality')} <b>{stats.maxVitality}</b></span>
          <span>{t('stats.draw')} <b>{stats.drawCount}</b></span>
          <span>{t('stats.critical')} <b>{Math.round(stats.critChance * 100)}%</b></span>
          <span>{t('stats.tearForm')} <b>{t(`attackModes.${stats.attackMode}`)}</b></span>
        </div>
      </details>
      <details>
        <summary>{t('stats.items')} <span>{run.player.items.length}</span></summary>
        <div className="item-grid">
          {run.player.items.map((id) => <span key={id} title={`${itemName(t, id)}：${itemDescription(t, id)}`}>{ITEMS[id]?.icon ?? '?'}<small>{itemName(t, id)}</small></span>)}
        </div>
      </details>
      <details>
        <summary>{t('stats.run')} <span>{run.seed}</span></summary>
        <div className="run-facts"><p>{t('stats.roomsCleared', { count: run.clearedRooms })}</p><p>{t('stats.dealChance', { chance: Math.round(run.devilChance * 100) })}</p><p>{t('stats.angelFavor', { count: run.angelFavor })}</p><p>{t('stats.pocketHp', { count: totalPocketHp(run) })}</p></div>
      </details>
    </aside>
  );
}

function ResultView({ run, onHome }: { run: RunState; onHome: () => void }) {
  const { t } = useTranslation();
  const won = run.phase === 'victory';
  return (
    <main className={`result-page ${won ? 'won' : 'lost'}`}>
      <div className="result-symbol">{won ? '♚' : '†'}</div>
      <p className="eyebrow">{t(won ? 'result.wonKicker' : 'result.lostKicker')}</p>
      <h1>{t(won ? 'result.wonTitle' : 'result.lostTitle')}</h1>
      <p>{t(won ? 'result.wonBody' : 'result.lostBody')}</p>
      <div className="result-stats"><span><b>{run.score}</b>{t('result.score')}</span><span><b>{run.clearedRooms}</b>{t('result.rooms')}</span><span><b>{run.player.items.length}</b>{t('result.items')}</span><span><b>{run.floorIndex + 1}</b>{t('result.floors')}</span></div>
      {run.unlockNotices.length > 0 && <div className="unlock-list"><strong>{t('result.unlocks')}</strong>{run.unlockNotices.map((notice) => <span key={notice.itemId}>{ITEMS[notice.itemId]?.icon} {unlockText(t, notice.itemId)}</span>)}</div>}
      <button className="primary-button" onClick={onHome}>{t('result.return')} <span>→</span></button>
    </main>
  );
}

function Home({ profile, localRun, recentRuns, onStart, onResume }: {
  profile: ProfileState;
  localRun: RunState | null;
  recentRuns: PersistedRun[];
  onStart: (seed: string) => void;
  onResume: (run: RunState) => void;
}) {
  const { t } = useTranslation();
  const [seed, setSeed] = useState(shortSeed());
  const resumable = localRun && !['victory', 'defeat'].includes(localRun.phase)
    ? localRun
    : recentRuns.find((run) => run.status === 'active')?.snapshot;
  return (
    <main className="home-page">
      <div className="home-grain" />
      <div className="home-language"><LanguageToggle /></div>
      <section className="home-hero">
        <div className="home-logo"><span>B</span><div><p>{t('home.kicker')}</p><h1>{t('brand.title')}</h1><small>{t('brand.subtitle')}</small></div></div>
        <p className="home-intro">{t('home.intro')}</p>
        <div className="seed-control">
          <label htmlFor="seed">{t('home.seed')}</label>
          <input id="seed" value={seed} maxLength={28} onChange={(event) => setSeed(event.target.value.toUpperCase())} />
          <button onClick={() => setSeed(shortSeed())} title={t('home.rerollSeed')} aria-label={t('home.rerollSeed')}>↻</button>
        </div>
        <div className="home-actions">
          <button className="primary-button large" onClick={() => onStart(seed)}>{t('home.begin')} <span>↓</span></button>
          {resumable && <button className="secondary-button large" onClick={() => onResume(resumable)}>{t('home.continue', { floor: resumable.floorIndex + 1 })} <span>→</span></button>}
        </div>
        <div className="home-meta"><span><b>{profile.wins}</b>{t('home.momKills')}</span><span><b>{profile.bestScore}</b>{t('home.bestScore')}</span><span><b>{profile.unlockedItemIds.length}/{Object.keys(ITEMS).length}</b>{t('home.itemsUnlocked')}</span></div>
      </section>
      <section className="home-rules">
        <p className="eyebrow">{t('home.firstRun')}</p>
        <h2>{t('home.tagline1')}<br />{t('home.tagline2')}<br />{t('home.tagline3')}</h2>
        <div className="rule-list">
          <article><span>01</span><div><strong>{t('home.ruleRoute')}</strong><p>{t('home.ruleRouteBody')}</p></div></article>
          <article><span>02</span><div><strong>{t('home.ruleFight')}</strong><p>{t('home.ruleFightBody')}</p></div></article>
          <article><span>03</span><div><strong>{t('home.ruleBreak')}</strong><p>{t('home.ruleBreakBody')}</p></div></article>
        </div>
        <div className="boss-line"><span>{t('home.basement')}</span><i /><span>{t('home.caves')}</span><i /><span>{t('home.depths')}</span><i /><b>{t('home.mom')}</b></div>
      </section>
      <footer>{t('home.disclaimer')}</footer>
    </main>
  );
}

export function App() {
  const { t, i18n } = useTranslation();
  const [run, setRun] = useState<RunState | null>(null);
  const [profile, setProfile] = useState<ProfileState>(DEFAULT_PROFILE);
  const [recentRuns, setRecentRuns] = useState<PersistedRun[]>([]);
  const [localRun, setLocalRun] = useState<RunState | null>(() => readLocalRun());
  const [notice, setNotice] = useState<string>('');
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.title = t('brand.pageTitle');
  }, [i18n.resolvedLanguage, t]);

  useEffect(() => {
    void Promise.all([loadProfile(), loadRecentRuns()]).then(([nextProfile, nextRuns]) => {
      setProfile(nextProfile); setRecentRuns(nextRuns);
    });
  }, []);

  useEffect(() => {
    if (!run) return;
    localStorage.setItem(LOCAL_RUN_KEY, JSON.stringify(run));
    setLocalRun(run);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveRun(run), 350);
    return () => window.clearTimeout(saveTimer.current);
  }, [run]);

  const commit = (action: (state: RunState) => RunState) => {
    if (!run) return;
    try {
      const next = action(run);
      setRun(next);
      setNotice('');
    } catch (error) {
      setNotice(errorText(t, error instanceof Error ? error.message : 'That action is unavailable'));
    }
  };

  const start = (seed: string) => {
    const next = createRun(seed, profile.unlockedItemIds);
    setRun(next); setNotice('');
    void saveRun(next, true);
  };

  const goHome = () => {
    if (run && ['victory', 'defeat'].includes(run.phase)) localStorage.removeItem(LOCAL_RUN_KEY);
    setRun(null);
    setLocalRun(readLocalRun());
    void Promise.all([loadProfile(), loadRecentRuns()]).then(([nextProfile, nextRuns]) => { setProfile(nextProfile); setRecentRuns(nextRuns); });
  };

  if (!run) return <Home profile={profile} localRun={localRun} recentRuns={recentRuns} onStart={start} onResume={setRun} />;

  const onAbandon = () => {
    if (window.confirm(t('header.abandonConfirm'))) commit(abandonRun);
  };

  return (
    <div className={`game-shell phase-${run.phase}`}>
      <Header run={run} onAbandon={onAbandon} />
      {notice && <button className="toast" onClick={() => setNotice('')}>{notice}<span>×</span></button>}
      {run.unlockNotices.length > 0 && run.phase !== 'victory' && <div className="unlock-toast">{t('result.newUnlock', { message: unlockText(t, run.unlockNotices.at(-1)!.itemId) })}</div>}
      {run.phase === 'map' && <RouteMap run={run} onEnter={(id) => commit((state) => enterRoom(state, id))} />}
      {(run.phase === 'combat' || run.phase === 'discard') && run.combat && <CombatView run={run} commit={commit} />}
      {run.phase === 'choice' && run.choice && <ChoiceView run={run} commit={commit} />}
      {(run.phase === 'victory' || run.phase === 'defeat') && <ResultView run={run} onHome={goHome} />}
      {!['victory', 'defeat', 'combat', 'discard'].includes(run.phase) && <StatsRail run={run} />}
    </div>
  );
}
