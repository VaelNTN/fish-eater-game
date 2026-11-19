export interface PiranhaColorSkin {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  belly: string;
  fin: string;
  outline: string;
  glow: string;
}

export const PIRANHA_COLORS: PiranhaColorSkin[] = [
  {
    id: 'crimson',
    name: 'Amazon Crimson',
    primary: '#dc2626',
    secondary: '#991b1b',
    belly: '#fb923c',
    fin: '#ef4444',
    outline: '#450a0a',
    glow: 'rgba(239, 68, 68, 0.45)',
  },
  {
    id: 'emerald',
    name: 'Jungle Emerald',
    primary: '#10b981',
    secondary: '#047857',
    belly: '#fde047',
    fin: '#34d399',
    outline: '#022c22',
    glow: 'rgba(16, 185, 129, 0.45)',
  },
  {
    id: 'electric',
    name: 'Electric Blue',
    primary: '#0284c7',
    secondary: '#0369a1',
    belly: '#7dd3fc',
    fin: '#38bdf8',
    outline: '#082f49',
    glow: 'rgba(56, 189, 248, 0.48)',
  },
  {
    id: 'gold',
    name: '24K Golden',
    primary: '#f59e0b',
    secondary: '#b45309',
    belly: '#fef08a',
    fin: '#fbbf24',
    outline: '#451a03',
    glow: 'rgba(251, 191, 36, 0.5)',
  },
  {
    id: 'violet',
    name: 'Cosmic Violet',
    primary: '#8b5cf6',
    secondary: '#5b21b6',
    belly: '#f472b6',
    fin: '#c084fc',
    outline: '#2e1065',
    glow: 'rgba(168, 85, 247, 0.48)',
  },
  {
    id: 'tiger',
    name: 'Magma Tiger',
    primary: '#ea580c',
    secondary: '#9a3412',
    belly: '#fde047',
    fin: '#fb923c',
    outline: '#431407',
    glow: 'rgba(249, 115, 22, 0.48)',
  },
  {
    id: 'cyan',
    name: 'Bio-Neon Cyan',
    primary: '#06b6d4',
    secondary: '#0e7490',
    belly: '#a5f3fc',
    fin: '#22d3ee',
    outline: '#083344',
    glow: 'rgba(34, 211, 238, 0.48)',
  },
  {
    id: 'sakura',
    name: 'Coral Rose',
    primary: '#ec4899',
    secondary: '#9d174d',
    belly: '#fbcfe8',
    fin: '#f472b6',
    outline: '#500724',
    glow: 'rgba(236, 72, 153, 0.48)',
  },
  {
    id: 'obsidian',
    name: 'Shadow Obsidian',
    primary: '#334155',
    secondary: '#0f172a',
    belly: '#ef4444',
    fin: '#64748b',
    outline: '#020617',
    glow: 'rgba(239, 68, 68, 0.4)',
  },
  {
    id: 'lime',
    name: 'Toxic Lime',
    primary: '#84cc16',
    secondary: '#3f6212',
    belly: '#ecfccb',
    fin: '#a3e635',
    outline: '#1a2e05',
    glow: 'rgba(163, 230, 53, 0.48)',
  },
  {
    id: 'albino',
    name: 'Pearl Ghost',
    primary: '#f1f5f9',
    secondary: '#cbd5e1',
    belly: '#fda4af',
    fin: '#fb7185',
    outline: '#334155',
    glow: 'rgba(248, 250, 252, 0.45)',
  },
  {
    id: 'prism',
    name: 'Rainbow Prism',
    primary: '#f43f5e',
    secondary: '#3b82f6',
    belly: '#fde047',
    fin: '#10b981',
    outline: '#1e1b4b',
    glow: 'rgba(250, 204, 21, 0.52)',
  },
];

export type FishArchetype =
  | 'clownfish'
  | 'bluetang'
  | 'pufferfish'
  | 'shark'
  | 'swordfish'
  | 'anglerfish'
  | 'butterflyfish'
  | 'morayeel'
  | 'lionfish'
  | 'hammerhead'
  | 'parrotfish'
  | 'mantaray'
  | 'barracuda'
  | 'piranha';

