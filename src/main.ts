import './style.css';
import { SoundFX } from './audio/soundFx';
import { FISH_SPECIES, PIRANHA_COLORS, PiranhaColorSkin } from './data/fishSpecies';
import { HudSnapshot, Ocean3DEngine } from './game/ocean3DEngine';

const STORAGE_COLOR_KEY = 'fish_eater_piranha_color_v1';
const STORAGE_BEST_KEY = 'fish_eater_best_eaten_v1';
const STORAGE_SWAP_KEY = 'fish_eater_controls_swapped_v1';

const app = document.querySelector<HTMLDivElement>('#app')!;
const savedColorId = localStorage.getItem(STORAGE_COLOR_KEY) || PIRANHA_COLORS[0].id;
const savedBest = Number(localStorage.getItem(STORAGE_BEST_KEY) || '0') || 0;
const savedSwapped = localStorage.getItem(STORAGE_SWAP_KEY) === 'true';

function piranhaEmblemSvg(skin: PiranhaColorSkin, size = 28): string {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M18 32 L7 22 L11 32 L7 42 Z" fill="${skin.fin}" stroke="${skin.outline}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M24 21 L27 13 L33 18 L37 12 L41 19 Z" fill="${skin.fin}" stroke="${skin.outline}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M24 44 L29 52 L35 45 Z" fill="${skin.fin}" stroke="${skin.outline}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M16 32 C16 21,26 17,37 18 C46 19,52 25,54 32 L45 33 L53 36 C50 43,43 47,34 47 C24 47,16 41,16 32 Z" fill="${skin.primary}" stroke="${skin.outline}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M22 37 C28 44,39 46,49 40 C44 41,34 41,22 37 Z" fill="${skin.belly}" opacity="0.92"/>
      <path d="M38 35 C44 35,50 34,54 31 C55 36,51 41,45 42 C41 43,38 40,38 35 Z" fill="${skin.belly}" stroke="${skin.outline}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M40 35 L42.5 30 L45 35 L47.5 30 L50 34.5 L52 30.5 L52.5 35 Z" fill="#ffffff" stroke="${skin.outline}" stroke-width="1" stroke-linejoin="round"/>
      <circle cx="41" cy="27" r="4.2" fill="#fef08a" stroke="${skin.outline}" stroke-width="1.6"/>
      <circle cx="42" cy="27" r="2.1" fill="#0f172a"/>
      <circle cx="42.8" cy="26" r="0.8" fill="#ffffff"/>
      <path d="M36 22.5 L45 24.5" stroke="${skin.outline}" stroke-width="2.2" stroke-linecap="round"/>
    </svg>
  `;
}

function speciesIconSvg(primary: string, secondary: string, outline: string): string {
  return `
    <svg width="30" height="22" viewBox="0 0 40 28" fill="none" aria-hidden="true">
      <path d="M11 14 L3 7 L6 14 L3 21 Z" fill="${secondary}" stroke="${outline}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M16 7 C20 3,25 4,27 8 Z" fill="${secondary}" stroke="${outline}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M10 14 C12 7,22 5,32 10 C35 12,37 14,37 14 C37 14,35 16,32 18 C22 23,12 21,10 14 Z" fill="${primary}" stroke="${outline}" stroke-width="1.8" stroke-linejoin="round"/>
      <circle cx="29" cy="12" r="2.3" fill="#ffffff" stroke="${outline}" stroke-width="1"/>
      <circle cx="29.6" cy="12" r="1.1" fill="#0f172a"/>
    </svg>
  `;
}

const HEART_SVG = `<svg class="fe-heart-svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 17.5l-1.35-1.23C4.4 12.42 2 10.24 2 7.25 2 4.82 3.9 3 6.25 3c1.38 0 2.7.65 3.75 1.72C11.05 3.65 12.37 3 13.75 3 16.1 3 18 4.82 18 7.25c0 2.99-2.4 5.17-6.65 9.02L10 17.5z"/></svg>`;

const SOUND_ON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
const SOUND_OFF_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;

const initialSkin = PIRANHA_COLORS.find((c) => c.id === savedColorId) || PIRANHA_COLORS[0];

app.innerHTML = `
  <div class="fe-shell">
    <canvas id="feOceanCanvas" class="fe-canvas"></canvas>

    <!-- SLEEK TOP HUD -->
    <header class="fe-top-hud">
      <div class="fe-hud-row">
        <div class="fe-score-card">
          <div class="fe-emblem" id="fePlayerEmblem">
            ${piranhaEmblemSvg(initialSkin, 32)}
          </div>
          <div class="fe-score-main">
            <div class="fe-score-top">
              <span class="fe-eaten-value" id="feFishEaten">0</span>
              <span class="fe-eaten-unit">eaten</span>
              <span class="fe-lives-row" id="feLivesRow" aria-label="Lives">
                ${HEART_SVG}${HEART_SVG}${HEART_SVG}
              </span>
            </div>
            <div class="fe-score-sub">
              <span class="fe-rank-pill" id="feRankLabel">Lv.1 Baby Fry</span>
              <span class="fe-dot-sep">·</span>
              <span id="feSizeBestLabel">12 cm · Best ${savedBest}</span>
            </div>
          </div>
        </div>

        <div class="fe-top-actions">
          <button type="button" class="fe-pill-btn fe-skin-toggle" id="feBtnSkinToggle" aria-label="Piranha Color" title="Piranha Color">
            <span class="fe-skin-dot" id="feActiveSkinDot" style="background: linear-gradient(135deg, ${initialSkin.primary} 55%, ${initialSkin.belly} 100%);"></span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button type="button" class="fe-pill-btn" id="feBtnSpecies" aria-label="14 Species Guide" title="14 Species Guide">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <span>14</span>
          </button>
          <button type="button" class="fe-icon-btn" id="feBtnSound" aria-label="Toggle Sound" title="Sound">
            ${SOUND_ON_SVG}
          </button>
          <button type="button" class="fe-icon-btn" id="feBtnReset" aria-label="Restart Run" title="Restart">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
        </div>
      </div>

      <div class="fe-sub-row">
        <div class="fe-balance-chip">
          <span class="fe-chip-prey" id="feSmallerCount">16 Prey</span>
          <span class="fe-dot-sep">·</span>
          <span class="fe-chip-pred" id="feLargerCount">16 Predators</span>
        </div>

        <!-- COLLAPSIBLE PIRANHA COLOR DRAWER -->
        <div class="fe-color-drawer" id="feColorDrawer" aria-label="Piranha Color Picker">
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
      </div>

      <div class="fe-hunter-alert" id="feHunterAlert"></div>
    </header>

    <div class="fe-toast" id="feToast"></div>

    <!-- SLEEK DUAL CORNER CONTROLS -->
    <div class="fe-controls-dock ${savedSwapped ? 'swapped' : ''}" id="feControlsDock">
      <div class="fe-dpad-zone">
        <div class="fe-dpad-grid" id="feDpadGrid">
          <button type="button" class="fe-arrow-btn fe-arrow-up" data-dir="up" aria-label="Swim Up">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button type="button" class="fe-arrow-btn fe-arrow-left" data-dir="left" aria-label="Swim Left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="fe-arrow-center" id="feDpadEmblem">
            ${piranhaEmblemSvg(initialSkin, 22)}
          </div>
          <button type="button" class="fe-arrow-btn fe-arrow-right" data-dir="right" aria-label="Swim Right">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button type="button" class="fe-arrow-btn fe-arrow-down" data-dir="down" aria-label="Swim Down">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
      </div>

      <button type="button" class="fe-swap-btn" id="feBtnSwap" title="Swap Left & Right Controls" aria-label="Swap Controls">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
        <span>Swap</span>
      </button>

      <div class="fe-knob-zone">
        <div class="fe-knob-outer" id="feKnobOuter" aria-label="360 Degree Rotary Steering Knob">
          <div class="fe-knob-ticks"></div>
          <div class="fe-knob-dial" id="feKnobDial">
            <div class="fe-knob-pointer"></div>
            <div class="fe-knob-center-dot">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 14 SPECIES ENCYCLOPEDIA MODAL -->
    <div class="fe-modal-backdrop" id="feSpeciesModal">
      <div class="fe-modal-card">
        <div class="fe-modal-header">
          <div>
            <h2 class="fe-modal-title">Ocean Species</h2>
            <p class="fe-modal-subtitle">14 Reef & Deep-Sea Varieties</p>
          </div>
          <button type="button" class="fe-modal-close" id="feCloseSpecies" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="fe-species-grid">
          ${FISH_SPECIES.map(
            (sp) => `
              <div class="fe-species-card">
                <div class="fe-species-top">
                  ${speciesIconSvg(sp.primaryColor, sp.secondaryColor, sp.outlineColor)}
                  <span class="fe-species-dot" style="background: linear-gradient(135deg, ${sp.primaryColor}, ${sp.secondaryColor});"></span>
                </div>
                <div class="fe-species-name">${sp.name}</div>
                <div class="fe-species-meta">${sp.preferredDepth} · ${sp.pattern}</div>
              </div>
            `
          ).join('')}
        </div>
      </div>
    </div>

    <!-- GAME OVER MODAL -->
    <div class="fe-modal-backdrop" id="feGameOverModal">
      <div class="fe-gameover-card">
        <div class="fe-gameover-emblem" id="feGameOverEmblem">
          ${piranhaEmblemSvg(initialSkin, 56)}
        </div>
        <h2 class="fe-gameover-title">Eaten in the Deep</h2>
        <p class="fe-gameover-rank" id="feGameOverRank">Lv.1 Baby Fry Piranha</p>
        <div class="fe-gameover-stats">
          <div class="fe-stat-box">
            <span class="fe-stat-num" id="feGameOverScore">0</span>
            <span class="fe-stat-lbl">Fish Eaten</span>
          </div>
          <div class="fe-stat-box">
            <span class="fe-stat-num" id="feGameOverBest">0</span>
            <span class="fe-stat-lbl">Best Run</span>
          </div>
          <div class="fe-stat-box">
            <span class="fe-stat-num" id="feGameOverSize">12 cm</span>
            <span class="fe-stat-lbl">Max Size</span>
          </div>
        </div>
        <button type="button" class="fe-play-again-btn" id="feBtnPlayAgain">Swim Again</button>
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
const elLivesRow = document.getElementById('feLivesRow')!;
const elHunterAlert = document.getElementById('feHunterAlert')!;
const elToast = document.getElementById('feToast')!;
const elControlsDock = document.getElementById('feControlsDock')!;
const elKnobOuter = document.getElementById('feKnobOuter')!;
const elKnobDial = document.getElementById('feKnobDial')!;
const elSpeciesModal = document.getElementById('feSpeciesModal')!;
const elColorDrawer = document.getElementById('feColorDrawer')!;
const elActiveSkinDot = document.getElementById('feActiveSkinDot')!;
const elPlayerEmblem = document.getElementById('fePlayerEmblem')!;
const elDpadEmblem = document.getElementById('feDpadEmblem')!;
const elGameOverModal = document.getElementById('feGameOverModal')!;
const elGameOverEmblem = document.getElementById('feGameOverEmblem')!;
const elGameOverRank = document.getElementById('feGameOverRank')!;
const elGameOverScore = document.getElementById('feGameOverScore')!;
const elGameOverBest = document.getElementById('feGameOverBest')!;
const elGameOverSize = document.getElementById('feGameOverSize')!;

const sfx = new SoundFX();
let toastTimer: number | null = null;

function showToast(message: string): void {
  elToast.textContent = message;
  elToast.classList.add('visible');
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elToast.classList.remove('visible');
  }, 2600);
}

