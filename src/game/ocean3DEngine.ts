import { SoundFX } from '../audio/soundFx';
import {
  FISH_SPECIES,
  FishSpeciesDef,
  getPiranhaRank,
  PIRANHA_COLORS,
  PiranhaColorSkin,
} from '../data/fishSpecies';

export interface ControlInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  knobActive: boolean;
  knobAngleRad: number; // 0 = right, -PI/2 = up, PI/2 = down, PI = left
  knobStrength: number; // 0..1
}

export interface OceanFishEntity {
  id: number;
  species: FishSpeciesDef;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  isHunter: boolean;
  wasOutgrownHunter: boolean;
  tailPhase: number;
  facingX: number; // -1 or 1
  pitchRad: number;
  patrolTimer: number;
}

interface CoralProp3D {
  x: number;
  y: number;
  z: number;
  kind: 'coral_branch' | 'coral_brain' | 'kelp' | 'rock' | 'anemone' | 'chest';
  color: string;
  secondaryColor: string;
  scale: number;
  phase: number;
}

interface Bubble3D {
  x: number;
  y: number;
  z: number;
  radius: number;
  speedY: number;
  wobblePhase: number;
  fromTrail?: boolean;
  alpha?: number;
}

interface PlanktonMote3D {
  x: number;
  y: number;
  z: number;
  size: number;
  phase: number;
  alpha: number;
}

interface ChompParticle3D {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: string;
  size: number;
  alpha: number;
  ring?: boolean;
  text?: string;
}

export interface HudSnapshot {
  fishEaten: number;
  bestFishEaten: number;
  sizeCm: number;
  rankTitle: string;
  rankNumber: number;
  smallerCount: number;
  largerCount: number;
  activeHunterName: string | null;
  activeHunterSmallNeeded: number;
  lives: number;
  maxLives: number;
  isGameOver: boolean;
  started: boolean;
  paused: boolean;
  dashActive: boolean;
  dashCooldownRatio: number;
  dashCooldownSec: number;
}

const WORLD_HALF_X = 76;
const WORLD_HALF_Y = 40;
const WORLD_HALF_Z = 48;
const TOTAL_ACTIVE_FISH = 32; // Always 16 smaller (50%) + 16 larger (50%)

