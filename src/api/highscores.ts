export interface FishEaterHighscoreEntry {
  rank: number;
  deviceId: string;
  playerName: string;
  fishEaten: number;
  maxSizeCm: number;
  bestRank: number;
  skinId: string;
  updatedAt: string;
}

export interface FishEaterLocalBest {
  bestEaten: number;
  bestSizeCm: number;
  bestRank: number;
}

export type HighscoreStatus = 'ok' | 'no-server' | 'offline';

export interface HighscoreFetchResult {
  entries: FishEaterHighscoreEntry[];
  status: HighscoreStatus;
}

const KEY_DEVICE = 'fish_eater_device_id_v1';
const KEY_NAME = 'fish_eater_player_name_v1';
const KEY_API = 'fish_eater_api_url_v1';
const KEY_LOCAL_BEST = 'fish_eater_local_best_v1';
const LEGACY_BEST_KEY = 'fish_eater_best_eaten_v1';

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY_DEVICE);
    if (!id) {
      id = `fe-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
      localStorage.setItem(KEY_DEVICE, id);
    }
    return id;
  } catch {
    return 'fe-local';
  }
}

export function getPlayerName(): string {
  try {
    return localStorage.getItem(KEY_NAME) || 'Piranha';
  } catch {
    return 'Piranha';
  }
}

export function setPlayerName(name: string): void {
  try {
    localStorage.setItem(KEY_NAME, name.trim().slice(0, 20) || 'Piranha');
  } catch {
    // ignore
  }
}

export function getApiUrl(): string {
  try {
    const saved = localStorage.getItem(KEY_API);
    if (saved) return saved;
  } catch {
    // ignore
  }
  const envUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL || '';
  return envUrl.trim().replace(/\/+$/, '');
}

export function setApiUrl(url: string): void {
  try {
    localStorage.setItem(KEY_API, url.trim().replace(/\/+$/, ''));
  } catch {
    // ignore
  }
}

function safeInt(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function getLocalBest(): FishEaterLocalBest {
  let legacyBest = 0;
  try {
    legacyBest = safeInt(localStorage.getItem(LEGACY_BEST_KEY), 0);
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem(KEY_LOCAL_BEST);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FishEaterLocalBest> | null;
      if (parsed && typeof parsed === 'object') {
        return {
          bestEaten: Math.max(legacyBest, safeInt(parsed.bestEaten, 0)),
          bestSizeCm: Math.max(12, safeInt(parsed.bestSizeCm, 12)),
          bestRank: Math.max(1, safeInt(parsed.bestRank, 1)),
        };
      }
    }
  } catch {
    // ignore
  }
  return { bestEaten: legacyBest, bestSizeCm: 12, bestRank: 1 };
}

export function updateLocalBest(
  fishEaten: number,
  maxSizeCm: number,
  bestRank: number
): FishEaterLocalBest {
  const prev = getLocalBest();
  const next: FishEaterLocalBest = {
    bestEaten: Math.max(prev.bestEaten, safeInt(fishEaten, 0)),
    bestSizeCm: Math.max(prev.bestSizeCm, safeInt(maxSizeCm, 12)),
    bestRank: Math.max(prev.bestRank, safeInt(bestRank, 1)),
  };
  try {
    localStorage.setItem(KEY_LOCAL_BEST, JSON.stringify(next));
    localStorage.setItem(LEGACY_BEST_KEY, String(next.bestEaten));
  } catch {
    // ignore
  }
  return next;
}

export async function submitFishEaterScore(
  fishEaten: number,
  maxSizeCm: number,
  bestRank: number,
  skinId: string
): Promise<void> {
  const base = getApiUrl();
  if (!base || fishEaten <= 0) return;
  try {
    await fetch(`${base}/api/fish-eater/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: getDeviceId(),
        playerName: getPlayerName(),
        fishEaten: safeInt(fishEaten, 0),
        maxSizeCm: Math.max(1, safeInt(maxSizeCm, 12)),
        bestRank: Math.max(1, safeInt(bestRank, 1)),
        skinId: skinId || 'ruby',
      }),
    });
  } catch {
    // offline
  }
}

export async function fetchFishEaterHighscores(): Promise<HighscoreFetchResult> {
  const base = getApiUrl();
  if (!base) return { entries: [], status: 'no-server' };
  try {
    const res = await fetch(
      `${base}/api/fish-eater/highscores?limit=30&deviceId=${encodeURIComponent(getDeviceId())}`
    );
    if (!res.ok) return { entries: [], status: 'offline' };
    const data = (await res.json()) as { entries?: Record<string, unknown>[] };
    const rawList = Array.isArray(data.entries) ? data.entries : [];
    const entries: FishEaterHighscoreEntry[] = rawList.map((row, idx) => ({
      rank: safeInt(row.rank, idx + 1) || idx + 1,
      deviceId: String(row.device_id ?? row.deviceId ?? ''),
      playerName: String(row.player_name ?? row.playerName ?? 'Piranha'),
      fishEaten: safeInt(row.fish_eaten ?? row.fishEaten, 0),
      maxSizeCm: Math.max(1, safeInt(row.max_size_cm ?? row.maxSizeCm, 12)),
      bestRank: Math.max(1, safeInt(row.best_rank ?? row.bestRank, 1)),
      skinId: String(row.skin_id ?? row.skinId ?? 'ruby'),
      updatedAt: String(row.updated_at ?? row.updatedAt ?? ''),
    }));
    return { entries, status: 'ok' };
  } catch {
    return { entries: [], status: 'offline' };
  }
}
