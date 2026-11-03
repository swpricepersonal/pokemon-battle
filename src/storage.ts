import { ABILITIES, blankCustomAbility } from './engine/abilities';
import { ITEMS } from './engine/items';
import { MOVE_LIBRARY, PRESET_BUILDS, blankBuild, defaultMoveTarget, newId } from './data/presets';
import { BOOSTABLE_STATS, CUSTOM_ABILITY, MAJOR_STATUSES, MOVE_FLAGS, MOVE_SPECIALS, MOVE_TARGETS, NATURE_NAMES, STAT_KEYS, TERRAINS, TYPES, WEATHERS } from './engine/types';
import type { Boosts, CustomAbility, Format, MajorStatus, Move, PokemonBuild, Terrain, Weather } from './engine/types';

const LIBRARY_KEY = 'battle-sim:library';
const SIDES_KEY = 'battle-sim:sides';
const TEAMS_KEY = 'battle-sim:teams';

export type Teams = [PokemonBuild[], PokemonBuild[]];

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

function presetCopy(i: number): PokemonBuild {
  return { ...structuredClone(PRESET_BUILDS[i % PRESET_BUILDS.length]), id: newId() };
}

export function defaultTeams(): Teams {
  return [[presetCopy(0), presetCopy(2)], [presetCopy(3), presetCopy(4)]];
}

/** Each team always holds exactly two builds (singles uses the first). */
function fillTeam(team: PokemonBuild[], fallback: number): PokemonBuild[] {
  const out = team.slice(0, 2);
  while (out.length < 2) out.push(presetCopy(fallback + out.length));
  return out;
}

export interface FieldChoice {
  weather: Weather | null;
  terrain: Terrain | null;
}

export interface SavedSetup {
  teams: Teams;
  format: Format;
  field: FieldChoice;
}

export function loadTeams(): SavedSetup | null {
  const saved = read<{ teams?: unknown[]; format?: unknown; field?: { weather?: unknown; terrain?: unknown } }>(TEAMS_KEY);
  if (saved && Array.isArray(saved.teams) && saved.teams.length === 2) {
    const teams = saved.teams.map((t, i) =>
      fillTeam(Array.isArray(t) ? t.flatMap((b) => normalizeBuild(b) ?? []) : [], i * 2),
    ) as Teams;
    const f = saved.field ?? {};
    return {
      teams,
      format: saved.format === 'doubles' ? 'doubles' : 'singles',
      field: {
        weather: WEATHERS.includes(f.weather as never) ? (f.weather as Weather) : null,
        terrain: TERRAINS.includes(f.terrain as never) ? (f.terrain as Terrain) : null,
      },
    };
  }
  // Older versions saved just the two singles builds.
  const old = read<unknown[]>(SIDES_KEY);
  if (Array.isArray(old) && old.length === 2) {
    const a = normalizeBuild(old[0]);
    const b = normalizeBuild(old[1]);
    if (a && b) return { teams: [fillTeam([a], 2), fillTeam([b], 4)], format: 'singles', field: { weather: null, terrain: null } };
  }
  return null;
}

export function saveTeams(teams: Teams, format: Format, field: FieldChoice) {
  write(TEAMS_KEY, { teams, format, field });
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.max(min, Math.min(max, n));
}

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

function boosts(v: unknown): Partial<Boosts> {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out: Partial<Boosts> = {};
  for (const k of BOOSTABLE_STATS) {
    const n = num(o[k], 0, -6, 6);
    if (n) out[k] = n;
  }
  return out;
}

function normalizeContactStatus(v: unknown): CustomAbility['contactStatus'] {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!MAJOR_STATUSES.includes(o.status as never)) return null;
  return { status: o.status as MajorStatus, chance: num(o.chance, 30, 1, 100) };
}

function normalizeEffects(raw: unknown): Move['effects'] {
  const effects = (raw && typeof raw === 'object' ? { ...(raw as object) } : {}) as Move['effects'];
  if (effects.status && !MAJOR_STATUSES.includes(effects.status.status)) delete effects.status;
  if (effects.multiHit) {
    const [a, b] = Array.isArray(effects.multiHit) ? effects.multiHit : [];
    if (typeof a === 'number' && typeof b === 'number' && a >= 1 && b >= a && b <= 10) effects.multiHit = [a, b];
    else delete effects.multiHit;
  }
  const fd = effects.fixedDamage;
  if (fd !== undefined && fd !== 'level' && fd !== 'halfHp' && !(typeof fd === 'number' && fd > 0)) delete effects.fixedDamage;
  return effects;
}

