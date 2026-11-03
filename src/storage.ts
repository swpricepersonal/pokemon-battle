import { blankBuild } from './data/presets';
import { MAJOR_STATUSES, NATURE_NAMES, STAT_KEYS, TYPES } from './engine/types';
import type { Move, PokemonBuild } from './engine/types';

const LIBRARY_KEY = 'battle-sim:library';
const SIDES_KEY = 'battle-sim:sides';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, quota): the app still works, it just won't persist.
  }
}

export function loadLibrary(): PokemonBuild[] {
  const raw = read<unknown[]>(LIBRARY_KEY);
  return Array.isArray(raw) ? raw.flatMap((b) => normalizeBuild(b) ?? []) : [];
}

export function saveLibrary(builds: PokemonBuild[]) {
  write(LIBRARY_KEY, builds);
}

export function loadSides(): [PokemonBuild, PokemonBuild] | null {
  const raw = read<unknown[]>(SIDES_KEY);
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const a = normalizeBuild(raw[0]);
  const b = normalizeBuild(raw[1]);
  return a && b ? [a, b] : null;
}

export function saveSides(sides: [PokemonBuild, PokemonBuild]) {
  write(SIDES_KEY, sides);
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.max(min, Math.min(max, n));
}

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

function normalizeMove(raw: unknown): Move | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const effects = (m.effects && typeof m.effects === 'object' ? m.effects : {}) as Move['effects'];
  if (effects.status && !MAJOR_STATUSES.includes(effects.status.status)) delete effects.status;
  return {
    name: typeof m.name === 'string' ? m.name : 'Move',
    type: oneOf(m.type, TYPES, 'Normal'),
    category: oneOf(m.category, ['Physical', 'Special', 'Status'] as const, 'Physical'),
    power: num(m.power, 0, 0, 999),
    accuracy: m.accuracy === null ? null : num(m.accuracy, 100, 1, 100),
    pp: num(m.pp, 10, 1, 64),
    priority: num(m.priority, 0, -7, 5),
    highCrit: m.highCrit === true,
    effects,
  };
}

/** Coerces untrusted JSON (storage or an imported file) into a valid build, or null. */
export function normalizeBuild(raw: unknown): PokemonBuild | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const base = blankBuild();
  const table = (v: unknown, fallback: PokemonBuild['ivs'], min: number, max: number) => {
    const t = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return Object.fromEntries(STAT_KEYS.map((k) => [k, num(t[k], fallback[k], min, max)])) as PokemonBuild['ivs'];
  };
  const moves = Array.isArray(b.moves) ? b.moves.slice(0, 4).map(normalizeMove) : [];
  while (moves.length < 4) moves.push(null);
  return {
    id: typeof b.id === 'string' ? b.id : base.id,
    name: typeof b.name === 'string' ? b.name : base.name,
    level: num(b.level, 50, 1, 100),
    type1: oneOf(b.type1, TYPES, 'Normal'),
    type2: TYPES.includes(b.type2 as never) ? (b.type2 as PokemonBuild['type2']) : null,
    nature: oneOf(b.nature, NATURE_NAMES, 'Hardy'),
    baseStats: table(b.baseStats, base.baseStats, 1, 255),
    ivs: table(b.ivs, base.ivs, 0, 31),
    evs: table(b.evs, base.evs, 0, 252),
    moves,
  };
}
