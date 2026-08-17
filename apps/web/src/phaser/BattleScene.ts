import * as Phaser from 'phaser';
import type { CombatAnimationEvent, RunState } from '@isaac-spire/game';

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
  enemies: Record<string, string>;
  cards: Record<string, string>;
}

interface ActorVisual {
  parts: Phaser.GameObjects.GameObject[];
  x: number;
  y: number;
}

export class BattleScene extends Phaser.Scene {
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off('run-sync', this.syncRun, this));
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

    const newEvents = (run.combat.animationEvents ?? []).filter((event) => event.sequence > this.lastSequence);
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
    const palette = ['0x382c28', '0x302421', '0x23332f', '0x1f302c', '0x302736', '0x3a202b'][run.floorIndex] ?? '0x302421';
    this.cameras.main.setBackgroundColor(Number(palette));

    const room = this.add.graphics();
    room.fillStyle(0x171312, 0.38);
    room.fillRoundedRect(24, 25, width - 48, height - 50, 22);
    room.lineStyle(3, 0xa98c73, 0.18);
    room.strokeRoundedRect(24, 25, width - 48, height - 50, 22);

    for (let i = 0; i < 22; i += 1) {
      const dust = this.add.circle(
        Phaser.Math.Between(35, width - 35), Phaser.Math.Between(40, height - 40),
        Phaser.Math.Between(1, 3), 0xd7b895, 0.12,
      );
      this.tweens.add({ targets: dust, y: dust.y - Phaser.Math.Between(8, 20), alpha: 0.02, duration: Phaser.Math.Between(1800, 3600), yoyo: true, repeat: -1 });
    }

    this.isaac = this.drawIsaac(135, 178, run, labels);
    const allEnemies = run.combat!.enemies;
    const spacing = Math.min(190, 520 / Math.max(1, allEnemies.length));
    const startX = width - 125 - spacing * (allEnemies.length - 1);
    allEnemies.forEach((enemy, index) => {
      if (enemy.hp <= 0) return;
      const visual = this.drawEnemy(
        startX + spacing * index, 170, enemy.icon,
        labels?.enemies[enemy.instanceId] ?? enemy.name,
        enemy.hp / enemy.maxHp, enemy.instanceId === run.combat?.selectedEnemyId,
      );
      this.enemies.set(enemy.instanceId, visual);
    });

    this.add.text(42, 40, labels?.round ?? `ROUND ${run.combat!.round}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#d6baa0', letterSpacing: 3,
    });
    this.add.text(width - 42, 40, labels?.room ?? run.combat!.roomKind.toUpperCase(), {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#d6baa0', letterSpacing: 3,
    }).setOrigin(1, 0);
  }

  private actor(id?: string): ActorVisual | undefined {
    return id === 'isaac' ? this.isaac : id ? this.enemies.get(id) : undefined;
  }

  private wait(duration: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(duration, resolve));
  }

  private tween(targets: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[], config: Record<string, unknown>): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({ targets, ...config, onComplete: () => resolve() });
    });
  }

  private async animateEvent(event: CombatAnimationEvent): Promise<void> {
    switch (event.kind) {
      case 'card-play': await this.animateCard(event, false); break;
      case 'card-discard': await this.animateCard(event, true); break;
      case 'discard-phase': await this.animatePhaseBanner(this.labels()?.discardPhase ?? 'DISCARD PHASE', 0xc67a64); break;
      case 'enemy-phase': await this.animatePhaseBanner(this.labels()?.enemyTurn ?? 'ENEMY TURN', 0xd75e57); break;
      case 'round-start': await this.animatePhaseBanner(`${this.labels()?.playerTurn ?? 'PLAYER TURN'}  ·  ${event.value ?? ''}`, 0xe3bc72); break;
      case 'player-attack': await this.animatePlayerAttack(event); break;
      case 'enemy-attack': await this.animateEnemyAttack(event); break;
      case 'shield': await this.animateShield(event); break;
      case 'heal': await this.animateHeal(event); break;
      case 'curse': await this.animateCurse(event); break;
      case 'prepare': await this.animatePrepare(event); break;
      case 'idle': await this.animateIdle(event); break;
      case 'defeat': await this.animateDefeat(event); break;
      case 'black-heart': await this.animateBlackHeart(); break;
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
    const text = this.add.text(width / 2, height / 2, title, {
      fontFamily: 'Georgia, "Microsoft YaHei", serif', fontSize: '29px', fontStyle: 'bold', color: `#${color.toString(16).padStart(6, '0')}`,
      stroke: '#160e0d', strokeThickness: 7, letterSpacing: 5,
    }).setOrigin(0.5).setAlpha(0).setScale(0.72).setDepth(82);
    await Promise.all([
      this.tween(veil, { alpha: 0.7, duration: 170 }),
      this.tween([topLine, bottomLine], { alpha: 0.85, scaleX: 1.12, duration: 220, ease: 'Cubic.easeOut' }),
      this.tween(text, { alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' }),
    ]);
    await this.wait(330);
    await this.tween([veil, topLine, bottomLine, text], { alpha: 0, duration: 210 });
    veil.destroy(); topLine.destroy(); bottomLine.destroy(); text.destroy();
  }

  private async animateCard(event: CombatAnimationEvent, discarded: boolean): Promise<void> {
    const cardName = this.labels()?.cards[event.cardId ?? ''] ?? event.cardId ?? '';
    const x = this.scale.width / 2;
    const panel = this.add.rectangle(x, this.scale.height - 20, 174, 74, discarded ? 0x282322 : 0x3a2e28, 0.98)
      .setStrokeStyle(2, discarded ? 0x806f67 : 0xdfb875, 0.9).setDepth(70).setAngle(discarded ? -5 : 0);
    const icon = this.add.text(x - 67, panel.y, discarded ? '↘' : '↑', {
      fontFamily: 'Georgia, serif', fontSize: '26px', color: discarded ? '#8d7d75' : '#f0c980',
    }).setOrigin(0.5).setDepth(71);
    const title = this.add.text(x + 10, panel.y, cardName, {
      fontFamily: 'Georgia, "Microsoft YaHei", serif', fontSize: '15px', fontStyle: 'bold', color: discarded ? '#a8978e' : '#f0dfcd',
      wordWrap: { width: 120 }, align: 'center',
    }).setOrigin(0.5).setDepth(71);
    const pieces = [panel, icon, title];
    await this.tween(pieces, { y: `-=${discarded ? 58 : 112}`, x: discarded ? '+=150' : '+=0', angle: discarded ? 12 : 0, duration: 260, ease: 'Back.easeOut' });
    await this.tween(pieces, { alpha: 0, y: discarded ? '+=45' : '-=28', duration: 190, ease: 'Quad.easeIn' });
    pieces.forEach((piece) => piece.destroy());
  }

  private async animatePlayerAttack(event: CombatAnimationEvent): Promise<void> {
    const source = this.actor('isaac');
    const target = this.actor(event.targetId);
    if (!source || !target) return;
    this.tweens.add({ targets: source.parts, x: '+=14', duration: 100, yoyo: true, ease: 'Quad.easeOut' });

    if (event.attackMode === 'brimstone') {
      const beam = this.add.graphics();
      beam.lineStyle(16, 0xb82135, 0.22); beam.lineBetween(source.x + 38, source.y, target.x - 25, target.y);
      beam.lineStyle(5, 0xff4761, 0.9); beam.lineBetween(source.x + 38, source.y, target.x - 25, target.y);
      await this.tween(beam, { alpha: 0, duration: 330, ease: 'Quad.easeIn' });
      beam.destroy();
    } else {
      const projectile = event.attackMode === 'knife'
        ? this.add.text(source.x + 38, source.y, '◆', { fontFamily: 'Georgia, serif', fontSize: '34px', color: '#e7d7cc' }).setOrigin(0.5)
        : event.attackMode === 'tech-x'
          ? this.add.circle(source.x + 38, source.y, 18, 0x62d4dd, 0.12).setStrokeStyle(5, 0x85f5f1, 0.95)
          : this.add.circle(source.x + 38, source.y, 11, 0x93dff3, 0.95).setStrokeStyle(3, 0xd8f8ff, 0.8);
      this.tweens.add({ targets: projectile, angle: event.attackMode === 'knife' ? 360 : 0, duration: 250 });
      await this.tween(projectile, { x: target.x - 20, y: target.y, duration: 260, ease: 'Quad.easeIn' });
      projectile.destroy();
    }
    await this.impact(target, event.value ?? 0, 0xefa09a);
  }

  private async animateEnemyAttack(event: CombatAnimationEvent): Promise<void> {
    const source = this.actor(event.sourceId);
    const target = this.actor('isaac');
    if (!source || !target) return;
    this.tweens.add({ targets: source.parts, x: '-=62', duration: 180, yoyo: true, hold: 80, ease: 'Back.easeIn' });
    await this.wait(130);
    const shot = this.add.circle(source.x - 38, source.y, 13, 0xd45b54, 0.95).setStrokeStyle(4, 0xffb09d, 0.75);
    const raw = this.add.text(source.x - 10, source.y - 75, `⚔ ${event.rawValue ?? 0}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#ffaea0', stroke: '#3d1715', strokeThickness: 4,
    }).setOrigin(0.5);
    this.tweens.add({ targets: raw, y: raw.y - 18, alpha: 0, duration: 520, onComplete: () => raw.destroy() });
    await this.tween(shot, { x: target.x + 26, y: target.y, duration: 240, ease: 'Cubic.easeIn' });
    shot.destroy();
    if ((event.armorValue ?? 0) > 0) await this.animateArmorBlock(target, event.armorValue ?? 0);
    if ((event.secondaryValue ?? 0) > 0) await this.animateShieldLoss(target, event.secondaryValue ?? 0);
    await this.impact(
      target, event.value ?? 0, (event.value ?? 0) > 0 ? 0xff6f66 : 0x7fc9df,
      event.secondaryValue ?? 0, event.armorValue ?? 0, event.rawValue,
    );
    if ((event.value ?? 0) > 0) this.bloodDrop(target, event.value ?? 0);
  }

  private async animateArmorBlock(target: ActorVisual, amount: number): Promise<void> {
    const plate = this.add.text(target.x - 36, target.y - 10, '⛉', {
      fontFamily: 'Georgia, serif', fontSize: '40px', color: '#d9b66f', stroke: '#4f3a1e', strokeThickness: 6,
    }).setOrigin(0.5).setScale(0.45).setAngle(-12);
    const label = this.add.text(target.x, target.y - 70, `${this.labels()?.armorBlocked ?? 'ARMOR'}  −${amount}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#f0ce86', stroke: '#34250f', strokeThickness: 4,
    }).setOrigin(0.5);
    this.tweens.add({ targets: label, y: label.y - 20, alpha: 0, duration: 480, onComplete: () => label.destroy() });
    await this.tween(plate, { scale: 1.15, angle: 8, duration: 150, ease: 'Back.easeOut', yoyo: true });
    plate.destroy();
  }

  private async animateShieldLoss(target: ActorVisual, amount: number): Promise<void> {
    const ring = this.add.circle(target.x, target.y, 56, 0x78d6e8, 0.08).setStrokeStyle(7, 0x9be8f2, 0.88);
    const label = this.add.text(target.x + 42, target.y - 56, `${this.labels()?.shieldBlocked ?? 'SHIELD'}  −${amount}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#a9ecf4', stroke: '#173b43', strokeThickness: 4,
    }).setOrigin(0.5);
    for (let index = 0; index < 6; index += 1) {
      const shard = this.add.triangle(target.x, target.y, 0, 0, 7, 2, 2, 8, 0x8be1ed, 0.9);
      this.tweens.add({ targets: shard, x: target.x + Phaser.Math.Between(-75, 75), y: target.y + Phaser.Math.Between(-70, 70), alpha: 0, duration: 360, onComplete: () => shard.destroy() });
    }
    this.tweens.add({ targets: label, y: label.y - 18, alpha: 0, duration: 470, onComplete: () => label.destroy() });
    await this.tween(ring, { scale: 0.55, alpha: 0, duration: 260, ease: 'Cubic.easeIn' });
    ring.destroy();
  }

  private bloodDrop(target: ActorVisual, amount: number): void {
    const count = Phaser.Math.Clamp(Math.ceil(amount / 3), 4, 11);
    this.cameras.main.flash(90, 105, 8, 8, false);
    for (let index = 0; index < count; index += 1) {
      const drop = this.add.circle(target.x + Phaser.Math.Between(-15, 15), target.y + Phaser.Math.Between(-10, 20), Phaser.Math.Between(3, 7), 0xa9212a, 0.92).setDepth(55);
      this.tweens.add({
        targets: drop, x: drop.x + Phaser.Math.Between(-65, 65), y: target.y + Phaser.Math.Between(68, 102),
        scaleY: 0.45, alpha: 0.12, duration: Phaser.Math.Between(380, 620), ease: 'Quad.easeIn', onComplete: () => drop.destroy(),
      });
    }
    const stain = this.add.ellipse(target.x, target.y + 83, 18, 7, 0x68161d, 0.45).setDepth(2);
    this.tweens.add({ targets: stain, scaleX: 2.2, alpha: 0, duration: 1200, onComplete: () => stain.destroy() });
  }

  private async impact(target: ActorVisual, value: number, color: number, shieldDamage = 0, armorDamage = 0, rawValue?: number): Promise<void> {
    this.cameras.main.shake(120, 0.008);
    const burst = this.add.circle(target.x, target.y, 22, color, 0.45).setStrokeStyle(4, color, 0.9);
    this.tweens.add({ targets: target.parts, x: '+=8', duration: 45, yoyo: true, repeat: 2 });
    const damageLabel = rawValue === undefined
      ? value > 0 ? `-${value} HP` : shieldDamage > 0 ? `-${shieldDamage} ⬡` : 'MISS'
      : `⚔ ${rawValue}  −  ⛉ ${armorDamage}  −  ⬡ ${shieldDamage}\n${value > 0 ? `−${value} HP` : 'NO HEART DAMAGE'}`;
    const damage = this.add.text(target.x, target.y - 62, damageLabel, {
      fontFamily: 'Arial, sans-serif', fontSize: rawValue === undefined ? '18px' : '15px', fontStyle: 'bold', color: value > 0 ? '#ffb4a9' : '#9ee4f2',
      align: 'center', stroke: '#301313', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: damage, y: damage.y - 35, alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => damage.destroy() });
    await this.tween(burst, { scale: 2.3, alpha: 0, duration: 240, ease: 'Quad.easeOut' });
    burst.destroy();
  }

  private async animateShield(event: CombatAnimationEvent): Promise<void> {
    const target = this.actor(event.targetId ?? event.sourceId);
    if (!target) return;
    const ring = this.add.circle(target.x, target.y, 48, 0x70c9df, 0.08).setStrokeStyle(6, 0x8de6f0, 0.9);
    const label = this.add.text(target.x, target.y - 62, `+${event.value ?? 0} ⬡`, {
      fontFamily: 'Arial, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#a7edf4',
    }).setOrigin(0.5);
    this.tweens.add({ targets: label, y: label.y - 22, alpha: 0, duration: 500, onComplete: () => label.destroy() });
    await this.tween(ring, { scale: 1.35, alpha: 0, duration: 430, ease: 'Sine.easeOut' });
    ring.destroy();
  }

  private async animateHeal(event: CombatAnimationEvent): Promise<void> {
    const target = this.actor(event.targetId ?? event.sourceId);
    if (!target) return;
    const glow = this.add.circle(target.x, target.y, 42, 0x69ce91, 0.25);
    for (let index = 0; index < 5; index += 1) {
      const plus = this.add.text(target.x + Phaser.Math.Between(-28, 28), target.y + Phaser.Math.Between(-18, 25), '+', {
        fontFamily: 'Arial, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#91efad',
      }).setOrigin(0.5);
      this.tweens.add({ targets: plus, y: plus.y - 45, alpha: 0, duration: 430 + index * 45, onComplete: () => plus.destroy() });
    }
    const value = this.add.text(target.x, target.y - 64, `+${event.value ?? 0}`, { fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#a6f4bb' }).setOrigin(0.5);
    this.tweens.add({ targets: value, y: value.y - 25, alpha: 0, duration: 520, onComplete: () => value.destroy() });
    await this.tween(glow, { scale: 1.6, alpha: 0, duration: 430 });
    glow.destroy();
  }

  private async animateCurse(event: CombatAnimationEvent): Promise<void> {
    const source = this.actor(event.sourceId);
    const target = this.actor(event.targetId);
    if (!target) return;
    const curse = this.add.text(source?.x ?? target.x, (source?.y ?? target.y) - 20, '☠', {
      fontFamily: 'Georgia, serif', fontSize: '34px', color: '#c58be2', stroke: '#442554', strokeThickness: 5,
    }).setOrigin(0.5);
    await this.tween(curse, { x: target.x, y: target.y - 18, angle: 360, scale: 1.35, duration: 330, ease: 'Sine.easeInOut' });
    await this.tween(curse, { alpha: 0, y: curse.y - 20, duration: 210 });
    curse.destroy();
  }

  private async animatePrepare(event: CombatAnimationEvent): Promise<void> {
    const source = this.actor(event.sourceId);
    if (!source) return;
    const warning = this.add.text(source.x, source.y - 70, '!', {
      fontFamily: 'Arial, sans-serif', fontSize: '38px', fontStyle: 'bold', color: '#ff645a', stroke: '#551a19', strokeThickness: 6,
    }).setOrigin(0.5).setScale(0.4);
    const ring = this.add.circle(source.x, source.y, 54, 0xb9222b, 0.05).setStrokeStyle(4, 0xf05252, 0.75);
    this.tweens.add({ targets: ring, scale: 1.3, alpha: 0, duration: 520, onComplete: () => ring.destroy() });
    await this.tween(warning, { scale: 1.25, y: warning.y - 10, duration: 240, ease: 'Back.easeOut', yoyo: true, hold: 120 });
    warning.destroy();
  }

  private async animateIdle(event: CombatAnimationEvent): Promise<void> {
    const source = this.actor(event.sourceId);
    if (!source) return;
    const dots = this.add.text(source.x, source.y - 65, '…', { fontFamily: 'Georgia, serif', fontSize: '30px', color: '#a99d96' }).setOrigin(0.5);
    await this.tween(dots, { y: dots.y - 18, alpha: 0, duration: 360 });
    dots.destroy();
  }

  private async animateDefeat(event: CombatAnimationEvent): Promise<void> {
    const target = this.actor(event.targetId ?? event.sourceId);
    if (!target) return;
    for (let index = 0; index < 8; index += 1) {
      const mote = this.add.circle(target.x, target.y, Phaser.Math.Between(3, 7), 0xb65b58, 0.85);
      this.tweens.add({
        targets: mote, x: target.x + Phaser.Math.Between(-65, 65), y: target.y + Phaser.Math.Between(-55, 70),
        alpha: 0, duration: 420, onComplete: () => mote.destroy(),
      });
    }
    await this.tween(target.parts, { alpha: 0, y: '+=22', duration: 360, ease: 'Back.easeIn' });
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
    const shadow = this.add.ellipse(x, y + 78, 92, 22, 0x080707, 0.35);
    const body = this.add.graphics();
    body.fillStyle(0xe3c6b4, 1);
    body.fillRoundedRect(x - 31, y + 22, 62, 70, 26);
    body.fillCircle(x, y, 51);
    body.fillStyle(0x303337, 1);
    body.fillCircle(x - 18, y - 5, 8);
    body.fillCircle(x + 18, y - 5, 8);
    body.fillStyle(0x7ec4dc, 0.9);
    body.fillCircle(x - 18, y + 7, 5);
    body.fillCircle(x + 18, y + 7, 5);
    body.lineStyle(3, 0x6e4a43, 1);
    body.beginPath(); body.arc(x, y + 24, 9, 0.2, Math.PI - 0.2); body.strokePath();
    const label = this.add.text(x, y + 108, `${labels?.isaac ?? 'ISAAC'}  ·  ${labels?.attackMode ?? run.player.stats.attackMode.toUpperCase()}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#dbc0aa', letterSpacing: 1,
    }).setOrigin(0.5);
    this.tweens.add({ targets: [body, shadow], y: '-=3', duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return { parts: [shadow, body, label], x, y };
  }

  private drawEnemy(x: number, y: number, icon: string, name: string, health: number, selected: boolean): ActorVisual {
    const glow = this.add.circle(x, y + 4, 65, selected ? 0xe8b76d : 0x8a5b57, selected ? 0.16 : 0.07);
    const body = this.add.circle(x, y, 48, selected ? 0xa46058 : 0x744c4b, 1);
    body.setStrokeStyle(selected ? 4 : 2, selected ? 0xf3cb83 : 0xb78a7f, selected ? 0.8 : 0.35);
    const symbol = this.add.text(x, y - 3, icon, { fontFamily: 'Georgia, serif', fontSize: '46px', color: '#24191a' }).setOrigin(0.5);
    const label = this.add.text(x, y + 69, name, { fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#dbc0aa' }).setOrigin(0.5);
    const bar = this.add.graphics();
    bar.fillStyle(0x1a1515, 0.9); bar.fillRoundedRect(x - 43, y + 86, 86, 7, 3);
    bar.fillStyle(health > 0.35 ? 0xb45555 : 0xe07b65, 1); bar.fillRoundedRect(x - 43, y + 86, 86 * health, 7, 3);
    this.tweens.add({ targets: [body, glow], scaleX: 1.04, scaleY: 0.97, duration: 850 + x, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return { parts: [glow, body, symbol, label, bar], x, y };
  }
}
