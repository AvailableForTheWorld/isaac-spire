import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CARDS, DEFAULT_PROFILE, FLOORS, ITEMS, abandonRun, canPlayCard, canPlayFusedAttack, chooseOption, confirmPlayerDeployment, createRun,
  discardCard, endTurn, enterRoom, finishDiscard, getAvailableNodes, getCardDefinition,
  getAttackFusionMaterialIds, getAttackFusionPreview, getEnemyMovementSpeed, getPlayerAttackRange, getPlayerMovementSpeed, hydrateRunState,
  isEnemyInPlayerRange, isPlayerInEnemyVision, itemUsesCombatCard, movePlayer, placePlayerForDeployment, playCard, playFusedAttack, selectEnemy, skipChoice, useCombatBomb, useMapBomb,
  type CardInstance, type CombatAnimationEvent, type EnemyIntent, type MapConnectionStyle, type MapNode, type PersistedRun, type ProfileState, type RewardOption,
  type RoomKind, type RunState,
} from '@isaac-spire/game';
import { loadProfile, loadRecentRuns, saveRun } from './api';
import {
  cardDescription, cardName, cardTypeName, choiceSubtitle, choiceTitle, enemyName,
  errorText, floorBoss, floorName, floorSubtitle, intentLabel, itemDescription, itemName,
  logText, optionDescription, optionLabel, rewardText, rewardsText, roomHint, roomName, unlockText,
} from './localize';

const PhaserStage = lazy(() => import('./phaser/PhaserStage').then((module) => ({ default: module.PhaserStage })));

const LOCAL_RUN_KEY = 'isaac-spire.active-run.v1';

const ROOM_META: Record<RoomKind, { icon: string }> = {
  entrance: { icon: '↓' }, combat: { icon: '⚔' }, elite: { icon: '♛' }, shop: { icon: '¢' },
  treasure: { icon: '▣' }, curse: { icon: '☠' }, sacrifice: { icon: '♱' }, secret: { icon: '✦' },
  'super-secret': { icon: '✺' }, planetarium: { icon: '☾' }, boss: { icon: '♚' },
};

function enemyIntentIcon(kind: EnemyIntent['kind']): string {
  return kind === 'attack' ? '⚔'
    : kind === 'shield' ? '⬡'
      : kind === 'curse' ? '☠'
        : kind === 'heal' ? '♥'
          : kind === 'prepare' ? '!'
            : kind === 'summon' ? '♟'
              : '…';
}

function readLocalRun(): RunState | null {
  try {
    const raw = localStorage.getItem(LOCAL_RUN_KEY);
    return raw ? hydrateRunState(JSON.parse(raw) as RunState) : null;
  } catch {
    return null;
  }
}

function shortSeed(): string {
  const words = ['CELLAR', 'ATTACK', 'LAMB', 'MOTHER', 'DICE', 'SPIDER', 'ANGEL', 'STATIC'];
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
  if (node.mapPosition) return node.mapPosition;
  const optionalOffset = node.kind === 'secret' ? -0.34 : node.kind === 'super-secret' ? 0.34 : 0;
  const laneDrift = ['entrance', 'boss'].includes(node.kind)
    ? 0
    : ((Math.round(node.depth * 10) + node.lane * 7) % 3 - 1) * 1.7;
  return { x: 20 + (node.lane + optionalOffset) * 30 + laneDrift, y: 5 + node.depth * 12.6 };
}

function fallbackConnectionStyle(key: string): MapConnectionStyle {
  const direction = [...key].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 2 ? 1 : -1;
  return {
    startBend: direction * 4.2, endBend: direction * -2.8, tension: 0.34,
    dash: 2, gap: 2, duration: 16, delay: -4, opacity: 1,
  };
}

function routeCurve(
  from: { x: number; y: number },
  to: { x: number; y: number },
  style: MapConnectionStyle,
): string {
  const horizontalDistance = to.x - from.x;
  const verticalDistance = to.y - from.y;
  const firstControlX = from.x + horizontalDistance * 0.22 + style.startBend;
  const secondControlX = to.x - horizontalDistance * 0.22 + style.endBend;
  return `M ${from.x} ${from.y} C ${firstControlX} ${from.y + verticalDistance * style.tension}, ${secondControlX} ${to.y - verticalDistance * style.tension}, ${to.x} ${to.y}`;
}

function routeInkStyle(style: MapConnectionStyle): React.CSSProperties {
  return {
    '--route-dash': `${style.dash} ${style.gap}`,
    '--route-duration': `${style.duration}s`,
    '--route-delay': `${style.delay}s`,
    '--route-opacity': style.opacity,
  } as React.CSSProperties;
}

