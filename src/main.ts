import './style.css';
import { SoundFX } from './audio/soundFx';
import { FISH_SPECIES, PIRANHA_COLORS } from './data/fishSpecies';
import { HudSnapshot, Ocean3DEngine } from './game/ocean3DEngine';

const STORAGE_COLOR_KEY = 'fish_eater_piranha_color_v1';
const STORAGE_BEST_KEY = 'fish_eater_best_eaten_v1';
const STORAGE_SWAP_KEY = 'fish_eater_controls_swapped_v1';

const app = document.querySelector<HTMLDivElement>('#app')!;
const savedColorId = localStorage.getItem(STORAGE_COLOR_KEY) || PIRANHA_COLORS[0].id;
const savedBest = Number(localStorage.getItem(STORAGE_BEST_KEY) || '0') || 0;
const savedSwapped = localStorage.getItem(STORAGE_SWAP_KEY) === 'true';

app.innerHTML = `
  <div class="fe-shell">
    <canvas id="feOceanCanvas" class="fe-canvas"></canvas>

    <!-- TOP HUD: FISH EATEN AT TOP + ALWAYS-ACCESSIBLE PIRANHA COLOR PICKER -->
    <header class="fe-top-hud">
      <div class="fe-hud-row">
        <div class="fe-eaten-banner">
          <span class="fe-eaten-icon">🦷</span>
          <div class="fe-eaten-main">
            <span class="fe-eaten-label">FISH EATEN</span>
            <span class="fe-eaten-value" id="feFishEaten">0</span>
          </div>
          <div class="fe-eaten-divider"></div>
          <div class="fe-eaten-sub">
            <span class="fe-rank-pill" id="feRankLabel">Lv.1 Baby Fry Piranha</span>
            <span id="feSizeBestLabel">📏 12 cm • 🏆 Best: ${savedBest}</span>
          </div>
        </div>

        <div class="fe-top-actions">
          <button type="button" class="fe-icon-btn" id="feBtnSpecies">📖 14 Species</button>
          <button type="button" class="fe-icon-btn" id="feBtnSound">🔊</button>
          <button type="button" class="fe-icon-btn" id="feBtnReset">🔄</button>
        </div>
      </div>

      <div class="fe-stats-strip">
        <div class="fe-balance-pill">
          <span>⚖️ 50/50 Sea:</span>
          <span class="fe-smaller-txt" id="feSmallerCount">🐟 16 Smaller</span>
          <span>•</span>
          <span class="fe-larger-txt" id="feLargerCount">🦈 16 Larger</span>
          <span>•</span>
          <span class="fe-lives-pill" id="feLivesText">❤️❤️❤️</span>
        </div>
      </div>

      <!-- ALWAYS-VISIBLE PIRANHA COLOR PICKER -->
      <div class="fe-color-bar" aria-label="Piranha Color Picker">
        <span class="fe-color-label">🎨 Piranha Color:</span>
        <div class="fe-color-swatches" id="feColorSwatches">
          ${PIRANHA_COLORS.map(
            (skin) => `
              <button
                type="button"
                class="fe-swatch-btn ${skin.id === savedColorId ? 'active' : ''}"
                data-color-id="${skin.id}"
                title="${skin.name}"
                style="background: linear-gradient(135deg, ${skin.primary} 55%, ${skin.belly} 100%);"
              ></button>
            `
          ).join('')}
        </div>
      </div>

      <div class="fe-hunter-alert" id="feHunterAlert">
        <span>⚠️ HUNTER CHASING YOU!</span>
      </div>
    </header>

    <div class="fe-toast" id="feToast"></div>

    <!-- DUAL CORNER CONTROLS: 4 ARROWS + 1 ROTARY KNOB -->
    <div class="fe-controls-dock ${savedSwapped ? 'swapped' : ''}" id="feControlsDock">
      <!-- 4 Directional Arrows -->
      <div class="fe-dpad-zone">
        <div class="fe-dpad-grid" id="feDpadGrid">
          <button type="button" class="fe-arrow-btn fe-arrow-up" data-dir="up" aria-label="Swim Up">⬆️</button>
          <button type="button" class="fe-arrow-btn fe-arrow-left" data-dir="left" aria-label="Swim Left">⬅️</button>
          <div class="fe-arrow-center">🐟</div>
          <button type="button" class="fe-arrow-btn fe-arrow-right" data-dir="right" aria-label="Swim Right">➡️</button>
          <button type="button" class="fe-arrow-btn fe-arrow-down" data-dir="down" aria-label="Swim Down">⬇️</button>
        </div>
        <span class="fe-control-caption">4-Way Arrows</span>
      </div>

      <button type="button" class="fe-swap-btn" id="feBtnSwap" title="Swap Arrow & Rotary Knob Corners">⇄ Swap</button>

      <!-- 1 Interactive 360° Rotary Steering Knob ("Draaiknopje") -->
      <div class="fe-knob-zone">
        <div class="fe-knob-outer" id="feKnobOuter" aria-label="360 Degree Rotary Steering Knob">
          <div class="fe-knob-ticks"></div>
          <div class="fe-knob-dial" id="feKnobDial">
            <div class="fe-knob-pointer"></div>
            <div class="fe-knob-center-dot">🎛️</div>
          </div>
        </div>
        <span class="fe-control-caption">Rotary Dial 360°</span>
      </div>
    </div>

    <!-- 14 SPECIES ENCYCLOPEDIA MODAL -->
    <div class="fe-modal-backdrop" id="feSpeciesModal">
      <div class="fe-modal-card">
        <div class="fe-modal-header">
          <h2 class="fe-modal-title">🌊 3D Ocean Species (14 Varieties)</h2>
          <button type="button" class="fe-modal-close" id="feCloseSpecies">✕</button>
        </div>
        <div class="fe-species-grid">
          ${FISH_SPECIES.map(
            (sp) => `
              <div class="fe-species-card">
                <div class="fe-species-top">
                  <span class="fe-species-emoji">${sp.emoji}</span>
                  <span class="fe-species-dot" style="background: linear-gradient(135deg, ${sp.primaryColor}, ${sp.secondaryColor});"></span>
                </div>
                <div class="fe-species-name">${sp.name}</div>
                <div class="fe-species-meta">${sp.preferredDepth} zone • ${sp.pattern}</div>
              </div>
            `
          ).join('')}
        </div>
      </div>
    </div>
  </div>
`;

