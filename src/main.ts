import './style.css';
import {
  fetchFishEaterHighscores,
  FishEaterHighscoreEntry,
  getApiUrl,
  getLocalBest,
  getPlayerName,
  HighscoreStatus,
  setApiUrl,
  setPlayerName,
  submitFishEaterScore,
  updateLocalBest,
} from './api/highscores';
import { SoundFX } from './audio/soundFx';
import { FISH_SPECIES, PIRANHA_COLORS, PiranhaColorSkin } from './data/fishSpecies';
import { HudSnapshot, Ocean3DEngine } from './game/ocean3DEngine';

const STORAGE_COLOR_KEY = 'fish_eater_piranha_color_v1';
const STORAGE_SWAP_KEY = 'fish_eater_controls_swapped_v1';

const app = document.querySelector<HTMLDivElement>('#app')!;
const savedColorId = localStorage.getItem(STORAGE_COLOR_KEY) || PIRANHA_COLORS[0].id;
const savedLocalBest = getLocalBest();
const savedSwapped = localStorage.getItem(STORAGE_SWAP_KEY) === 'true';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
const SOUND_ON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
const SOUND_OFF_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;

const initialSkin = PIRANHA_COLORS.find((c) => c.id === savedColorId) || PIRANHA_COLORS[0];

