import * as Phaser from 'phaser';
import {
  AttackMode,
  CombatAnimationKind,
  CombatMovementStyle,
  DEFAULT_COMBAT_ROOM_LAYOUT,
  isCombatCellAvailable,
  type CombatAnimationEvent,
  type EnemyState,
  type RunState,
} from '@isaac-spire/game';

interface BattleLabels {
  round: string;
  room: string;
  isaac: string;
  attackMode: string;
  playerTurn: string;
  enemyTurn: string;
  discardPhase: string;
  armorBlocked: string;
  shieldBlocked: string;
  hpDamage: string;
  noHeartDamage: string;
  targetLock: string;
  enemies: Record<string, string>;
  cards: Record<string, string>;
}

interface ActorVisual {
  parts: Phaser.GameObjects.GameObject[];
  x: number;
  y: number;
  footprintWidth: number;
  footprintHeight: number;
}

export class BattleScene extends Phaser.Scene {
  private gridLeft = 42;
  private gridTop = 48;
  private gridWidth = 876;
  private gridHeight = 464;
  private gridColumns = 17;
  private gridRows = 9;
  private isaac?: ActorVisual;
  private enemies = new Map<string, ActorVisual>();
  private latestRun?: RunState;
  private currentCombatId = '';
  private lastSequence = 0;
  private queuedEvents: CombatAnimationEvent[] = [];
  private playingEvents = false;
  private initialized = false;

  constructor() {
    super('BattleScene');
  }

  create(): void {
    this.game.events.on('run-sync', this.syncRun, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.game.events.off('run-sync', this.syncRun, this),
    );
    this.syncRun();
  }

  private syncRun(): void {
    const run = this.registry.get('run') as RunState | undefined;
    if (!run?.combat) return;
    this.latestRun = run;
    const combatId = `${run.id}:${run.floorIndex}:${run.currentRoomId ?? run.combat.roomKind}`;
    const newestSequence = run.combat.animationSequence ?? 0;

    if (!this.initialized || combatId !== this.currentCombatId) {
      this.initialized = true;
      this.currentCombatId = combatId;
      this.lastSequence = newestSequence;
      this.queuedEvents = [];
      this.playingEvents = false;
      this.renderRun(run);
      return;
    }

    const newEvents = (run.combat.animationEvents ?? []).filter(
      (event) => event.sequence > this.lastSequence,
    );
    if (newEvents.length) {
      this.lastSequence = Math.max(this.lastSequence, ...newEvents.map((event) => event.sequence));
      this.queuedEvents.push(...newEvents);
      if (!this.playingEvents) void this.playNextEvent();
    } else if (!this.playingEvents) {
      this.renderRun(run);
    }
  }

  private async playNextEvent(): Promise<void> {
    const event = this.queuedEvents.shift();
    if (!event) {
      this.playingEvents = false;
      if (this.latestRun?.combat) this.renderRun(this.latestRun);
      return;
    }
    this.playingEvents = true;
    await this.animateEvent(event);
    await this.playNextEvent();
  }

  private renderRun(run: RunState): void {
    const labels = this.registry.get('labels') as BattleLabels | undefined;
    this.tweens.killAll();
    this.children.removeAll(true);
    this.enemies.clear();
    this.isaac = undefined;

    const width = this.scale.width;
    const height = this.scale.height;
    this.configureGrid(run);
    const palette =
      ['0x382c28', '0x302421', '0x23332f', '0x1f302c', '0x302736', '0x3a202b'][run.floorIndex] ?? '0x302421';
    this.cameras.main.setBackgroundColor(Number(palette));

    const room = this.add.graphics();
    room.fillStyle(0x171312, 0.38);
    room.fillRoundedRect(24, 25, width - 48, height - 50, 22);
    room.lineStyle(3, 0xa98c73, 0.18);
    room.strokeRoundedRect(24, 25, width - 48, height - 50, 22);

    const grid = this.add.graphics();
    const cellWidth = this.gridWidth / this.gridColumns;
    const cellHeight = this.gridHeight / this.gridRows;
    grid.lineStyle(1, 0xc5a58e, 0.12);
    for (let row = 0; row < this.gridRows; row += 1) {
      for (let column = 0; column < this.gridColumns; column += 1) {
        if (!isCombatCellAvailable(run.combat!, { x: column, y: row })) continue;
        grid.fillStyle((row + column) % 2 === 0 ? 0x59443d : 0x493833, 0.13);
        grid.fillRect(
          this.gridLeft + column * cellWidth,
          this.gridTop + row * cellHeight,
          cellWidth,
          cellHeight,
        );
        grid.strokeRect(
          this.gridLeft + column * cellWidth,
          this.gridTop + row * cellHeight,
          cellWidth,
          cellHeight,
        );
      }
    }
    const leftDoorRows = Array.from({ length: this.gridRows }, (_, row) => row).filter((row) =>
      isCombatCellAvailable(run.combat!, { x: 0, y: row }),
    );
    const doorRow = leftDoorRows.sort(
      (left, right) => Math.abs(left - this.gridRows / 2) - Math.abs(right - this.gridRows / 2),
    )[0];
    if (doorRow !== undefined) {
      const doorY = this.gridPoint(0, doorRow).y;
      this.add
        .rectangle(this.gridLeft - 11, doorY, 22, cellHeight * 1.35, 0x120f0e, 0.9)
        .setStrokeStyle(2, 0xb28d72, 0.45);
    }

    for (let i = 0; i < 22; i += 1) {
      const dust = this.add.circle(
        Phaser.Math.Between(35, width - 35),
        Phaser.Math.Between(40, height - 40),
        Phaser.Math.Between(1, 3),
        0xd7b895,
        0.12,
      );
      this.tweens.add({
        targets: dust,
        y: dust.y - Phaser.Math.Between(8, 20),
        alpha: 0.02,
        duration: Phaser.Math.Between(1800, 3600),
        yoyo: true,
        repeat: -1,
      });
    }

    const playerPosition = run.combat!.playerPosition ?? { x: 0, y: 4 };
    const playerPoint = this.gridPoint(playerPosition.x, playerPosition.y);
    this.isaac = this.drawIsaac(playerPoint.x, playerPoint.y, run, labels);
    const allEnemies = run.combat!.enemies;
    const highlightedEnemyId = this.registry.get('highlightedEnemyId') as string | undefined;
    allEnemies.forEach((enemy, index) => {
      if (enemy.hp <= 0) return;
      const position = enemy.position ?? { x: 15 - (index % 2), y: Math.min(8, 2 + index * 3) };
      const point = this.gridEntityPoint(position.x, position.y, enemy.footprintWidth, enemy.footprintHeight);
      const visual = this.drawEnemy(
        point.x,
        point.y,
        enemy,
        labels?.enemies[enemy.instanceId] ?? enemy.name,
        enemy.hp / enemy.maxHp,
        enemy.instanceId === run.combat?.selectedEnemyId,
        enemy.instanceId === highlightedEnemyId,
        allEnemies.filter((entry) => entry.hp > 0 && entry.id === enemy.id).length > 1
          ? allEnemies.slice(0, index + 1).filter((entry) => entry.hp > 0 && entry.id === enemy.id).length
          : undefined,
        labels?.targetLock ?? 'TARGET',
      );
      this.enemies.set(enemy.instanceId, visual);
    });

    this.add
      .text(42, 40, labels?.round ?? `ROUND ${run.combat!.round}`, {
        fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ead3bd',
        letterSpacing: 3,
      })
      .setResolution(2);
    this.add
      .text(width - 42, 40, labels?.room ?? run.combat!.roomKind.toUpperCase(), {
        fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ead3bd',
        letterSpacing: 3,
      })
      .setOrigin(1, 0)
      .setResolution(2);
  }

