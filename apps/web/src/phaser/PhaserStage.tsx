import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Phaser from 'phaser';
import {
  CARDS,
  DEFAULT_COMBAT_ROOM_LAYOUT,
  getPlayerDeploymentCells,
  getReachablePlayerCells,
  getEnemyOccupiedCells,
  isCombatCellAvailable,
  isPositionInPlayerAttackRange,
  type CombatRoomLayout,
  type EnemyState,
  type RunState,
} from '@isaac-spire/game';
import { cardName, enemyName, roomName } from '../localize';
import { BattleScene } from './BattleScene';

function roomGridStyle(layout: CombatRoomLayout) {
  const cellSize = Math.min(876 / layout.width, 464 / layout.height);
  const width = cellSize * layout.width;
  const height = cellSize * layout.height;
  return {
    top: `${((560 - height) / 2 / 560) * 100}%`,
    left: `${((960 - width) / 2 / 960) * 100}%`,
    width: `${(width / 960) * 100}%`,
    height: `${(height / 560) * 100}%`,
    gridTemplateColumns: `repeat(${layout.width}, 1fr)`,
    gridTemplateRows: `repeat(${layout.height}, 1fr)`,
  };
}

export function PhaserStage({
  run,
  movementDisabled = false,
  bombTargeting = false,
  highlightedEnemyId,
  onMove,
  onDeploy,
  onBomb,
}: {
  run: RunState;
  movementDisabled?: boolean;
  bombTargeting?: boolean;
  highlightedEnemyId?: string;
  onMove: (x: number, y: number) => void;
  onDeploy: (x: number, y: number) => void;
  onBomb: (x: number, y: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [bombHover, setBombHover] = useState<{ x: number; y: number }>();

  useEffect(() => {
    if (!bombTargeting) setBombHover(undefined);
  }, [bombTargeting]);

  useEffect(() => {
    if (!hostRef.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: 960,
      height: 560,
      backgroundColor: '#302421',
      transparent: false,
      scene: [BattleScene],
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true, pixelArt: false, roundPixels: true },
    });
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    game.registry.set('run', run);
    game.registry.set('highlightedEnemyId', highlightedEnemyId);
    game.registry.set('labels', {
      round: t('combat.round', { round: run.combat?.round ?? 1 }),
      room: run.combat
        ? `${roomName(t, run.combat.roomKind)} · ${t(`combat.roomShapes.${run.combat.roomLayout.shape}`)} ${run.combat.roomLayout.width}×${run.combat.roomLayout.height}`
        : '',
      isaac: t('stats.character'),
      attackMode: t(`attackModes.${run.combat?.attackModeOverride ?? run.player.stats.attackMode}`),
      playerTurn: t('combat.playerTurn'),
      enemyTurn: t('combat.enemyTurn'),
      discardPhase: t('combat.discardPhase'),
      armorBlocked: t('combat.armorBlocked'),
      shieldBlocked: t('combat.shieldBlocked'),
      hpDamage: t('combat.hpDamage'),
      noHeartDamage: t('combat.noHeartDamage'),
      targetLock: t('combat.targetLock'),
      enemies: Object.fromEntries(
        (run.combat?.enemies ?? []).map((enemy) => [enemy.instanceId, enemyName(t, enemy)]),
      ),
      cards: Object.fromEntries(Object.values(CARDS).map((card) => [card.id, cardName(t, card.id)])),
    });
    game.events.emit('run-sync');
  }, [highlightedEnemyId, i18n.resolvedLanguage, run, t]);

  const combat = run.combat;
  const layout = combat?.roomLayout ?? DEFAULT_COMBAT_ROOM_LAYOUT;
  const deploymentPending = Boolean(combat?.deploymentPending);
  const player = combat?.playerPosition ?? { x: 0, y: 4 };
  const reachable = new Set(getReachablePlayerCells(run).map((position) => `${position.x}:${position.y}`));
  const deployable = new Set(getPlayerDeploymentCells(run).map((position) => `${position.x}:${position.y}`));
  const occupied = new Map<string, EnemyState>(
    (combat?.enemies ?? [])
      .filter((enemy) => enemy.hp > 0)
      .flatMap((enemy) =>
        getEnemyOccupiedCells(enemy).map((cell) => [`${cell.x}:${cell.y}`, enemy] as const),
      ),
  );
  return (
    <div className="tactical-stage">
      <div className="phaser-stage" ref={hostRef} aria-label={t('combat.animatedRoom')} />
      <div
        className="battle-grid"
        style={roomGridStyle(layout)}
        aria-label={t('combat.battleGrid', {
          width: layout.width,
          height: layout.height,
          shape: t(`combat.roomShapes.${layout.shape}`),
        })}
      >
        {Array.from({ length: layout.width * layout.height }, (_, index) => {
          const x = index % layout.width;
          const y = Math.floor(index / layout.width);
          const key = `${x}:${y}`;
          const available = combat ? isCombatCellAvailable(combat, { x, y }) : true;
          const enemy = occupied.get(key);
          const isPlayer = player.x === x && player.y === y;
          const inAttackRange = isPositionInPlayerAttackRange(run, { x, y });
          const canDeploy = deploymentPending && deployable.has(key) && !isPlayer;
          const canMove = !deploymentPending && reachable.has(key) && !movementDisabled;
          const bombTargetable = bombTargeting && available;
          const bombPreview =
            bombTargeting && bombHover && Math.abs(bombHover.x - x) <= 1 && Math.abs(bombHover.y - y) <= 1;
          const bombCenter = bombTargeting && bombHover?.x === x && bombHover.y === y;
          return (
            <button
              key={key}
              className={`${!available ? 'void-cell' : ''} ${canMove && !bombTargeting ? 'reachable' : ''} ${canDeploy ? 'deployable' : ''} ${inAttackRange && !deploymentPending && available && !bombTargeting ? 'attack-range' : ''} ${isPlayer ? 'player-cell' : ''} ${enemy ? 'enemy-cell' : ''} ${bombTargetable ? 'bomb-targetable' : ''} ${bombPreview ? 'bomb-preview' : ''} ${bombCenter ? 'bomb-center' : ''}`}
              style={{ gridColumn: x + 1, gridRow: y + 1 }}
              disabled={
                bombTargeting
                  ? !available
                  : !available || (!canMove && !canDeploy) || Boolean(enemy) || isPlayer
              }
              onPointerEnter={() => {
                if (bombTargeting && available) setBombHover({ x, y });
              }}
              onFocus={() => {
                if (bombTargeting && available) setBombHover({ x, y });
              }}
              onClick={() => (bombTargeting ? onBomb(x, y) : canDeploy ? onDeploy(x, y) : onMove(x, y))}
              aria-label={
                bombTargeting
                  ? t('combat.bombCell', { x, y })
                  : enemy
                    ? `${enemy.name} (${x}, ${y})`
                    : isPlayer
                      ? `Isaac (${x}, ${y})`
                      : t('combat.gridCell', { x, y })
              }
              title={
                bombTargeting
                  ? t('combat.bombCell', { x, y })
                  : canDeploy
                    ? t('combat.deployHere', { x, y })
                    : canMove
                      ? t('combat.moveHere', { x, y })
                      : `(${x}, ${y})`
              }
            />
          );
        })}
      </div>
      <div className="grid-legend">
        {bombTargeting ? (
          <>
            <span className="bomb-swatch" />
            {t('combat.bombLegend')}
          </>
        ) : deploymentPending ? (
          <>
            <span className="deploy-swatch" />
            {t('combat.deploymentLegend')}
          </>
        ) : (
          <>
            <span className="range-swatch" />
            {t('combat.attackRangeLegend')}
            <span className="move-swatch" />
            {t('combat.movementLegend')}
          </>
        )}
      </div>
    </div>
  );
}