const canvas = document.getElementById('feOceanCanvas') as HTMLCanvasElement;
const elFishEaten = document.getElementById('feFishEaten')!;
const elRankLabel = document.getElementById('feRankLabel')!;
const elSizeBest = document.getElementById('feSizeBestLabel')!;
const elSmallerCount = document.getElementById('feSmallerCount')!;
const elLargerCount = document.getElementById('feLargerCount')!;
const elLivesText = document.getElementById('feLivesText')!;
const elHunterAlert = document.getElementById('feHunterAlert')!;
const elToast = document.getElementById('feToast')!;
const elControlsDock = document.getElementById('feControlsDock')!;
const elKnobOuter = document.getElementById('feKnobOuter')!;
const elKnobDial = document.getElementById('feKnobDial')!;
const elSpeciesModal = document.getElementById('feSpeciesModal')!;

const sfx = new SoundFX();
let toastTimer: number | null = null;

function showToast(message: string): void {
  elToast.textContent = message;
  elToast.classList.add('visible');
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elToast.classList.remove('visible');
  }, 2800);
}

function renderHud(snap: HudSnapshot): void {
  elFishEaten.textContent = String(snap.fishEaten);
  elRankLabel.textContent = `Lv.${snap.rankNumber} ${snap.rankTitle}`;
  elSizeBest.textContent = `📏 ${snap.sizeCm} cm • 🏆 Best: ${snap.bestFishEaten}`;
  elSmallerCount.textContent = `🐟 ${snap.smallerCount} Smaller`;
  elLargerCount.textContent = `🦈 ${snap.largerCount} Larger`;
  elLivesText.textContent = '❤️'.repeat(snap.lives) + '🖤'.repeat(Math.max(0, snap.maxLives - snap.lives));
  localStorage.setItem(STORAGE_BEST_KEY, String(snap.bestFishEaten));

  if (snap.activeHunterName) {
    elHunterAlert.classList.add('visible');
    elHunterAlert.innerHTML = `⚠️ <strong>${snap.activeHunterName}</strong> hunting! Eat <strong>${snap.activeHunterSmallNeeded}</strong> small fish to outgrow!`;
  } else {
    elHunterAlert.classList.remove('visible');
  }
}

const engine = new Ocean3DEngine(
  canvas,
  sfx,
  savedColorId,
  savedBest,
  renderHud,
  showToast
);

// ==================== ALWAYS-ACCESSIBLE PIRANHA COLOR PICKER ====================
const swatchButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.fe-swatch-btn'));
swatchButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const colorId = btn.dataset.colorId;
    if (!colorId) return;
    engine.setPiranhaColor(colorId);
    localStorage.setItem(STORAGE_COLOR_KEY, colorId);
    swatchButtons.forEach((b) => b.classList.toggle('active', b === btn));
    const skin = PIRANHA_COLORS.find((c) => c.id === colorId);
    sfx.playTap();
    if (skin) showToast(`🎨 Piranha Color: ${skin.name}`);
  });
});

// ==================== TOP ACTION BUTTONS & MODAL ====================
const btnSound = document.getElementById('feBtnSound')!;
btnSound.addEventListener('click', () => {
  sfx.enabled = !sfx.enabled;
  btnSound.textContent = sfx.enabled ? '🔊' : '🔇';
  if (sfx.enabled) sfx.playTap();
});