export interface FishSpeciesDef {
  id: FishArchetype;
  name: string;
  emoji: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  outlineColor: string;
  pattern: 'stripes' | 'spots' | 'twoTone' | 'gradient' | 'bands' | 'scales';
  bodyAspect: { length: number; height: number; width: number };
  baseSpeed: number;
  preferredDepth: 'shallow' | 'mid' | 'deep' | 'all';
}

export const FISH_SPECIES: FishSpeciesDef[] = [
  {
    id: 'clownfish',
    name: 'Reef Clownfish',
    emoji: '🐠',
    primaryColor: '#f97316',
    secondaryColor: '#ffffff',
    accentColor: '#18181b',
    outlineColor: '#431407',
    pattern: 'bands',
    bodyAspect: { length: 1.05, height: 0.62, width: 0.45 },
    baseSpeed: 1.05,
    preferredDepth: 'shallow',
  },
  {
    id: 'bluetang',
    name: 'Royal Blue Tang',
    emoji: '🐟',
    primaryColor: '#2563eb',
    secondaryColor: '#1e3a8a',
    accentColor: '#facc15',
    outlineColor: '#0f172a',
    pattern: 'twoTone',
    bodyAspect: { length: 1.1, height: 0.72, width: 0.38 },
    baseSpeed: 1.12,
    preferredDepth: 'mid',
  },
  {
    id: 'pufferfish',
    name: 'Spiky Pufferfish',
    emoji: '🐡',
    primaryColor: '#eab308',
    secondaryColor: '#fef08a',
    accentColor: '#854d0e',
    outlineColor: '#422006',
    pattern: 'spots',
    bodyAspect: { length: 0.92, height: 0.86, width: 0.82 },
    baseSpeed: 0.85,
    preferredDepth: 'mid',
  },
  {
    id: 'butterflyfish',
    name: 'Golden Butterflyfish',
    emoji: '🦋',
    primaryColor: '#facc15',
    secondaryColor: '#fffbeb',
    accentColor: '#1e293b',
    outlineColor: '#451a03',
    pattern: 'stripes',
    bodyAspect: { length: 0.95, height: 0.88, width: 0.32 },
    baseSpeed: 1.02,
    preferredDepth: 'shallow',
  },
  {
    id: 'parrotfish',
    name: 'Rainbow Parrotfish',
    emoji: '🌈',
    primaryColor: '#14b8a6',
    secondaryColor: '#ec4899',
    accentColor: '#fde047',
    outlineColor: '#042f2e',
    pattern: 'scales',
    bodyAspect: { length: 1.18, height: 0.64, width: 0.46 },
    baseSpeed: 1.08,
    preferredDepth: 'mid',
  },
  {
    id: 'lionfish',
    name: 'Crimson Lionfish',
    emoji: '🦁',
    primaryColor: '#be123c',
    secondaryColor: '#ffe4e6',
    accentColor: '#fb7185',
    outlineColor: '#4c0519',
    pattern: 'stripes',
    bodyAspect: { length: 1.08, height: 0.74, width: 0.56 },
    baseSpeed: 0.94,
    preferredDepth: 'deep',
  },
  {
    id: 'morayeel',
    name: 'Electric Moray Eel',
    emoji: '⚡',
    primaryColor: '#059669',
    secondaryColor: '#34d399',
    accentColor: '#fef08a',
    outlineColor: '#022c22',
    pattern: 'spots',
    bodyAspect: { length: 1.75, height: 0.36, width: 0.34 },
    baseSpeed: 1.15,
    preferredDepth: 'deep',
  },
  {
    id: 'mantaray',
    name: 'Emerald Manta Ray',
    emoji: '🦇',
    primaryColor: '#0e7490',
    secondaryColor: '#cffafe',
    accentColor: '#38bdf8',
    outlineColor: '#083344',
    pattern: 'twoTone',
    bodyAspect: { length: 1.15, height: 0.28, width: 1.55 },
    baseSpeed: 1.1,
    preferredDepth: 'all',
  },
  {
    id: 'barracuda',
    name: 'Silver Barracuda',
    emoji: '🐉',
    primaryColor: '#64748b',
    secondaryColor: '#f1f5f9',
    accentColor: '#38bdf8',
    outlineColor: '#0f172a',
    pattern: 'stripes',
    bodyAspect: { length: 1.55, height: 0.44, width: 0.38 },
    baseSpeed: 1.24,
    preferredDepth: 'mid',
  },
  {
    id: 'swordfish',
    name: 'Imperial Swordfish',
    emoji: '🗡️',
    primaryColor: '#0369a1',
    secondaryColor: '#e0f2fe',
    accentColor: '#38bdf8',
    outlineColor: '#0c4a6e',
    pattern: 'gradient',
    bodyAspect: { length: 1.5, height: 0.56, width: 0.44 },
    baseSpeed: 1.26,
    preferredDepth: 'all',
  },
  {
    id: 'anglerfish',
    name: 'Abyssal Anglerfish',
    emoji: '🏮',
    primaryColor: '#581c87',
    secondaryColor: '#a855f7',
    accentColor: '#fde047',
    outlineColor: '#2e1065',
    pattern: 'spots',
    bodyAspect: { length: 1.05, height: 0.82, width: 0.68 },
    baseSpeed: 0.96,
    preferredDepth: 'deep',
  },
  {
    id: 'shark',
    name: 'Reef Great Shark',
    emoji: '🦈',
    primaryColor: '#475569',
    secondaryColor: '#f8fafc',
    accentColor: '#94a3b8',
    outlineColor: '#0f172a',
    pattern: 'twoTone',
    bodyAspect: { length: 1.48, height: 0.62, width: 0.55 },
    baseSpeed: 1.18,
    preferredDepth: 'all',
  },
  {
    id: 'hammerhead',
    name: 'Hammerhead Titan',
    emoji: '🐋',
    primaryColor: '#334155',
    secondaryColor: '#e2e8f0',
    accentColor: '#38bdf8',
    outlineColor: '#020617',
    pattern: 'twoTone',
    bodyAspect: { length: 1.52, height: 0.58, width: 0.72 },
    baseSpeed: 1.2,
    preferredDepth: 'deep',
  },
  {
    id: 'piranha',
    name: 'Wild Razor Piranha',
    emoji: '🦷',
    primaryColor: '#b91c1c',
    secondaryColor: '#fca5a5',
    accentColor: '#fb923c',
    outlineColor: '#450a0a',
    pattern: 'scales',
    bodyAspect: { length: 1.06, height: 0.72, width: 0.48 },
    baseSpeed: 1.16,
    preferredDepth: 'all',
  },
];