app.innerHTML = `
  <div class="fe-shell">
    <canvas id="feOceanCanvas" class="fe-canvas"></canvas>

    <!-- SLEEK TOP HUD (toast anchored dynamically directly below) -->
    <header class="fe-top-hud" id="feTopHud">
      <div class="fe-hud-row">
        <div class="fe-score-card">
          <div class="fe-emblem" id="fePlayerEmblem">
            ${piranhaEmblemSvg(initialSkin, 30)}
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
              <span id="feSizeBestLabel">12 cm · Best ${savedLocalBest.bestEaten}</span>
            </div>
          </div>
        </div>

        <div class="fe-top-actions">
          <button type="button" class="fe-pill-btn fe-skin-toggle" id="feBtnSkinToggle" aria-label="Piranha Color" title="Piranha Color">
            <span class="fe-skin-dot" id="feActiveSkinDot" style="background: linear-gradient(135deg, ${initialSkin.primary} 55%, ${initialSkin.belly} 100%);"></span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button type="button" class="fe-pill-btn" id="feBtnSpecies" aria-label="14 Species Guide" title="14 Species Guide">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <span>14</span>
          </button>
          <button type="button" class="fe-icon-btn fe-hide-xs" id="feBtnSound" aria-label="Toggle Sound" title="Sound">
            ${SOUND_ON_SVG}
          </button>
          <button type="button" class="fe-icon-btn" id="feBtnPause" aria-label="Pause Menu" title="Pause">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>
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

      <!-- DYNAMIC TOAST: ALWAYS POSITIONS CLEANLY BELOW TOP HUD & COLOR DRAWER -->
      <div class="fe-toast" id="feToast"></div>
    </header>

    <!-- SLEEK DUAL CORNER CONTROLS + DASH BOOST -->
    <div class="fe-controls-dock ${savedSwapped ? 'swapped' : ''}" id="feControlsDock">
      <div class="fe-dpad-zone">
        <div class="fe-dpad-grid" id="feDpadGrid">
          <button type="button" class="fe-arrow-btn fe-arrow-up" data-dir="up" aria-label="Swim Up">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button type="button" class="fe-arrow-btn fe-arrow-left" data-dir="left" aria-label="Swim Left">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="fe-arrow-center" id="feDpadEmblem">
            ${piranhaEmblemSvg(initialSkin, 20)}
          </div>
          <button type="button" class="fe-arrow-btn fe-arrow-right" data-dir="right" aria-label="Swim Right">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button type="button" class="fe-arrow-btn fe-arrow-down" data-dir="down" aria-label="Swim Down">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
      </div>

      <div class="fe-center-controls">
        <button type="button" class="fe-dash-btn ready" id="feBtnDash" aria-label="Dash Bite Boost" title="Dash / Bite Boost (Space)">
          <span class="fe-dash-fill" id="feDashFill"></span>
          <span class="fe-dash-label" id="feDashLabel">⚡ Dash</span>
        </button>
        <button type="button" class="fe-swap-btn" id="feBtnSwap" title="Swap Left & Right Controls" aria-label="Swap Controls">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
          <span>Swap</span>
        </button>
      </div>

      <div class="fe-knob-zone">
        <div class="fe-knob-outer" id="feKnobOuter" aria-label="360 Degree Rotary Steering Knob">
          <div class="fe-knob-ticks"></div>
          <div class="fe-knob-dial" id="feKnobDial">
            <div class="fe-knob-pointer"></div>
            <div class="fe-knob-center-dot">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- START / TITLE OVERLAY -->
    <div class="fe-modal-backdrop open" id="feStartModal">
      <div class="fe-gameover-card fe-start-card">
        <div class="fe-gameover-emblem" id="feStartEmblem">
          ${piranhaEmblemSvg(initialSkin, 56)}
        </div>
        <h1 class="fe-gameover-title">Fish Eater</h1>
        <p class="fe-start-subtitle">Eat smaller fish to grow, dash through prey, and outgrow relentless 1% hunters!</p>
        <div class="fe-start-best" id="feStartBest">
          ${
            savedLocalBest.bestEaten > 0
              ? `🏆 Best: <strong>${savedLocalBest.bestEaten}</strong> fish · <strong>${savedLocalBest.bestSizeCm} cm</strong> · Lv.${savedLocalBest.bestRank}`
              : '🐟 Ready for your first dive!'
          }
        </div>
        <button type="button" class="fe-play-again-btn" id="feBtnDiveIn">Dive In</button>
        <div class="fe-modal-btn-row">
          <button type="button" class="fe-secondary-btn" id="feStartBtnScores">🏆 Leaderboard</button>
          <button type="button" class="fe-secondary-btn" id="feStartBtnMore">🎮 More Games</button>
        </div>
      </div>
    </div>

    <!-- PAUSE MENU MODAL -->
    <div class="fe-modal-backdrop" id="fePauseModal">
      <div class="fe-gameover-card fe-menu-card">
        <div class="fe-modal-header fe-menu-header">
          <h2 class="fe-modal-title">⏸ Paused</h2>
          <button type="button" class="fe-modal-close" id="feClosePause" aria-label="Resume">✕</button>
        </div>
        <div class="fe-menu-actions">
          <button type="button" class="fe-play-again-btn" id="feBtnResume">▶ Resume Swim</button>
          <button type="button" class="fe-secondary-btn" id="feBtnPauseSound">🔊 Sound: ON</button>
          <button type="button" class="fe-secondary-btn" id="feBtnPauseScores">🏆 Global Leaderboard</button>
          <button type="button" class="fe-secondary-btn" id="feBtnPauseMore">🎮 More Games by VaelNTN</button>
          <button type="button" class="fe-danger-btn" id="feBtnPauseRestart">🔄 Restart Run</button>
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
          <button type="button" class="fe-modal-close" id="feCloseSpecies" aria-label="Close">✕</button>
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

    <!-- ONLINE LEADERBOARD MODAL -->
    <div class="fe-modal-backdrop" id="feLeaderboardModal">
      <div class="fe-modal-card">
        <div class="fe-modal-header">
          <div>
            <h2 class="fe-modal-title" id="feScoresHeading">🏆 Leaderboard</h2>
            <p class="fe-modal-subtitle" id="feLocalBestSummary">Personal Best: ${savedLocalBest.bestEaten} fish · ${savedLocalBest.bestSizeCm} cm</p>
          </div>
          <button type="button" class="fe-modal-close" id="feCloseScores" aria-label="Close">✕</button>
        </div>
        <div class="fe-scores-body">
          <label class="fe-field-label">
            Player Name
            <input id="feInputName" class="fe-text-input" maxlength="20" value="${escapeHtml(getPlayerName())}" />
          </label>
          <label class="fe-field-label fe-hidden" id="feApiUrlWrap">
            Leaderboard Server URL
            <input id="feInputApiUrl" class="fe-text-input" placeholder="https://example.com" value="${escapeHtml(getApiUrl())}" />
          </label>
          <button type="button" class="fe-play-again-btn fe-compact-cta" id="feBtnSaveScoreCfg">Save & Refresh</button>
          <div class="fe-scores-list" id="feScoresList"></div>
        </div>
      </div>
    </div>

    <!-- MORE GAMES BY VAELNTN MODAL -->
    <div class="fe-modal-backdrop" id="feMoreGamesModal">
      <div class="fe-modal-card">
        <div class="fe-modal-header">
          <div>
            <h2 class="fe-modal-title">🎮 More Games</h2>
            <p class="fe-modal-subtitle">Handcrafted Arcade Games by VaelNTN</p>
          </div>
          <button type="button" class="fe-modal-close" id="feCloseMoreGames" aria-label="Close">✕</button>
        </div>
        <div class="fe-promo-list">
          <a class="fe-promo-card featured" href="https://github.com/VaelNTN/starforge-survivors" target="_blank" rel="noopener noreferrer">
            <span class="fe-promo-badge">⭐ FEATURED</span>
            <strong class="fe-promo-title">🚀 Starforge Survivors</strong>
            <span class="fe-promo-desc">Survive endless cosmic swarms, evolve stellar weapons, and conquer deep space!</span>
            <span class="fe-promo-cta">Play / Get APK →</span>
          </a>
          <a class="fe-promo-card" href="https://github.com/VaelNTN/castle-bastion-td" target="_blank" rel="noopener noreferrer">
            <strong class="fe-promo-title">🏰 Castle Bastion TD</strong>
            <span class="fe-promo-desc">Build towers, upgrade to Lv.10, and unlock 12 specializations to defend the keep.</span>
          </a>
          <a class="fe-promo-card" href="https://github.com/VaelNTN/arcade-100-hub" target="_blank" rel="noopener noreferrer">
            <strong class="fe-promo-title">🕹️ Arcade 100 Hub</strong>
            <span class="fe-promo-desc">Discover the full VaelNTN mobile & web arcade collection.</span>
          </a>
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
        <div class="fe-modal-btn-row">
          <button type="button" class="fe-secondary-btn" id="feGoBtnScores">🏆 Leaderboard</button>
          <button type="button" class="fe-secondary-btn" id="feGoBtnMore">🎮 More Games</button>
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
const elLivesRow = document.getElementById('feLivesRow')!;
const elHunterAlert = document.getElementById('feHunterAlert')!;
const elToast = document.getElementById('feToast')!;
const elControlsDock = document.getElementById('feControlsDock')!;
const elKnobOuter = document.getElementById('feKnobOuter')!;
const elKnobDial = document.getElementById('feKnobDial')!;
const elBtnDash = document.getElementById('feBtnDash') as HTMLButtonElement;
const elDashFill = document.getElementById('feDashFill')!;
const elDashLabel = document.getElementById('feDashLabel')!;
const elStartModal = document.getElementById('feStartModal')!;
const elStartEmblem = document.getElementById('feStartEmblem')!;
const elStartBest = document.getElementById('feStartBest')!;
const elPauseModal = document.getElementById('fePauseModal')!;
const elBtnPauseSound = document.getElementById('feBtnPauseSound')!;
const elSpeciesModal = document.getElementById('feSpeciesModal')!;
const elLeaderboardModal = document.getElementById('feLeaderboardModal')!;
const elMoreGamesModal = document.getElementById('feMoreGamesModal')!;
const elLocalBestSummary = document.getElementById('feLocalBestSummary')!;
const elScoresList = document.getElementById('feScoresList')!;
const elInputName = document.getElementById('feInputName') as HTMLInputElement;
const elApiUrlWrap = document.getElementById('feApiUrlWrap')!;
const elInputApiUrl = document.getElementById('feInputApiUrl') as HTMLInputElement;
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
let latestSnap: HudSnapshot | null = null;
let scoreEntries: FishEaterHighscoreEntry[] = [];
let scoreStatus: HighscoreStatus = 'no-server';
let loadingScores = false;
let secretTapCount = 0;
let secretTapTimer: number | null = null;

function showToast(message: string): void {
  elToast.textContent = message;
  elToast.classList.add('visible');
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elToast.classList.remove('visible');
  }, 2600);
}

function syncPauseState(): void {
  if (!latestSnap?.started || latestSnap.isGameOver) return;
  const anyOverlayOpen =
    elPauseModal.classList.contains('open') ||
    elSpeciesModal.classList.contains('open') ||
    elLeaderboardModal.classList.contains('open') ||
    elMoreGamesModal.classList.contains('open');
  engine.setPaused(anyOverlayOpen);
}

function closeSubModals(): void {
  elPauseModal.classList.remove('open');
  elSpeciesModal.classList.remove('open');
  elLeaderboardModal.classList.remove('open');
  elMoreGamesModal.classList.remove('open');
  syncPauseState();
}

function syncSoundUi(): void {
  const btnSound = document.getElementById('feBtnSound')!;
  btnSound.innerHTML = sfx.enabled ? SOUND_ON_SVG : SOUND_OFF_SVG;
  elBtnPauseSound.textContent = sfx.enabled ? '🔊 Sound: ON' : '🔇 Sound: OFF';
}

function renderScoresList(): void {
  const best = getLocalBest();
  elLocalBestSummary.textContent = `Personal Best: ${best.bestEaten} fish · ${best.bestSizeCm} cm · Lv.${best.bestRank}`;
  if (loadingScores) {
    elScoresList.innerHTML = `<div class="fe-score-empty">⏳ Connecting to leaderboard...</div>`;
    return;
  }
  if (scoreStatus === 'no-server') {
    elScoresList.innerHTML = `<div class="fe-score-empty">Playing in offline mode — personal bests are saved on your device.</div>`;
    return;
  }
  if (scoreStatus === 'offline') {
    elScoresList.innerHTML = `<div class="fe-score-empty">Offline right now — unable to reach leaderboard server.</div>`;
    return;
  }
  if (scoreEntries.length === 0) {
    elScoresList.innerHTML = `<div class="fe-score-empty">No scores yet. Be the first apex piranha!</div>`;
    return;
  }
  elScoresList.innerHTML = scoreEntries
    .map(
      (e) => `
      <div class="fe-score-row">
        <span class="fe-score-player"><strong>#${e.rank}</strong> ${escapeHtml(e.playerName)}</span>
        <span class="fe-score-val">${e.fishEaten} 🐟 · ${e.maxSizeCm}cm</span>
      </div>
    `
    )
    .join('');
}

async function openLeaderboardModal(): Promise<void> {
  closeSubModals();
  elInputName.value = getPlayerName();
  elInputApiUrl.value = getApiUrl();
  elLeaderboardModal.classList.add('open');
  syncPauseState();
  loadingScores = true;
  renderScoresList();
  const res = await fetchFishEaterHighscores();
  scoreEntries = res.entries;
  scoreStatus = res.status;
  loadingScores = false;
  renderScoresList();
}

function renderHud(snap: HudSnapshot): void {
  latestSnap = snap;
  elFishEaten.textContent = String(snap.fishEaten);
  elRankLabel.textContent = `Lv.${snap.rankNumber} ${snap.rankTitle.replace(' Piranha', '')}`;
  elSizeBest.textContent = `${snap.sizeCm} cm · Best ${snap.bestFishEaten}`;
  elSmallerCount.textContent = `${snap.smallerCount} Prey`;
  elLargerCount.textContent = `${snap.largerCount} Predators`;

  if (snap.fishEaten > 0) {
    updateLocalBest(snap.fishEaten, snap.sizeCm, snap.rankNumber);
  }

  const hearts = Array.from({ length: snap.maxLives }, (_, idx) => {
    const alive = idx < snap.lives;
    return `<span class="fe-heart ${alive ? 'alive' : 'lost'}">${HEART_SVG}</span>`;
  }).join('');
  elLivesRow.innerHTML = hearts;

  if (snap.activeHunterName && snap.started && !snap.isGameOver) {
    elHunterAlert.classList.add('visible');
    elHunterAlert.innerHTML = `<span class="fe-hunter-dot"></span><span><strong>${snap.activeHunterName}</strong> hunting · Eat <strong>${snap.activeHunterSmallNeeded}</strong> prey</span>`;
  } else {
    elHunterAlert.classList.remove('visible');
  }

  // Dash button cooldown / active visual state
  const ready = snap.dashCooldownRatio <= 0.001 && !snap.dashActive;
  elBtnDash.classList.toggle('ready', ready);
  elBtnDash.classList.toggle('active', snap.dashActive);
  elBtnDash.classList.toggle('cooling', !ready && !snap.dashActive);
  elBtnDash.disabled = !snap.started || snap.paused || snap.isGameOver || !ready;
  elDashFill.style.height = `${Math.round((1 - snap.dashCooldownRatio) * 100)}%`;
  elDashLabel.textContent = snap.dashActive
    ? '⚡ BOOST'
    : ready
      ? '⚡ Dash'
      : `${snap.dashCooldownSec.toFixed(1)}s`;

  if (!snap.started) {
    elStartModal.classList.add('open');
  } else {
    elStartModal.classList.remove('open');
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
  savedLocalBest.bestEaten,
  renderHud,
  showToast,
  (fishEaten, sizeCm, rankNumber, skinId) => {
    const best = updateLocalBest(fishEaten, sizeCm, rankNumber);
    elStartBest.innerHTML = `🏆 Best: <strong>${best.bestEaten}</strong> fish · <strong>${best.bestSizeCm} cm</strong> · Lv.${best.bestRank}`;
    void submitFishEaterScore(fishEaten, sizeCm, rankNumber, skinId);
  }
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
      elPlayerEmblem.innerHTML = piranhaEmblemSvg(skin, 30);
      elDpadEmblem.innerHTML = piranhaEmblemSvg(skin, 20);
      elStartEmblem.innerHTML = piranhaEmblemSvg(skin, 56);
      elGameOverEmblem.innerHTML = piranhaEmblemSvg(skin, 56);
      showToast(`Skin: ${skin.name}`);
    }
  });
});

// ==================== START, PAUSE, LEADERBOARD & MODALS ====================
document.getElementById('feBtnDiveIn')!.addEventListener('click', () => {
  sfx.playTap();
  engine.startGame();
  showToast('Eat smaller fish to grow — tap ⚡ Dash to lunge!');
});

document.getElementById('feBtnSound')!.addEventListener('click', () => {
  sfx.enabled = !sfx.enabled;
  syncSoundUi();
  if (sfx.enabled) sfx.playTap();
});

elBtnPauseSound.addEventListener('click', () => {
  sfx.enabled = !sfx.enabled;
  syncSoundUi();
  if (sfx.enabled) sfx.playTap();
});

function restartRun(): void {
  sfx.playTap();
  closeSubModals();
  elGameOverModal.classList.remove('open');
  engine.resetRun(true);
  showToast('Fresh dive — eat smaller fish & outgrow hunters!');
}

document.getElementById('feBtnPause')!.addEventListener('click', () => {
  if (!latestSnap?.started || latestSnap.isGameOver) return;
  sfx.playTap();
  elPauseModal.classList.add('open');
  syncPauseState();
});

document.getElementById('feClosePause')!.addEventListener('click', () => {
  sfx.playTap();
  closeSubModals();
});
document.getElementById('feBtnResume')!.addEventListener('click', () => {
  sfx.playTap();
  closeSubModals();
});
elPauseModal.addEventListener('click', (e) => {
  if (e.target === elPauseModal) closeSubModals();
});
document.getElementById('feBtnPauseRestart')!.addEventListener('click', restartRun);
document.getElementById('feBtnPlayAgain')!.addEventListener('click', restartRun);

document.getElementById('feBtnSpecies')!.addEventListener('click', () => {
  sfx.playTap();
  closeSubModals();
  elSpeciesModal.classList.add('open');
  syncPauseState();
});
document.getElementById('feCloseSpecies')!.addEventListener('click', () => {
  sfx.playTap();
  closeSubModals();
});
elSpeciesModal.addEventListener('click', (e) => {
  if (e.target === elSpeciesModal) closeSubModals();
});

// Leaderboard triggers
document.getElementById('feStartBtnScores')!.addEventListener('click', () => {
  sfx.playTap();
  void openLeaderboardModal();
});
document.getElementById('feBtnPauseScores')!.addEventListener('click', () => {
  sfx.playTap();
  void openLeaderboardModal();
});
document.getElementById('feGoBtnScores')!.addEventListener('click', () => {
  sfx.playTap();
  void openLeaderboardModal();
});
document.getElementById('feCloseScores')!.addEventListener('click', () => {
  sfx.playTap();
  closeSubModals();
});
elLeaderboardModal.addEventListener('click', (e) => {
  if (e.target === elLeaderboardModal) closeSubModals();
});

document.getElementById('feScoresHeading')!.addEventListener('click', () => {
  secretTapCount++;
  if (secretTapTimer !== null) window.clearTimeout(secretTapTimer);
  if (secretTapCount >= 5) {
    secretTapCount = 0;
    secretTapTimer = null;
    elApiUrlWrap.classList.toggle('fe-hidden');
    return;
  }
  secretTapTimer = window.setTimeout(() => {
    secretTapCount = 0;
    secretTapTimer = null;
  }, 2500);
});

document.getElementById('feBtnSaveScoreCfg')!.addEventListener('click', async () => {
  sfx.playTap();
  setPlayerName(elInputName.value);
  if (!elApiUrlWrap.classList.contains('fe-hidden')) {
    setApiUrl(elInputApiUrl.value);
  }
  const best = getLocalBest();
  if (best.bestEaten > 0) {
    await submitFishEaterScore(best.bestEaten, best.bestSizeCm, best.bestRank, engine.playerColor.id);
  }
  loadingScores = true;
  renderScoresList();
  const res = await fetchFishEaterHighscores();
  scoreEntries = res.entries;
  scoreStatus = res.status;
  loadingScores = false;
  renderScoresList();
});

// More Games triggers
const openMoreGames = () => {
  sfx.playTap();
  closeSubModals();
  elMoreGamesModal.classList.add('open');
  syncPauseState();
};
document.getElementById('feStartBtnMore')!.addEventListener('click', openMoreGames);
document.getElementById('feBtnPauseMore')!.addEventListener('click', openMoreGames);
document.getElementById('feGoBtnMore')!.addEventListener('click', openMoreGames);
document.getElementById('feCloseMoreGames')!.addEventListener('click', () => {
  sfx.playTap();
  closeSubModals();
});
elMoreGamesModal.addEventListener('click', (e) => {
  if (e.target === elMoreGamesModal) closeSubModals();
});

// Swap & Dash buttons
document.getElementById('feBtnSwap')!.addEventListener('click', () => {
  sfx.playTap();
  const isSwapped = elControlsDock.classList.toggle('swapped');
  localStorage.setItem(STORAGE_SWAP_KEY, String(isSwapped));
});

elBtnDash.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  engine.triggerDash();
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
  const shiftX = Math.cos(angle) * Math.min(14, dist * 0.34);
  const shiftY = Math.sin(angle) * Math.min(14, dist * 0.34);
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
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
    keysHeld.add(e.code);
    syncArrowInputs();
  } else if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    e.preventDefault();
    engine.triggerDash();
  } else if (e.code === 'Escape' && latestSnap?.started && !latestSnap.isGameOver) {
    const anyOpen =
      elPauseModal.classList.contains('open') ||
      elSpeciesModal.classList.contains('open') ||
      elLeaderboardModal.classList.contains('open') ||
      elMoreGamesModal.classList.contains('open');
    if (anyOpen) {
      closeSubModals();
    } else {
      elPauseModal.classList.add('open');
      syncPauseState();
    }
  }
});
window.addEventListener('keyup', (e) => {
  if (keysHeld.has(e.code)) {
    keysHeld.delete(e.code);
    syncArrowInputs();
  }
});

syncSoundUi();
engine.start();