export class Ocean3DEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sfx: SoundFX;
  private onHudChange: (snap: HudSnapshot) => void;
  private onToast: (msg: string) => void;
  private onGameOver?: (fishEaten: number, sizeCm: number, rankNumber: number, skinId: string) => void;

  private rafId: number | null = null;
  private lastTs = 0;
  private time = 0;
  private nextEntityId = 1;

  public playerColor: PiranhaColorSkin = PIRANHA_COLORS[0];
  public fishEaten = 0;
  public bestFishEaten = 0;
  public playerSize = 1.0;
  public lives = 3;
  public readonly maxLives = 3;
  public isGameOver = false;
  public started = false;
  public paused = false;

  private playerX = 0;
  private playerY = 0;
  private playerZ = 0;
  private playerVx = 0;
  private playerVy = 0;
  private playerVz = 0;
  private playerFacing = 1;
  private playerPitch = 0;
  private playerTailPhase = 0;
  private biteAnim = 0;
  private invulnTimer = 0;
  private chompCombo = 0;
  private chompComboTimer = 0;
  private trailTimer = 0;

  private dashTimer = 0;
  private dashCooldown = 0;
  private readonly dashDuration = 0.42;
  private readonly dashMaxCooldown = 3.2;
  private dashHudTimer = 0;

  private camX = 0;
  private camY = 0;
  private camZ = -66;

  public input: ControlInputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    knobActive: false,
    knobAngleRad: 0,
    knobStrength: 0,
  };

  private fishes: OceanFishEntity[] = [];
  private props: CoralProp3D[] = [];
  private bubbles: Bubble3D[] = [];
  private motes: PlanktonMote3D[] = [];
  private particles: ChompParticle3D[] = [];
  private hunterCheckTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    sfx: SoundFX,
    initialColorId: string,
    bestFishEaten: number,
    onHudChange: (snap: HudSnapshot) => void,
    onToast: (msg: string) => void,
    onGameOver?: (fishEaten: number, sizeCm: number, rankNumber: number, skinId: string) => void
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.sfx = sfx;
    this.bestFishEaten = bestFishEaten;
    this.onHudChange = onHudChange;
    this.onToast = onToast;
    this.onGameOver = onGameOver;
    this.setPiranhaColor(initialColorId);

    this.init3DScenery();
    this.resetRun(false);
  }

  public setPiranhaColor(colorId: string): void {
    const found = PIRANHA_COLORS.find((c) => c.id === colorId);
    if (found) {
      this.playerColor = found;
    }
  }

  public start(): void {
    if (this.rafId !== null) return;
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (ts - this.lastTs) / 1000));
      this.lastTs = ts;
      this.update(dt);
      this.render();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  public stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public startGame(): void {
    if (this.started) return;
    this.started = true;
    this.paused = false;
    this.invulnTimer = 2.0;
    this.lastTs = performance.now();
    this.emitHud();
  }

  public setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) {
      this.lastTs = performance.now();
    }
    this.emitHud();
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public triggerDash(): boolean {
    if (!this.started || this.paused || this.isGameOver || this.dashCooldown > 0) {
      return false;
    }
    this.dashTimer = this.dashDuration;
    this.dashCooldown = this.dashMaxCooldown;
    this.biteAnim = 1.0;

    // Immediate burst velocity in current input or facing direction
    let dx = 0;
    let dy = 0;
    if (this.input.left) dx -= 1;
    if (this.input.right) dx += 1;
    if (this.input.up) dy += 1;
    if (this.input.down) dy -= 1;
    if (this.input.knobActive && this.input.knobStrength > 0.08) {
      dx += Math.cos(this.input.knobAngleRad);
      dy += -Math.sin(this.input.knobAngleRad);
    }
    const mag = Math.hypot(dx, dy);
    if (mag > 0.05) {
      dx /= mag;
      dy /= mag;
    } else {
      dx = this.playerFacing;
      dy = 0;
    }
    this.playerVx = dx * 42;
    this.playerVy = dy * 42;
    if (Math.abs(dx) > 0.15) {
      this.playerFacing = dx >= 0 ? 1 : -1;
    }

    this.sfx.playDash();
    this.spawnChompParticles(this.playerX, this.playerY, this.playerZ, '#38bdf8', 'DASH!');
    for (let i = 0; i < 6 && this.bubbles.length < 80; i++) {
      this.bubbles.push({
        x: this.playerX - dx * (1.8 + Math.random() * 2.2),
        y: this.playerY - dy * (1.8 + Math.random() * 2.2) + (Math.random() - 0.5) * 2,
        z: this.playerZ + (Math.random() - 0.5) * 2,
        radius: 0.9 + Math.random() * 1.2,
        speedY: 4 + Math.random() * 3.5,
        wobblePhase: Math.random() * Math.PI * 2,
        fromTrail: true,
        alpha: 0.9,
      });
    }
    this.emitHud();
    return true;
  }

  public resetRun(autoStart = true): void {
    this.fishEaten = 0;
    this.playerSize = 1.0;
    this.lives = this.maxLives;
    this.isGameOver = false;
    this.started = autoStart;
    this.paused = false;
    this.playerX = 0;
    this.playerY = 0;
    this.playerZ = 0;
    this.playerVx = 0;
    this.playerVy = 0;
    this.playerVz = 0;
    this.playerFacing = 1;
    this.playerPitch = 0;
    this.biteAnim = 0;
    this.invulnTimer = 2.0;
    this.chompCombo = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashHudTimer = 0;
    this.hunterCheckTimer = 0;
    this.fishes = [];
    this.particles = [];
    this.rebalance5050Ecosystem(true);
    this.emitHud();
  }

  private init3DScenery(): void {
    this.props = [];
    const coralColors = [
      ['#f43f5e', '#fda4af'],
      ['#fb7185', '#fecdd3'],
      ['#f97316', '#fdba74'],
      ['#14b8a6', '#5eead4'],
      ['#0ea5e9', '#7dd3fc'],
      ['#eab308', '#fef08a'],
    ];

    for (let i = 0; i < 44; i++) {
      const x = (Math.random() - 0.5) * (WORLD_HALF_X * 1.9);
      const z = (Math.random() - 0.5) * (WORLD_HALF_Z * 1.85);
      const y = -WORLD_HALF_Y;
      const roll = Math.random();
      const pal = coralColors[i % coralColors.length];
      const kind: CoralProp3D['kind'] =
        i === 0
          ? 'chest'
          : roll < 0.3
            ? 'kelp'
            : roll < 0.54
              ? 'coral_branch'
              : roll < 0.72
                ? 'coral_brain'
                : roll < 0.88
                  ? 'anemone'
                  : 'rock';
      this.props.push({
        x,
        y,
        z,
        kind,
        color: pal[0],
        secondaryColor: pal[1],
        scale: 0.8 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
      });
    }

    this.bubbles = [];
    for (let i = 0; i < 40; i++) {
      this.bubbles.push({
        x: (Math.random() - 0.5) * WORLD_HALF_X * 1.8,
        y: (Math.random() - 0.5) * WORLD_HALF_Y * 1.8,
        z: (Math.random() - 0.5) * WORLD_HALF_Z * 1.8,
        radius: 1.0 + Math.random() * 2.2,
        speedY: 3.5 + Math.random() * 5.0,
        wobblePhase: Math.random() * Math.PI * 2,
      });
    }

    this.motes = [];
    for (let i = 0; i < 55; i++) {
      this.motes.push({
        x: (Math.random() - 0.5) * WORLD_HALF_X * 1.9,
        y: (Math.random() - 0.5) * WORLD_HALF_Y * 1.8,
        z: (Math.random() - 0.5) * WORLD_HALF_Z * 1.8,
        size: 0.7 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.14 + Math.random() * 0.22,
      });
    }
  }

  private rebalance5050Ecosystem(initialSpawn = false): void {
    const targetHalf = TOTAL_ACTIVE_FISH / 2;

    const smaller = this.fishes.filter((f) => f.size < this.playerSize);
    const larger = this.fishes.filter((f) => f.size >= this.playerSize);

    while (smaller.length > targetHalf) {
      smaller.sort(
        (a, b) =>
          Math.hypot(b.x - this.playerX, b.y - this.playerY) -
          Math.hypot(a.x - this.playerX, a.y - this.playerY)
      );
      const removed = smaller.shift();
      if (removed) {
        this.fishes = this.fishes.filter((f) => f.id !== removed.id);
      }
    }

    while (larger.length > targetHalf) {
      larger.sort(
        (a, b) =>
          Math.hypot(b.x - this.playerX, b.y - this.playerY) -
          Math.hypot(a.x - this.playerX, a.y - this.playerY)
      );
      const removed = larger.shift();
      if (removed) {
        this.fishes = this.fishes.filter((f) => f.id !== removed.id);
      }
    }

    while (this.fishes.filter((f) => f.size < this.playerSize).length < targetHalf) {
      this.fishes.push(this.spawnFishEntity('smaller', initialSpawn));
    }

    while (this.fishes.filter((f) => f.size >= this.playerSize).length < targetHalf) {
      const slightlyLargerCount = this.fishes.filter(
        (f) => f.size >= this.playerSize * 1.03 && f.size <= this.playerSize * 1.18
      ).length;
      const mode = slightlyLargerCount < 5 ? 'slightly_larger' : 'larger';
      this.fishes.push(this.spawnFishEntity(mode, initialSpawn));
    }
  }

  private spawnFishEntity(
    category: 'smaller' | 'slightly_larger' | 'larger',
    initialSpawn: boolean
  ): OceanFishEntity {
    const species = FISH_SPECIES[Math.floor(Math.random() * FISH_SPECIES.length)];

    let sizeRatio = 0.65;
    if (category === 'smaller') {
      sizeRatio = 0.38 + Math.random() * 0.52;
    } else if (category === 'slightly_larger') {
      sizeRatio = 1.05 + Math.random() * 0.11;
    } else {
      sizeRatio = 1.18 + Math.random() * 0.85;
    }

    let x = 0;
    let y = 0;
    let z = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      x = (Math.random() - 0.5) * (WORLD_HALF_X * 1.75);
      y = (Math.random() - 0.5) * (WORLD_HALF_Y * 1.65);
      z = (Math.random() - 0.5) * (WORLD_HALF_Z * 1.65);
      const dist = Math.hypot(x - this.playerX, y - this.playerY);
      if (initialSpawn ? dist > 11 : dist > 18) break;
    }

    const dir = Math.random() < 0.5 ? 1 : -1;
    const spd = (5.5 + Math.random() * 4.5) * species.baseSpeed;
    return {
      id: this.nextEntityId++,
      species,
      x,
      y,
      z,
      vx: dir * spd,
      vy: (Math.random() - 0.5) * 2.2,
      vz: (Math.random() - 0.5) * 2.8,
      size: this.playerSize * sizeRatio,
      isHunter: false,
      wasOutgrownHunter: false,
      tailPhase: Math.random() * Math.PI * 2,
      facingX: dir,
      pitchRad: 0,
      patrolTimer: 2 + Math.random() * 4,
    };
  }

  private update(dt: number): void {
    if (this.paused) return;

    this.time += dt;
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.biteAnim > 0) this.biteAnim = Math.max(0, this.biteAnim - dt * 4.5);
    if (this.chompComboTimer > 0) {
      this.chompComboTimer -= dt;
      if (this.chompComboTimer <= 0) this.chompCombo = 0;
    }

    // Dash timer & cooldown tracking
    const wasCooling = this.dashCooldown > 0 || this.dashTimer > 0;
    if (this.dashTimer > 0) this.dashTimer = Math.max(0, this.dashTimer - dt);
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (wasCooling && this.started && !this.isGameOver) {
      this.dashHudTimer += dt;
      if (this.dashHudTimer >= 0.08 || this.dashCooldown === 0) {
        this.dashHudTimer = 0;
        this.emitHud();
      }
    }

    if (this.started && !this.isGameOver) {
      // 1. Update Player Piranha Movement
      let dirX = 0;
      let dirY = 0;

      if (this.input.left) dirX -= 1;
      if (this.input.right) dirX += 1;
      if (this.input.up) dirY += 1;
      if (this.input.down) dirY -= 1;

      if (this.input.knobActive && this.input.knobStrength > 0.08) {
        dirX += Math.cos(this.input.knobAngleRad) * this.input.knobStrength * 1.15;
        dirY += -Math.sin(this.input.knobAngleRad) * this.input.knobStrength * 1.15;
      }

      const inputMag = Math.hypot(dirX, dirY);
      const normX = inputMag > 1 ? dirX / inputMag : dirX;
      const normY = inputMag > 1 ? dirY / inputMag : dirY;

      const dashMult = this.dashTimer > 0 ? 1.72 : 1.0;
      const maxSpeed = 24 * dashMult;
      const targetVx = this.dashTimer > 0 && inputMag < 0.08 ? this.playerFacing * maxSpeed : normX * maxSpeed;
      const targetVy = normY * maxSpeed;
      const targetVz =
        inputMag > 0.1
          ? Math.sin(this.time * 1.6) * 7.5 + normY * 3.5
          : -this.playerZ * 0.4;

      const accel = this.dashTimer > 0 ? 15.0 : inputMag > 0.05 ? 9.5 : 5.0;
      this.playerVx += (targetVx - this.playerVx) * Math.min(1, accel * dt);
      this.playerVy += (targetVy - this.playerVy) * Math.min(1, accel * dt);
      this.playerVz += (targetVz - this.playerVz) * Math.min(1, 3.5 * dt);

      this.playerX += this.playerVx * dt;
      this.playerY += this.playerVy * dt;
      this.playerZ += this.playerVz * dt;

      if (this.playerX < -WORLD_HALF_X) {
        this.playerX = -WORLD_HALF_X;
        this.playerVx = Math.abs(this.playerVx) * 0.35;
      } else if (this.playerX > WORLD_HALF_X) {
        this.playerX = WORLD_HALF_X;
        this.playerVx = -Math.abs(this.playerVx) * 0.35;
      }
      if (this.playerY < -WORLD_HALF_Y + 3.5) {
        this.playerY = -WORLD_HALF_Y + 3.5;
        this.playerVy = Math.abs(this.playerVy) * 0.35;
      } else if (this.playerY > WORLD_HALF_Y - 3.5) {
        this.playerY = WORLD_HALF_Y - 3.5;
        this.playerVy = -Math.abs(this.playerVy) * 0.35;
      }
      if (this.playerZ < -WORLD_HALF_Z * 0.75) {
        this.playerZ = -WORLD_HALF_Z * 0.75;
      } else if (this.playerZ > WORLD_HALF_Z * 0.75) {
        this.playerZ = WORLD_HALF_Z * 0.75;
      }

      if (Math.abs(this.playerVx) > 0.6) {
        this.playerFacing = this.playerVx >= 0 ? 1 : -1;
      }
      const targetPitch = Math.max(-0.55, Math.min(0.55, (this.playerVy / 24) * 0.65));
      this.playerPitch += (targetPitch - this.playerPitch) * Math.min(1, 10 * dt);

      const swimSpeed = Math.hypot(this.playerVx, this.playerVy, this.playerVz);
      this.playerTailPhase += dt * (7 + swimSpeed * 0.75);

      // Subtle swim bubble trail behind fast-moving piranha (denser during Dash!)
      const trailStep = this.dashTimer > 0 ? 0.045 : 0.14;
      this.trailTimer += dt * (swimSpeed > 8 ? 1 : 0.2);
      if (swimSpeed > 9 && this.trailTimer > trailStep && this.bubbles.length < 78) {
        this.trailTimer = 0;
        this.bubbles.push({
          x: this.playerX - this.playerFacing * 2.2,
          y: this.playerY + (Math.random() - 0.5) * 1.2,
          z: this.playerZ + (Math.random() - 0.5) * 1.2,
          radius: 0.7 + Math.random() * 0.9,
          speedY: 4.5 + Math.random() * 3.0,
          wobblePhase: Math.random() * Math.PI * 2,
          fromTrail: true,
          alpha: this.dashTimer > 0 ? 0.9 : 0.75,
        });
      }

      this.camX += (this.playerX * 0.82 - this.camX) * Math.min(1, 6.5 * dt);
      this.camY += (this.playerY * 0.82 - this.camY) * Math.min(1, 6.5 * dt);
      this.camZ = -66;

      // 2. Smart 1% Hunter Check
      this.hunterCheckTimer += dt;
      if (this.hunterCheckTimer >= 0.9) {
        this.hunterCheckTimer = 0;
        this.evaluateOnePercentHunterRule();
      }
    } else if (!this.started) {
      // Gentle idle hover animation behind Start overlay
      this.playerY = Math.sin(this.time * 1.6) * 1.4;
      this.playerTailPhase += dt * 7.5;
      this.camX += (0 - this.camX) * Math.min(1, 3 * dt);
      this.camY += (0 - this.camY) * Math.min(1, 3 * dt);
    }

    // 3. Update All 32 Fish & Collisions
    let ateAnyFish = false;
    const rankBefore = getPiranhaRank(this.fishEaten).rank;

    for (let i = this.fishes.length - 1; i >= 0; i--) {
      const f = this.fishes[i];

      if (f.isHunter && this.playerSize > f.size) {
        f.isHunter = false;
        f.wasOutgrownHunter = true;
        this.sfx.playHunterTurnaround();
        this.onToast(`Outgrew ${f.species.name} — eat for 3x bonus!`);
      }
      if (f.isHunter && f.size > this.playerSize * 1.24) {
        f.isHunter = false;
      }

      if (f.isHunter && this.started && !this.isGameOver) {
        const dx = this.playerX - f.x;
        const dy = this.playerY - f.y;
        const dz = this.playerZ - f.z;
        const dist = Math.max(0.01, Math.hypot(dx, dy, dz));
        const huntSpeed = 12.6;
        f.vx += ((dx / dist) * huntSpeed - f.vx) * Math.min(1, 4.0 * dt);
        f.vy += ((dy / dist) * huntSpeed - f.vy) * Math.min(1, 4.0 * dt);
        f.vz += ((dz / dist) * huntSpeed - f.vz) * Math.min(1, 4.0 * dt);
      } else if (f.wasOutgrownHunter && this.started && !this.isGameOver) {
        const dx = f.x - this.playerX;
        const dy = f.y - this.playerY;
        const dist = Math.max(0.01, Math.hypot(dx, dy));
        const fleeSpeed = 10.5;
        f.vx += ((dx / dist) * fleeSpeed - f.vx) * Math.min(1, 3.5 * dt);
        f.vy += ((dy / dist) * fleeSpeed - f.vy) * Math.min(1, 3.5 * dt);
      } else {
        f.patrolTimer -= dt;
        if (f.patrolTimer <= 0) {
          f.patrolTimer = 2.5 + Math.random() * 4.5;
          const dir = Math.random() < 0.22 ? -f.facingX : f.facingX;
          const spd = (5.2 + Math.random() * 5.0) * f.species.baseSpeed;
          f.vx = dir * spd;
          f.vy = (Math.random() - 0.5) * 3.6;
          f.vz = (Math.random() - 0.5) * 4.0;
        }
        f.vz += (this.playerZ - f.z) * 0.16 * dt;
      }

      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;

      if (f.x < -WORLD_HALF_X + 3) {
        f.x = -WORLD_HALF_X + 3;
        f.vx = Math.abs(f.vx);
      } else if (f.x > WORLD_HALF_X - 3) {
        f.x = WORLD_HALF_X - 3;
        f.vx = -Math.abs(f.vx);
      }
      if (f.y < -WORLD_HALF_Y + 4) {
        f.y = -WORLD_HALF_Y + 4;
        f.vy = Math.abs(f.vy);
      } else if (f.y > WORLD_HALF_Y - 4) {
        f.y = WORLD_HALF_Y - 4;
        f.vy = -Math.abs(f.vy);
      }
      if (f.z < -WORLD_HALF_Z + 4) {
        f.z = -WORLD_HALF_Z + 4;
        f.vz = Math.abs(f.vz);
      } else if (f.z > WORLD_HALF_Z - 4) {
        f.z = WORLD_HALF_Z - 4;
        f.vz = -Math.abs(f.vz);
      }

      if (Math.abs(f.vx) > 0.3) {
        f.facingX = f.vx >= 0 ? 1 : -1;
      }
      f.pitchRad = Math.max(-0.48, Math.min(0.48, f.vy * 0.04));
      f.tailPhase += dt * (6.5 + Math.hypot(f.vx, f.vy) * 0.65);

      if (!this.started || this.isGameOver) continue;

      const fishVisualRatio = Math.pow(f.size / this.playerSize, 0.42);
      const dashReachBonus = this.dashTimer > 0 ? 1.15 : 0;
      const hitRadiusXY = 3.2 + dashReachBonus + Math.min(2.6, fishVisualRatio * 1.6);
      const distXY = Math.hypot(f.x - this.playerX, f.y - this.playerY);
      const distZ = Math.abs(f.z - this.playerZ);

      if (distXY < hitRadiusXY && distZ < 14) {
        if (f.size <= this.playerSize * 1.01) {
          const bonusEaten = f.wasOutgrownHunter ? 3 : 1;
          this.fishEaten += bonusEaten;
          if (this.fishEaten > this.bestFishEaten) {
            this.bestFishEaten = this.fishEaten;
          }
          const growthFactor = f.wasOutgrownHunter ? 1.14 : 1.065;
          this.playerSize *= growthFactor;
          this.biteAnim = 1.0;
          this.chompCombo += 1;
          this.chompComboTimer = 2.4;
          this.sfx.playChomp(this.chompCombo);

          this.spawnChompParticles(
            f.x,
            f.y,
            f.z,
            f.species.primaryColor,
            f.wasOutgrownHunter ? '+3 REVENGE' : '+1'
          );

          this.fishes.splice(i, 1);
          ateAnyFish = true;
        } else if (f.isHunter && this.invulnTimer <= 0) {
          this.invulnTimer = 2.2;
          this.lives = Math.max(0, this.lives - 1);
          this.sfx.playBitten();

          const pushX = f.x >= this.playerX ? 1 : -1;
          f.vx = pushX * 16;
          f.x += pushX * 7;
          this.playerVx = -pushX * 12;
          this.spawnChompParticles(
            this.playerX,
            this.playerY,
            this.playerZ,
            '#fb7185',
            'BITTEN'
          );

          if (this.lives <= 0) {
            this.isGameOver = true;
            f.isHunter = false;
            const sizeCm = Math.round(12 * Math.pow(this.playerSize, 0.85));
            const rankNow = getPiranhaRank(this.fishEaten).rank;
            this.onGameOver?.(this.fishEaten, sizeCm, rankNow, this.playerColor.id);
          } else {
            this.onToast(`Bitten by ${f.species.name} — eat 2 small fish to outgrow it`);
          }
          this.emitHud();
        }
      }
    }

    if (ateAnyFish) {
      const rankNow = getPiranhaRank(this.fishEaten);
      if (rankNow.rank > rankBefore) {
        this.sfx.playRankUp();
        this.onToast(`Stage Up: Lv.${rankNow.rank} ${rankNow.title}`);
      }
      this.rebalance5050Ecosystem(false);
      this.emitHud();
    }

    // 4. Update Bubbles, Motes & Particles
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.y += b.speedY * dt;
      b.x += Math.sin(this.time * 2 + b.wobblePhase) * 0.85 * dt;
      if (b.fromTrail) {
        b.alpha = (b.alpha ?? 0.7) - dt * 0.65;
        if (b.alpha <= 0 || b.y > WORLD_HALF_Y) {
          this.bubbles.splice(i, 1);
        }
      } else if (b.y > WORLD_HALF_Y) {
        b.y = -WORLD_HALF_Y;
        b.x = (Math.random() - 0.5) * WORLD_HALF_X * 1.8;
      }
    }

    for (const m of this.motes) {
      m.y += Math.sin(this.time * 0.7 + m.phase) * 0.4 * dt;
      m.x += Math.cos(this.time * 0.5 + m.phase) * 0.35 * dt;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.ring) {
        p.size += dt * 28;
        p.alpha -= dt * 1.65;
      } else {
        p.alpha -= dt * 1.25;
      }
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  private evaluateOnePercentHunterRule(): void {
    const activeHunter = this.fishes.find((f) => f.isHunter);
    if (activeHunter) {
      this.emitHud();
      return;
    }

    const slightlyLargerCandidates = this.fishes.filter(
      (f) => f.size > this.playerSize * 1.02 && f.size <= this.playerSize * 1.17
    );
    if (slightlyLargerCandidates.length === 0) return;

    for (const candidate of slightlyLargerCandidates) {
      if (Math.random() < 0.06) {
        candidate.isHunter = true;
        candidate.size = Math.min(candidate.size, this.playerSize * 1.125);
        this.sfx.playHunterAlert();
        this.emitHud();
        break;
      }
    }
  }

  private spawnChompParticles(
    x: number,
    y: number,
    z: number,
    color: string,
    labelText?: string
  ): void {
    // Expanding water ripple ring
    this.particles.push({
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      color: '#bae6fd',
      size: 6,
      alpha: 0.75,
      ring: true,
    });

    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const spd = 4 + Math.random() * 7;
      this.particles.push({
        x,
        y,
        z,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        vz: (Math.random() - 0.5) * 4,
        color: i % 2 === 0 ? color : '#e0f2fe',
        size: 1.8 + Math.random() * 1.8,
        alpha: 0.9,
      });
    }
    if (labelText) {
      this.particles.push({
        x,
        y: y + 2.5,
        z,
        vx: 0,
        vy: 5.5,
        vz: 0,
        color: labelText === 'BITTEN' ? '#fda4af' : '#fef08a',
        size: 13,
        alpha: 1.2,
        text: labelText,
      });
    }
  }

  private emitHud(): void {
    const smallerCount = this.fishes.filter((f) => f.size < this.playerSize).length;
    const largerCount = this.fishes.length - smallerCount;
    const rank = getPiranhaRank(this.fishEaten);
    const activeHunter = this.fishes.find((f) => f.isHunter);
    let smallNeeded = 0;
    if (activeHunter) {
      const ratio = activeHunter.size / this.playerSize;
      smallNeeded = Math.max(1, Math.ceil(Math.log(ratio * 1.005) / Math.log(1.065)));
    }

    const sizeCm = Math.round(12 * Math.pow(this.playerSize, 0.85));

    this.onHudChange({
      fishEaten: this.fishEaten,
      bestFishEaten: this.bestFishEaten,
      sizeCm,
      rankTitle: rank.title,
      rankNumber: rank.rank,
      smallerCount,
      largerCount,
      activeHunterName: activeHunter ? activeHunter.species.name : null,
      activeHunterSmallNeeded: smallNeeded,
      lives: this.lives,
      maxLives: this.maxLives,
      isGameOver: this.isGameOver,
      started: this.started,
      paused: this.paused,
      dashActive: this.dashTimer > 0,
      dashCooldownRatio: Math.max(0, Math.min(1, this.dashCooldown / this.dashMaxCooldown)),
      dashCooldownSec: Math.ceil(this.dashCooldown * 10) / 10,
    });
  }

  // ===================== 3D PERSPECTIVE PROJECTION & RENDERING =====================
  private project3D(
    wx: number,
    wy: number,
    wz: number,
    w: number,
    h: number
  ): { sx: number; sy: number; scale: number; depth: number } | null {
    const dx = wx - this.camX;
    const dy = wy - this.camY;
    const dz = wz - this.camZ;
    if (dz <= 4) return null;
    const fov = Math.min(w, h) * 0.92;
    const scale = fov / dz;
    return {
      sx: w * 0.5 + dx * scale,
      sy: h * 0.5 - dy * scale,
      scale,
      depth: dz,
    };
  }

  private render(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const cw = Math.max(320, Math.round(rect.width * dpr));
    const ch = Math.max(320, Math.round(rect.height * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);
    const w = rect.width || 390;
    const h = rect.height || 680;

    // 1. Sleek Multi-Stop Deep Ocean Backdrop
    const depthRatio = Math.max(0, Math.min(1, (WORLD_HALF_Y - this.camY) / (WORLD_HALF_Y * 2)));
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, depthRatio < 0.35 ? '#0ea5e9' : '#0284c7');
    bgGrad.addColorStop(0.28, '#0369a1');
    bgGrad.addColorStop(0.68, '#083a5c');
    bgGrad.addColorStop(1, '#03182b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Soft Diagonal Sunlit God Rays
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const beamX = -WORLD_HALF_X * 0.78 + i * (WORLD_HALF_X * 0.31);
      const sway = Math.sin(this.time * 0.45 + i * 1.3) * 5;
      const topP = this.project3D(beamX + sway, WORLD_HALF_Y, 14, w, h);
      const botP = this.project3D(beamX - 14 + sway * 0.4, -WORLD_HALF_Y, 14, w, h);
      if (topP && botP) {
        const beamGrad = ctx.createLinearGradient(topP.sx, topP.sy, botP.sx, botP.sy);
        beamGrad.addColorStop(0, 'rgba(224, 247, 255, 0.16)');
        beamGrad.addColorStop(0.65, 'rgba(56, 189, 248, 0.05)');
        beamGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(topP.sx - 16, topP.sy);
        ctx.lineTo(topP.sx + 16, topP.sy);
        ctx.lineTo(botP.sx + 58, botP.sy);
        ctx.lineTo(botP.sx - 58, botP.sy);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    // 3. Clean Organic Ocean Floor & Shimmering Surface (no wireframe grid!)
    this.draw3DOceanBasin(ctx, w, h);

    // 4. Drifting Plankton Motes for Subtle Depth Parallax
    ctx.save();
    for (const m of this.motes) {
      const p = this.project3D(m.x, m.y, m.z, w, h);
      if (!p) continue;
      const r = Math.max(0.7, (m.size * p.scale) / 14);
      ctx.fillStyle = `rgba(186, 230, 253, ${m.alpha})`;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 5. Depth-Sorted 3D Scene Queue
    type RenderItem = { depth: number; draw: () => void };
    const queue: RenderItem[] = [];

    for (const prop of this.props) {
      const p = this.project3D(prop.x, prop.y, prop.z, w, h);
      if (!p) continue;
      queue.push({
        depth: p.depth,
        draw: () => this.draw3DProp(ctx, prop, p.sx, p.sy, p.scale, p.depth),
      });
    }

    for (const b of this.bubbles) {
      const p = this.project3D(b.x, b.y, b.z, w, h);
      if (!p) continue;
      queue.push({
        depth: p.depth,
        draw: () => {
          const r = Math.max(1.2, (b.radius * p.scale) / 7.5);
          ctx.save();
          ctx.globalAlpha = b.alpha ?? 0.65;
          ctx.strokeStyle = 'rgba(224, 242, 254, 0.72)';
          ctx.fillStyle = 'rgba(186, 230, 253, 0.16)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Tiny bubble specular dot
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.beginPath();
          ctx.arc(p.sx - r * 0.3, p.sy - r * 0.3, Math.max(0.6, r * 0.25), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        },
      });
    }

    const playerScreenGrowth = Math.min(1.95, 0.68 + Math.log10(this.playerSize) * 0.72);

    for (const f of this.fishes) {
      const p = this.project3D(f.x, f.y, f.z, w, h);
      if (!p) continue;
      const relSize = Math.pow(f.size / this.playerSize, 0.48) * playerScreenGrowth;
      const radiusPx = Math.max(8, Math.min(72, relSize * (p.scale * 2.15)));
      queue.push({
        depth: p.depth,
        draw: () => this.draw3DFishEntity(ctx, f, p.sx, p.sy, radiusPx, p.depth, w, h),
      });
    }

    if (!this.isGameOver) {
      const pp = this.project3D(this.playerX, this.playerY, this.playerZ, w, h);
      if (pp) {
        const playerRadiusPx = playerScreenGrowth * (pp.scale * 2.15);
        queue.push({
          depth: pp.depth,
          draw: () => this.drawPlayer3DPiranha(ctx, pp.sx, pp.sy, playerRadiusPx, w, h),
        });
      }
    }

    queue.sort((a, b) => b.depth - a.depth);
    for (const item of queue) {
      item.draw();
    }

    // 6. Particles & Ripples
    for (const pt of this.particles) {
      const p = this.project3D(pt.x, pt.y, pt.z, w, h);
      if (!p) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.alpha));
      if (pt.ring) {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, pt.size, 0, Math.PI * 2);
        ctx.stroke();
      } else if (pt.text) {
        ctx.font = '800 13px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(3, 24, 43, 0.85)';
        ctx.lineWidth = 3.5;
        ctx.strokeText(pt.text, p.sx, p.sy);
        ctx.fillStyle = pt.color;
        ctx.fillText(pt.text, p.sx, p.sy);
      } else {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 7. Subtle Edge Depth Vignette for Clean Framing
    const vig = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.35,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.8
    );
    vig.addColorStop(0, 'rgba(3, 24, 43, 0)');
    vig.addColorStop(1, 'rgba(2, 12, 24, 0.38)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // 8. Sleek Screen-Edge Predator & 1% Hunter Radar Arrows
    if (this.started && !this.isGameOver) {
      this.drawPredatorRadarArrows(ctx, w, h);
    }

    ctx.restore();
  }

  private draw3DOceanBasin(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.save();

    // 1. Smooth Shaded Ocean Sand Floor
    const fl1 = this.project3D(-WORLD_HALF_X * 1.15, -WORLD_HALF_Y, -WORLD_HALF_Z, w, h);
    const fl2 = this.project3D(WORLD_HALF_X * 1.15, -WORLD_HALF_Y, -WORLD_HALF_Z, w, h);
    const fl3 = this.project3D(WORLD_HALF_X * 1.15, -WORLD_HALF_Y, WORLD_HALF_Z * 1.1, w, h);
    const fl4 = this.project3D(-WORLD_HALF_X * 1.15, -WORLD_HALF_Y, WORLD_HALF_Z * 1.1, w, h);

    if (fl1 && fl2 && fl3 && fl4) {
      const sandGrad = ctx.createLinearGradient(0, fl3.sy, 0, fl1.sy);
      sandGrad.addColorStop(0, '#072a45');
      sandGrad.addColorStop(0.42, '#0e4466');
      sandGrad.addColorStop(0.82, '#2d687d');
      sandGrad.addColorStop(1, '#8c7548');
      ctx.fillStyle = sandGrad;
      ctx.beginPath();
      ctx.moveTo(fl1.sx, fl1.sy);
      ctx.lineTo(fl2.sx, fl2.sy);
      ctx.lineTo(fl3.sx, fl3.sy);
      ctx.lineTo(fl4.sx, fl4.sy);
      ctx.closePath();
      ctx.fill();

      // Gentle Organic Caustic Light Ripples on the Seafloor (replaces rigid wireframe grid)
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.1)';
      ctx.lineWidth = 2;
      for (let row = 0; row < 5; row++) {
        const z = -WORLD_HALF_Z * 0.65 + row * (WORLD_HALF_Z * 0.35);
        ctx.beginPath();
        for (let step = 0; step <= 14; step++) {
          const x = -WORLD_HALF_X + (step / 14) * WORLD_HALF_X * 2;
          const waveZ = z + Math.sin(this.time * 1.2 + step * 0.8 + row) * 3.5;
          const pt = this.project3D(x, -WORLD_HALF_Y + 0.1, waveZ, w, h);
          if (!pt) continue;
          if (step === 0) ctx.moveTo(pt.sx, pt.sy);
          else ctx.lineTo(pt.sx, pt.sy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Shimmering Top Water Surface Meniscus
    const sf1 = this.project3D(-WORLD_HALF_X * 1.15, WORLD_HALF_Y, -WORLD_HALF_Z, w, h);
    const sf2 = this.project3D(WORLD_HALF_X * 1.15, WORLD_HALF_Y, -WORLD_HALF_Z, w, h);
    const sf3 = this.project3D(WORLD_HALF_X * 1.15, WORLD_HALF_Y, WORLD_HALF_Z * 1.1, w, h);
    const sf4 = this.project3D(-WORLD_HALF_X * 1.15, WORLD_HALF_Y, WORLD_HALF_Z * 1.1, w, h);
    if (sf1 && sf2 && sf3 && sf4) {
      const surfGrad = ctx.createLinearGradient(0, sf1.sy, 0, sf3.sy);
      surfGrad.addColorStop(0, 'rgba(224, 242, 254, 0.25)');
      surfGrad.addColorStop(1, 'rgba(56, 189, 248, 0.04)');
      ctx.fillStyle = surfGrad;
      ctx.beginPath();
      ctx.moveTo(sf1.sx, sf1.sy);
      ctx.lineTo(sf2.sx, sf2.sy);
      ctx.lineTo(sf3.sx, sf3.sy);
      ctx.lineTo(sf4.sx, sf4.sy);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(224, 242, 254, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sf4.sx, sf4.sy);
      ctx.lineTo(sf3.sx, sf3.sy);
      ctx.stroke();
    }

    ctx.restore();
  }

  private draw3DProp(
    ctx: CanvasRenderingContext2D,
    prop: CoralProp3D,
    sx: number,
    sy: number,
    projScale: number,
    depth: number
  ): void {
    const s = Math.max(4, (prop.scale * projScale) / 4.2);
    const fogAlpha = Math.max(0.35, Math.min(0.95, 1.2 - depth / 135));
    ctx.save();
    ctx.globalAlpha = fogAlpha;
    ctx.translate(sx, sy);

    if (prop.kind === 'kelp') {
      ctx.lineCap = 'round';
      for (const [idx, offset] of [-s * 0.42, 0, s * 0.44].entries()) {
        const sway1 = Math.sin(this.time * 1.9 + prop.phase + idx * 0.6) * s * 0.55;
        const sway2 = Math.cos(this.time * 1.6 + prop.phase + idx * 0.5) * s * 0.75;
        ctx.strokeStyle = idx === 1 ? '#10b981' : '#059669';
        ctx.lineWidth = Math.max(2, s * (idx === 1 ? 0.3 : 0.24));
        ctx.beginPath();
        ctx.moveTo(offset, 0);
        ctx.bezierCurveTo(
          offset + sway1,
          -s * 1.6,
          offset - sway2,
          -s * 3.2,
          offset + sway1 * 0.8,
          -s * (4.4 + (idx % 2) * 0.6)
        );
        ctx.stroke();
      }
    } else if (prop.kind === 'coral_branch') {
      ctx.strokeStyle = prop.color;
      ctx.lineWidth = Math.max(2.5, s * 0.32);
      ctx.lineCap = 'round';
      for (const ang of [-0.62, -0.22, 0.2, 0.6]) {
        const tx = Math.sin(ang) * s * 2.1;
        const ty = -Math.cos(ang) * s * 2.1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(tx * 0.45, ty * 0.7, tx, ty);
        ctx.stroke();
        ctx.fillStyle = prop.secondaryColor;
        ctx.beginPath();
        ctx.arc(tx, ty, Math.max(1.5, s * 0.16), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (prop.kind === 'coral_brain') {
      const grad = ctx.createRadialGradient(-s * 0.25, -s * 0.75, s * 0.1, 0, -s * 0.3, s * 1.15);
      grad.addColorStop(0, prop.secondaryColor);
      grad.addColorStop(1, prop.color);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, -s * 0.2, s * 1.05, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    } else if (prop.kind === 'anemone') {
      for (let i = -3; i <= 3; i++) {
        const sway = Math.sin(this.time * 2.6 + i + prop.phase) * s * 0.22;
        ctx.strokeStyle = prop.color;
        ctx.lineWidth = Math.max(1.8, s * 0.24);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(i * s * 0.22, 0);
        ctx.quadraticCurveTo(i * s * 0.26 + sway, -s * 0.9, i * s * 0.3 + sway * 1.3, -s * 1.45);
        ctx.stroke();
        ctx.fillStyle = prop.secondaryColor;
        ctx.beginPath();
        ctx.arc(i * s * 0.3 + sway * 1.3, -s * 1.45, Math.max(1.2, s * 0.13), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (prop.kind === 'chest') {
      ctx.fillStyle = '#78350f';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(-s * 1.4, -s * 1.4, s * 2.8, s * 1.4, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(0, -s * 0.75, s * 0.24, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const rockGrad = ctx.createLinearGradient(0, -s * 1.1, 0, 0);
      rockGrad.addColorStop(0, '#475569');
      rockGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = rockGrad;
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.35, s * 1.3, s * 0.65, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Draws a streamlined aerodynamic fish body using smooth Bezier curves instead of plain ovals.
   */
  private traceStreamlinedFishBody(
    ctx: CanvasRenderingContext2D,
    rx: number,
    ry: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(rx * 1.02, 0); // Snout tip
    ctx.bezierCurveTo(rx * 0.85, -ry * 0.78, rx * 0.12, -ry * 1.05, -rx * 0.45, -ry * 0.72);
    ctx.bezierCurveTo(-rx * 0.72, -ry * 0.5, -rx * 0.88, -ry * 0.22, -rx * 0.96, -ry * 0.14);
    ctx.lineTo(-rx * 0.96, ry * 0.14);
    ctx.bezierCurveTo(-rx * 0.88, ry * 0.22, -rx * 0.72, ry * 0.5, -rx * 0.45, ry * 0.72);
    ctx.bezierCurveTo(rx * 0.12, ry * 1.05, rx * 0.85, ry * 0.78, rx * 1.02, 0);
    ctx.closePath();
  }

  private drawPlayer3DPiranha(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    r: number,
    w: number,
    h: number
  ): void {
    // 1. Soft Floor Shadow
    const floorShadow = this.project3D(this.playerX, -WORLD_HALF_Y + 0.5, this.playerZ, w, h);
    if (floorShadow) {
      ctx.save();
      ctx.fillStyle = 'rgba(2, 6, 23, 0.26)';
      ctx.beginPath();
      ctx.ellipse(floorShadow.sx, floorShadow.sy, r * 0.8, r * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(sx, sy);

    // Invulnerability Shield Bubble
    if (this.invulnTimer > 0) {
      const pulse = 0.65 + Math.sin(this.time * 14) * 0.25;
      ctx.save();
      ctx.strokeStyle = `rgba(125, 211, 252, ${pulse})`;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Subtle Piranha Aura
    const auraGrad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.5);
    auraGrad.addColorStop(0, this.playerColor.glow);
    auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(this.playerFacing, 1);
    ctx.rotate(-this.playerPitch * this.playerFacing);

    const wag = Math.sin(this.playerTailPhase) * r * 0.22;
    const strokeW = Math.max(1.4, r * 0.065);

    // 1. Sleek Forked Caudal Tail Fin
    // 0. Dash / Bite Boost Speed-Wake Streaks
    if (this.dashTimer > 0) {
      const wakeAlpha = Math.min(0.85, (this.dashTimer / this.dashDuration) * 0.9);
      ctx.save();
      ctx.strokeStyle = `rgba(125, 211, 252, ${wakeAlpha.toFixed(2)})`;
      ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.lineCap = 'round';
      for (const offsetY of [-r * 0.5, 0, r * 0.5]) {
        ctx.beginPath();
        ctx.moveTo(-r * 1.15, offsetY);
        ctx.lineTo(-r * (2.05 + (offsetY === 0 ? 0.35 : 0)), offsetY * 1.1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 1. Forked Animated Tail Fin
    ctx.fillStyle = this.playerColor.fin;
    ctx.strokeStyle = this.playerColor.outline;
    ctx.lineWidth = strokeW;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.85, 0);
    ctx.quadraticCurveTo(-r * 1.25, -r * 0.45 + wag * 0.6, -r * 1.52, -r * 0.64 + wag);
    ctx.quadraticCurveTo(-r * 1.32, -r * 0.15 + wag * 0.4, -r * 1.18, wag * 0.35);
    ctx.quadraticCurveTo(-r * 1.32, r * 0.15 + wag * 0.4, -r * 1.52, r * 0.64 + wag);
    ctx.quadraticCurveTo(-r * 1.25, r * 0.45 + wag * 0.6, -r * 0.85, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 2. Twin-Peaked Razor Dorsal Fin & Ventral Fin
    ctx.beginPath();
    ctx.moveTo(-r * 0.46, -r * 0.54);
    ctx.lineTo(-r * 0.28, -r * 0.96);
    ctx.lineTo(-r * 0.06, -r * 0.78);
    ctx.lineTo(r * 0.1, -r * 0.98);
    ctx.lineTo(r * 0.28, -r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-r * 0.48, r * 0.52);
    ctx.lineTo(-r * 0.24, r * 0.88);
    ctx.lineTo(r * 0.06, r * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. Sculpted Piranha Body
    const bodyGrad = ctx.createRadialGradient(-r * 0.08, -r * 0.28, r * 0.08, 0, 0, r * 1.1);
    bodyGrad.addColorStop(0, this.playerColor.primary);
    bodyGrad.addColorStop(0.7, this.playerColor.secondary);
    bodyGrad.addColorStop(1, this.playerColor.outline);
    ctx.fillStyle = bodyGrad;
    this.traceStreamlinedFishBody(ctx, r * 1.0, r * 0.78);
    ctx.fill();
    ctx.stroke();

    // 4. Clipped Belly & Top Specular Sheen
    ctx.save();
    this.traceStreamlinedFishBody(ctx, r * 0.96, r * 0.74);
    ctx.clip();
    ctx.fillStyle = this.playerColor.belly;
    ctx.beginPath();
    ctx.ellipse(r * 0.16, r * 0.52, r * 0.8, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.44, r * 0.54, r * 0.14, -0.08, 0, Math.PI * 2);
    ctx.fill();

    // Subtle Gill Curve
    ctx.strokeStyle = this.playerColor.outline;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.max(1.2, r * 0.055);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(r * 0.16, r * 0.04, r * 0.34, -0.55, 0.7);
    ctx.stroke();
    ctx.restore();

    // 5. Piranha Bulldog Lower Jaw & Sleek Razor Teeth
    const jawOpen = this.biteAnim * r * 0.24;
    ctx.fillStyle = this.playerColor.belly;
    ctx.strokeStyle = this.playerColor.outline;
    ctx.lineWidth = strokeW * 0.9;
    ctx.beginPath();
    ctx.moveTo(r * 0.44, r * 0.16 + jawOpen * 0.3);
    ctx.quadraticCurveTo(r * 0.96, r * 0.4 + jawOpen, r * 1.04, -r * 0.02 + jawOpen * 0.45);
    ctx.lineTo(r * 0.54, -r * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = this.playerColor.outline;
    ctx.lineWidth = Math.max(0.8, r * 0.032);
    for (let t = 0; t < 4; t++) {
      const tx = r * (0.55 + t * 0.105);
      const ty = r * 0.03 + jawOpen * 0.25;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + r * 0.05, ty - r * 0.14);
      ctx.lineTo(tx + r * 0.1, ty);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 6. Fierce Eye & Brow
    ctx.fillStyle = '#fef08a';
    ctx.strokeStyle = this.playerColor.outline;
    ctx.lineWidth = Math.max(1.2, r * 0.055);
    ctx.beginPath();
    ctx.arc(r * 0.46, -r * 0.21, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(r * 0.51, -r * 0.21, r * 0.105, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.54, -r * 0.26, r * 0.042, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = this.playerColor.outline;
    ctx.lineWidth = Math.max(1.8, r * 0.085);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(r * 0.27, -r * 0.39);
    ctx.lineTo(r * 0.65, -r * 0.3);
    ctx.stroke();

    // 7. Flapping Side Pectoral Fin
    const finFlap = Math.cos(this.playerTailPhase) * 0.25;
    ctx.save();
    ctx.translate(r * 0.06, r * 0.18);
    ctx.rotate(0.28 + finFlap);
    ctx.fillStyle = this.playerColor.fin;
    ctx.strokeStyle = this.playerColor.outline;
    ctx.lineWidth = Math.max(1.1, r * 0.055);
    ctx.beginPath();
    ctx.ellipse(-r * 0.16, r * 0.07, r * 0.24, r * 0.12, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  private draw3DFishEntity(
    ctx: CanvasRenderingContext2D,
    f: OceanFishEntity,
    sx: number,
    sy: number,
    r: number,
    depth: number,
    w: number,
    h: number
  ): void {
    const sp = f.species;

    // Floor Shadow
    const floorShadow = this.project3D(f.x, -WORLD_HALF_Y + 0.5, f.z, w, h);
    if (floorShadow) {
      ctx.save();
      ctx.fillStyle = 'rgba(2, 6, 23, 0.18)';
      ctx.beginPath();
      ctx.ellipse(floorShadow.sx, floorShadow.sy, r * 0.72, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(sx, sy);

    const fogAlpha = Math.max(0.52, Math.min(1, 1.24 - depth / 132));
    ctx.globalAlpha = fogAlpha;

    // Only highlight active 1% Hunter or Outgrown Revenge target (keeps ocean clean!)
    if (f.isHunter) {
      const pulse = 1 + Math.sin(this.time * 8) * 0.1;
      ctx.save();
      ctx.strokeStyle = '#f43f5e';
      ctx.fillStyle = 'rgba(244, 63, 94, 0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.38 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (f.wasOutgrownHunter) {
      ctx.save();
      ctx.strokeStyle = '#34d399';
      ctx.fillStyle = 'rgba(52, 211, 153, 0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.scale(f.facingX, 1);
    ctx.rotate(-f.pitchRad * f.facingX);

    const wag = Math.sin(f.tailPhase) * r * 0.18;
    const rx = r * sp.bodyAspect.length;
    const ry = r * sp.bodyAspect.height;

    ctx.strokeStyle = sp.outlineColor;
    ctx.lineWidth = Math.max(1.1, r * 0.055);
    ctx.lineJoin = 'round';

    // 1. Caudal Tail Fin
    ctx.save();
    ctx.globalAlpha *= 0.92;
    ctx.fillStyle = sp.accentColor;
    ctx.beginPath();
    ctx.moveTo(-rx * 0.85, 0);
    ctx.quadraticCurveTo(-rx * 1.18, -ry * 0.55 + wag * 0.6, -rx * 1.42, -ry * 0.72 + wag);
    ctx.quadraticCurveTo(-rx * 1.2, -ry * 0.12 + wag * 0.35, -rx * 1.14, wag * 0.35);
    ctx.quadraticCurveTo(-rx * 1.2, ry * 0.12 + wag * 0.35, -rx * 1.42, ry * 0.72 + wag);
    ctx.quadraticCurveTo(-rx * 1.18, ry * 0.55 + wag * 0.6, -rx * 0.85, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 2. Dorsal & Specialty Fins
    if (sp.id === 'shark' || sp.id === 'hammerhead') {
      ctx.fillStyle = sp.primaryColor;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.22, -ry * 0.65);
      ctx.quadraticCurveTo(-rx * 0.1, -ry * 1.4, -rx * 0.04, -ry * 1.62);
      ctx.quadraticCurveTo(rx * 0.12, -ry * 1.1, rx * 0.22, -ry * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (sp.id === 'lionfish') {
      ctx.strokeStyle = sp.secondaryColor;
      ctx.lineWidth = Math.max(1.5, r * 0.075);
      for (let q = -3; q <= 3; q++) {
        ctx.beginPath();
        ctx.moveTo(q * rx * 0.13, -ry * 0.58);
        ctx.lineTo(q * rx * 0.22, -ry * 1.48);
        ctx.stroke();
      }
      ctx.strokeStyle = sp.outlineColor;
      ctx.lineWidth = Math.max(1.1, r * 0.055);
    } else if (sp.id === 'mantaray') {
      const flap = Math.sin(f.tailPhase) * ry * 0.85;
      ctx.fillStyle = sp.primaryColor;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.65, 0);
      ctx.quadraticCurveTo(-rx * 0.1, -ry * 1.4 + flap * 0.4, 0, -ry * 2.35 + flap);
      ctx.quadraticCurveTo(rx * 0.38, -ry * 1.1 + flap * 0.3, rx * 0.74, 0);
      ctx.quadraticCurveTo(rx * 0.38, ry * 1.1 + flap * 0.3, 0, ry * 2.05 + flap);
      ctx.quadraticCurveTo(-rx * 0.1, ry * 1.4 + flap * 0.4, -rx * 0.65, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = sp.accentColor;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.38, -ry * 0.66);
      ctx.quadraticCurveTo(-rx * 0.05, -ry * 1.3, rx * 0.26, -ry * 0.68);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 3. Sculpted Body (Continuous smooth ribbon for Moray Eel, streamlined Bezier for others)
    const bodyGrad = ctx.createRadialGradient(-rx * 0.08, -ry * 0.25, r * 0.08, 0, 0, Math.max(rx, ry));
    bodyGrad.addColorStop(0, sp.primaryColor);
    bodyGrad.addColorStop(0.76, sp.secondaryColor);
    bodyGrad.addColorStop(1, sp.outlineColor);
    ctx.fillStyle = bodyGrad;

    if (sp.id === 'morayeel') {
      const pts: Array<{ x: number; y: number; w: number }> = [];
      for (let seg = 0; seg <= 8; seg++) {
        const t = seg / 8;
        pts.push({
          x: -rx * 0.9 + t * rx * 1.85,
          y: Math.sin(f.tailPhase + seg * 0.7) * ry * 0.55,
          w: ry * (0.35 + Math.sin(t * Math.PI * 0.85) * 0.58),
        });
      }
      ctx.beginPath();
      for (let sIdx = 0; sIdx < pts.length; sIdx++) {
        const pt = pts[sIdx];
        if (sIdx === 0) ctx.moveTo(pt.x, pt.y - pt.w);
        else ctx.lineTo(pt.x, pt.y - pt.w);
      }
      for (let sIdx = pts.length - 1; sIdx >= 0; sIdx--) {
        const pt = pts[sIdx];
        ctx.lineTo(pt.x, pt.y + pt.w);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      this.traceStreamlinedFishBody(ctx, rx, ry);
      ctx.fill();
      ctx.stroke();

      // Clipped Species Patterns & Gloss Highlight
      ctx.save();
      this.traceStreamlinedFishBody(ctx, rx * 0.96, ry * 0.94);
      ctx.clip();

      if (sp.pattern === 'bands' || sp.pattern === 'stripes') {
        ctx.fillStyle = sp.secondaryColor;
        ctx.globalAlpha *= 0.85;
        for (const bx of [-rx * 0.38, 0, rx * 0.36]) {
          ctx.beginPath();
          ctx.ellipse(bx, 0, rx * 0.09, ry * 1.1, 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (sp.pattern === 'spots') {
        ctx.fillStyle = sp.accentColor;
        ctx.globalAlpha *= 0.8;
        for (const [px, py] of [
          [-0.32, -0.22],
          [0.02, 0.24],
          [0.24, -0.24],
          [-0.14, -0.35],
        ]) {
          ctx.beginPath();
          ctx.arc(px * rx, py * ry, Math.max(1.2, r * 0.1), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Glossy Dorsal Highlight
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
      ctx.beginPath();
      ctx.ellipse(0, -ry * 0.5, rx * 0.52, ry * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();

      // Subtle Gill Arc
      ctx.strokeStyle = sp.outlineColor;
      ctx.globalAlpha = 0.38;
      ctx.lineWidth = Math.max(1, r * 0.045);
      ctx.beginPath();
      ctx.arc(rx * 0.25, 0, ry * 0.45, -0.5, 0.6);
      ctx.stroke();

      ctx.restore();
    }

    // 4. Special Species Snout / Spines / Lure
    if (sp.id === 'swordfish') {
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.moveTo(rx * 0.85, -ry * 0.1);
      ctx.lineTo(rx * 1.82, 0);
      ctx.lineTo(rx * 0.85, ry * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (sp.id === 'anglerfish') {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx * 0.35, -ry * 0.68);
      ctx.quadraticCurveTo(rx * 0.92, -ry * 1.4, rx * 1.12, -ry * 0.6);
      ctx.stroke();
      ctx.fillStyle = 'rgba(254, 240, 138, 0.35)';
      ctx.beginPath();
      ctx.arc(rx * 1.12, -ry * 0.6, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(rx * 1.12, -ry * 0.6, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    } else if (sp.id === 'pufferfish') {
      ctx.fillStyle = '#fef08a';
      for (let a = 0; a < 10; a++) {
        const ang = (a / 10) * Math.PI * 2;
        const px = Math.cos(ang) * rx * 1.03;
        const py = Math.sin(ang) * ry * 1.03;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, r * 0.085), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (sp.id === 'hammerhead') {
      ctx.fillStyle = sp.primaryColor;
      ctx.beginPath();
      ctx.roundRect(rx * 0.68, -ry * 0.82, rx * 0.32, ry * 1.64, 4);
      ctx.fill();
      ctx.stroke();
    }

    // 5. Crisp Fish Eye
    ctx.fillStyle = f.isHunter ? '#fb7185' : '#ffffff';
    ctx.beginPath();
    ctx.arc(rx * 0.5, -ry * 0.18, Math.max(1.6, r * 0.16), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = f.isHunter ? '#fef08a' : '#0f172a';
    ctx.beginPath();
    ctx.arc(rx * 0.54, -ry * 0.18, Math.max(1, r * 0.085), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(rx * 0.56, -ry * 0.22, Math.max(0.6, r * 0.032), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 6. Clean Hunter / Revenge Tag
    if (f.isHunter) {
      this.drawFloatingTag(ctx, 'HUNTER', 0, -r * 1.25, '#fecdd3', '#881337');
    } else if (f.wasOutgrownHunter) {
      this.drawFloatingTag(ctx, '3x BONUS', 0, -r * 1.25, '#a7f3d0', '#064e3b');
    }

    ctx.restore();
  }

  private drawFloatingTag(
    ctx: CanvasRenderingContext2D,
    label: string,
    x: number,
    y: number,
    fg: string,
    bg: string
  ): void {
    ctx.save();
    ctx.font = '800 9px system-ui, -apple-system, sans-serif';
    const textW = ctx.measureText(label).width;
    const padX = 6;
    const pillW = textW + padX * 2;
    const pillH = 16;
    ctx.fillStyle = bg;
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.roundRect(x - pillW / 2, y - pillH / 2, pillW, pillH, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);
    ctx.restore();
  }

  private drawPredatorRadarArrows(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const padX = 24;
    const padTop = Math.min(96, h * 0.22);
    const padBottom = Math.min(126, h * 0.26);

    const drawChevron = (
      sx: number,
      sy: number,
      isHunter: boolean,
      proximity: number
    ): void => {
      const cx = Math.max(padX, Math.min(w - padX, sx));
      const cy = Math.max(padTop, Math.min(h - padBottom, sy));
      const ang = Math.atan2(sy - h * 0.5, sx - w * 0.5);
      const pulse = isHunter ? 1 + Math.sin(this.time * 10) * 0.14 : 1;
      const scale = (isHunter ? 1.15 : 0.82) * pulse;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.scale(scale, scale);

      if (isHunter) {
        ctx.fillStyle = 'rgba(225, 29, 72, 0.94)';
        ctx.strokeStyle = '#fecdd3';
        ctx.lineWidth = 1.6;
        ctx.shadowColor = 'rgba(244, 63, 94, 0.75)';
        ctx.shadowBlur = 10;
      } else {
        const alpha = Math.max(0.28, Math.min(0.75, proximity * 0.78));
        ctx.fillStyle = `rgba(251, 146, 60, ${alpha.toFixed(2)})`;
        ctx.strokeStyle = `rgba(254, 240, 138, ${(alpha + 0.15).toFixed(2)})`;
        ctx.lineWidth = 1.2;
      }

      ctx.beginPath();
      ctx.moveTo(11, 0);
      ctx.lineTo(-7, -6.8);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-7, 6.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    // 1. Always highlight active 1% hunter(s) when off-screen or near edge
    for (const f of this.fishes) {
      if (!f.isHunter) continue;
      const p = this.project3D(f.x, f.y, f.z, w, h);
      if (!p) continue;
      if (p.sx >= 28 && p.sx <= w - 28 && p.sy >= padTop && p.sy <= h - padBottom) continue;
      drawChevron(p.sx, p.sy, true, 1);
    }

    // 2. Subtle screen-edge radar chevrons for up to 3 nearby giant predators
    const nearbyGiants = this.fishes
      .filter((f) => !f.isHunter && f.size > this.playerSize * 1.15)
      .map((f) => ({
        f,
        dist: Math.hypot(f.x - this.playerX, f.y - this.playerY),
      }))
      .filter((item) => item.dist < 44)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);

    for (const { f, dist } of nearbyGiants) {
      const p = this.project3D(f.x, f.y, f.z, w, h);
      if (!p) continue;
      if (p.sx >= 26 && p.sx <= w - 26 && p.sy >= padTop && p.sy <= h - padBottom) continue;
      const proximity = Math.max(0, 1 - dist / 44);
      drawChevron(p.sx, p.sy, false, proximity);
    }
  }
}