function normalizeCustomAbility(raw: unknown): CustomAbility {
  const base = blankCustomAbility();
  if (!raw || typeof raw !== 'object') return base;
  const c = raw as Record<string, unknown>;
  const mult = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : fallback);
  const sm = (c.statMultipliers && typeof c.statMultipliers === 'object' ? c.statMultipliers : {}) as Record<string, unknown>;
  const typeOrNull = (v: unknown) => (TYPES.includes(v as never) ? (v as CustomAbility['boostType']) : null);
  return {
    name: typeof c.name === 'string' ? c.name : base.name,
    statMultipliers: Object.fromEntries((['atk', 'def', 'spa', 'spd', 'spe'] as const).flatMap((k) => (sm[k] !== undefined ? [[k, mult(sm[k], 1)]] : []))),
    boostType: typeOrNull(c.boostType),
    boostMultiplier: mult(c.boostMultiplier, base.boostMultiplier),
    immuneType: typeOrNull(c.immuneType),
    onImmune: oneOf(c.onImmune, ['none', 'heal', 'boost'] as const, 'none'),
    immuneBoost: oneOf(c.immuneBoost, BOOSTABLE_STATS, 'atk'),
    resistType: typeOrNull(c.resistType),
    resistMultiplier: mult(c.resistMultiplier, base.resistMultiplier),
    stabMultiplier: mult(c.stabMultiplier, base.stabMultiplier),
    superEffectiveTaken: mult(c.superEffectiveTaken, base.superEffectiveTaken),
    critImmune: c.critImmune === true,
    statusImmune: Array.isArray(c.statusImmune) ? c.statusImmune.filter((x) => MAJOR_STATUSES.includes(x)) : [],
    onStartFoeBoosts: boosts(c.onStartFoeBoosts),
    endOfTurnBoosts: boosts(c.endOfTurnBoosts),
    onStartWeather: WEATHERS.includes(c.onStartWeather as never) ? (c.onStartWeather as CustomAbility['onStartWeather']) : null,
    onStartTerrain: TERRAINS.includes(c.onStartTerrain as never) ? (c.onStartTerrain as CustomAbility['onStartTerrain']) : null,
    contactStatus: normalizeContactStatus(c.contactStatus),
    contactDamage: typeof c.contactDamage === 'number' && Number.isFinite(c.contactDamage) ? Math.max(0, Math.min(100, c.contactDamage)) : 0,
  };
}

function normalizeMove(raw: unknown): Move | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const effects = normalizeEffects(m.effects);
  const category = oneOf(m.category, ['Physical', 'Special', 'Status'] as const, 'Physical');
  // Moves saved by older versions lack targets and flags: borrow them from the library move of the same name.
  const known = MOVE_LIBRARY.find((x) => x.name === m.name);
  const special = MOVE_SPECIALS.includes(m.special as never) ? (m.special as Move['special']) : m.special === undefined ? known?.special : undefined;
  const flags = Array.isArray(m.flags)
    ? m.flags.filter((f) => MOVE_FLAGS.includes(f))
    : known?.flags ?? (category === 'Physical' ? ['contact' as const] : []);
  return {
    target: oneOf(m.target, MOVE_TARGETS, known?.target ?? defaultMoveTarget(category, effects)),
    ...(special ? { special } : {}),
    ...(flags.length ? { flags } : {}),
    name: typeof m.name === 'string' ? m.name : 'Move',
    type: oneOf(m.type, TYPES, 'Normal'),
    category,
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
    ability: b.ability === CUSTOM_ABILITY || (typeof b.ability === 'string' && b.ability in ABILITIES) ? (b.ability as string) : '',
    ...(b.ability === CUSTOM_ABILITY || b.customAbility ? { customAbility: normalizeCustomAbility(b.customAbility) } : {}),
    item: typeof b.item === 'string' && b.item in ITEMS ? b.item : '',
    baseStats: table(b.baseStats, base.baseStats, 1, 255),
    ivs: table(b.ivs, base.ivs, 0, 31),
    evs: table(b.evs, base.evs, 0, 252),
    moves,
  };
}
