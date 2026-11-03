import { ABILITIES, blankCustomAbility } from './engine/abilities';
import { ITEMS } from './engine/items';
import { MOVE_LIBRARY, PRESET_BUILDS, blankBuild, defaultMoveTarget, newId } from './data/presets';
import { MAX_TEAM } from './engine/battle';
import type { BattleState } from './engine/battle';
import {
  BOOSTABLE_STATS, COPY_USER_ABILITY, CUSTOM_ABILITY, HAZARDS, HIDDEN_STATES, ITEM_CHANGES, MAJOR_STATUSES, MOVE_FLAGS, MOVE_SPECIALS, MOVE_TARGETS, NATURE_NAMES,
  STAT_KEYS, SWAP_ABILITIES, TERRAINS, TYPES, WEATHERS,
} from './engine/types';
import type { Boosts, CustomAbility, Format, Hidden, MajorStatus, Move, MoveEffects, PokemonBuild, Terrain, TypeName, Weather } from './engine/types';

const LIBRARY_KEY = 'battle-sim:library';
const SIDES_KEY = 'battle-sim:sides';
const TEAMS_KEY = 'battle-sim:teams';
const MOVES_KEY = 'battle-sim:moves';
const ABILITIES_KEY = 'battle-sim:abilities';
const BATTLE_KEY = 'battle-sim:battle';
/** Bumped when the saved battle format changes, so an incompatible saved battle is dropped. */
const BATTLE_VERSION = 2;

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

/** Custom moves saved by the player. */
export function loadSavedMoves(): Move[] {
  const raw = read<unknown[]>(MOVES_KEY);
  return Array.isArray(raw) ? raw.flatMap((m) => normalizeMove(m) ?? []) : [];
}

export function saveSavedMoves(moves: Move[]) {
  write(MOVES_KEY, moves);
}

/** Custom abilities saved by the player. */
export function loadSavedAbilities(): CustomAbility[] {
  const raw = read<unknown[]>(ABILITIES_KEY);
  return Array.isArray(raw) ? raw.flatMap((a) => (a && typeof a === 'object' ? [normalizeCustomAbility(a)] : [])) : [];
}

export function saveSavedAbilities(abilities: CustomAbility[]) {
  write(ABILITIES_KEY, abilities);
}

/** The battle in progress, so it can be resumed after leaving it or closing the app. */
export function loadBattle(): BattleState | null {
  const saved = read<{ version?: number; battle?: BattleState }>(BATTLE_KEY);
  const b = saved?.version === BATTLE_VERSION ? saved.battle : null;
  if (!b || !Array.isArray(b.sides) || b.sides.length !== 2 || !b.sides.every((s) => Array.isArray(s?.team) && Array.isArray(s?.mons))) return null;
  // Field slots must point at the same objects as the team entries (JSON loses that link).
  for (const side of b.sides) {
    side.mons = side.mons.map((m) => side.team.find((t) => t.uid === m?.uid)).filter((m): m is NonNullable<typeof m> => !!m);
    if (!side.mons.length) return null;
  }
  return b;
}

export function saveBattle(battle: BattleState | null) {
  if (!battle) {
    try {
      localStorage.removeItem(BATTLE_KEY);
    } catch {
      // ignore
    }
    return;
  }
  write(BATTLE_KEY, { version: BATTLE_VERSION, battle });
}

/** Everything that Export / Share / Import JSON carries. */
export interface Bundle {
  builds: PokemonBuild[];
  moves: Move[];
  abilities: CustomAbility[];
}

/** Reads an imported file: a list of builds (older exports), one build, or a bundle with builds, moves and abilities. */
export function parseBundle(parsed: unknown): Bundle {
  if (Array.isArray(parsed)) return { builds: parsed.flatMap((b) => normalizeBuild(b) ?? []), moves: [], abilities: [] };
  if (!parsed || typeof parsed !== 'object') return { builds: [], moves: [], abilities: [] };
  const o = parsed as Record<string, unknown>;
  if ('baseStats' in o) {
    const b = normalizeBuild(o);
    return { builds: b ? [b] : [], moves: [], abilities: [] };
  }
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    builds: list(o.builds).flatMap((b) => normalizeBuild(b) ?? []),
    moves: list(o.moves).flatMap((m) => normalizeMove(m) ?? []),
    abilities: list(o.abilities).flatMap((a) => (a && typeof a === 'object' ? [normalizeCustomAbility(a)] : [])),
  };
}

