import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import * as Phaser from 'phaser';
import { CARDS, type RunState } from '@isaac-spire/game';
import { cardName, enemyName, roomName } from '../localize';
import { BattleScene } from './BattleScene';

export function PhaserStage({ run }: { run: RunState }) {
  const { t, i18n } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: 960,
      height: 340,
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
      attackMode: t(`attackModes.${run.player.stats.attackMode}`),
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

  return <div className="phaser-stage" ref={hostRef} aria-label={t('combat.animatedRoom')} />;
}