function RouteMap({ run, onEnter, onBombSearch }: { run: RunState; onEnter: (id: string) => void; onBombSearch: () => void }) {
  const { t } = useTranslation();
  const [enteringNode, setEnteringNode] = useState<string>();
  const available = useMemo(() => new Set(getAvailableNodes(run)), [run]);
  const current = run.floorMap.nodes.find((node) => node.id === run.floorMap.currentNodeId);
  const visibleNodes = run.floorMap.nodes.filter((node) => node.revealed || !node.optional);
  const currentSearched = Boolean(current && run.floorBombSearches?.includes(current.id));
  const bombResult = run.mapBombResult?.currentNodeId === current?.id ? run.mapBombResult : undefined;
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
        <div className="map-bomb-search">
          <button disabled={run.player.bombs < 1 || currentSearched} onClick={onBombSearch}>
            <b>●</b><span>{t(currentSearched ? 'map.wallSearched' : 'map.searchWall')}</span><small>{t('map.searchWallCost')}</small>
          </button>
          {bombResult && <p className={bombResult.found ? 'found' : 'empty'}>{bombResult.found
            ? t('map.secretFound', { room: roomName(t, bombResult.roomKind ?? 'secret') })
            : t('map.noSecretFound')}</p>}
        </div>
        <HeartMeter run={run} />
        <div className="floor-progress" aria-label={t('map.progress')}>
          {FLOORS.map((floor) => <i key={floor.index} className={floor.index < run.floorIndex ? 'done' : floor.index === run.floorIndex ? 'active' : ''} title={floorName(t, floor.index)} />)}
        </div>
        <p className="map-note">{t('map.note')}</p>
      </section>
      <section className={`route-board ${enteringNode ? 'route-entering' : ''}`} style={{ '--floor-color': FLOORS[run.floorIndex]?.palette } as React.CSSProperties}>
        <div className="route-canvas">
          <svg className="route-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {run.floorMap.nodes.filter((node) => !node.optional).flatMap((node) => node.connections.map((targetId) => {
              const target = run.floorMap.nodes.find((entry) => entry.id === targetId);
              if (!target) return null;
              const from = nodePoint(node); const to = nodePoint(target);
              const active = node.visited && (target.visited || available.has(target.id));
              const key = `${node.id}->${target.id}`;
              const style = run.floorMap.connectionStyles?.[key] ?? fallbackConnectionStyle(key);
              return <path key={key} d={routeCurve(from, to, style)} style={routeInkStyle(style)} className={active ? 'active' : ''} />;
            }))}
            {run.floorMap.nodes.filter((node) => node.optional).map((node) => {
              const anchor = run.floorMap.nodes.find((entry) => entry.id === node.anchorId);
              if (!anchor || !node.revealed) return null;
              const from = nodePoint(anchor); const to = nodePoint(node);
              const key = `${anchor.id}->${node.id}`;
              const style = run.floorMap.connectionStyles?.[key] ?? fallbackConnectionStyle(key);
              return <path key={key} d={routeCurve(from, to, style)} style={routeInkStyle(style)} className="secret-line" />;
            })}
          </svg>
          {visibleNodes.map((node) => {
            const point = nodePoint(node);
            const meta = ROOM_META[node.kind];
            const canEnter = available.has(node.id);
            const sealedSecret = node.optional && !node.doorOpened;
            const needsKey = run.floorIndex > 0 && (node.kind === 'shop' || node.kind === 'treasure');
            const noKey = canEnter && needsKey && run.player.keys < 1;
            const hidden = node.optional && !node.revealed;
            return (
              <button
                key={node.id}
                className={`map-node ${node.kind} ${node.visited ? 'visited' : ''} ${canEnter ? 'available' : ''} ${hidden ? 'hidden' : ''} ${enteringNode === node.id ? 'choosing' : ''}`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                disabled={!canEnter || noKey}
                onClick={() => {
                  if (enteringNode) return;
                  setEnteringNode(node.id);
                  window.setTimeout(() => onEnter(node.id), 420);
                }}
                title={hidden ? t('map.hidden') : `${roomName(t, node.kind)}：${roomHint(t, node.kind)}${sealedSecret ? ` ${t('map.needBomb')}` : ''}${needsKey ? ` ${t('map.needKey')}` : ''}`}
                aria-label={hidden ? t('map.hiddenLabel') : roomName(t, node.kind)}
              >
                <span>{hidden ? '?' : meta.icon}</span>
                {!hidden && <small>{roomName(t, node.kind)}</small>}
                {sealedSecret && <em>{t('map.sealed')}</em>}
                {noKey && <em>{t('map.noKey')}</em>}
                {canEnter && needsKey && !noKey && <em className="key-cost">⚿ 1</em>}
              </button>
            );
          })}
          <div className="route-depth-label top">{t('map.thisFloor')}</div>
          <div className="route-depth-label bottom">{t('map.bossDoor')}</div>
        </div>
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
  const directPlayable = canPlayCard(run, instance.instanceId);
  const fusionStarter = definition.type === 'attack'
    ? getAttackFusionMaterialIds(run, instance.instanceId)
      .find((id) => canPlayFusedAttack(run, instance.instanceId, [id]).ok)
    : undefined;
  const playable = directPlayable.ok || fusionStarter
    ? { ok: true }
    : directPlayable;
  const cooldown = run.combat?.cooldowns[instance.instanceId] ?? 0;
  const isSkill = definition.type === 'skill';
  const item = definition.itemId
    ? ITEMS[definition.itemId]
    : Object.values(ITEMS).find((entry) => entry.skillCardId === definition.id);
  const maxCharge = isSkill && item
    ? Math.max(1, (item.chargeRounds ?? 3) - (instance.upgraded ? 1 : 0))
    : 0;
  const charge = Math.max(0, maxCharge - cooldown);
  const disabled = locked || (mode === 'play' ? !playable.ok : false);
  return (
    <button
      className={`game-card ${definition.type} ${instance.upgraded ? 'upgraded' : ''} ${targeting ? 'targeting' : ''} ${animating ? (mode === 'discard' ? 'discarding-out' : 'playing-out') : ''}`}
      style={{ '--card-index': index } as React.CSSProperties}
      disabled={disabled}
      onClick={mode === 'play' ? onPlay : onDiscard}
      title={disabled && playable.reason ? errorText(t, playable.reason) : cardDescription(t, definition.id)}
    >
      <span className="card-cost">{definition.cost}</span>
      <span className="card-type">{cardTypeName(t, definition.type)}</span>
      {item && <span className={`card-quality quality-${item.quality}`}>{t('choice.quality', { quality: item.quality })}</span>}
      <b className="card-icon">{definition.icon}</b>
      <strong>{cardName(t, definition.id)}{instance.upgraded ? '+' : ''}</strong>
      <p>{cardDescription(t, definition.id)}</p>
      {isSkill && <small>{cooldown > 0 ? t('combat.recharging', { rounds: cooldown }) : t('combat.activeRetained')}</small>}
      {isSkill && mode === 'discard' && <small className="active-loss">{t('combat.activeDiscardWarning')}</small>}
      {definition.exhaust && <small>{t('combat.oneOff')}</small>}
      {isSkill && item && <div
        className={`charge-meter ${cooldown === 0 ? 'ready' : ''}`}
        role="progressbar"
        aria-label={t('combat.chargeProgress', { current: charge, max: maxCharge })}
        aria-valuemin={0}
        aria-valuemax={maxCharge}
        aria-valuenow={charge}
        title={t('combat.chargeProgress', { current: charge, max: maxCharge })}
      >
        <span className="charge-cells" style={{ '--charge-max': maxCharge } as React.CSSProperties}>
          {Array.from({ length: maxCharge }, (_, chargeIndex) => <i key={chargeIndex} className={chargeIndex < charge ? 'filled' : ''} />)}
        </span>
        <b>{charge}/{maxCharge}</b>
      </div>}
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

function FusionAttackModal({ run, attackInstanceId, selectedItemIds, onToggle, onCancel, onConfirm }: {
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
    .filter(({ definition }) => definition?.type === 'item' && Boolean(definition.itemId && ITEMS[definition.itemId]?.fusion));
  const preview = getAttackFusionPreview(run, attackInstanceId, selectedItemIds);
  const playable = canPlayFusedAttack(run, attackInstanceId, selectedItemIds);
  if (!attackDefinition || !preview) return null;
  const summary = [
    preview.damageMultiplier !== 1 ? t('fusion.damage', { value: preview.damageMultiplier.toFixed(2) }) : undefined,
    preview.flatDamage ? t('fusion.flatDamage', { value: preview.flatDamage }) : undefined,
    preview.projectileScale !== 1 ? t('fusion.size', { value: preview.projectileScale.toFixed(2) }) : undefined,
    preview.knockback ? t('fusion.knockback', { value: preview.knockback }) : undefined,
    preview.poisonTurns ? t('fusion.poison', { turns: preview.poisonTurns, damage: preview.poisonDamage }) : undefined,
    preview.slowTurns ? t('fusion.slow', { turns: preview.slowTurns }) : undefined,
    preview.curvedShots ? t('fusion.homing') : undefined,
    preview.attackMode ? t('fusion.form', { form: t(`attackModes.${preview.attackMode}`) }) : undefined,
  ].filter((value): value is string => Boolean(value));
  return <div className="fusion-backdrop" role="presentation">
    <section className="fusion-modal" role="dialog" aria-modal="true" aria-label={t('fusion.title')}>
      <header>
        <div><span>{t('fusion.kicker')}</span><h2>{t('fusion.title')}</h2><p>{t('fusion.description')}</p></div>
        <button onClick={onCancel} aria-label={t('fusion.cancel')}>×</button>
      </header>
      <div className="fusion-equation">
        <article><b>{attackDefinition.icon}</b><span>{cardName(t, attackDefinition.id)}</span><small>{attackDefinition.cost} {t('fusion.stamina')}</small></article>
        <strong>＋</strong>
        <div className="fusion-slots">
          {selectedItemIds.map((id) => {
            const card = run.player.deck.find((entry) => entry.instanceId === id);
            const definition = card ? CARDS[card.definitionId] : undefined;
            return definition ? <button key={id} onClick={() => onToggle(id)} title={t('fusion.remove')}><b>{definition.icon}</b><span>{cardName(t, definition.id)}</span></button> : null;
          })}
          {!selectedItemIds.length && <em>{t('fusion.noSelection')}</em>}
        </div>
      </div>
      <div className="fusion-items">
        {compatible.map(({ card, definition }) => {
          if (!definition?.itemId) return null;
          const item = ITEMS[definition.itemId]!;
          const selected = selectedItemIds.includes(card.instanceId);
          return <button
            key={card.instanceId}
            className={selected ? 'selected' : ''}
            aria-pressed={selected}
            onClick={() => onToggle(card.instanceId)}
          >
            <b>{item.icon}</b>
            <span><strong>{itemName(t, item.id)}</strong><small>{t('choice.quality', { quality: item.quality })} · {t('fusion.free')}</small></span>
            <em>{t(`fusion.items.${item.id}`)}</em>
          </button>;
        })}
        {!compatible.length && <div className="fusion-empty">{t('fusion.empty')}</div>}
      </div>
      <div className="fusion-summary">
        <div>{summary.length ? summary.map((entry) => <span key={entry}>{entry}</span>) : <span>{t('fusion.basic')}</span>}</div>
        <strong>{t('fusion.total', { cost: preview.totalCost, remaining: (run.combat?.vitality ?? 0) - preview.totalCost })}</strong>
      </div>
      <footer><button className="text-button" onClick={onCancel}>{t('fusion.cancel')}</button><button className="primary-button" disabled={!playable.ok} onClick={onConfirm}>{selectedItemIds.length ? t('fusion.confirm') : t('fusion.direct')} <span>→</span></button></footer>
    </section>
  </div>;
}

interface ConfirmationItem {
  icon: string;
  name: string;
  note: string;
}

function ConfirmationPanel({ eyebrow, title, message, items, confirmLabel, onConfirm, onCancel }: {
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
  return <div
    className="confirmation-backdrop"
    role="presentation"
    onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}
  >
    <section className="confirmation-panel" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message">
      <header><span>{eyebrow}</span><button onClick={onCancel} aria-label={t('confirmation.close')}>×</button></header>
      <div className="confirmation-copy">
        <b aria-hidden="true">!</b>
        <div><h2 id="confirmation-title">{title}</h2><p id="confirmation-message">{message}</p></div>
      </div>
      <div className={`confirmation-items ${items.length === 1 ? 'single' : ''}`}>
        {items.map((item, index) => <div key={`${item.name}-${index}`}>
          <b>{item.icon}</b><span><small>{item.note}</small><strong>{item.name}</strong></span>
        </div>)}
        {items.length === 2 && <i aria-hidden="true">→</i>}
      </div>
      <footer>
        <button className="text-button" onClick={onCancel}>{t('confirmation.cancel')}</button>
        <button ref={confirmButton} className="primary-button confirmation-submit" onClick={onConfirm}>{confirmLabel}<span>→</span></button>
      </footer>
    </section>
  </div>;
}

type TargetingGeometry = {
  width: number;
  height: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  path: string;
  locked: boolean;
};

function TargetingGuide({ hoveredTargetId, targetName }: { hoveredTargetId?: string; targetName?: string }) {
  const { t } = useTranslation();
  const [geometry, setGeometry] = useState<TargetingGeometry>();
  const pointer = useRef<{ x: number; y: number } | undefined>(undefined);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = 0;
      const source = document.querySelector<HTMLElement>('.game-card.targeting');
      if (!source) return;
      const sourceRect = source.getBoundingClientRect();
      const target = hoveredTargetId
        ? document.querySelector<HTMLElement>(`[data-enemy-instance-id="${hoveredTargetId}"]`)
        : null;
      const targetRect = target?.getBoundingClientRect();
      const width = window.innerWidth;
      const height = window.innerHeight;
      const startX = Math.max(18, Math.min(width - 18, sourceRect.left + sourceRect.width / 2));
      const startY = Math.max(18, Math.min(height - 18, sourceRect.top + 12));
      const fallback = pointer.current ?? { x: width * .72, y: Math.max(110, startY - 230) };
      const endX = targetRect ? targetRect.left + targetRect.width / 2 : fallback.x;
      const endY = targetRect ? targetRect.top + targetRect.height / 2 : fallback.y;
      const lift = Math.max(90, Math.min(270, Math.abs(startY - endY) * .68 + Math.abs(startX - endX) * .13));
      const controlOneY = Math.max(14, startY - lift);
      const controlTwoY = Math.min(height - 14, endY + lift * .38);
      setGeometry({
        width, height, startX, startY, endX, endY,
        path: `M ${startX} ${startY} C ${startX} ${controlOneY}, ${endX} ${controlTwoY}, ${endX} ${endY}`,
        locked: Boolean(targetRect),
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(draw);
    };
    const followPointer = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      schedule();
    };
    window.addEventListener('pointermove', followPointer, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    schedule();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', followPointer);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [hoveredTargetId]);
  if (!geometry) return null;
  const markerId = geometry.locked ? 'target-arrow-head-locked' : 'target-arrow-head-seeking';
  return <div className={`targeting-guide ${geometry.locked ? 'locked' : 'seeking'}`} role="status" aria-live="polite">
    <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true">
      <defs>
        <filter id="target-arrow-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
        <marker id="target-arrow-head-seeking" markerWidth="22" markerHeight="22" refX="19" refY="11" orient="auto" markerUnits="userSpaceOnUse"><path d="M 2 2 L 20 11 L 2 20 Z" fill="#dd6f64" /></marker>
        <marker id="target-arrow-head-locked" markerWidth="22" markerHeight="22" refX="19" refY="11" orient="auto" markerUnits="userSpaceOnUse"><path d="M 2 2 L 20 11 L 2 20 Z" fill="#f1c574" /></marker>
      </defs>
      <path className="target-arrow-glow" d={geometry.path} />
      <path className="target-arrow-main" d={geometry.path} markerEnd={`url(#${markerId})`} />
      <path className="target-arrow-flow" d={geometry.path} />
      <circle className="target-arrow-origin" cx={geometry.startX} cy={geometry.startY} r="8" />
      {geometry.locked && <><circle className="target-arrow-reticle outer" cx={geometry.endX} cy={geometry.endY} r="24" /><circle className="target-arrow-reticle inner" cx={geometry.endX} cy={geometry.endY} r="9" /></>}
    </svg>
    <div className="targeting-cursor-label" style={{ left: geometry.endX, top: geometry.endY }}>
      {geometry.locked ? <><strong>{targetName}</strong><span>{t('combat.targetReady')}</span></> : <span>{t('combat.targetSeek')}</span>}
    </div>
  </div>;
}

const COMBAT_ANIMATION_DURATIONS: Record<CombatAnimationEvent['kind'], number> = {
  'card-play': 460,
  'card-discard': 440,
  'discard-phase': 850,
  'enemy-phase': 850,
  'round-start': 850,
  move: 520,
  'player-attack': 3100,
  'enemy-attack': 3100,
  shield: 520,
  heal: 520,
  poison: 520,
  curse: 560,
  prepare: 600,
  summon: 720,
  idle: 420,
  defeat: 650,
  'bomb-blast': 900,
  'bomb-hit': 3100,
  'black-heart': 560,
};

function combatAnimationDuration(events: readonly CombatAnimationEvent[]): number {
  return events.reduce((sum, event) => sum + COMBAT_ANIMATION_DURATIONS[event.kind], 0);
}

function CombatView({ run, commit }: { run: RunState; commit: (action: (state: RunState) => RunState) => void }) {
  const { t } = useTranslation();
  const [animatingCardId, setAnimatingCardId] = useState<string>();
  const [animationLocked, setAnimationLocked] = useState(false);
  const [viewingPile, setViewingPile] = useState<'draw' | 'discard'>();
  const [targetingCardId, setTargetingCardId] = useState<string>();
  const [fusionAttackId, setFusionAttackId] = useState<string>();
  const [fusionItemIds, setFusionItemIds] = useState<string[]>([]);
  const [pendingFusionItemIds, setPendingFusionItemIds] = useState<string[]>([]);
  const [hoveredTargetId, setHoveredTargetId] = useState<string>();
  const [bombTargeting, setBombTargeting] = useState(false);
  const [pendingActiveDiscard, setPendingActiveDiscard] = useState<{ type: 'single'; instanceId: string } | { type: 'all' }>();
  const combat = run.combat!;
  const deploymentPending = Boolean(combat.deploymentPending);
  const lastAnimationSequence = useRef(combat.animationSequence);
  const discardMode = run.phase === 'discard';
  const handCards = combat.hand.map((id) => run.player.deck.find((card) => card.instanceId === id)).filter((card): card is CardInstance => Boolean(card));
  const selected = combat.enemies.find((enemy) => enemy.instanceId === combat.selectedEnemyId);
  const targetingCard = targetingCardId ? run.player.deck.find((card) => card.instanceId === targetingCardId) : undefined;
  const targetingDefinition = targetingCard ? CARDS[targetingCard.definitionId] : undefined;
  const hoveredTarget = hoveredTargetId ? combat.enemies.find((enemy) => enemy.instanceId === hoveredTargetId) : undefined;
  const discardable = handCards;
  const cardsToDiscard = Math.max(0, handCards.length - run.player.stats.maxRetain);
  const activeItem = run.player.activeItemId ? ITEMS[run.player.activeItemId] : undefined;
  const activeSkillCardId = activeItem?.skillCardId;
  useEffect(() => {
    const events = combat.animationEvents.filter((event) => event.sequence > lastAnimationSequence.current);
    lastAnimationSequence.current = combat.animationSequence;
    if (!events.length) return;
    const blockingEvents = events.filter((event) => event.kind !== 'move' || event.sourceId !== 'isaac');
    if (!blockingEvents.length) return;
    const duration = combatAnimationDuration(blockingEvents);
    setAnimationLocked(true);
    const timer = window.setTimeout(() => setAnimationLocked(false), duration);
    return () => window.clearTimeout(timer);
  }, [combat.animationSequence]);
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
  const discardAll = () => {
    if (activeSkillCardId && handCards.some((card) => card.definitionId === activeSkillCardId)) {
      setPendingActiveDiscard({ type: 'all' });
      return;
    }
    discardAllCards();
  };
  return (
    <main className={`combat-page ${targetingCardId ? 'targeting-active' : ''} ${bombTargeting ? 'bomb-targeting-active' : ''}`}>
      <section className="combat-arena-layout">
        <aside className="combat-side-hud">
          <div className="combat-heading">
            <p className="eyebrow">{t('combat.room', { room: roomName(t, combat.roomKind) })}</p>
            <h1>{deploymentPending ? t('combat.deploymentTitle') : combat.roomKind === 'boss' ? floorBoss(t, run.floorIndex) : t('combat.round', { round: combat.round })}</h1>
          </div>
          <div className="combat-player-hud">
          <span className="hud-name">{t('stats.character')}</span>
          <HeartMeter run={run} shield={combat.playerShield} armor={run.player.stats.armor + combat.playerArmorBuff} />
          <div className="tactical-stats"><span>◎ {t('combat.range', { value: getPlayerAttackRange(run) })}</span><span>↝ {t('combat.moveSpeed', { value: getPlayerMovementSpeed(run) })}</span><span>⌖ ({combat.playerPosition?.x ?? 0},{combat.playerPosition?.y ?? 4})</span></div>
          </div>
          <div className="hud-vitality-block">
            <span>{t('combat.vitalityLabel')}</span>
            <div className="vitality-orbs" title={t('combat.vitalityHint')}>
              {Array.from({ length: run.player.stats.maxVitality }, (_, index) => <i key={index} className={index < combat.vitality ? 'full' : ''} />)}
              <strong>{t('combat.vitality', { value: combat.vitality })}</strong>
            </div>
          </div>
          <div className="combat-log">
            {combat.log.slice(0, 4).map((entry) => <p className={entry.tone} key={entry.id}>{logText(t, run, entry.message, entry.messageKey, entry.params)}</p>)}
          </div>
        </aside>
        <div className={`combat-stage-stack ${deploymentPending ? 'deploying' : ''}`}>
          <Suspense fallback={<div className="phaser-stage stage-loading">{t('combat.preparing')}</div>}>
            <PhaserStage
              run={run}
              highlightedEnemyId={targetingCardId ? hoveredTargetId : undefined}
              bombTargeting={bombTargeting}
              movementDisabled={animationLocked || discardMode || deploymentPending || bombTargeting}
              onMove={(x, y) => commit((state) => movePlayer(state, x, y))}
              onDeploy={(x, y) => commit((state) => placePlayerForDeployment(state, x, y))}
              onBomb={(x, y) => {
                setBombTargeting(false);
                commit((state) => useCombatBomb(state, x, y));
              }}
            />
          </Suspense>
          {deploymentPending && <div className="deployment-panel" role="status">
            <span>{t('combat.deploymentKicker')}</span>
            <strong>{t('combat.deploymentPrompt')}</strong>
            <p>{t('combat.deploymentHint')}</p>
            <small>⌖ ({combat.playerPosition.x},{combat.playerPosition.y})</small>
            <button className="primary-button" onClick={() => commit(confirmPlayerDeployment)}>{t('combat.confirmDeployment')} <b>→</b></button>
          </div>}
          {targetingCardId && <div className="targeting-instruction">
            <span>↗</span><div><strong>{t('combat.targetGuideTitle')}</strong><small>{t('combat.targetGuideHint')}</small></div>
          </div>}
          {bombTargeting && <div className="targeting-instruction bomb-targeting-instruction">
            <span>●</span><div><strong>{t('combat.bombTargetTitle')}</strong><small>{t('combat.bombTargetHint')}</small></div>
            <button className="target-cancel" onClick={() => setBombTargeting(false)}>{t('combat.cancelBomb')}</button>
          </div>}
          <div className={`enemy-strip ${targetingCardId ? 'targeting' : ''} ${combat.enemies.filter((enemy) => enemy.hp > 0).length > 3 ? 'crowded' : ''}`}>
        {combat.enemies.map((enemy, enemyIndex) => {
          const intendedActions = enemy.intent.actions?.length
            ? enemy.intent.actions
            : [{ kind: enemy.intent.kind, value: enemy.intent.value }];
          const intendedAttacks = intendedActions.filter((entry) => entry.kind === 'attack');
          const weakenedActions = Array.from({ length: enemy.boss ? 2 : 1 }, (_, index) => ({
            kind: 'attack' as const,
            value: Math.max(1, Math.round((intendedAttacks[index]?.value ?? intendedAttacks[0]?.value ?? enemy.attack) * 0.6)),
          }));
          const shownIntent: EnemyIntent = (enemy.staggeredTurns ?? 0) > 0
            ? { kind: 'idle', value: 0, label: '', actions: [{ kind: 'idle', value: 0 }] }
            : enemy.cursedTurns > 0
              ? { kind: 'attack', value: weakenedActions[0]!.value, label: '', actions: weakenedActions }
              : enemy.intent;
          const shownActions = shownIntent.actions?.length
            ? shownIntent.actions
            : [{ kind: shownIntent.kind, value: shownIntent.value }];
          const inRange = isEnemyInPlayerRange(run, enemy.instanceId);
          const seesPlayer = isPlayerInEnemyVision(run, enemy.instanceId);
          const enemyMoveSpeed = getEnemyMovementSpeed(enemy);
          const duplicateEnemies = combat.enemies.filter((entry) => entry.hp > 0 && entry.id === enemy.id);
          const duplicateIndex = combat.enemies
            .slice(0, enemyIndex + 1)
            .filter((entry) => entry.hp > 0 && entry.id === enemy.id).length;
          const identityNumber = duplicateEnemies.length > 1 ? duplicateIndex : undefined;
          const targetable = Boolean(targetingCardId && (targetingDefinition?.type === 'attack'
            ? pendingFusionItemIds.length
              ? canPlayFusedAttack(run, targetingCardId, pendingFusionItemIds, enemy.instanceId).ok
              : canPlayCard(run, targetingCardId, enemy.instanceId).ok
            : canPlayCard(run, targetingCardId, enemy.instanceId).ok));
          return <button
            key={enemy.instanceId}
            data-enemy-instance-id={enemy.instanceId}
            disabled={deploymentPending || bombTargeting || enemy.hp <= 0 || animationLocked || Boolean(targetingCardId && !targetable)}
            className={`enemy-panel ${selected?.instanceId === enemy.instanceId ? 'selected' : ''} ${targetable ? 'targetable' : ''} ${hoveredTargetId === enemy.instanceId ? 'aimed' : ''} ${enemy.hp <= 0 ? 'dead' : ''} ${inRange ? 'in-range' : 'out-of-range'}`}
            onPointerEnter={() => { if (targetable) setHoveredTargetId(enemy.instanceId); }}
            onPointerLeave={() => setHoveredTargetId((current) => current === enemy.instanceId ? undefined : current)}
            onFocus={() => { if (targetable) setHoveredTargetId(enemy.instanceId); }}
            onBlur={() => setHoveredTargetId((current) => current === enemy.instanceId ? undefined : current)}
            onClick={() => {
              if (targetingCardId) {
                const cardId = targetingCardId;
                const fusedIds = [...pendingFusionItemIds];
                setTargetingCardId(undefined);
                setPendingFusionItemIds([]);
                setHoveredTargetId(undefined);
                animateCardAction(cardId, (state) => targetingDefinition?.type === 'attack'
                  ? fusedIds.length
                    ? playFusedAttack(state, cardId, fusedIds, enemy.instanceId)
                    : playCard(state, cardId, enemy.instanceId)
                  : playCard(state, cardId, enemy.instanceId));
              } else {
                commit((state) => selectEnemy(state, enemy.instanceId));
              }
            }}
          >
            {targetable && <span className="targeting-marker">{hoveredTargetId === enemy.instanceId ? t('combat.targetReady') : t('combat.targetAvailable')}</span>}
            <span className={`intent ${shownIntent.kind}`}>
              <span className="intent-movement">↝ {t('combat.enemyMoveAction', { value: enemyMoveSpeed })}</span>
              {enemy.boss && <b className="boss-action-count">{t('combat.bossDoubleAction')}</b>}
              <span className="intent-actions">
                {shownActions.map((entry, index) => <span className={`intent-action ${entry.kind}`} key={`${entry.kind}-${index}`}>
                  {enemy.boss && <b>{index + 1}</b>}{enemyIntentIcon(entry.kind)} {intentLabel(t, { ...entry, label: '' })}
                </span>)}
              </span>
            </span>
            <strong>{enemyName(t, enemy)}{identityNumber && <b className="enemy-identity">#{identityNumber}</b>}</strong>
            <span>{enemy.hp}/{enemy.maxHp} {t('combat.hp')} · {enemy.armor} {t('combat.armor')} {enemy.shield ? `· ${enemy.shield} ${t('combat.shield')}` : ''}</span>
            <span className="enemy-grid-stats">⌖ ({enemy.position?.x ?? 15},{enemy.position?.y ?? 4}) · {enemy.footprintWidth}×{enemy.footprintHeight} · ◎ {enemy.attackRange ?? 1} · ◉ {t('combat.vision', { value: enemy.visionRange })} · ↝ {enemyMoveSpeed}</span>
            <span className={`enemy-awareness ${enemy.alerted || seesPlayer ? 'alerted' : 'wandering'}`}>{enemy.alerted ? t('combat.enemyAlerted') : seesPlayer ? t('combat.enemyWatching') : t('combat.enemyWandering')} · {inRange ? t('combat.inRange') : t('combat.outOfRange')}</span>
            {enemy.cursedTurns > 0 && <em>{t('combat.weakened', { turns: enemy.cursedTurns })}</em>}
            {(enemy.staggeredTurns ?? 0) > 0 && <em>{t('combat.staggered')}</em>}
            {(enemy.poisonTurns ?? 0) > 0 && <em className="poisoned">{t('combat.poisoned', { turns: enemy.poisonTurns, damage: enemy.poisonDamage })}</em>}
            {(enemy.slowedTurns ?? 0) > 0 && <em className="slowed">{t('combat.slowed', { turns: enemy.slowedTurns })}</em>}
          </button>;
        })}
          </div>
      </div>
      </section>
      <section className={`hand-zone ${discardMode ? 'discarding' : ''}`}>
        <div className="hand-heading">
          <div>
            <span className="eyebrow">{t('combat.hand', { count: handCards.length, max: run.player.stats.drawCount })}</span>
            <strong>{deploymentPending
              ? t('combat.cardsLockedDuringDeployment')
              : discardMode
              ? t('combat.discardPrompt', { count: run.player.stats.maxRetain })
              : targetingDefinition
                ? <>{t('combat.chooseCardTarget', { card: cardName(t, targetingDefinition.id) })} <button className="target-cancel" onClick={() => { setTargetingCardId(undefined); setPendingFusionItemIds([]); setHoveredTargetId(undefined); }}>{t('fusion.cancelTarget')}</button></>
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
              locked={deploymentPending || bombTargeting || Boolean(animatingCardId) || animationLocked}
              onPlay={() => {
                const definition = CARDS[instance.definitionId];
                if (definition?.type === 'attack') {
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
                  } else if (definition.target === 'enemy') {
                    setTargetingCardId(instance.instanceId);
                  } else {
                    animateCardAction(instance.instanceId, (state) => playCard(state, instance.instanceId));
                  }
                  return;
                }
                if (definition?.target === 'enemy' && definition.type === 'hex') {
                  setTargetingCardId((current) => current === instance.instanceId ? undefined : instance.instanceId);
                  return;
                }
                setTargetingCardId(undefined);
                animateCardAction(instance.instanceId, (state) => playCard(state, instance.instanceId));
              }}
              onDiscard={() => {
                if (instance.definitionId === activeSkillCardId) {
                  setPendingActiveDiscard({ type: 'single', instanceId: instance.instanceId });
                  return;
                }
                animateCardAction(instance.instanceId, (state) => discardCard(state, instance.instanceId));
              }}
            />
          ))}
        </div>
        <div className={`turn-actions ${discardMode ? 'discard-actions' : ''}`}>
          {discardMode ? (
            <>
              <div className={`discard-phase-callout ${cardsToDiscard === 0 ? 'ready' : 'waiting'}`} role="status" aria-live="polite">
                <span aria-hidden="true">{cardsToDiscard === 0 ? '!' : cardsToDiscard}</span>
                <div>
                  <strong>{cardsToDiscard === 0 ? t('combat.discardReadyTitle') : t('combat.discardNeededTitle', { count: cardsToDiscard })}</strong>
                  <small>{cardsToDiscard === 0
                    ? t('combat.discardReadyHint')
                    : t('combat.discardNeededHint', { count: run.player.stats.maxRetain })}</small>
                </div>
              </div>
              <button className="text-button" disabled={!discardable.length || animationLocked} onClick={discardAll}>{t('combat.discardAll')}</button>
              <button className="primary-button enemy-phase-button" disabled={animationLocked || cardsToDiscard > 0} onClick={() => commit(finishDiscard)}>{t('combat.faceEnemy')} <span>→</span></button>
            </>
          ) : (
            <>
              <button
                className={`resource-action bomb-action ${bombTargeting ? 'active' : ''}`}
                disabled={deploymentPending || animationLocked || Boolean(targetingCardId) || run.player.bombs < 1}
                onClick={() => {
                  setTargetingCardId(undefined);
                  setPendingFusionItemIds([]);
                  setHoveredTargetId(undefined);
                  setBombTargeting((current) => !current);
                }}
              ><span>●</span>{t('combat.useBomb')} <b>×{run.player.bombs}</b></button>
              <button className="primary-button danger-button" disabled={deploymentPending || animationLocked || Boolean(targetingCardId) || bombTargeting} onClick={() => commit(endTurn)}>{t('combat.endTurn')} <span>→</span></button>
            </>
          )}
        </div>
      </section>
      {animationLocked && <div className="animation-status"><i />{t('combat.resolving')}</div>}
      <CombatItemRail run={run} />
      {targetingCardId && <TargetingGuide hoveredTargetId={hoveredTargetId} targetName={hoveredTarget ? enemyName(t, hoveredTarget) : undefined} />}
      {viewingPile && <PileViewer run={run} pile={viewingPile} onClose={() => setViewingPile(undefined)} />}
      {fusionAttackId && <FusionAttackModal
        run={run}
        attackInstanceId={fusionAttackId}
        selectedItemIds={fusionItemIds}
        onToggle={(instanceId) => setFusionItemIds((current) => current.includes(instanceId) ? current.filter((id) => id !== instanceId) : [...current, instanceId])}
        onCancel={() => { setFusionAttackId(undefined); setFusionItemIds([]); }}
        onConfirm={() => {
          const attackId = fusionAttackId;
          const selectedFusionIds = [...fusionItemIds];
          const definition = getCardDefinition(run, attackId);
          setFusionAttackId(undefined);
          setFusionItemIds([]);
          if (definition?.target === 'enemy') {
            setPendingFusionItemIds(selectedFusionIds);
            setTargetingCardId(attackId);
          } else {
            animateCardAction(attackId, (state) => selectedFusionIds.length
              ? playFusedAttack(state, attackId, selectedFusionIds)
              : playCard(state, attackId));
          }
        }}
      />}
      {pendingActiveDiscard && activeItem && <ConfirmationPanel
        eyebrow={t('confirmation.irreversible')}
        title={t('confirmation.discardActiveTitle')}
        message={t('combat.confirmActiveDiscard', { item: itemName(t, activeItem.id) })}
        items={[{ icon: activeItem.icon, name: itemName(t, activeItem.id), note: t('confirmation.currentActive') }]}
        confirmLabel={t(pendingActiveDiscard.type === 'all' ? 'confirmation.discardAll' : 'confirmation.discardActive')}
        onCancel={() => setPendingActiveDiscard(undefined)}
        onConfirm={() => {
          const pending = pendingActiveDiscard;
          setPendingActiveDiscard(undefined);
          if (pending.type === 'all') discardAllCards();
          else animateCardAction(pending.instanceId, (state) => discardCard(state, pending.instanceId));
        }}
      />}
    </main>
  );
}

function ChoiceCard({ option, run, dealType, onChoose }: { option: RewardOption; run: RunState; dealType?: 'devil' | 'angel'; onChoose: () => void }) {
  const { t } = useTranslation();
  const choice = run.choice!;
  const unaffordable = (option.price ?? 0) > run.player.coins || (dealType === 'devil' && option.type === 'item' && run.player.redContainers <= 1);
  const offeredCard = option.cardId ? CARDS[option.cardId] : undefined;
  const offeredCardItem = offeredCard?.itemId ? ITEMS[offeredCard.itemId] : undefined;
  return (
    <button className={`choice-card ${option.type} ${option.sold ? 'sold' : ''}`} disabled={option.sold || unaffordable} onClick={onChoose}>
      {option.price !== undefined && <span className="price">{option.price}¢</span>}
      <b>{option.icon}</b>
      <strong>{optionLabel(t, option, choice)}</strong>
      <p>{optionDescription(t, option, choice)}</p>
      {option.type === 'item' && option.itemId && <small>{t(`itemKinds.${ITEMS[option.itemId]?.kind}`)} · {t('choice.quality', { quality: ITEMS[option.itemId]?.quality })}{ITEMS[option.itemId]?.kind === 'passive' ? ` · ${t(itemUsesCombatCard(ITEMS[option.itemId]!) ? 'choice.addsItemCard' : 'choice.permanentItem')}` : ''}</small>}
      {option.type === 'card' && offeredCard && <small>{t('choice.cardLabel', { type: cardTypeName(t, offeredCard.type) })}{offeredCardItem ? ` · ${t('choice.quality', { quality: offeredCardItem.quality })}` : ''}</small>}
      {choice.rewardContext === 'floor-start' && option.type === 'resource' && <small>{t('choice.assetPack')}</small>}
      {option.sold && <em>{t('choice.sold')}</em>}
      {unaffordable && !option.sold && <em>{dealType === 'devil' && run.player.redContainers <= 1 ? t('choice.needContainers') : t('choice.notEnoughCoins')}</em>}
    </button>
  );
}

function rewardIcon(reward: string): string {
  if (/¢$/.test(reward)) return '¢';
  if (/bomb/.test(reward)) return '●';
  if (/key/.test(reward)) return '⚿';
  if (/black heart/.test(reward)) return '♥';
  if (/soul heart/.test(reward)) return '♡';
  if (/red-heart/.test(reward)) return '♥';
  return '✦';
}

function RoomClearTransition({ delayMs }: { delayMs: number }) {
  const { t } = useTranslation();
  return <div
    className="room-clear-transition"
    role="status"
    aria-live="assertive"
    style={{ '--room-clear-delay': `${delayMs}ms` } as React.CSSProperties}
  >
    <div className="room-clear-sigil" aria-hidden="true"><i /><b>✦</b><i /></div>
    <div className="room-clear-copy">
      <span>{t('combat.roomClearKicker')}</span>
      <strong>{t('combat.roomClearTitle')}</strong>
      <small>{t('combat.roomClearNext')}</small>
    </div>
  </div>;
}

function RoomRewardReveal({ run }: { run: RunState }) {
  const { t } = useTranslation();
  return <div className="reward-reveal" role="status" aria-live="assertive">
    <div className="reward-rays" />
    <div className="reward-chest" aria-hidden="true"><i /><b>◆</b></div>
    <div className="reward-title"><span>{t('rewardReveal.cleared')}</span><strong>{t('rewardReveal.open')}</strong></div>
    <div className="reward-drops">
      {run.lastReward.map((reward, index) => <div key={`${reward}-${index}`} style={{ '--reward-index': index } as React.CSSProperties}>
        <b>{rewardIcon(reward)}</b><span>{rewardText(t, reward)}</span>
      </div>)}
    </div>
  </div>;
}

function ChoiceView({ run, commit, revealRoomReward = false }: {
  run: RunState;
  commit: (action: (state: RunState) => RunState) => void;
  revealRoomReward?: boolean;
}) {
  const { t } = useTranslation();
  const [choosingId, setChoosingId] = useState<string>();
  const [pendingActiveChoice, setPendingActiveChoice] = useState<RewardOption>();
  const choice = run.choice!;
  const [revealingReward, setRevealingReward] = useState(Boolean(revealRoomReward || (run.combat && run.lastReward.length)));
  useEffect(() => {
    if (!revealingReward) return;
    const timer = window.setTimeout(() => setRevealingReward(false), 1900);
    return () => window.clearTimeout(timer);
  }, [revealingReward]);
  const beginChoice = (option: RewardOption) => {
    if (choosingId) return;
    setChoosingId(option.id);
    window.setTimeout(() => {
      commit((state) => chooseOption(state, option.id));
      setChoosingId(undefined);
    }, 340);
  };
  const requestChoice = (option: RewardOption) => {
    if (choosingId) return;
    const offeredItem = option.itemId ? ITEMS[option.itemId] : undefined;
    if (offeredItem?.kind === 'active' && run.player.activeItemId) {
      setPendingActiveChoice(option);
      return;
    }
    beginChoice(option);
  };
  const currentActiveItem = run.player.activeItemId ? ITEMS[run.player.activeItemId] : undefined;
  const pendingReplacement = pendingActiveChoice?.itemId ? ITEMS[pendingActiveChoice.itemId] : undefined;
  return (
    <main className={`choice-page ${choice.dealType ?? choice.kind}`}>
      {revealingReward && <RoomRewardReveal run={run} />}
      <div className="choice-aura" />
      <section className="choice-copy">
        <p className="eyebrow">{choice.kind === 'upgrade' ? t('choice.floorReward') : t('choice.chooseReward')}</p>
        <h1>{choiceTitle(t, run)}</h1>
        <p>{choiceSubtitle(t, run)}</p>
        {run.lastReward.length > 0 && <div className="drop-notice">{t('choice.roomDrop', { rewards: rewardsText(t, run) })}</div>}
      </section>
      <section className="choice-grid">
        {choice.options.map((option) => <div className={choosingId === option.id ? 'choice-selecting' : ''} key={option.id}><ChoiceCard option={option} run={run} dealType={choice.dealType} onChoose={() => requestChoice(option)} /></div>)}
      </section>
      {choice.canSkip && <button className="text-button choice-skip" onClick={() => commit(skipChoice)}>{t('choice.leaveEmpty')} <span>→</span></button>}
      {choice.kind === 'shop' && <div className="shop-purse">{t('choice.shopPurse')} <strong>{run.player.coins}¢</strong></div>}
      {pendingActiveChoice && currentActiveItem && pendingReplacement && <ConfirmationPanel
        eyebrow={t('confirmation.inventoryChange')}
        title={t('confirmation.replaceActiveTitle')}
        message={t('choice.replaceActiveConfirm', { current: itemName(t, currentActiveItem.id), next: itemName(t, pendingReplacement.id) })}
        items={[
          { icon: currentActiveItem.icon, name: itemName(t, currentActiveItem.id), note: t('confirmation.currentActive') },
          { icon: pendingReplacement.icon, name: itemName(t, pendingReplacement.id), note: t('confirmation.newActive') },
        ]}
        confirmLabel={t('confirmation.replaceActive')}
        onCancel={() => setPendingActiveChoice(undefined)}
        onConfirm={() => {
          const option = pendingActiveChoice;
          setPendingActiveChoice(undefined);
          beginChoice(option);
        }}
      />}
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
          <span>{t('stats.attackForm')} <b>{t(`attackModes.${stats.attackMode}`)}</b></span>
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
  const [combatClearTransition, setCombatClearTransition] = useState<{ id: string; delayMs: number }>();
  const [roomRewardRevealId, setRoomRewardRevealId] = useState<string>();
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

  useEffect(() => {
    if (!combatClearTransition) return;
    const timer = window.setTimeout(() => {
      setRoomRewardRevealId(combatClearTransition.id);
      setCombatClearTransition(undefined);
    }, combatClearTransition.delayMs + 1250);
    return () => window.clearTimeout(timer);
  }, [combatClearTransition]);

  useEffect(() => {
    if (!roomRewardRevealId) return;
    const timer = window.setTimeout(() => setRoomRewardRevealId(undefined), 2100);
    return () => window.clearTimeout(timer);
  }, [roomRewardRevealId]);

  const commit = (action: (state: RunState) => RunState) => {
    if (!run) return;
    try {
      const next = action(run);
      const clearedCombat = ['combat', 'discard'].includes(run.phase)
        && next.phase === 'choice'
        && Boolean(next.combat?.enemies.length)
        && next.combat!.enemies.every((enemy) => enemy.hp <= 0);
      if (clearedCombat && next.combat) {
        const previousSequence = run.combat?.animationSequence ?? 0;
        const finishingEvents = next.combat.animationEvents.filter((event) => event.sequence > previousSequence);
        setCombatClearTransition({
          id: `${next.currentRoomId ?? next.combat.roomKind}:${next.combat.animationSequence}`,
          delayMs: Math.max(850, combatAnimationDuration(finishingEvents) + 100),
        });
        setRoomRewardRevealId(undefined);
      }
      setRun(next);
      setNotice('');
    } catch (error) {
      setNotice(errorText(t, error instanceof Error ? error.message : 'That action is unavailable'));
    }
  };

  const start = (seed: string) => {
    const next = createRun(seed, profile.unlockedItemIds);
    setCombatClearTransition(undefined);
    setRoomRewardRevealId(undefined);
    setRun(next); setNotice('');
    void saveRun(next, true);
  };

  const goHome = () => {
    if (run && ['victory', 'defeat'].includes(run.phase)) localStorage.removeItem(LOCAL_RUN_KEY);
    setCombatClearTransition(undefined);
    setRoomRewardRevealId(undefined);
    setRun(null);
    setLocalRun(readLocalRun());
    void Promise.all([loadProfile(), loadRecentRuns()]).then(([nextProfile, nextRuns]) => { setProfile(nextProfile); setRecentRuns(nextRuns); });
  };

  if (!run) return <Home profile={profile} localRun={localRun} recentRuns={recentRuns} onStart={start} onResume={(next) => setRun(hydrateRunState(next))} />;

  const onAbandon = () => {
    if (window.confirm(t('header.abandonConfirm'))) commit(abandonRun);
  };

  const showingCombatClear = Boolean(combatClearTransition && run.phase === 'choice' && run.combat);

  return (
    <div className={`game-shell phase-${showingCombatClear ? 'combat' : run.phase}`}>
      <Header run={run} onAbandon={onAbandon} />
      {notice && <button className="toast" onClick={() => setNotice('')}>{notice}<span>×</span></button>}
      {!showingCombatClear && run.unlockNotices.length > 0 && run.phase !== 'victory' && <div className="unlock-toast">{t('result.newUnlock', { message: unlockText(t, run.unlockNotices.at(-1)!.itemId) })}</div>}
      {run.phase === 'map' && <RouteMap run={run} onEnter={(id) => commit((state) => enterRoom(state, id))} onBombSearch={() => commit(useMapBomb)} />}
      {(run.phase === 'combat' || run.phase === 'discard' || showingCombatClear) && run.combat && <CombatView run={run} commit={commit} />}
      {showingCombatClear && combatClearTransition && <RoomClearTransition key={combatClearTransition.id} delayMs={combatClearTransition.delayMs} />}
      {run.phase === 'choice' && run.choice && !showingCombatClear && <ChoiceView run={run} commit={commit} revealRoomReward={Boolean(roomRewardRevealId)} />}
      {(run.phase === 'victory' || run.phase === 'defeat') && <ResultView run={run} onHome={goHome} />}
      {!showingCombatClear && !['victory', 'defeat', 'combat', 'discard'].includes(run.phase) && <StatsRail run={run} />}
    </div>
  );
}
