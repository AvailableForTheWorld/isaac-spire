import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import * as Phaser from 'phaser';
import {
  CARDS, COMBAT_GRID_HEIGHT, COMBAT_GRID_WIDTH, getReachablePlayerCells,
  isPositionInPlayerAttackRange, type RunState,
} from '@isaac-spire/game';
import { cardName, enemyName, roomName } from '../localize';
import { BattleScene } from './BattleScene';

export function PhaserStage({ run, movementDisabled = false, onMove }: { run: RunState; movementDisabled?: boolean; onMove: (x: number, y: number) => void }) {
  const { t, i18n } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

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
      render: { antialias: true, pixelArt: false },
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
    game.registry.set('labels', {
      round: t('combat.round', { round: run.combat?.round ?? 1 }),
      room: run.combat ? roomName(t, run.combat.roomKind) : '',
      isaac: t('stats.character'),
      attackMode: t(`attackModes.${run.combat?.attackModeOverride ?? run.player.stats.attackMode}`),
      playerTurn: t('combat.playerTurn'),
      enemyTurn: t('combat.enemyTurn'),
      discardPhase: t('combat.discardPhase'),
      armorBlocked: t('combat.armorBlocked'),
      shieldBlocked: t('combat.shieldBlocked'),
      enemies: Object.fromEntries((run.combat?.enemies ?? []).map((enemy) => [enemy.instanceId, enemyName(t, enemy)])),
      cards: Object.fromEntries(Object.values(CARDS).map((card) => [card.id, cardName(t, card.id)])),
    });
    game.events.emit('run-sync');
  }, [i18n.resolvedLanguage, run, t]);

  const combat = run.combat;
  const player = combat?.playerPosition ?? { x: 0, y: 4 };
  const reachable = new Set(getReachablePlayerCells(run).map((position) => `${position.x}:${position.y}`));
  const occupied = new Map((combat?.enemies ?? []).filter((enemy) => enemy.hp > 0).map((enemy) => [`${enemy.position?.x ?? 15}:${enemy.position?.y ?? 4}`, enemy]));
  return (
    <div className="tactical-stage">
      <div className="phaser-stage" ref={hostRef} aria-label={t('combat.animatedRoom')} />
      <div className="battle-grid" aria-label={t('combat.battleGrid')}>
        {Array.from({ length: COMBAT_GRID_WIDTH * COMBAT_GRID_HEIGHT }, (_, index) => {
          const x = index % COMBAT_GRID_WIDTH;
          const y = Math.floor(index / COMBAT_GRID_WIDTH);
          const key = `${x}:${y}`;
          const enemy = occupied.get(key);
          const isPlayer = player.x === x && player.y === y;
          const inAttackRange = isPositionInPlayerAttackRange(run, { x, y });
          const canMove = reachable.has(key) && !movementDisabled;
          return <button
            key={key}
            className={`${canMove ? 'reachable' : ''} ${inAttackRange ? 'attack-range' : ''} ${isPlayer ? 'player-cell' : ''} ${enemy ? 'enemy-cell' : ''}`}
            style={{ gridColumn: x + 1, gridRow: y + 1 }}
            disabled={!canMove || Boolean(enemy) || isPlayer}
            onClick={() => onMove(x, y)}
            aria-label={enemy ? `${enemy.name} (${x}, ${y})` : isPlayer ? `Isaac (${x}, ${y})` : t('combat.gridCell', { x, y })}
            title={canMove ? t('combat.moveHere', { x, y }) : `(${x}, ${y})`}
          />;
        })}
      </div>
      <div className="grid-legend"><span className="range-swatch" />{t('combat.attackRangeLegend')}<span className="move-swatch" />{t('combat.movementLegend')}</div>
    </div>
  );
}
