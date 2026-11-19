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
  size: number; // comparable directly to playerSize
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
}

// Balanced 3D Ocean Reef Basin ("niet te groot maar ook zeker niet te klein")
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

  private rafId: number | null = null;
  private lastTs = 0;
  private time = 0;
  private nextEntityId = 1;

  // Player 3D Piranha State
  public playerColor: PiranhaColorSkin = PIRANHA_COLORS[0];
  public fishEaten = 0;
  public bestFishEaten = 0;
  public playerSize = 1.0; // Grows from 1.0 up to colossal
  public lives = 3;
  public readonly maxLives = 3;

  private playerX = 0;
  private playerY = 0;
  private playerZ = 0;
  private playerVx = 0;
  private playerVy = 0;
  private playerVz = 0;
  private playerFacing = 1; // 1 = right, -1 = left
  private playerPitch = 0;
  private playerTailPhase = 0;
  private biteAnim = 0; // 1..0 jaw snap animation
  private invulnTimer = 0;
  private chompCombo = 0;
  private chompComboTimer = 0;

  // Camera 3D position
  private camX = 0;
  private camY = 0;
  private camZ = -62;

  // Controls
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
  private particles: ChompParticle3D[] = [];
  private hunterCheckTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    sfx: SoundFX,
    initialColorId: string,
    bestFishEaten: number,
    onHudChange: (snap: HudSnapshot) => void,
    onToast: (msg: string) => void
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.sfx = sfx;
    this.bestFishEaten = bestFishEaten;
    this.onHudChange = onHudChange;
    this.onToast = onToast;
    this.setPiranhaColor(initialColorId);

    this.init3DScenery();
    this.resetRun();
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

  public resetRun(): void {
    this.fishEaten = 0;
    this.playerSize = 1.0;
    this.lives = this.maxLives;
    this.playerX = 0;
    this.playerY = 0;
    this.playerZ = 0;
    this.playerVx = 0;
    this.playerVy = 0;
    this.playerVz = 0;
    this.playerFacing = 1;
    this.playerPitch = 0;
    this.biteAnim = 0;
    this.invulnTimer = 1.5;
    this.chompCombo = 0;
    this.fishes = [];
    this.particles = [];
    this.rebalance5050Ecosystem(true);
    this.emitHud();
  }

  private init3DScenery(): void {
    this.props = [];
    const coralColors = [
      ['#f43f5e', '#fda4af'],
      ['#a855f7', '#d8b4fe'],
      ['#f97316', '#fdba74'],
      ['#ec4899', '#fbcfe8'],
      ['#06b6d4', '#67e8f9'],
      ['#eab308', '#fef08a'],
    ];

    // Populate 3D ocean floor (-WORLD_HALF_Y) with coral reefs, kelp forests, rocks, and sunken chest
    for (let i = 0; i < 42; i++) {
      const x = (Math.random() - 0.5) * (WORLD_HALF_X * 1.9);
      const z = (Math.random() - 0.5) * (WORLD_HALF_Z * 1.85);
      const y = -WORLD_HALF_Y;
      const roll = Math.random();
      const pal = coralColors[i % coralColors.length];
      const kind: CoralProp3D['kind'] =
        i === 0
          ? 'chest'
          : roll < 0.28
            ? 'kelp'
            : roll < 0.52
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
    for (let i = 0; i < 48; i++) {
      this.bubbles.push({
        x: (Math.random() - 0.5) * WORLD_HALF_X * 1.8,
        y: (Math.random() - 0.5) * WORLD_HALF_Y * 1.8,
        z: (Math.random() - 0.5) * WORLD_HALF_Z * 1.8,
        radius: 1.2 + Math.random() * 2.8,
        speedY: 4 + Math.random() * 6,
        wobblePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  /**
   * Guarantees that at all times 50% of the fish in the 3D sea are SMALLER than your Piranha
   * and 50% of the fish are LARGER than your Piranha!
   */
  private rebalance5050Ecosystem(initialSpawn = false): void {
    const targetHalf = TOTAL_ACTIVE_FISH / 2; // 16 smaller, 16 larger

    let smaller = this.fishes.filter((f) => f.size < this.playerSize);
    let larger = this.fishes.filter((f) => f.size >= this.playerSize);

    // If player outgrew some fish so there are too many smaller fish, convert the farthest excess smaller fish
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

    // If there are too many larger fish, remove the farthest excess larger fish
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

    // Re-count and spawn missing smaller fish (50%)
    while (this.fishes.filter((f) => f.size < this.playerSize).length < targetHalf) {
      this.fishes.push(this.spawnFishEntity('smaller', initialSpawn));
    }

    // Re-count and spawn missing larger fish (50%)
    while (this.fishes.filter((f) => f.size >= this.playerSize).length < targetHalf) {
      // Ensure at least 4 of the larger fish are only SLIGHTLY larger (1.04x - 1.16x) so 1% hunter rule has fair targets
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
      sizeRatio = 0.38 + Math.random() * 0.52; // 0.38x .. 0.90x of playerSize
    } else if (category === 'slightly_larger') {
      sizeRatio = 1.05 + Math.random() * 0.11; // 1.05x .. 1.16x of playerSize (outgrown in 2-3 bites!)
    } else {
      sizeRatio = 1.18 + Math.random() * 0.85; // 1.18x .. 2.03x of playerSize
    }

    // Pick 3D coordinates inside the ocean basin, keeping a safe distance from player on respawn
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
    const spd = (6 + Math.random() * 5) * species.baseSpeed;
    return {
      id: this.nextEntityId++,
      species,
      x,
      y,
      z,
      vx: dir * spd,
      vy: (Math.random() - 0.5) * 2.5,
      vz: (Math.random() - 0.5) * 3.0,
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
    this.time += dt;
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.biteAnim > 0) this.biteAnim = Math.max(0, this.biteAnim - dt * 4.5);
    if (this.chompComboTimer > 0) {
      this.chompComboTimer -= dt;
      if (this.chompComboTimer <= 0) this.chompCombo = 0;
    }

    // 1. Update Player 3D Piranha Movement from 4 Arrows + 1 Rotary Knob
    let dirX = 0;
    let dirY = 0;

    if (this.input.left) dirX -= 1;
    if (this.input.right) dirX += 1;
    if (this.input.up) dirY += 1; // Up arrow = swim upward toward water surface
    if (this.input.down) dirY -= 1; // Down arrow = dive downward toward coral floor

    if (this.input.knobActive && this.input.knobStrength > 0.08) {
      // Screen-space knob angle: 0 = right, -PI/2 = up (positive 3D Y), +PI/2 = down (negative 3D Y)
      dirX += Math.cos(this.input.knobAngleRad) * this.input.knobStrength * 1.15;
      dirY += -Math.sin(this.input.knobAngleRad) * this.input.knobStrength * 1.15;
    }

    const inputMag = Math.hypot(dirX, dirY);
    const normX = inputMag > 1 ? dirX / inputMag : dirX;
    const normY = inputMag > 1 ? dirY / inputMag : dirY;

    const maxSpeed = 24;
    const targetVx = normX * maxSpeed;
    const targetVy = normY * maxSpeed;
    // Gentle 3D depth (Z) weaving as you turn & swim so you traverse the full 3D sea volume smoothly
    const targetVz =
      inputMag > 0.1
        ? Math.sin(this.time * 1.6) * 7.5 + normY * 3.5
        : -this.playerZ * 0.4;

    const accel = inputMag > 0.05 ? 9.5 : 5.0;
    this.playerVx += (targetVx - this.playerVx) * Math.min(1, accel * dt);
    this.playerVy += (targetVy - this.playerVy) * Math.min(1, accel * dt);
    this.playerVz += (targetVz - this.playerVz) * Math.min(1, 3.5 * dt);

    this.playerX += this.playerVx * dt;
    this.playerY += this.playerVy * dt;
    this.playerZ += this.playerVz * dt;

    // Keep player inside the 3D Coral Reef Sea Basin with soft elastic reef bounce
    if (this.playerX < -WORLD_HALF_X) {
      this.playerX = -WORLD_HALF_X;
      this.playerVx = Math.abs(this.playerVx) * 0.4;
    } else if (this.playerX > WORLD_HALF_X) {
      this.playerX = WORLD_HALF_X;
      this.playerVx = -Math.abs(this.playerVx) * 0.4;
    }
    if (this.playerY < -WORLD_HALF_Y + 3.5) {
      this.playerY = -WORLD_HALF_Y + 3.5;
      this.playerVy = Math.abs(this.playerVy) * 0.4;
    } else if (this.playerY > WORLD_HALF_Y - 3.5) {
      this.playerY = WORLD_HALF_Y - 3.5;
      this.playerVy = -Math.abs(this.playerVy) * 0.4;
    }
    if (this.playerZ < -WORLD_HALF_Z * 0.75) {
      this.playerZ = -WORLD_HALF_Z * 0.75;
    } else if (this.playerZ > WORLD_HALF_Z * 0.75) {
      this.playerZ = WORLD_HALF_Z * 0.75;
    }

    if (Math.abs(this.playerVx) > 0.6) {
      this.playerFacing = this.playerVx >= 0 ? 1 : -1;
    }
    const targetPitch = Math.max(-0.55, Math.min(0.55, (this.playerVy / maxSpeed) * 0.65));
    this.playerPitch += (targetPitch - this.playerPitch) * Math.min(1, 10 * dt);

    const swimSpeed = Math.hypot(this.playerVx, this.playerVy, this.playerVz);
    this.playerTailPhase += dt * (7 + swimSpeed * 0.75);

    // Smooth 3D Follow Camera
    this.camX += (this.playerX * 0.82 - this.camX) * Math.min(1, 6.5 * dt);
    this.camY += (this.playerY * 0.82 - this.camY) * Math.min(1, 6.5 * dt);
    this.camZ = -66;

    // 2. Smart 1% Slightly-Larger Hunter Check
    this.hunterCheckTimer += dt;
    if (this.hunterCheckTimer >= 0.9) {
      this.hunterCheckTimer = 0;
      this.evaluateOnePercentHunterRule();
    }

    // 3. Update All 32 3D Fish & Check Eating / Collision
    let ateAnyFish = false;
    let rankBefore = getPiranhaRank(this.fishEaten).rank;

    for (let i = this.fishes.length - 1; i >= 0; i--) {
      const f = this.fishes[i];

      // Check if player just outgrew an active hunter by eating a couple of small fish!
      if (f.isHunter && this.playerSize > f.size) {
        f.isHunter = false;
        f.wasOutgrownHunter = true;
        this.sfx.playHunterTurnaround();
        this.onToast(`💪 You outgrew the ${f.species.name}! Eat it now for 3x Bonus!`);
      }
      // Also cancel hunter if player grew so much that this fish is no longer slightly larger, or if it somehow became way too big
      if (f.isHunter && f.size > this.playerSize * 1.24) {
        f.isHunter = false;
      }

      if (f.isHunter) {
        // Actively pursue player at moderate speed (slower than player maxSpeed = 24 so player can eat 2 small fish!)
        const dx = this.playerX - f.x;
        const dy = this.playerY - f.y;
        const dz = this.playerZ - f.z;
        const dist = Math.max(0.01, Math.hypot(dx, dy, dz));
        const huntSpeed = 12.8;
        f.vx += ((dx / dist) * huntSpeed - f.vx) * Math.min(1, 4.0 * dt);
        f.vy += ((dy / dist) * huntSpeed - f.vy) * Math.min(1, 4.0 * dt);
        f.vz += ((dz / dist) * huntSpeed - f.vz) * Math.min(1, 4.0 * dt);
      } else if (f.wasOutgrownHunter) {
        // Panicked outgrown former hunter tries to flee away from player
        const dx = f.x - this.playerX;
        const dy = f.y - this.playerY;
        const dist = Math.max(0.01, Math.hypot(dx, dy));
        const fleeSpeed = 10.5;
        f.vx += ((dx / dist) * fleeSpeed - f.vx) * Math.min(1, 3.5 * dt);
        f.vy += ((dy / dist) * fleeSpeed - f.vy) * Math.min(1, 3.5 * dt);
      } else {
        // Natural 3D Reef Patrol
        f.patrolTimer -= dt;
        if (f.patrolTimer <= 0) {
          f.patrolTimer = 2.5 + Math.random() * 4.5;
          const dir = Math.random() < 0.25 ? -f.facingX : f.facingX;
          const spd = (5.5 + Math.random() * 5.5) * f.species.baseSpeed;
          f.vx = dir * spd;
          f.vy = (Math.random() - 0.5) * 4.0;
          f.vz = (Math.random() - 0.5) * 4.5;
        }
        // Keep Z near player depth softly so fish stay interactive in the 3D view
        f.vz += (this.playerZ - f.z) * 0.18 * dt;
      }

      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;

      // Turn back at 3D Ocean Basin boundaries
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

      // 3D Collision Check between Player Piranha and Fish
      const fishVisualRatio = Math.pow(f.size / this.playerSize, 0.42);
      const hitRadiusXY = 3.2 + Math.min(2.6, fishVisualRatio * 1.6);
      const distXY = Math.hypot(f.x - this.playerX, f.y - this.playerY);
      const distZ = Math.abs(f.z - this.playerZ);

      if (distXY < hitRadiusXY && distZ < 14) {
        if (f.size <= this.playerSize * 1.01) {
          // EAT SMALLER FISH!
          const bonusEaten = f.wasOutgrownHunter ? 3 : 1;
          this.fishEaten += bonusEaten;
          if (this.fishEaten > this.bestFishEaten) {
            this.bestFishEaten = this.fishEaten;
          }
          // Smoothly grow Piranha by +6.5% per fish (so eating 2-3 small fish outgrows a 1.05x-1.15x hunter!)
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
            f.wasOutgrownHunter ? `🦷 REVENGE +3!` : `+1 ${f.species.emoji}`
          );

          this.fishes.splice(i, 1);
          ateAnyFish = true;
        } else if (f.isHunter && this.invulnTimer <= 0) {
          // Bitten by the slightly-larger 1% hunter!
          this.invulnTimer = 2.2;
          this.lives = Math.max(1, this.lives - 1);
          this.sfx.playBitten();
          // Knock hunter back so player has room to eat 2 small fish
          const pushX = f.x >= this.playerX ? 1 : -1;
          f.vx = pushX * 16;
          f.x += pushX * 7;
          this.playerVx = -pushX * 12;
          this.spawnChompParticles(
            this.playerX,
            this.playerY,
            this.playerZ,
            '#ef4444',
            '⚠️ BITTEN! Eat small fish!'
          );
          this.onToast(`⚠️ Bitten by ${f.species.name}! Quickly eat 2 small fish to outgrow it!`);
          this.emitHud();
        }
      }
    }

    if (ateAnyFish) {
      const rankNow = getPiranhaRank(this.fishEaten);
      if (rankNow.rank > rankBefore) {
        this.sfx.playRankUp();
        this.onToast(`👑 GROWTH STAGE UP: ${rankNow.title}!`);
      }
      this.rebalance5050Ecosystem(false);
      this.emitHud();
    }

    // 4. Update 3D Bubbles & Chomp Particles
    for (const b of this.bubbles) {
      b.y += b.speedY * dt;
      b.x += Math.sin(this.time * 2 + b.wobblePhase) * 0.9 * dt;
      if (b.y > WORLD_HALF_Y) {
        b.y = -WORLD_HALF_Y;
        b.x = (Math.random() - 0.5) * WORLD_HALF_X * 1.8;
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.alpha -= dt * 1.15;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  /**
   * Implements the 1% Hunter Rule:
   * Only fish that are SLIGHTLY larger than the player (1.03x to 1.17x playerSize)
   * can ever decide to hunt/attack the player (~1% per fish roll), so eating 2-3 small fish
   * lets the player outgrow the attacker!
   */
  private evaluateOnePercentHunterRule(): void {
    const activeHunter = this.fishes.find((f) => f.isHunter);
    if (activeHunter) {
      this.emitHud();
      return;
    }

    // Candidate pool: ONLY fish that are slightly larger than the player (1.03x .. 1.17x)
    const slightlyLargerCandidates = this.fishes.filter(
      (f) => f.size > this.playerSize * 1.02 && f.size <= this.playerSize * 1.17
    );

    if (slightlyLargerCandidates.length === 0) return;

    // 1% per-fish roll across the active school (~28% chance per second when no hunter is active)
    for (const candidate of slightlyLargerCandidates) {
      if (Math.random() < 0.06) {
        candidate.isHunter = true;
        // Clamp its size to at most 1.13x playerSize so 2 small fish (1.065^2 = 1.134) ALWAYS outgrows it!
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
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const spd = 4 + Math.random() * 8;
      this.particles.push({
        x,
        y,
        z,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        vz: (Math.random() - 0.5) * 5,
        color: i % 2 === 0 ? color : '#fef08a',
        size: 2.5 + Math.random() * 2.5,
        alpha: 1,
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
        color: '#fef08a',
        size: 13,
        alpha: 1.25,
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

    // Physical size in cm grows from 12 cm up to colossal meters!
    const sizeCm = Math.round(12 * Math.pow(this.playerSize, 0.85));

    this.onHudChange({
      fishEaten: this.fishEaten,
      bestFishEaten: this.bestFishEaten,
      sizeCm,
      rankTitle: rank.title,
      rankNumber: rank.rank,
      smallerCount,
      largerCount,
      activeHunterName: activeHunter ? `${activeHunter.species.emoji} ${activeHunter.species.name}` : null,
      activeHunterSmallNeeded: smallNeeded,
      lives: this.lives,
      maxLives: this.maxLives,
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
    const dz = wz - this.camZ; // camZ is -66, world z is in [-48..+48], so dz is in [18..114]
    if (dz <= 4) return null;
    const fov = Math.min(w, h) * 0.92;
    const scale = fov / dz;
    return {
      sx: w * 0.5 + dx * scale,
      sy: h * 0.5 - dy * scale, // +Y in 3D is UP on screen
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

    // 1. Deep 3D Ocean Gradient Skybox
    const depthRatio = Math.max(0, Math.min(1, (WORLD_HALF_Y - this.camY) / (WORLD_HALF_Y * 2)));
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#0284c7');
    bgGrad.addColorStop(0.35, '#0369a1');
    bgGrad.addColorStop(0.75, '#0c4a6e');
    bgGrad.addColorStop(1, depthRatio > 0.6 ? '#041e33' : '#082f49');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Volumetric 3D Sunbeams from Water Surface
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const beamX = -WORLD_HALF_X * 0.7 + i * (WORLD_HALF_X * 0.35);
      const topP = this.project3D(beamX + Math.sin(this.time * 0.6 + i) * 4, WORLD_HALF_Y, 10, w, h);
      const botP = this.project3D(beamX - 10, -WORLD_HALF_Y, 10, w, h);
      if (topP && botP) {
        const beamGrad = ctx.createLinearGradient(topP.sx, topP.sy, botP.sx, botP.sy);
        beamGrad.addColorStop(0, 'rgba(186, 230, 253, 0.22)');
        beamGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(topP.sx - 18, topP.sy);
        ctx.lineTo(topP.sx + 18, topP.sy);
        ctx.lineTo(botP.sx + 48, botP.sy);
        ctx.lineTo(botP.sx - 48, botP.sy);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    // 3. 3D Ocean Basin Wireframe / Reef Boundary Box & Sandy Ocean Floor Grid
    this.draw3DOceanBasin(ctx, w, h);

    // 4. Depth-Sorted 3D Render Queue (Corals, Kelp, 32 Fish, Player Piranha, Bubbles, Particles)
    type RenderItem = { depth: number; draw: () => void };
    const queue: RenderItem[] = [];

    // Add 3D Coral Reef & Kelp Props
    for (const prop of this.props) {
      const p = this.project3D(prop.x, prop.y, prop.z, w, h);
      if (!p) continue;
      queue.push({
        depth: p.depth,
        draw: () => this.draw3DProp(ctx, prop, p.sx, p.sy, p.scale),
      });
    }

    // Add 3D Bubbles
    for (const b of this.bubbles) {
      const p = this.project3D(b.x, b.y, b.z, w, h);
      if (!p) continue;
      queue.push({
        depth: p.depth,
        draw: () => {
          const r = Math.max(1.2, (b.radius * p.scale) / 7.5);
          ctx.save();
          ctx.strokeStyle = 'rgba(224, 242, 254, 0.55)';
          ctx.fillStyle = 'rgba(186, 230, 253, 0.16)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        },
      });
    }

    // Visual growth factor for player: starts compact (0.68) as Baby Piranha and grows to huge (1.95)
    const playerScreenGrowth = Math.min(1.95, 0.68 + Math.log10(this.playerSize) * 0.72);

    // Add 32 Ecosystem Fish
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

    // Add Player 3D Piranha
    const pp = this.project3D(this.playerX, this.playerY, this.playerZ, w, h);
    if (pp) {
      const playerRadiusPx = playerScreenGrowth * (pp.scale * 2.15);
      queue.push({
        depth: pp.depth,
        draw: () => this.drawPlayer3DPiranha(ctx, pp.sx, pp.sy, playerRadiusPx, w, h),
      });
    }

    // Sort farthest to nearest (Painter's Algorithm Z-buffer)
    queue.sort((a, b) => b.depth - a.depth);
    for (const item of queue) {
      item.draw();
    }

    // 5. Render 3D Chomp Particles & Floating Labels on top
    for (const pt of this.particles) {
      const p = this.project3D(pt.x, pt.y, pt.z, w, h);
      if (!p) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.alpha));
      if (pt.text) {
        ctx.font = '900 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#082f49';
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

    // 6. Off-Screen Hunter Warning Arrow if a 1% Hunter is chasing from off-screen
    this.drawHunterRadarArrow(ctx, w, h);

    ctx.restore();
  }

  private draw3DOceanBasin(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.save();

    // 1. 3D Sandy Ocean Floor Polygon (-WORLD_HALF_Y)
    const fl1 = this.project3D(-WORLD_HALF_X, -WORLD_HALF_Y, -WORLD_HALF_Z, w, h);
    const fl2 = this.project3D(WORLD_HALF_X, -WORLD_HALF_Y, -WORLD_HALF_Z, w, h);
    const fl3 = this.project3D(WORLD_HALF_X, -WORLD_HALF_Y, WORLD_HALF_Z, w, h);
    const fl4 = this.project3D(-WORLD_HALF_X, -WORLD_HALF_Y, WORLD_HALF_Z, w, h);

    if (fl1 && fl2 && fl3 && fl4) {
      const sandGrad = ctx.createLinearGradient(0, fl3.sy, 0, fl1.sy);
      sandGrad.addColorStop(0, '#0f3f5c');
      sandGrad.addColorStop(0.5, '#1e5b7a');
      sandGrad.addColorStop(1, '#ca8a04');
      ctx.fillStyle = sandGrad;
      ctx.beginPath();
      ctx.moveTo(fl1.sx, fl1.sy);
      ctx.lineTo(fl2.sx, fl2.sy);
      ctx.lineTo(fl3.sx, fl3.sy);
      ctx.lineTo(fl4.sx, fl4.sy);
      ctx.closePath();
      ctx.fill();

      // Perspective 3D Caustic Grid Lines on Ocean Floor
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.18)';
      ctx.lineWidth = 1;
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const x = -WORLD_HALF_X + (i / steps) * (WORLD_HALF_X * 2);
        const pNear = this.project3D(x, -WORLD_HALF_Y, -WORLD_HALF_Z, w, h);
        const pFar = this.project3D(x, -WORLD_HALF_Y, WORLD_HALF_Z, w, h);
        if (pNear && pFar) {
          ctx.beginPath();
          ctx.moveTo(pNear.sx, pNear.sy);
          ctx.lineTo(pFar.sx, pFar.sy);
          ctx.stroke();
        }
      }
      for (let j = 0; j <= 6; j++) {
        const z = -WORLD_HALF_Z + (j / 6) * (WORLD_HALF_Z * 2);
        const pL = this.project3D(-WORLD_HALF_X, -WORLD_HALF_Y, z, w, h);
        const pR = this.project3D(WORLD_HALF_X, -WORLD_HALF_Y, z, w, h);
        if (pL && pR) {
          ctx.beginPath();
          ctx.moveTo(pL.sx, pL.sy);
          ctx.lineTo(pR.sx, pR.sy);
          ctx.stroke();
        }
      }
    }

    // 2. Shimmering 3D Water Surface Ceiling (+WORLD_HALF_Y)
    const sf1 = this.project3D(-WORLD_HALF_X, WORLD_HALF_Y, -WORLD_HALF_Z, w, h);
    const sf2 = this.project3D(WORLD_HALF_X, WORLD_HALF_Y, -WORLD_HALF_Z, w, h);
    const sf3 = this.project3D(WORLD_HALF_X, WORLD_HALF_Y, WORLD_HALF_Z, w, h);
    const sf4 = this.project3D(-WORLD_HALF_X, WORLD_HALF_Y, WORLD_HALF_Z, w, h);
    if (sf1 && sf2 && sf3 && sf4) {
      ctx.fillStyle = 'rgba(125, 211, 252, 0.18)';
      ctx.beginPath();
      ctx.moveTo(sf1.sx, sf1.sy);
      ctx.lineTo(sf2.sx, sf2.sy);
      ctx.lineTo(sf3.sx, sf3.sy);
      ctx.lineTo(sf4.sx, sf4.sy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 3. Translucent 3D Reef Boundary Frame (Left & Right Sea Walls)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1.5;
    if (fl1 && fl4 && sf1 && sf4) {
      ctx.beginPath();
      ctx.moveTo(fl1.sx, fl1.sy);
      ctx.lineTo(sf1.sx, sf1.sy);
      ctx.lineTo(sf4.sx, sf4.sy);
      ctx.lineTo(fl4.sx, fl4.sy);
      ctx.closePath();
      ctx.stroke();
    }
    if (fl2 && fl3 && sf2 && sf3) {
      ctx.beginPath();
      ctx.moveTo(fl2.sx, fl2.sy);
      ctx.lineTo(sf2.sx, sf2.sy);
      ctx.lineTo(sf3.sx, sf3.sy);
      ctx.lineTo(fl3.sx, fl3.sy);
      ctx.closePath();
      ctx.stroke();
    }

    ctx.restore();
  }

  private draw3DProp(
    ctx: CanvasRenderingContext2D,
    prop: CoralProp3D,
    sx: number,
    sy: number,
    projScale: number
  ): void {
    const s = Math.max(4, (prop.scale * projScale) / 4.2);
    ctx.save();
    ctx.translate(sx, sy);

    if (prop.kind === 'kelp') {
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = Math.max(2, s * 0.28);
      ctx.lineCap = 'round';
      for (const offset of [-s * 0.4, 0, s * 0.45]) {
        ctx.beginPath();
        ctx.moveTo(offset, 0);
        const sway1 = Math.sin(this.time * 2 + prop.phase) * s * 0.6;
        const sway2 = Math.cos(this.time * 1.8 + prop.phase) * s * 0.8;
        ctx.bezierCurveTo(offset + sway1, -s * 1.6, offset - sway2, -s * 3.2, offset + sway1, -s * 4.8);
        ctx.stroke();
      }
    } else if (prop.kind === 'coral_branch') {
      ctx.strokeStyle = prop.color;
      ctx.lineWidth = Math.max(2.5, s * 0.35);
      ctx.lineCap = 'round';
      for (const ang of [-0.65, -0.25, 0.2, 0.6]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.sin(ang) * s * 2.1, -Math.cos(ang) * s * 2.1);
        ctx.stroke();
      }
    } else if (prop.kind === 'coral_brain') {
      ctx.fillStyle = prop.color;
      ctx.strokeStyle = prop.secondaryColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -s * 0.4, s * 1.1, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (prop.kind === 'anemone') {
      ctx.fillStyle = prop.color;
      for (let i = -3; i <= 3; i++) {
        const sway = Math.sin(this.time * 3 + i + prop.phase) * s * 0.2;
        ctx.beginPath();
        ctx.ellipse(i * s * 0.28 + sway, -s * 0.9, s * 0.16, s * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (prop.kind === 'chest') {
      // Sunken Treasure Chest on the 3D reef floor
      ctx.fillStyle = '#854d0e';
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-s * 1.4, -s * 1.6, s * 2.8, s * 1.6, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(0, -s * 0.8, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.4, s * 1.3, s * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawPlayer3DPiranha(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    r: number,
    w: number,
    h: number
  ): void {
    // 1. Cast 3D Shadow on the Ocean Floor directly below Player
    const floorShadow = this.project3D(this.playerX, -WORLD_HALF_Y + 0.5, this.playerZ, w, h);
    if (floorShadow) {
      ctx.save();
      ctx.fillStyle = 'rgba(2, 6, 23, 0.32)';
      ctx.beginPath();
      ctx.ellipse(floorShadow.sx, floorShadow.sy, r * 0.85, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(sx, sy);

    // Invulnerability Shield Bubble if recently bitten
    if (this.invulnTimer > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Ambient Piranha Glow Aura
    const auraGrad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.55);
    auraGrad.addColorStop(0, this.playerColor.glow);
    auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(this.playerFacing, 1);
    ctx.rotate(-this.playerPitch * this.playerFacing);

    const wag = Math.sin(this.playerTailPhase) * r * 0.22;

    // 1. Forked 3D Piranha Caudal Tail Fin
    ctx.fillStyle = this.playerColor.fin;
    ctx.strokeStyle = this.playerColor.outline;
    ctx.lineWidth = Math.max(1.6, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(-r * 0.82, 0);
    ctx.lineTo(-r * 1.48, -r * 0.62 + wag);
    ctx.lineTo(-r * 1.18, wag * 0.4);
    ctx.lineTo(-r * 1.48, r * 0.62 + wag);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 2. Spiky Razor Dorsal Fin & Ventral Anal Fin
    ctx.fillStyle = this.playerColor.fin;
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.58);
    ctx.lineTo(-r * 0.15, -r * 1.05);
    ctx.lineTo(r * 0.1, -r * 0.85);
    ctx.lineTo(r * 0.28, -r * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-r * 0.5, r * 0.52);
    ctx.lineTo(-r * 0.22, r * 0.92);
    ctx.lineTo(r * 0.08, r * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. 3D Shaded Muscular Piranha Body
    const bodyGrad = ctx.createRadialGradient(-r * 0.1, -r * 0.28, r * 0.1, 0, 0, r * 1.1);
    bodyGrad.addColorStop(0, this.playerColor.primary);
    bodyGrad.addColorStop(0.68, this.playerColor.secondary);
    bodyGrad.addColorStop(1, this.playerColor.outline);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.02, r * 0.76, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 4. Characteristic Red-Belly / Colored Throat Underside
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.98, r * 0.72, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = this.playerColor.belly;
    ctx.beginPath();
    ctx.ellipse(r * 0.18, r * 0.48, r * 0.75, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    // Specular 3D Top Gloss Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.26)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.05, -r * 0.42, r * 0.58, r * 0.18, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 5. Piranha Bulldog Jaw & Interlocking White Razor Teeth (with chomp animation!)
    const jawOpen = this.biteAnim * r * 0.26;
    ctx.fillStyle = this.playerColor.belly;
    ctx.strokeStyle = this.playerColor.outline;
    ctx.beginPath();
    ctx.moveTo(r * 0.45, r * 0.15 + jawOpen * 0.4);
    ctx.quadraticCurveTo(r * 1.08, r * 0.35 + jawOpen, r * 1.05, -r * 0.02 + jawOpen * 0.5);
    ctx.lineTo(r * 0.55, -r * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Sharp White Triangular Piranha Teeth
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = this.playerColor.outline;
    ctx.lineWidth = Math.max(1, r * 0.04);
    for (let t = 0; t < 4; t++) {
      const tx = r * (0.56 + t * 0.11);
      const ty = r * 0.04 + jawOpen * 0.3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + r * 0.055, ty - r * 0.16);
      ctx.lineTo(tx + r * 0.11, ty);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 6. Fierce 3D Piranha Eye & Brow Ridge
    ctx.fillStyle = '#fef08a';
    ctx.strokeStyle = this.playerColor.outline;
    ctx.lineWidth = Math.max(1.4, r * 0.06);
    ctx.beginPath();
    ctx.arc(r * 0.46, -r * 0.22, r * 0.21, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(r * 0.51, -r * 0.22, r * 0.11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.54, -r * 0.27, r * 0.045, 0, Math.PI * 2);
    ctx.fill();

    // Fierce angled brow
    ctx.strokeStyle = this.playerColor.outline;
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.beginPath();
    ctx.moveTo(r * 0.26, -r * 0.42);
    ctx.lineTo(r * 0.66, -r * 0.32);
    ctx.stroke();

    // 7. Flapping 3D Side Pectoral Fin
    const finFlap = Math.cos(this.playerTailPhase) * 0.25;
    ctx.save();
    ctx.translate(r * 0.05, r * 0.18);
    ctx.rotate(0.3 + finFlap);
    ctx.fillStyle = this.playerColor.fin;
    ctx.strokeStyle = this.playerColor.outline;
    ctx.lineWidth = Math.max(1.2, r * 0.06);
    ctx.beginPath();
    ctx.ellipse(-r * 0.18, r * 0.08, r * 0.26, r * 0.14, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // 8. Player Tag Pill ("YOU")
    ctx.save();
    ctx.font = '900 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.strokeStyle = '#082f49';
    ctx.lineWidth = 3;
    ctx.strokeText('🦷 YOU', sx, sy - r * 1.18);
    ctx.fillText('🦷 YOU', sx, sy - r * 1.18);
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
    const isEdible = f.size <= this.playerSize * 1.01;
    const sp = f.species;

    // 1. 3D Floor Shadow
    const floorShadow = this.project3D(f.x, -WORLD_HALF_Y + 0.5, f.z, w, h);
    if (floorShadow) {
      ctx.save();
      ctx.fillStyle = 'rgba(2, 6, 23, 0.22)';
      ctx.beginPath();
      ctx.ellipse(floorShadow.sx, floorShadow.sy, r * 0.75, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(sx, sy);

    // Subtle 3D Depth Fog Alpha
    const fogAlpha = Math.max(0.55, Math.min(1, 1.25 - depth / 130));
    ctx.globalAlpha = fogAlpha;

    // 2. Status Ring (Green ring for 50% smaller edible fish, Red pulse ring for 1% Active Hunter!)
    if (f.isHunter) {
      const pulse = 1 + Math.sin(this.time * 9) * 0.12;
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.38 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (f.wasOutgrownHunter) {
      ctx.save();
      ctx.strokeStyle = '#10b981';
      ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (isEdible) {
      ctx.save();
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.scale(f.facingX, 1);
    ctx.rotate(-f.pitchRad * f.facingX);

    const wag = Math.sin(f.tailPhase) * r * 0.2;
    const rx = r * sp.bodyAspect.length;
    const ry = r * sp.bodyAspect.height;

    // 3. Species-Specific 3D Articulated Geometry (14 Distinct Species!)
    ctx.strokeStyle = sp.outlineColor;
    ctx.lineWidth = Math.max(1.3, r * 0.07);

    // Caudal Tail Fin
    ctx.fillStyle = sp.accentColor;
    ctx.beginPath();
    ctx.moveTo(-rx * 0.82, 0);
    ctx.lineTo(-rx * 1.42, -ry * 0.75 + wag);
    ctx.lineTo(-rx * 1.15, wag * 0.35);
    ctx.lineTo(-rx * 1.42, ry * 0.75 + wag);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Dorsal & Ventral Fins
    if (sp.id === 'shark' || sp.id === 'hammerhead') {
      // Tall Shark Dorsal Fin
      ctx.fillStyle = sp.primaryColor;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.25, -ry * 0.7);
      ctx.lineTo(-rx * 0.05, -ry * 1.65);
      ctx.lineTo(rx * 0.22, -ry * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (sp.id === 'lionfish') {
      // Fan of Lionfish Dorsal Quills
      ctx.strokeStyle = sp.secondaryColor;
      ctx.lineWidth = Math.max(1.8, r * 0.09);
      for (let q = -3; q <= 3; q++) {
        ctx.beginPath();
        ctx.moveTo(q * rx * 0.14, -ry * 0.6);
        ctx.lineTo(q * rx * 0.24, -ry * 1.55);
        ctx.stroke();
      }
      ctx.strokeStyle = sp.outlineColor;
    } else if (sp.id === 'mantaray') {
      // Flapping Diamond Manta Wings
      const flap = Math.sin(f.tailPhase) * ry * 0.9;
      ctx.fillStyle = sp.primaryColor;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.6, 0);
      ctx.lineTo(0, -ry * 2.4 + flap);
      ctx.lineTo(rx * 0.7, 0);
      ctx.lineTo(0, ry * 2.1 + flap);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = sp.accentColor;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.4, -ry * 0.75);
      ctx.quadraticCurveTo(0, -ry * 1.35, rx * 0.28, -ry * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Main 3D Shaded Body
    const bodyGrad = ctx.createRadialGradient(-rx * 0.1, -ry * 0.25, r * 0.1, 0, 0, Math.max(rx, ry));
    bodyGrad.addColorStop(0, sp.primaryColor);
    bodyGrad.addColorStop(0.75, sp.secondaryColor);
    bodyGrad.addColorStop(1, sp.outlineColor);
    ctx.fillStyle = bodyGrad;

    if (sp.id === 'morayeel') {
      // Multi-segment undulating serpent eel body
      for (let seg = 4; seg >= 0; seg--) {
        const sxOff = (seg - 2) * rx * 0.34;
        const syOff = Math.sin(f.tailPhase + seg * 0.8) * ry * 0.45;
        ctx.beginPath();
        ctx.arc(sxOff, syOff, ry * (0.95 - (4 - seg) * 0.08), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Species Markings & 3D Anatomical Features
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.96, ry * 0.94, 0, 0, Math.PI * 2);
    ctx.clip();

    if (sp.pattern === 'bands' || sp.pattern === 'stripes') {
      ctx.fillStyle = sp.secondaryColor;
      for (const bx of [-rx * 0.42, 0, rx * 0.38]) {
        ctx.fillRect(bx - rx * 0.1, -ry, rx * 0.18, ry * 2);
      }
    } else if (sp.pattern === 'spots') {
      ctx.fillStyle = sp.accentColor;
      for (const [px, py] of [
        [-0.35, -0.2],
        [0, 0.25],
        [0.25, -0.25],
        [-0.15, -0.35],
      ]) {
        ctx.beginPath();
        ctx.arc(px * rx, py * ry, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3D Top Specular Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.beginPath();
    ctx.ellipse(0, -ry * 0.52, rx * 0.55, ry * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Special 3D Snout / Spines / Lure per Species
    if (sp.id === 'swordfish') {
      // Long 3D Sword Bill
      ctx.fillStyle = '#bae6fd';
      ctx.beginPath();
      ctx.moveTo(rx * 0.85, -ry * 0.12);
      ctx.lineTo(rx * 1.85, 0);
      ctx.lineTo(rx * 0.85, ry * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (sp.id === 'anglerfish') {
      // Glowing Bioluminescent Lantern Lure
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(rx * 0.35, -ry * 0.7);
      ctx.quadraticCurveTo(rx * 0.95, -ry * 1.45, rx * 1.15, -ry * 0.65);
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(rx * 1.15, -ry * 0.65, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    } else if (sp.id === 'pufferfish') {
      // 3D Protruding Puffer Spines
      ctx.fillStyle = '#fef08a';
      for (let a = 0; a < 10; a++) {
        const ang = (a / 10) * Math.PI * 2;
        const px = Math.cos(ang) * rx * 1.05;
        const py = Math.sin(ang) * ry * 1.05;
        ctx.beginPath();
        ctx.arc(px, py, r * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (sp.id === 'hammerhead') {
      // 3D T-Shaped Hammer Cephalofoil
      ctx.fillStyle = sp.primaryColor;
      ctx.beginPath();
      ctx.roundRect(rx * 0.65, -ry * 0.85, rx * 0.35, ry * 1.7, 4);
      ctx.fill();
      ctx.stroke();
    }

    // Eye (Glowing Red if active 1% Hunter!)
    ctx.fillStyle = f.isHunter ? '#ef4444' : '#ffffff';
    ctx.beginPath();
    ctx.arc(rx * 0.52, -ry * 0.2, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = f.isHunter ? '#fef08a' : '#0f172a';
    ctx.beginPath();
    ctx.arc(rx * 0.56, -ry * 0.2, r * 0.085, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 4. Floating Label for 1% Hunter or Outgrown Hunter
    if (f.isHunter) {
      ctx.font = '900 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#450a0a';
      ctx.lineWidth = 3;
      const txt = '⚠️ HUNTER! (Eat 2 small!)';
      ctx.strokeText(txt, 0, -r * 1.25);
      ctx.fillStyle = '#fca5a5';
      ctx.fillText(txt, 0, -r * 1.25);
    } else if (f.wasOutgrownHunter) {
      ctx.font = '900 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#064e3b';
      ctx.lineWidth = 3;
      const txt = '🟢 OUTGROWN! (3x Bonus!)';
      ctx.strokeText(txt, 0, -r * 1.25);
      ctx.fillStyle = '#6ee7b7';
      ctx.fillText(txt, 0, -r * 1.25);
    }

    ctx.restore();
  }

  private drawHunterRadarArrow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const hunter = this.fishes.find((f) => f.isHunter);
    if (!hunter) return;
    const p = this.project3D(hunter.x, hunter.y, hunter.z, w, h);
    if (!p) return;
    if (p.sx >= 24 && p.sx <= w - 24 && p.sy >= 60 && p.sy <= h - 90) return;

    const cx = Math.max(34, Math.min(w - 34, p.sx));
    const cy = Math.max(85, Math.min(h - 110, p.sy));
    ctx.save();
    ctx.fillStyle = 'rgba(220, 38, 38, 0.92)';
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = '900 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('⚠️', cx, cy);
    ctx.restore();
  }
}