  private actor(id?: string): ActorVisual | undefined {
    return id === 'isaac' ? this.isaac : id ? this.enemies.get(id) : undefined;
  }

  private configureGrid(run: RunState): void {
    const layout = run.combat?.roomLayout ?? DEFAULT_COMBAT_ROOM_LAYOUT;
    this.gridColumns = layout.width;
    this.gridRows = layout.height;
    const cellSize = Math.min(876 / layout.width, 464 / layout.height);
    this.gridWidth = cellSize * layout.width;
    this.gridHeight = cellSize * layout.height;
    this.gridLeft = (960 - this.gridWidth) / 2;
    this.gridTop = (560 - this.gridHeight) / 2;
  }

  private gridPoint(x: number, y: number): { x: number; y: number } {
    return {
      x: this.gridLeft + (x + 0.5) * (this.gridWidth / this.gridColumns),
      y: this.gridTop + (y + 0.5) * (this.gridHeight / this.gridRows),
    };
  }

  private floatingLabelPosition(actorY: number, offset: number): { y: number; drift: number } {
    const safeTop = Math.max(92, this.gridTop + 42);
    const safeBottom = Math.min(518, this.gridTop + this.gridHeight - 42);
    const above = actorY - offset;
    if (above >= safeTop) return { y: above, drift: -24 };
    return { y: Math.min(safeBottom, actorY + offset), drift: 24 };
  }

  private gridEntityPoint(
    x: number,
    y: number,
    footprintWidth = 1,
    footprintHeight = 1,
  ): { x: number; y: number } {
    return this.gridPoint(x + (footprintWidth - 1) / 2, y + (footprintHeight - 1) / 2);
  }