function presetCopy(i: number): PokemonBuild {
  return { ...structuredClone(PRESET_BUILDS[i % PRESET_BUILDS.length]), id: newId() };
}

export function defaultTeams(): Teams {
  return [[presetCopy(0), presetCopy(2)], [presetCopy(3), presetCopy(4)]];
}

/** Each team holds one to six builds (the first one or two start on the field). */
function fillTeam(team: PokemonBuild[], fallback: number): PokemonBuild[] {
  const out = team.slice(0, MAX_TEAM);
  if (!out.length) out.push(presetCopy(fallback));
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
  const isType = (t: unknown): t is TypeName => TYPES.includes(t as never);
  if (effects.healBlock !== undefined) {
    const n = num(effects.healBlock, 0, 0, 20);
    if (n) effects.healBlock = n;
    else delete effects.healBlock;
  }
  if (effects.typeChange) {
    const tc = effects.typeChange as Partial<NonNullable<MoveEffects['typeChange']>>;
    const types = Array.isArray(tc.types) ? tc.types.filter(isType).slice(0, 2) : [];
    if (types.length && (tc.mode === 'add' || tc.mode === 'replace')) effects.typeChange = { mode: tc.mode, types: tc.mode === 'add' ? types.slice(0, 1) : types };
    else delete effects.typeChange;
  }
  if (effects.targetAbility) {
    const ta = effects.targetAbility as { ability?: unknown; customAbility?: unknown };
    const a = ta.ability;
    if (a === CUSTOM_ABILITY) effects.targetAbility = { ability: a, customAbility: normalizeCustomAbility(ta.customAbility) };
    else if (a === '' || a === COPY_USER_ABILITY || a === SWAP_ABILITIES || (typeof a === 'string' && a in ABILITIES)) effects.targetAbility = { ability: a as string };
    else delete effects.targetAbility;
  }
  if (effects.protectContact) {
    const pc = effects.protectContact as Record<string, unknown>;
    const out: NonNullable<MoveEffects['protectContact']> = {};
    if (typeof pc.damage === 'number' && pc.damage > 0) out.damage = Math.min(100, pc.damage);
    if (MAJOR_STATUSES.includes(pc.status as never)) out.status = pc.status as MajorStatus;
    const b = boosts(pc.boosts);
    if (Object.keys(b).length) out.boosts = b;
    if (Object.keys(out).length) effects.protectContact = out;
    else delete effects.protectContact;
  }
  if (effects.protectAttacksOnly !== undefined && effects.protectAttacksOnly !== true) delete effects.protectAttacksOnly;
  if (effects.hazard !== undefined && !HAZARDS.includes(effects.hazard)) delete effects.hazard;
  if (effects.clearHazards !== undefined && effects.clearHazards !== 'own' && effects.clearHazards !== 'both') delete effects.clearHazards;
  if (effects.selfSwitch !== undefined && effects.selfSwitch !== 'switch' && effects.selfSwitch !== 'batonPass') delete effects.selfSwitch;
  if (effects.forceSwitch !== undefined && effects.forceSwitch !== true) delete effects.forceSwitch;
  if (effects.charge) {
    const c = (typeof effects.charge === 'object' ? effects.charge : {}) as Record<string, unknown>;
    const b = boosts(c.boosts);
    effects.charge = {
      ...(HIDDEN_STATES.includes(c.hide as never) ? { hide: c.hide as Hidden } : {}),
      ...(WEATHERS.includes(c.skipIn as never) ? { skipIn: c.skipIn as Weather } : {}),
      ...(Object.keys(b).length ? { boosts: b } : {}),
    };
  }
  if (effects.recharge !== undefined && effects.recharge !== true) delete effects.recharge;
  if (effects.itemChange !== undefined && !ITEM_CHANGES.includes(effects.itemChange)) delete effects.itemChange;
  if (effects.itemBoost !== undefined && effects.itemBoost !== true) delete effects.itemBoost;
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

export function normalizeCustomAbility(raw: unknown): CustomAbility {
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
    simple: c.simple === true,
    contrary: c.contrary === true,
  };
}

export function normalizeMove(raw: unknown): Move | null {
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