document.getElementById('feBtnReset')!.addEventListener('click', () => {
  sfx.playTap();
  engine.resetRun();
  showToast('🌊 New Piranha Run! Eat small fish to grow!');
});

document.getElementById('feBtnSpecies')!.addEventListener('click', () => {
  sfx.playTap();
  elSpeciesModal.classList.add('open');
});

document.getElementById('feCloseSpecies')!.addEventListener('click', () => {
  sfx.playTap();
  elSpeciesModal.classList.remove('open');
});

elSpeciesModal.addEventListener('click', (e) => {
  if (e.target === elSpeciesModal) {
    elSpeciesModal.classList.remove('open');
  }
});

document.getElementById('feBtnSwap')!.addEventListener('click', () => {
  sfx.playTap();
  const isSwapped = elControlsDock.classList.toggle('swapped');
  localStorage.setItem(STORAGE_SWAP_KEY, String(isSwapped));
});

// ==================== 4 DIRECTIONAL ARROW BUTTONS ====================
type ArrowDir = 'up' | 'down' | 'left' | 'right';
const activeArrowPointers = new Map<number, ArrowDir>();

function syncArrowInputs(): void {
  const dirs = new Set<ArrowDir>(activeArrowPointers.values());
  engine.input.up = dirs.has('up') || keysHeld.has('ArrowUp') || keysHeld.has('KeyW');
  engine.input.down = dirs.has('down') || keysHeld.has('ArrowDown') || keysHeld.has('KeyS');
  engine.input.left = dirs.has('left') || keysHeld.has('ArrowLeft') || keysHeld.has('KeyA');
  engine.input.right = dirs.has('right') || keysHeld.has('ArrowRight') || keysHeld.has('KeyD');

  document.querySelectorAll<HTMLButtonElement>('.fe-arrow-btn').forEach((btn) => {
    const dir = btn.dataset.dir as ArrowDir | undefined;
    btn.classList.toggle('pressed', Boolean(dir && dirs.has(dir)));
  });
}

document.querySelectorAll<HTMLButtonElement>('.fe-arrow-btn').forEach((btn) => {
  const dir = btn.dataset.dir as ArrowDir;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    activeArrowPointers.set(e.pointerId, dir);
    syncArrowInputs();
  });

  const release = (e: PointerEvent) => {
    activeArrowPointers.delete(e.pointerId);
    syncArrowInputs();
  };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
});

// ==================== 1 ROTARY KNOB ("DRAAIKNOPJE") ====================
let knobPointerId: number | null = null;

function updateKnobFromPointer(clientX: number, clientY: number): void {
  const rect = elKnobOuter.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const maxR = rect.width * 0.42;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const strength = Math.min(1, Math.max(0.18, dist / maxR));

  engine.input.knobActive = true;
  engine.input.knobAngleRad = angle;
  engine.input.knobStrength = strength;

  const deg = (angle * 180) / Math.PI;
  const shiftX = Math.cos(angle) * Math.min(16, dist * 0.35);
  const shiftY = Math.sin(angle) * Math.min(16, dist * 0.35);
  elKnobDial.style.transform = `translate(${shiftX}px, ${shiftY}px) rotate(${deg}deg)`;
  elKnobOuter.classList.add('active');
}

function resetKnob(): void {
  knobPointerId = null;
  engine.input.knobActive = false;
  engine.input.knobStrength = 0;
  elKnobOuter.classList.remove('active');
  const currentDeg = (engine.input.knobAngleRad * 180) / Math.PI;
  elKnobDial.style.transform = `translate(0px, 0px) rotate(${currentDeg}deg)`;
}

elKnobOuter.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  knobPointerId = e.pointerId;
  elKnobOuter.setPointerCapture(e.pointerId);
  updateKnobFromPointer(e.clientX, e.clientY);
});

elKnobOuter.addEventListener('pointermove', (e) => {
  if (knobPointerId === e.pointerId) {
    updateKnobFromPointer(e.clientX, e.clientY);
  }
});

const releaseKnob = (e: PointerEvent) => {
  if (knobPointerId === e.pointerId) {
    resetKnob();
  }
};
elKnobOuter.addEventListener('pointerup', releaseKnob);
elKnobOuter.addEventListener('pointercancel', releaseKnob);
elKnobOuter.addEventListener('lostpointercapture', releaseKnob);

// ==================== KEYBOARD SUPPORT (ARROWS / WASD) ====================
const keysHeld = new Set<string>();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
    keysHeld.add(e.code);
    syncArrowInputs();
  }
});
window.addEventListener('keyup', (e) => {
  if (keysHeld.has(e.code)) {
    keysHeld.delete(e.code);
    syncArrowInputs();
  }
});

// Start the 3D Ocean Loop!
engine.start();
showToast('🦷 Eat smaller fish! Outgrow 1% hunters by eating 2 small fish!');