  private wait(duration: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(duration, resolve));
  }

  private tween(
    targets: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[],
    config: Record<string, unknown>,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({ targets, ...config, onComplete: () => resolve() });
    });
  }

  private async animateEvent(event: CombatAnimationEvent): Promise<void> {
    switch (event.kind) {
      case CombatAnimationKind.CardPlay:
        await this.animateCard(event, false);
        break;
      case CombatAnimationKind.CardDiscard:
        await this.animateCard(event, true);
        break;
      case CombatAnimationKind.DiscardPhase:
        await this.animatePhaseBanner(this.labels()?.discardPhase ?? 'DISCARD PHASE', 0xc67a64);
        break;
      case CombatAnimationKind.EnemyPhase:
        await this.animatePhaseBanner(this.labels()?.enemyTurn ?? 'ENEMY TURN', 0xd75e57);
        break;
      case CombatAnimationKind.RoundStart:
        await this.animatePhaseBanner(
          `${this.labels()?.playerTurn ?? 'PLAYER TURN'}  ·  ${event.value ?? ''}`,
          0xe3bc72,
        );
        break;
      case CombatAnimationKind.Move:
        await this.animateMove(event);
        break;
      case CombatAnimationKind.PlayerAttack:
        await this.animatePlayerAttack(event);
        break;
      case CombatAnimationKind.EnemyAttack:
        await this.animateEnemyAttack(event);
        break;
      case CombatAnimationKind.Shield:
        await this.animateShield(event);
        break;
      case CombatAnimationKind.Heal:
        await this.animateHeal(event);
        break;
      case CombatAnimationKind.Poison:
        await this.animatePoison(event);
        break;
      case CombatAnimationKind.Curse:
        await this.animateCurse(event);
        break;
      case CombatAnimationKind.Prepare:
        await this.animatePrepare(event);
        break;
      case CombatAnimationKind.Summon:
        await this.animateSummon(event);
        break;
      case CombatAnimationKind.Idle:
        await this.animateIdle(event);
        break;
      case CombatAnimationKind.Defeat:
        await this.animateDefeat(event);
        break;
      case CombatAnimationKind.BombBlast:
        await this.animateBombBlast(event);
        break;
      case CombatAnimationKind.BombHit:
        await this.animateBombHit(event);
        break;
      case CombatAnimationKind.BlackHeart:
        await this.animateBlackHeart();
        break;
    }
  }

  private labels(): BattleLabels | undefined {
    return this.registry.get('labels') as BattleLabels | undefined;
  }

  private async animatePhaseBanner(title: string, color: number): Promise<void> {
    const width = this.scale.width;
    const height = this.scale.height;
    const veil = this.add.rectangle(width / 2, height / 2, width, height, 0x090707, 0).setDepth(80);
    const topLine = this.add.rectangle(width / 2, height / 2 - 34, width * 0.55, 2, color, 0).setDepth(81);
    const bottomLine = this.add.rectangle(width / 2, height / 2 + 34, width * 0.55, 2, color, 0).setDepth(81);
    const text = this.add
      .text(width / 2, height / 2, title, {
        fontFamily: 'Georgia, "Microsoft YaHei", serif',
        fontSize: '29px',
        fontStyle: 'bold',
        color: `#${color.toString(16).padStart(6, '0')}`,
        stroke: '#160e0d',
        strokeThickness: 7,
        letterSpacing: 5,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(0.72)
      .setDepth(82);
    await Promise.all([
      this.tween(veil, { alpha: 0.7, duration: 170 }),
      this.tween([topLine, bottomLine], { alpha: 0.85, scaleX: 1.12, duration: 220, ease: 'Cubic.easeOut' }),
      this.tween(text, { alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' }),
    ]);
    await this.wait(330);
    await this.tween([veil, topLine, bottomLine, text], { alpha: 0, duration: 210 });
    veil.destroy();
    topLine.destroy();
    bottomLine.destroy();
    text.destroy();
  }

  private async animateCard(event: CombatAnimationEvent, discarded: boolean): Promise<void> {
    const cardName = this.labels()?.cards[event.cardId ?? ''] ?? event.cardId ?? '';
    const x = this.scale.width / 2;
    const panel = this.add
      .rectangle(x, this.scale.height - 20, 174, 74, discarded ? 0x282322 : 0x3a2e28, 0.98)
      .setStrokeStyle(2, discarded ? 0x806f67 : 0xdfb875, 0.9)
      .setDepth(70)
      .setAngle(discarded ? -5 : 0);
    const icon = this.add
      .text(x - 67, panel.y, discarded ? '↘' : '↑', {
        fontFamily: 'Georgia, serif',
        fontSize: '26px',
        color: discarded ? '#8d7d75' : '#f0c980',
      })
      .setOrigin(0.5)
      .setDepth(71);
    const title = this.add
      .text(x + 10, panel.y, cardName, {
        fontFamily: 'Georgia, "Microsoft YaHei", serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: discarded ? '#a8978e' : '#f0dfcd',
        wordWrap: { width: 120 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(71);
    const pieces = [panel, icon, title];
    await this.tween(pieces, {
      y: `-=${discarded ? 58 : 112}`,
      x: discarded ? '+=150' : '+=0',
      angle: discarded ? 12 : 0,
      duration: 260,
      ease: 'Back.easeOut',
    });
    await this.tween(pieces, {
      alpha: 0,
      y: discarded ? '+=45' : '-=28',
      duration: 190,
      ease: 'Quad.easeIn',
    });
    pieces.forEach((piece) => piece.destroy());
  }

  private async animateMove(event: CombatAnimationEvent): Promise<void> {
    const actor = this.actor(event.targetId ?? event.sourceId);
    if (!actor || event.toX === undefined || event.toY === undefined) return;
    const destination = this.gridEntityPoint(
      event.toX,
      event.toY,
      actor.footprintWidth,
      actor.footprintHeight,
    );
    const deltaX = destination.x - actor.x;
    const deltaY = destination.y - actor.y;
    const jumping = event.movementStyle === CombatMovementStyle.Jump;
    const trail = this.add.circle(
      actor.x,
      actor.y,
      jumping ? 24 : 15,
      event.sourceId === 'isaac'
        ? 0x7ed9e8
        : event.movementStyle === CombatMovementStyle.Wander
          ? 0xd0a56c
          : 0xc07067,
      0.24,
    );
    this.tweens.add({
      targets: trail,
      scale: 1.8,
      alpha: 0,
      duration: 430,
      onComplete: () => trail.destroy(),
    });
    if (jumping) {
      await this.tween(actor.parts, {
        x: `+=${deltaX / 2}`,
        y: `+=${deltaY / 2 - 34}`,
        duration: 210,
        ease: 'Quad.easeOut',
      });
      await this.tween(actor.parts, {
        x: `+=${deltaX / 2}`,
        y: `+=${deltaY / 2 + 34}`,
        duration: 230,
        ease: 'Bounce.easeOut',
      });
    } else {
      await this.tween(actor.parts, {
        x: `+=${deltaX}`,
        y: `+=${deltaY}`,
        duration: event.movementStyle === CombatMovementStyle.Wander ? 520 : 410,
        ease: event.movementStyle === CombatMovementStyle.Wander ? 'Sine.easeInOut' : 'Cubic.easeInOut',
      });
    }
    actor.x = destination.x;
    actor.y = destination.y;
  }

  private async animatePlayerAttack(event: CombatAnimationEvent): Promise<void> {
    const source = this.actor('isaac');
    const target = this.actor(event.targetId);
    if (!source || !target) return;
    this.tweens.add({ targets: source.parts, x: '+=8', duration: 100, yoyo: true, ease: 'Quad.easeOut' });

    const projectileScale = Math.max(0.7, event.projectileScale ?? 1);
    if (event.attackMode === AttackMode.Brimstone) {
      const beam = this.add.graphics();
      beam.lineStyle(12 * projectileScale, 0xb82135, 0.22);
      beam.lineBetween(source.x + 16, source.y, target.x - 12, target.y);
      beam.lineStyle(4 * projectileScale, 0xff4761, 0.9);
      beam.lineBetween(source.x + 16, source.y, target.x - 12, target.y);
      await this.tween(beam, { alpha: 0, duration: 330, ease: 'Quad.easeIn' });
      beam.destroy();
    } else {
      const projectileColor =
        (event.poisonTurns ?? 0) > 0 ? 0x8bd36f : (event.slowTurns ?? 0) > 0 ? 0x70cbe4 : 0x93dff3;
      const projectile =
        event.attackMode === AttackMode.Knife
          ? this.add
              .text(source.x + 16, source.y, '◆', {
                fontFamily: 'Georgia, serif',
                fontSize: '23px',
                color: '#e7d7cc',
              })
              .setOrigin(0.5)
          : event.attackMode === AttackMode.TechX
            ? this.add
                .circle(source.x + 16, source.y, 12 * projectileScale, projectileColor, 0.12)
                .setStrokeStyle(4, projectileColor, 0.95)
            : this.add
                .circle(source.x + 16, source.y, 7 * projectileScale, projectileColor, 0.95)
                .setStrokeStyle(2, 0xd8f8ff, 0.8);
      if (event.attackMode === AttackMode.Knife) projectile.setScale(projectileScale);
      this.tweens.add({
        targets: projectile,
        angle: event.attackMode === AttackMode.Knife ? 360 : 0,
        duration: 250,
      });
      await this.tween(projectile, { x: target.x - 10, y: target.y, duration: 260, ease: 'Quad.easeIn' });
      projectile.destroy();
    }
    if ((event.armorValue ?? 0) > 0) await this.animateArmorBlock(target, event.armorValue ?? 0);
    if ((event.secondaryValue ?? 0) > 0) await this.animateShieldLoss(target, event.secondaryValue ?? 0);
    await this.impact(
      target,
      event.value ?? 0,
      0xefa09a,
      event.secondaryValue ?? 0,
      event.armorValue ?? 0,
      event.rawValue,
    );
    if ((event.poisonTurns ?? 0) > 0) {
      const ring = this.add.circle(target.x, target.y, 12, 0x7dbd63, 0.08).setStrokeStyle(3, 0x9ee57d, 0.8);
      this.tweens.add({
        targets: ring,
        scale: 2.3,
        alpha: 0,
        duration: 520,
        onComplete: () => ring.destroy(),
      });
    }
    if ((event.slowTurns ?? 0) > 0) {
      const frost = this.add.circle(target.x, target.y, 18, 0x69b9d0, 0.12).setStrokeStyle(2, 0x9de4ef, 0.72);
      this.tweens.add({
        targets: frost,
        scale: 1.7,
        alpha: 0,
        duration: 620,
        onComplete: () => frost.destroy(),
      });
    }
  }

  private async animateBombBlast(event: CombatAnimationEvent): Promise<void> {
    if (event.toX === undefined || event.toY === undefined) return;
    const source = this.actor('isaac');
    const destination = this.gridPoint(event.toX, event.toY);
    const start = source ?? { x: destination.x, y: destination.y };
    const bomb = this.add
      .circle(start.x, start.y - 18, 12, 0x242021, 1)
      .setStrokeStyle(3, 0x887673, 0.9)
      .setDepth(72);
    const fuse = this.add
      .line(start.x + 8, start.y - 29, 0, 8, 7, 0, 0xd8b774, 1)
      .setLineWidth(3)
      .setDepth(73);
    const spark = this.add.circle(start.x + 14, start.y - 34, 4, 0xffc55d, 0.95).setDepth(74);
    const thrown = [bomb, fuse, spark];
    await this.tween(thrown, {
      x: `+=${destination.x - start.x}`,
      y: `+=${destination.y - (start.y - 18)}`,
      angle: 300,
      duration: 270,
      ease: 'Quad.easeOut',
    });
    await this.wait(90);
    thrown.forEach((part) => part.destroy());

    const cellWidth = this.gridWidth / this.gridColumns;
    const cellHeight = this.gridHeight / this.gridRows;
    const blastCells: Phaser.GameObjects.Rectangle[] = [];
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const x = event.toX + offsetX;
        const y = event.toY + offsetY;
        if (!this.latestRun?.combat || !isCombatCellAvailable(this.latestRun.combat, { x, y })) continue;
        const point = this.gridPoint(x, y);
        blastCells.push(
          this.add
            .rectangle(point.x, point.y, cellWidth * 0.92, cellHeight * 0.92, 0xef6a38, 0.32)
            .setStrokeStyle(3, 0xffc45e, 0.75)
            .setDepth(65),
        );
      }
    }
    this.cameras.main.flash(130, 255, 125, 40, false);
    this.cameras.main.shake(320, 0.018);
    const core = this.add.circle(destination.x, destination.y, 18, 0xffd27a, 0.95).setDepth(75);
    const fire = this.add
      .circle(destination.x, destination.y, 28, 0xe94e2f, 0.58)
      .setStrokeStyle(7, 0xffa94a, 0.9)
      .setDepth(74);
    const smoke = Array.from({ length: 14 }, (_, index) =>
      this.add
        .circle(
          destination.x + Phaser.Math.Between(-10, 10),
          destination.y + Phaser.Math.Between(-10, 10),
          5 + (index % 5),
          index % 3 ? 0x5f4640 : 0x2d2929,
          0.78,
        )
        .setDepth(73),
    );
    smoke.forEach((mote) =>
      this.tweens.add({
        targets: mote,
        x: mote.x + Phaser.Math.Between(-95, 95),
        y: mote.y + Phaser.Math.Between(-85, 85),
        scale: 2.2,
        alpha: 0,
        duration: Phaser.Math.Between(420, 650),
        ease: 'Cubic.easeOut',
        onComplete: () => mote.destroy(),
      }),
    );
    this.tweens.add({
      targets: blastCells,
      alpha: 0,
      scale: 0.86,
      duration: 520,
      onComplete: () => blastCells.forEach((cell) => cell.destroy()),
    });
    await Promise.all([
      this.tween(core, { scale: 6.5, alpha: 0, duration: 360, ease: 'Cubic.easeOut' }),
      this.tween(fire, { scale: 3.8, alpha: 0, duration: 470, ease: 'Quad.easeOut' }),
    ]);
    core.destroy();
    fire.destroy();
  }

  private async animateBombHit(event: CombatAnimationEvent): Promise<void> {
    const target = this.actor(event.targetId);
    if (!target) return;
    const cells = Math.max(1, event.hitCount ?? 1);
    const labelPosition = this.floatingLabelPosition(target.y, 88);
    const label = this.add
      .text(target.x, labelPosition.y, `50 × ${cells}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffd07a',
        stroke: '#4b1d12',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(76);
    this.tweens.add({
      targets: label,
      y: label.y + labelPosition.drift,
      alpha: 0,
      duration: 560,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
    if ((event.armorValue ?? 0) > 0) await this.animateArmorBlock(target, event.armorValue ?? 0);
    if ((event.secondaryValue ?? 0) > 0) await this.animateShieldLoss(target, event.secondaryValue ?? 0);
    await this.impact(
      target,
      event.value ?? 0,
      0xff7648,
      event.secondaryValue ?? 0,
      event.armorValue ?? 0,
      event.rawValue,
    );
    if ((event.value ?? 0) > 0) this.bloodDrop(target, event.value ?? 0);
  }

  private async animatePoison(event: CombatAnimationEvent): Promise<void> {
    const target = this.actor(event.targetId);
    if (!target) return;
    const bubbles = Array.from({ length: 4 }, (_, index) =>
      this.add.circle(target.x - 12 + index * 8, target.y + 8, 3 + (index % 2), 0x7fc467, 0.8),
    );
    this.tweens.add({
      targets: bubbles,
      y: '-=34',
      alpha: 0,
      duration: 520,
      stagger: 55,
      onComplete: () => bubbles.forEach((bubble) => bubble.destroy()),
    });
    await this.impact(target, event.value ?? 0, 0x81c46c);
  }

  private async animateEnemyAttack(event: CombatAnimationEvent): Promise<void> {
    const source = this.actor(event.sourceId);
    const target = this.actor('isaac');
    if (!source || !target) return;
    this.tweens.add({
      targets: source.parts,
      x: '-=16',
      duration: 180,
      yoyo: true,
      hold: 80,
      ease: 'Back.easeIn',
    });
    await this.wait(130);
    const shot = this.add
      .circle(source.x - 16, source.y, 8, 0xd45b54, 0.95)
      .setStrokeStyle(3, 0xffb09d, 0.75);
    const rawPosition = this.floatingLabelPosition(source.y, 75);
    const raw = this.add
      .text(source.x - 10, rawPosition.y, `⚔ ${event.rawValue ?? 0}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffaea0',
        stroke: '#3d1715',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: raw,
      y: raw.y + rawPosition.drift,
      alpha: 0,
      duration: 950,
      onComplete: () => raw.destroy(),
    });
    await this.tween(shot, { x: target.x + 10, y: target.y, duration: 240, ease: 'Cubic.easeIn' });
    shot.destroy();
    if ((event.armorValue ?? 0) > 0) await this.animateArmorBlock(target, event.armorValue ?? 0);
    if ((event.secondaryValue ?? 0) > 0) await this.animateShieldLoss(target, event.secondaryValue ?? 0);
    await this.impact(
      target,
      event.value ?? 0,
      (event.value ?? 0) > 0 ? 0xff6f66 : 0x7fc9df,
      event.secondaryValue ?? 0,
      event.armorValue ?? 0,
      event.rawValue,
    );
    if ((event.value ?? 0) > 0) this.bloodDrop(target, event.value ?? 0);
  }

  private async animateArmorBlock(target: ActorVisual, amount: number): Promise<void> {
    const plate = this.add
      .text(target.x - 36, target.y - 10, '⛉', {
        fontFamily: 'Georgia, serif',
        fontSize: '40px',
        color: '#d9b66f',
        stroke: '#4f3a1e',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScale(0.45)
      .setAngle(-12);
    const labelPosition = this.floatingLabelPosition(target.y, 70);
    const label = this.add
      .text(target.x, labelPosition.y, `${this.labels()?.armorBlocked ?? 'ARMOR'}  −${amount}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#f0ce86',
        stroke: '#34250f',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const labelTween = this.tween(label, {
      y: label.y + labelPosition.drift,
      alpha: 0,
      duration: 650,
      ease: 'Quad.easeOut',
    });
    await Promise.all([
      labelTween,
      this.tween(plate, { scale: 1.15, angle: 8, duration: 210, ease: 'Back.easeOut', yoyo: true, hold: 80 }),
    ]);
    label.destroy();
    plate.destroy();
  }

  private async animateShieldLoss(target: ActorVisual, amount: number): Promise<void> {
    const ring = this.add.circle(target.x, target.y, 56, 0x78d6e8, 0.08).setStrokeStyle(7, 0x9be8f2, 0.88);
    const labelPosition = this.floatingLabelPosition(target.y, 56);
    const label = this.add
      .text(target.x + 42, labelPosition.y, `${this.labels()?.shieldBlocked ?? 'SHIELD'}  −${amount}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#a9ecf4',
        stroke: '#173b43',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    for (let index = 0; index < 6; index += 1) {
      const shard = this.add.triangle(target.x, target.y, 0, 0, 7, 2, 2, 8, 0x8be1ed, 0.9);
      this.tweens.add({
        targets: shard,
        x: target.x + Phaser.Math.Between(-75, 75),
        y: target.y + Phaser.Math.Between(-70, 70),
        alpha: 0,
        duration: 360,
        onComplete: () => shard.destroy(),
      });
    }
    const labelTween = this.tween(label, {
      y: label.y + labelPosition.drift,
      alpha: 0,
      duration: 700,
      ease: 'Quad.easeOut',
    });
    await Promise.all([
      labelTween,
      this.tween(ring, { scale: 0.55, alpha: 0, duration: 380, ease: 'Cubic.easeIn' }),
    ]);
    label.destroy();
    ring.destroy();
  }

  private bloodDrop(target: ActorVisual, amount: number): void {
    const count = Phaser.Math.Clamp(Math.ceil(amount / 3), 4, 11);
    this.cameras.main.flash(90, 105, 8, 8, false);
    for (let index = 0; index < count; index += 1) {
      const drop = this.add
        .circle(
          target.x + Phaser.Math.Between(-15, 15),
          target.y + Phaser.Math.Between(-10, 20),
          Phaser.Math.Between(3, 7),
          0xa9212a,
          0.92,
        )
        .setDepth(55);
      this.tweens.add({
        targets: drop,
        x: drop.x + Phaser.Math.Between(-65, 65),
        y: target.y + Phaser.Math.Between(68, 102),
        scaleY: 0.45,
        alpha: 0.12,
        duration: Phaser.Math.Between(380, 620),
        ease: 'Quad.easeIn',
        onComplete: () => drop.destroy(),
      });
    }
    const stain = this.add.ellipse(target.x, target.y + 83, 18, 7, 0x68161d, 0.45).setDepth(2);
    this.tweens.add({
      targets: stain,
      scaleX: 2.2,
      alpha: 0,
      duration: 1200,
      onComplete: () => stain.destroy(),
    });
  }

  private async impact(
    target: ActorVisual,
    value: number,
    color: number,
    shieldDamage = 0,
    armorDamage = 0,
    rawValue?: number,
  ): Promise<void> {
    this.cameras.main.shake(120, 0.008);
    const burst = this.add.circle(target.x, target.y, 22, color, 0.45).setStrokeStyle(4, color, 0.9);
    this.tweens.add({ targets: target.parts, x: '+=8', duration: 45, yoyo: true, repeat: 2 });
    const detailed = rawValue !== undefined;
    const damageLabel = !detailed
      ? value > 0
        ? `-${value} HP`
        : shieldDamage > 0
          ? `-${shieldDamage} ⬡`
          : 'MISS'
      : `⚔ ${rawValue}  −  ⛉ ${armorDamage}  −  ⬡ ${shieldDamage}\n${value > 0 ? `${this.labels()?.hpDamage ?? 'HP DAMAGE'}  −${value}` : (this.labels()?.noHeartDamage ?? 'NO HEART DAMAGE')}`;
    const damagePosition = this.floatingLabelPosition(target.y, 62);
    const damage = this.add
      .text(target.x, damagePosition.y, damageLabel, {
        fontFamily: 'Arial, sans-serif',
        fontSize: detailed ? '17px' : '18px',
        fontStyle: 'bold',
        color: value > 0 ? '#ffb4a9' : '#9ee4f2',
        align: 'center',
        stroke: '#301313',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(60);
    const calculationDuration = detailed ? 1300 : 850;
    await Promise.all([
      this.tween(damage, {
        y: damage.y + damagePosition.drift,
        alpha: 0,
        duration: calculationDuration,
        ease: 'Quad.easeOut',
      }),
      this.tween(burst, { scale: 2.3, alpha: 0, duration: detailed ? 430 : 300, ease: 'Quad.easeOut' }),
    ]);
    damage.destroy();
    burst.destroy();
  }

  private async animateShield(event: CombatAnimationEvent): Promise<void> {
    const target = this.actor(event.targetId ?? event.sourceId);
    if (!target) return;
    const ring = this.add.circle(target.x, target.y, 48, 0x70c9df, 0.08).setStrokeStyle(6, 0x8de6f0, 0.9);
    const labelPosition = this.floatingLabelPosition(target.y, 62);
    const label = this.add
      .text(target.x, labelPosition.y, `+${event.value ?? 0} ⬡`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#a7edf4',
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: label,
      y: label.y + labelPosition.drift,
      alpha: 0,
      duration: 500,
      onComplete: () => label.destroy(),
    });
    await this.tween(ring, { scale: 1.35, alpha: 0, duration: 430, ease: 'Sine.easeOut' });
    ring.destroy();
  }

  private async animateHeal(event: CombatAnimationEvent): Promise<void> {
    const target = this.actor(event.targetId ?? event.sourceId);
    if (!target) return;
    const glow = this.add.circle(target.x, target.y, 42, 0x69ce91, 0.25);
    for (let index = 0; index < 5; index += 1) {
      const plus = this.add
        .text(target.x + Phaser.Math.Between(-28, 28), target.y + Phaser.Math.Between(-18, 25), '+', {
          fontFamily: 'Arial, sans-serif',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#91efad',
        })
        .setOrigin(0.5);
      this.tweens.add({
        targets: plus,
        y: plus.y - 45,
        alpha: 0,
        duration: 430 + index * 45,
        onComplete: () => plus.destroy(),
      });
    }
    const valuePosition = this.floatingLabelPosition(target.y, 64);
    const value = this.add
      .text(target.x, valuePosition.y, `+${event.value ?? 0}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#a6f4bb',
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: value,
      y: value.y + valuePosition.drift,
      alpha: 0,
      duration: 520,
      onComplete: () => value.destroy(),
    });
    await this.tween(glow, { scale: 1.6, alpha: 0, duration: 430 });
    glow.destroy();
  }

  private async animateCurse(event: CombatAnimationEvent): Promise<void> {
    const source = this.actor(event.sourceId);
    const target = this.actor(event.targetId);
    if (!target) return;
    const curse = this.add
      .text(source?.x ?? target.x, (source?.y ?? target.y) - 20, '☠', {
        fontFamily: 'Georgia, serif',
        fontSize: '34px',
        color: '#c58be2',
        stroke: '#442554',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    await this.tween(curse, {
      x: target.x,
      y: target.y - 18,
      angle: 360,
      scale: 1.35,
      duration: 330,
      ease: 'Sine.easeInOut',
    });
    await this.tween(curse, { alpha: 0, y: curse.y - 20, duration: 210 });
    curse.destroy();
  }

  private async animatePrepare(event: CombatAnimationEvent): Promise<void> {
    const source = this.actor(event.sourceId);
    if (!source) return;
    const warning = this.add
      .text(source.x, source.y - 70, '!', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '38px',
        fontStyle: 'bold',
        color: '#ff645a',
        stroke: '#551a19',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScale(0.4);
    const ring = this.add.circle(source.x, source.y, 54, 0xb9222b, 0.05).setStrokeStyle(4, 0xf05252, 0.75);
    this.tweens.add({ targets: ring, scale: 1.3, alpha: 0, duration: 520, onComplete: () => ring.destroy() });
    await this.tween(warning, {
      scale: 1.25,
      y: warning.y - 10,
      duration: 240,
      ease: 'Back.easeOut',
      yoyo: true,
      hold: 120,
    });
    warning.destroy();
  }

  private async animateSummon(event: CombatAnimationEvent): Promise<void> {
    const source = this.actor(event.sourceId);
    if (!source) return;
    this.cameras.main.shake(260, 0.009);
    const portal = this.add
      .circle(source.x, source.y + 36, 20, 0x32133f, 0.72)
      .setStrokeStyle(5, 0xc879d4, 0.88)
      .setDepth(57)
      .setScale(0.2, 0.08);
    const mark = this.add
      .text(source.x, source.y - 58, '♟', {
        fontFamily: 'Georgia, serif',
        fontSize: '38px',
        fontStyle: 'bold',
        color: '#e5a8eb',
        stroke: '#4a1d53',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setAlpha(0)
      .setScale(0.35);
    const smoke = Array.from({ length: 9 }, (_, index) =>
      this.add
        .circle(
          source.x + Phaser.Math.Between(-28, 28),
          source.y + Phaser.Math.Between(8, 48),
          5 + (index % 4),
          index % 2 ? 0x8f539a : 0x4c3158,
          0.62,
        )
        .setDepth(58),
    );
    this.tweens.add({
      targets: smoke,
      x: `+=${Phaser.Math.Between(-18, 18)}`,
      y: '-=52',
      scale: 1.8,
      alpha: 0,
      duration: 620,
      stagger: 35,
      onComplete: () => smoke.forEach((mote) => mote.destroy()),
    });
    await Promise.all([
      this.tween(portal, { scaleX: 2.3, scaleY: 0.72, angle: 180, duration: 360, ease: 'Back.easeOut' }),
      this.tween(mark, { alpha: 1, scale: 1.2, y: mark.y - 12, duration: 330, ease: 'Back.easeOut' }),
    ]);
    await this.wait(120);
    await this.tween([portal, mark], { alpha: 0, scale: 1.75, duration: 220, ease: 'Quad.easeIn' });
    portal.destroy();
    mark.destroy();
  }

  private async animateIdle(event: CombatAnimationEvent): Promise<void> {
    const source = this.actor(event.sourceId);
    if (!source) return;
    const dots = this.add
      .text(source.x, source.y - 65, '…', {
        fontFamily: 'Georgia, serif',
        fontSize: '30px',
        color: '#a99d96',
      })
      .setOrigin(0.5);
    await this.tween(dots, { y: dots.y - 18, alpha: 0, duration: 360 });
    dots.destroy();
  }

  private async animateDefeat(event: CombatAnimationEvent): Promise<void> {
    const target = this.actor(event.targetId ?? event.sourceId);
    if (!target) return;
    this.tweens.killTweensOf(target.parts);
    this.cameras.main.shake(220, 0.008);
    const collapseRing = this.add
      .circle(target.x, target.y, 34, 0x7f2528, 0.08)
      .setStrokeStyle(5, 0xdb6f69, 0.82)
      .setDepth(58);
    const deathMark = this.add
      .text(target.x, target.y - 10, '✕', {
        fontFamily: 'Georgia, serif',
        fontSize: '42px',
        fontStyle: 'bold',
        color: '#f0b1a7',
        stroke: '#501a1c',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setScale(0.2);
    await this.tween(target.parts, {
      scaleX: 1.2,
      scaleY: 0.68,
      duration: 120,
      ease: 'Back.easeIn',
      yoyo: true,
    });
    this.bloodDrop(target, 15);
    this.tweens.add({
      targets: collapseRing,
      scale: 2.5,
      alpha: 0,
      duration: 520,
      ease: 'Cubic.easeOut',
      onComplete: () => collapseRing.destroy(),
    });
    for (let index = 0; index < 14; index += 1) {
      const mote = this.add
        .circle(target.x, target.y, Phaser.Math.Between(3, 8), index % 3 === 0 ? 0xe0a08d : 0x9f3337, 0.9)
        .setDepth(59);
      this.tweens.add({
        targets: mote,
        x: target.x + Phaser.Math.Between(-90, 90),
        y: target.y + Phaser.Math.Between(-75, 90),
        scale: 0.15,
        alpha: 0,
        duration: Phaser.Math.Between(420, 620),
        ease: 'Quad.easeOut',
        onComplete: () => mote.destroy(),
      });
    }
    const fadingActor = this.tween(target.parts, {
      alpha: 0,
      y: '+=28',
      scale: 0.45,
      duration: 480,
      ease: 'Back.easeIn',
    });
    await this.tween(deathMark, {
      scale: 1.25,
      y: deathMark.y - 22,
      alpha: 0,
      duration: 450,
      ease: 'Back.easeOut',
    });
    deathMark.destroy();
    await fadingActor;
    this.enemies.delete(event.targetId ?? event.sourceId);
  }

  private async animateBlackHeart(): Promise<void> {
    const source = this.actor('isaac');
    if (!source) return;
    this.cameras.main.shake(420, 0.018);
    const blast = this.add.circle(source.x, source.y, 26, 0x140e1b, 0.92).setStrokeStyle(7, 0x9d4b8b, 0.8);
    await this.tween(blast, { scale: 12, alpha: 0, duration: 520, ease: 'Cubic.easeOut' });
    blast.destroy();
  }

  private drawIsaac(x: number, y: number, run: RunState, labels?: BattleLabels): ActorVisual {
    const shadow = this.add.ellipse(x, y + 23, 44, 11, 0x080707, 0.35);
    const body = this.add.graphics();
    body.fillStyle(0xe3c6b4, 1);
    body.fillRoundedRect(x - 13, y + 7, 26, 27, 10);
    body.fillCircle(x, y - 5, 21);
    body.fillStyle(0x303337, 1);
    body.fillCircle(x - 8, y - 7, 4);
    body.fillCircle(x + 8, y - 7, 4);
    body.fillStyle(0x7ec4dc, 0.9);
    body.fillCircle(x - 8, y, 2.5);
    body.fillCircle(x + 8, y, 2.5);
    const label = this.add
      .text(x, y + 38, labels?.isaac ?? 'ISAAC', {
        fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#f0d6bf',
        stroke: '#211816',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setResolution(2);
    this.tweens.add({
      targets: [body, shadow],
      y: '-=1.5',
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    return { parts: [shadow, body, label], x, y, footprintWidth: 1, footprintHeight: 1 };
  }

  private drawEnemy(
    x: number,
    y: number,
    enemy: EnemyState,
    name: string,
    health: number,
    selected: boolean,
    highlighted: boolean,
    identityNumber?: number,
    targetLock = 'TARGET',
  ): ActorVisual {
    const cellWidth = this.gridWidth / this.gridColumns;
    const cellHeight = this.gridHeight / this.gridRows;
    const bodyWidth = Math.max(38, cellWidth * enemy.footprintWidth * 0.76);
    const bodyHeight = Math.max(38, cellHeight * enemy.footprintHeight * 0.72);
    const emphasized = selected || highlighted;
    const glow = this.add.ellipse(
      x,
      y,
      bodyWidth * 1.18,
      bodyHeight * 1.18,
      highlighted ? 0xf0c36f : selected ? 0xe8b76d : 0x8a5b57,
      highlighted ? 0.38 : selected ? 0.2 : 0.08,
    );
    const body = this.add.ellipse(x, y, bodyWidth, bodyHeight, emphasized ? 0xa46058 : 0x744c4b, 1);
    body.setStrokeStyle(
      highlighted ? 5 : selected ? 3 : 1,
      highlighted ? 0xffdd8d : selected ? 0xf3cb83 : 0xb78a7f,
      highlighted ? 1 : selected ? 0.8 : 0.35,
    );
    const symbolSize = Math.min(66, Math.max(22, Math.min(bodyWidth, bodyHeight) * 0.45));
    const symbol = this.add
      .text(x, y - 1, enemy.icon, {
        fontFamily: 'Georgia, serif',
        fontSize: `${symbolSize}px`,
        color: '#24191a',
      })
      .setOrigin(0.5)
      .setResolution(2);
    const detailY = y + bodyHeight * 0.5 + 8;
    const displayName = identityNumber ? `${name}  #${identityNumber}` : name;
    const label = this.add
      .text(x, detailY, displayName, {
        fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
        fontSize: enemy.boss ? '15px' : '11px',
        fontStyle: 'bold',
        color: '#f0d2ba',
        stroke: '#211615',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setResolution(2);
    const bar = this.add.graphics();
    const barWidth = Math.max(42, bodyWidth * 0.86);
    bar.fillStyle(0x1a1515, 0.9);
    bar.fillRoundedRect(x - barWidth / 2, detailY + 10, barWidth, 6, 3);
    bar.fillStyle(health > 0.35 ? 0xb45555 : 0xe07b65, 1);
    bar.fillRoundedRect(x - barWidth / 2, detailY + 10, barWidth * health, 6, 3);
    const targetingParts: Phaser.GameObjects.GameObject[] = [];
    if (highlighted) {
      const reticle = this.add.graphics().setDepth(66);
      const radius = Math.max(bodyWidth, bodyHeight) * 0.68 + 12;
      reticle.lineStyle(3, 0xffd47e, 0.96);
      reticle.strokeCircle(x, y, radius);
      reticle.lineStyle(2, 0xffefb7, 0.82);
      reticle.lineBetween(x - radius - 10, y, x - radius + 8, y);
      reticle.lineBetween(x + radius - 8, y, x + radius + 10, y);
      reticle.lineBetween(x, y - radius - 10, x, y - radius + 8);
      reticle.lineBetween(x, y + radius - 8, x, y + radius + 10);
      const lockPosition = this.floatingLabelPosition(y, radius + 22);
      const lock = this.add
        .text(x, lockPosition.y, `${targetLock}${identityNumber ? `  #${identityNumber}` : ''}`, {
          fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#ffe3a3',
          stroke: '#3f2915',
          strokeThickness: 5,
          letterSpacing: 2,
        })
        .setOrigin(0.5)
        .setDepth(67)
        .setResolution(2);
      targetingParts.push(reticle, lock);
      this.tweens.add({
        targets: reticle,
        alpha: { from: 0.48, to: 1 },
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.28, to: 0.58 },
        scale: { from: 1, to: 1.08 },
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    this.tweens.add({
      targets: [body, glow],
      scaleX: 1.04,
      scaleY: 0.97,
      duration: 850 + x,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    return {
      parts: [glow, body, symbol, label, bar, ...targetingParts],
      x,
      y,
      footprintWidth: enemy.footprintWidth,
      footprintHeight: enemy.footprintHeight,
    };
  }
}