export interface PiranhaGrowthRank {
  rank: number;
  title: string;
  minFishEaten: number;
}

export const PIRANHA_GROWTH_RANKS: PiranhaGrowthRank[] = [
  { rank: 1, title: 'Baby Fry Piranha', minFishEaten: 0 },
  { rank: 2, title: 'Reef Dart Piranha', minFishEaten: 5 },
  { rank: 3, title: 'Razorjaw Piranha', minFishEaten: 12 },
  { rank: 4, title: 'Coral Hunter Piranha', minFishEaten: 22 },
  { rank: 5, title: 'Apex Predator Piranha', minFishEaten: 35 },
  { rank: 6, title: 'Giant Goliath Piranha', minFishEaten: 52 },
  { rank: 7, title: 'Mega Kraken Piranha', minFishEaten: 75 },
  { rank: 8, title: 'Colossal Leviathan Piranha', minFishEaten: 105 },
  { rank: 9, title: 'Abyssal Titan Piranha', minFishEaten: 145 },
  { rank: 10, title: 'Ocean Emperor Piranha', minFishEaten: 200 },
];

export function getPiranhaRank(fishEaten: number): PiranhaGrowthRank {
  let current = PIRANHA_GROWTH_RANKS[0];
  for (const r of PIRANHA_GROWTH_RANKS) {
    if (fishEaten >= r.minFishEaten) current = r;
  }
  return current;
}