function renderHud(snap: HudSnapshot): void {
  elFishEaten.textContent = String(snap.fishEaten);
  elRankLabel.textContent = `Lv.${snap.rankNumber} ${snap.rankTitle.replace(' Piranha', '')}`;
  elSizeBest.textContent = `${snap.sizeCm} cm · Best ${snap.bestFishEaten}`;
  elSmallerCount.textContent = `${snap.smallerCount} Prey`;
  elLargerCount.textContent = `${snap.largerCount} Predators`;
  localStorage.setItem(STORAGE_BEST_KEY, String(snap.bestFishEaten));

  const hearts = Array.from({ length: snap.maxLives }, (_, idx) => {
    const alive = idx < snap.lives;
    return `<span class="fe-heart ${alive ? 'alive' : 'lost'}">${HEART_SVG}</span>`;
  }).join('');
  elLivesRow.innerHTML = hearts;

  if (snap.activeHunterName && !snap.isGameOver) {
    elHunterAlert.classList.add('visible');
    elHunterAlert.innerHTML = `<span class="fe-hunter-dot"></span><span><strong>${snap.activeHunterName}</strong> hunting · Eat <strong>${snap.activeHunterSmallNeeded}</strong> small fish</span>`;
  } else {
    elHunterAlert.classList.remove('visible');
  }

  if (snap.isGameOver) {
    elGameOverScore.textContent = String(snap.fishEaten);
    elGameOverBest.textContent = String(snap.bestFishEaten);
    elGameOverSize.textContent = `${snap.sizeCm} cm`;
    elGameOverRank.textContent = `Lv.${snap.rankNumber} ${snap.rankTitle}`;
    elGameOverModal.classList.add('open');
  } else {
    elGameOverModal.classList.remove('open');
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

// ==================== PIRANHA SKIN COLOR PICKER ====================
document.getElementById('feBtnSkinToggle')!.addEventListener('click', () => {
  sfx.playTap();
  elColorDrawer.classList.toggle('open');
});

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
    if (skin) {
      elActiveSkinDot.style.background = `linear-gradient(135deg, ${skin.primary} 55%, ${skin.belly} 100%)`;
      elPlayerEmblem.innerHTML = piranhaEmblemSvg(skin, 32);
      elDpadEmblem.innerHTML = piranhaEmblemSvg(skin, 22);
      elGameOverEmblem.innerHTML = piranhaEmblemSvg(skin, 56);
      showToast(`Skin: ${skin.name}`);
    }
  });
});

// ==================== TOP ACTION BUTTONS & MODALS ====================
const btnSound = document.getElementById('feBtnSound')!;
btnSound.addEventListener('click', () => {
  sfx.enabled = !sfx.enabled;
  btnSound.innerHTML = sfx.enabled ? SOUND_ON_SVG : SOUND_OFF_SVG;
  if (sfx.enabled) sfx.playTap();
});

function restartRun(): void {
  sfx.playTap();
  engine.resetRun();
  showToast('Eat smaller fish to grow and outgrow hunters');
}

document.getElementById('feBtnReset')!.addEventListener('click', restartRun);
document.getElementById('feBtnPlayAgain')!.addEventListener('click', restartRun);

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
  const shiftX = Math.cos(angle) * Math.min(15, dist * 0.34);
  const shiftY = Math.sin(angle) * Math.min(15, dist * 0.34);
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

// ==================== KEYBOARD SUPPORT ====================
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

engine.start();
showToast('Eat smaller fish to grow — outgrow 1% hunters');
