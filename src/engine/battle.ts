import { abilityName, defenderAbility, getAbility, hasSecondary, isGrounded } from './abilities';
import { CRIT_CHANCES, calcDamage, typeEffectiveness } from './damage';
import type { DamageBreakdown } from './damage';
import { getItem } from './items';
import { applyMod, chainMods } from './modifiers';
import { accuracyStageMultiplier, calcAllStats, clampStage, stageMultiplier } from './stats';
import { typeMultiplier } from './typeChart';
import { BOOST_LABELS, COPY_USER_ABILITY, CUSTOM_ABILITY, HAZARDS, HAZARD_LABELS, HAZARD_MAX, SWAP_ABILITIES, typesOf } from './types';
import type {
  BattlePokemon, BoostableStat, Boosts, CustomAbility, Format, Hazard, MajorStatus, Move, MoveEffects, PokemonBuild, Side, Terrain,
  TurnVolatiles, TypeName, Weather,
} from './types';
import { TERRAIN_LABELS, WEATHER_LABELS } from './types';
import type { AbilityDef, ImmunityResult } from './abilities';

export type { Side } from './types';

export type LogKind = 'turn' | 'order' | 'move' | 'info' | 'damage' | 'heal' | 'status' | 'boost' | 'faint' | 'result' | 'field' | 'switch';

export interface LogEntry {
  turn: number;
  kind: LogKind;
  text: string;
  /** The side this entry is about (used for coloring). */
  side?: Side;
  breakdown?: DamageBreakdown;
}

export interface SideState {
  /** The whole team (up to six), in team order. */
  team: BattlePokemon[];
  /** Active Pokémon by field position (index = slot). A fainted Pokémon stays in its slot until replaced. */
  mons: BattlePokemon[];
  /** Entry hazards on this side (layers). */
  hazards: Record<Hazard, number>;
  tailwind: number;
  reflect: number;
  lightScreen: number;
  wideGuard: boolean;
  quickGuard: boolean;
}

export interface BattleState {
  format: Format;
  sides: [SideState, SideState];
  trickRoom: number;
  /** Turns of Wonder Room / Magic Room left (0 = none). */
  wonderRoom: number;
  magicRoom: number;
  weather: Weather | null;
  /** Turns of weather left; -1 means it lasts the whole battle. */
  weatherTurns: number;
  terrain: Terrain | null;
  /** Turns of terrain left; -1 means it lasts the whole battle. */
  terrainTurns: number;
  turn: number;
  /** 'stopped' when the players ended the battle early. */
  winner: Side | 'draw' | 'stopped' | null;
  log: LogEntry[];
  /** Field positions whose Pokémon fainted and must be replaced from the bench before the next turn. */
  pendingReplacements: TargetRef[];
}

/** A move slot index (0–3), or STRUGGLE_INDEX when every usable move is out of PP. */
export type MoveChoice = number;
export const STRUGGLE_INDEX = -1;
/** Action.move value for a switch (see Action.switchTo). */
export const SWITCH_INDEX = -2;
/** Switching happens before any move. */
const SWITCH_PRIORITY = 7;

/** A field position. */
export interface TargetRef {
  side: Side;
  slot: number;
}

/** Key for a field position in the picks passed to applyReplacements. */
export const replacementKey = (ref: TargetRef) => `${ref.side}:${ref.slot}`;

export interface Action {
  move: MoveChoice;
  /** Required for single-target moves in doubles. */
  target?: TargetRef;
  /** Switch to this team member instead of using a move. */
  switchTo?: number;
  /** For moves that switch the user out (U-turn, Baton Pass): the team member to bring in. */
  pivotTo?: number;
}

/** Each active Pokémon's action for the turn, keyed by uid. */
export type TurnChoices = Record<string, Action>;

export const STRUGGLE: Move = {
  name: 'Struggle', type: 'Normal', category: 'Physical', power: 50, accuracy: null,
  pp: 1, priority: 0, highCrit: false, target: 'normal', effects: {},
};

export interface Rng {
  /** Returns a float in [0, 1). */
  next(): number;
}

export const mathRng: Rng = { next: () => Math.random() };

/** Deterministic RNG (mulberry32) for reproducible battles and tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

const ZERO_BOOSTS: Boosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };

function freshVolatiles(): TurnVolatiles {
  return { moved: false, protect: null, flinched: false, helpingHand: false, centerOfAttention: null };
}

const TEAM_LETTERS = 'abcdef';
export const MAX_TEAM = 6;

function buildTypes(build: PokemonBuild): TypeName[] {
  return build.type2 && build.type2 !== build.type1 ? [build.type1, build.type2] : [build.type1];
}

export function createBattlePokemon(build: PokemonBuild, side: Side = 0, teamIndex = 0, name?: string): BattlePokemon {
  const stats = calcAllStats(build);
  const own = structuredClone(build);
  return {
    uid: `p${side + 1}${TEAM_LETTERS[teamIndex]}`,
    name: name ?? (build.name.trim() || `Pokémon ${side + 1}`),
    side,
    teamIndex,
    build: own,
    ability: own.ability,
    ...(own.customAbility ? { customAbility: own.customAbility } : {}),
    types: buildTypes(own),
    addedType: null,
    healBlock: 0,
    itemsSuppressed: false,
    stats,
    currentHp: stats.hp,
    status: null,
    sleepTurns: 0,
    toxicCounter: 0,
    boosts: { ...ZERO_BOOSTS },
    pp: build.moves.map((m) => (m ? m.pp : 0)),
    item: build.item ?? '',
    choiceLock: null,
    protectStreak: 0,
    turnsActive: 0,
    flashFire: false,
    faintLogged: false,
    confusion: 0,
    lastAction: null,
    taunt: 0,
    encore: null,
    substituteHp: 0,
    leechSeed: null,
    disable: null,
    torment: false,
    yawn: 0,
    perishCount: 0,
    vol: freshVolatiles(),
  };
}

export const activeCount = (format: Format) => (format === 'doubles' ? 2 : 1);

/** Weather and terrain that are in place for the whole battle. */
export interface FieldSetup {
  weather?: Weather | null;
  terrain?: Terrain | null;
}

const noHazards = (): Record<Hazard, number> => ({ stealthRock: 0, spikes: 0, toxicSpikes: 0, stickyWeb: 0 });

/**
 * Create a battle from each side's team (up to six builds). The first one (singles) or two (doubles)
 * start on the field; the rest wait on the bench.
 */
export function createBattle(
  teams: [PokemonBuild[], PokemonBuild[]],
  format: Format = 'singles',
  rng: Rng = mathRng,
  setup: FieldSetup = {},
): BattleState {
  const n = activeCount(format);
  const picked = teams.map((t) => t.slice(0, MAX_TEAM)) as [PokemonBuild[], PokemonBuild[]];
  const raw = picked.flatMap((t, side) => t.map((b, i) => ({ side, i, name: b.name.trim() || `Pokémon ${side + 1}${TEAM_LETTERS[i].toUpperCase()}` })));
  const counts = new Map<string, number>();
  for (const r of raw) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
  const display = (side: number, i: number) => {
    const r = raw.find((x) => x.side === side && x.i === i)!;
    if (counts.get(r.name)! === 1) return r.name;
    const sameSide = raw.filter((x) => x.side === side && x.name === r.name).length > 1;
    return `${r.name} (P${side + 1}${sameSide ? TEAM_LETTERS[i].toUpperCase() : ''})`;
  };
  const sides = picked.map((builds, side) => {
    const team = builds.map((b, i) => createBattlePokemon(b, side as Side, i, display(side, i)));
    return {
      team, mons: team.slice(0, n), hazards: noHazards(),
      tailwind: 0, reflect: 0, lightScreen: 0, wideGuard: false, quickGuard: false,
    };
  }) as [SideState, SideState];
  const state: BattleState = {
    format, sides, trickRoom: 0, wonderRoom: 0, magicRoom: 0, turn: 0, winner: null, log: [], pendingReplacements: [],
    weather: setup.weather ?? null, weatherTurns: setup.weather ? -1 : 0,
    terrain: setup.terrain ?? null, terrainTurns: setup.terrain ? -1 : 0,
  };
  const teamName = (s: SideState) => s.mons.map((m) => m.name).join(' & ');
  state.log.push({ turn: 0, kind: 'info', text: `${teamName(sides[0])} vs. ${teamName(sides[1])}: battle start!` });
  if (state.weather) state.log.push({ turn: 0, kind: 'field', text: `${WEATHER_LABELS[state.weather]} covers the field for the whole battle.` });
  if (state.terrain) state.log.push({ turn: 0, kind: 'field', text: `${TERRAIN_LABELS[state.terrain]} covers the field for the whole battle.` });
  new TurnRunner(state, rng).startOfBattle();
  return state;
}

/** A singles battle with one Pokémon per side: messages name the Pokémon instead of "Player 1". */
export function oneOnOne(state: BattleState): boolean {
  return state.format === 'singles' && state.sides.every((s) => s.team.length === 1);
}

export function allMons(state: BattleState): BattlePokemon[] {
  return [...state.sides[0].mons, ...state.sides[1].mons];
}

export const isAlive = (m: BattlePokemon | null | undefined): m is BattlePokemon => !!m && m.currentHp > 0;

/** Finds a Pokémon by uid, on the field or on the bench. */
export function findMon(state: BattleState, uid: string): BattlePokemon | undefined {
  return [...state.sides[0].team, ...state.sides[1].team].find((m) => m.uid === uid);
}

export function isActive(state: BattleState, mon: BattlePokemon): boolean {
  return state.sides[mon.side].mons.includes(mon);
}

/** Team indices of healthy Pokémon on the bench that can be switched in. */
export function benchOptions(state: BattleState, side: Side): number[] {
  const s = state.sides[side];
  return s.team.flatMap((m, i) => (isAlive(m) && !s.mons.includes(m) ? [i] : []));
}

export function slotOf(state: BattleState, mon: BattlePokemon): number {
  return state.sides[mon.side].mons.indexOf(mon);
}

export function monAt(state: BattleState, ref: TargetRef): BattlePokemon | undefined {
  return state.sides[ref.side]?.mons[ref.slot];
}

export function allyOf(state: BattleState, mon: BattlePokemon): BattlePokemon | null {
  return state.sides[mon.side].mons.find((m) => m !== mon) ?? null;
}

export function foesOf(state: BattleState, mon: BattlePokemon): BattlePokemon[] {
  return state.sides[mon.side === 0 ? 1 : 0].mons.filter(isAlive);
}

/** Disabled, or the move Torment forbids repeating. */
function moveBlocked(mon: BattlePokemon, slot: number): boolean {
  return (mon.disable?.move === slot) || (mon.torment && mon.lastAction?.move === slot);
}

/** Status moves that restore HP can't be used under Heal Block. */
function isHealingMove(m: Move): boolean {
  return m.category === 'Status' && !!m.effects.heal;
}

/** Move slots that can be selected this turn; [STRUGGLE_INDEX] if none. */
export function availableChoices(mon: BattlePokemon): MoveChoice[] {
  const item = getItem(mon);
  const enc = mon.encore;
  if (enc && mon.pp[enc.move] > 0 && mon.build.moves[enc.move]) return moveBlocked(mon, enc.move) ? [STRUGGLE_INDEX] : [enc.move];
  const choices = mon.build.moves.flatMap((m, i) => {
    if (!m || mon.pp[i] <= 0 || moveBlocked(mon, i)) return [];
    if (mon.choiceLock !== null && mon.choiceLock !== i) return [];
    if (item?.noStatusMoves && m.category === 'Status') return [];
    if (mon.taunt > 0 && m.category === 'Status') return [];
    if (mon.healBlock > 0 && isHealingMove(m)) return [];
    return [i];
  });
  return choices.length ? choices : [STRUGGLE_INDEX];
}

export function getChoiceMove(mon: BattlePokemon, choice: MoveChoice): Move {
  if (choice === STRUGGLE_INDEX) return STRUGGLE;
  const move = mon.build.moves[choice];
  if (!move) throw new Error(`No move in slot ${choice}`);
  return move;
}

/** Does the player pick a target for this move? */
export function moveNeedsTarget(state: BattleState, move: Move): boolean {
  return state.format === 'doubles' && move.target === 'normal';
}

/** Positions a single-target move can aim at (foes first). */
export function validTargets(state: BattleState, mon: BattlePokemon): TargetRef[] {
  const foeSide: Side = mon.side === 0 ? 1 : 0;
  const refs: TargetRef[] = [];
  state.sides[foeSide].mons.forEach((m, slot) => isAlive(m) && refs.push({ side: foeSide, slot }));
  state.sides[mon.side].mons.forEach((m, slot) => m !== mon && isAlive(m) && refs.push({ side: mon.side, slot }));
  return refs;
}

export function defaultTarget(state: BattleState, mon: BattlePokemon): TargetRef | undefined {
  return validTargets(state, mon)[0];
}

/** The weather currently in effect (none while a Cloud Nine / Air Lock Pokémon is active). */
export function activeWeather(state: BattleState): Weather | null {
  if (!state.weather) return null;
  return allMons(state).some((m) => isAlive(m) && getAbility(m)?.negatesWeather) ? null : state.weather;
}

/** Damage options that come from the field. */
export function fieldDamageOpts(state: BattleState) {
  return { weather: activeWeather(state), terrain: state.terrain, doubles: state.format === 'doubles', wonderRoom: state.wonderRoom > 0 };
}

const WEATHER_BALL_TYPE: Record<Weather, TypeName> = { sun: 'Fire', rain: 'Water', sand: 'Rock', snow: 'Ice' };

/** The move as it will actually be used (Weather Ball changes type and power with the weather). */
export function effectiveMove(state: BattleState, move: Move): Move {
  if (move.special === 'weatherBall') {
    const w = activeWeather(state);
    if (w) return { ...move, type: WEATHER_BALL_TYPE[w], power: move.power * 2 };
  }
  return move;
}

/** Speed after stat stages, abilities, items, Tailwind and paralysis. */
export function effectiveSpeed(state: BattleState, mon: BattlePokemon): number {
  const base = Math.floor(mon.stats.spe * stageMultiplier(mon.boosts.spe));
  const mods: number[] = [];
  const ab = getAbility(mon);
  if (ab?.speed) mods.push(ab.speed(mon, activeWeather(state), state.terrain));
  const item = getItem(mon);
  if (item?.speed) mods.push(item.speed);
  if (state.sides[mon.side].tailwind > 0) mods.push(2);
  const spe = applyMod(base, chainMods(mods));
  return mon.status === 'par' ? Math.floor(spe * 0.5) : spe;
}

export function movePriority(mon: BattlePokemon, move: Move): number {
  return move.priority + (getAbility(mon)?.priority?.(move) ?? 0);
}

interface QueueEntry {
  mon: BattlePokemon;
  action: Action;
  move: Move;
  priority: number;
  tiebreak: number;
  fixed?: 'first' | 'last';
  /** A switch to this team member instead of a move. */
  switchTo?: number;
}

const STATUS_IMMUNITY: Record<MajorStatus, string[]> = {
  brn: ['Fire'], par: ['Electric'], psn: ['Poison', 'Steel'], tox: ['Poison', 'Steel'], slp: [], frz: ['Ice'],
};

const STATUS_INFLICT_TEXT: Record<MajorStatus, string> = {
  brn: 'was burned!',
  par: 'is paralyzed! It may be unable to move!',
  psn: 'was poisoned!',
  tox: 'was badly poisoned!',
  slp: 'fell asleep!',
  frz: 'was frozen solid!',
};

const STATUS_CURE_TEXT: Record<MajorStatus, string> = {
  brn: 'burn', par: 'paralysis', psn: 'poison', tox: 'poison', slp: 'sleep', frz: 'freeze',
};

/** The 40-power typeless physical hit a confused Pokémon deals to itself. */
const CONFUSION_HIT: Move = {
  name: 'Confusion damage', type: 'Normal', category: 'Physical', power: 40, accuracy: null, pp: 1, priority: 0,
  highCrit: false, target: 'self', effects: {},
};

const WEATHER_SPECIALS: Partial<Record<string, Weather>> = { sunnyDay: 'sun', rainDance: 'rain', sandstorm: 'sand', snowscape: 'snow' };
const TERRAIN_SPECIALS: Partial<Record<string, Terrain>> = {
  electricTerrain: 'electric', grassyTerrain: 'grassy', psychicTerrain: 'psychic', mistyTerrain: 'misty',
};

const PROTECT_MOVES = new Set(['protect', 'wideGuard', 'quickGuard']);

/** Effects handled by the generic move code (so a special move with any of these still runs it). */
function hasExtraEffects(e: MoveEffects): boolean {
  return !!(e.status || e.targetBoosts || e.selfBoosts || e.heal || e.confuse || e.healBlock || e.typeChange
    || e.targetAbility || e.hazard || e.clearHazards || e.selfSwitch || e.forceSwitch);
}

/** What Baton Pass hands to the incoming Pokémon. */
interface Passed {
  boosts: Boosts;
  substituteHp: number;
  confusion: number;
  leechSeed: BattlePokemon['leechSeed'];
  perishCount: number;
}

const HAZARD_SET_TEXT: Record<Hazard, string> = {
  stealthRock: 'Pointed stones float in the air around',
  spikes: 'Spikes were scattered on the ground all around',
  toxicSpikes: 'Poison spikes were scattered on the ground all around',
  stickyWeb: 'A sticky web has been laid out on the ground around',
};

const ROOM_TEXT = {
  trickRoom: ['twisted the dimensions!', 'The twisted dimensions returned to normal!'],
  wonderRoom: ['created a bizarre area in which Defense and Sp. Def stats are swapped!', 'Wonder Room wore off, and Defense and Sp. Def stats returned to normal!'],
  magicRoom: ['created a bizarre area in which Pokémon’s held items lose their effects!', 'Magic Room wore off, and held items’ effects returned to normal!'],
} as const;
type Room = keyof typeof ROOM_TEXT;
const SPREAD_TARGETS = new Set(['adjacentFoes', 'allAdjacent']);

function chanceHit(chance: number, rng: Rng): boolean {
  return chance >= 100 || rng.next() * 100 < chance;
}

function pct(n: number, max: number): string {
  return `${Math.round((n / max) * 1000) / 10}%`;
}

class TurnRunner {
  queue: QueueEntry[] = [];

  constructor(private s: BattleState, private rng: Rng) {}

  get doubles() {
    return this.s.format === 'doubles';
  }

  log(kind: LogKind, text: string, side?: Side, breakdown?: DamageBreakdown) {
    this.s.log.push({ turn: this.s.turn, kind, text, side, breakdown });
  }

  /** "Player 1", or the Pokémon's name in a singles battle with one Pokémon per side. */
  playerName(side: Side) {
    return oneOnOne(this.s) ? this.s.sides[side].team[0].name : `Player ${side + 1}`;
  }

  teamName(side: Side) {
    return oneOnOne(this.s) ? this.s.sides[side].team[0].name : `Player ${side + 1}'s team`;
  }

  isActive(mon: BattlePokemon) {
    return isActive(this.s, mon);
  }

  ally(mon: BattlePokemon) {
    return allyOf(this.s, mon);
  }

  speedOrder(mons: BattlePokemon[]): BattlePokemon[] {
    return [...mons].sort((a, b) => effectiveSpeed(this.s, b) - effectiveSpeed(this.s, a));
  }

  // ---------- Start of battle ----------

  startOfBattle() {
    for (const mon of this.speedOrder(allMons(this.s))) this.onEntry(mon);
  }

  /** Abilities that act when a Pokémon enters the field (or gains the ability). */
  onEntry(mon: BattlePokemon) {
    if (!isAlive(mon)) return;
    const ab = getAbility(mon);
    if (ab?.onStartWeather) {
      this.log('info', `${mon.name}'s ${abilityName(mon)}!`, mon.side);
      this.setWeather(mon, ab.onStartWeather);
    }
    if (ab?.onStartTerrain) {
      this.log('info', `${mon.name}'s ${abilityName(mon)}!`, mon.side);
      this.setTerrain(mon, ab.onStartTerrain);
    }
    if (ab?.negatesWeather && this.s.weather) {
      this.log('info', `${mon.name}'s ${abilityName(mon)}: the effects of the weather disappeared.`, mon.side);
    }
    if (!ab?.onStartFoeBoosts) return;
    this.log('info', `${mon.name}'s ${abilityName(mon)}!`, mon.side);
    for (const foe of foesOf(this.s, mon)) {
      const fAb = defenderAbility(foe, mon);
      if (fAb?.innerFocus || fAb?.ownTempo) {
        this.log('info', `${foe.name}'s ${abilityName(foe)} kept it from being affected!`, foe.side);
        continue;
      }
      this.applyBoosts(foe, ab.onStartFoeBoosts, mon);
    }
  }

  // ---------- Switching ----------

  /** Healthy bench Pokémon on a side (team indices). */
  bench(side: Side) {
    return benchOptions(this.s, side);
  }

  /** Clears everything a Pokémon loses when it leaves the field. Returns what Baton Pass would hand over. */
  withdraw(mon: BattlePokemon): Passed {
    const passed: Passed = {
      boosts: { ...mon.boosts }, substituteHp: mon.substituteHp, confusion: mon.confusion,
      leechSeed: mon.leechSeed, perishCount: mon.perishCount,
    };
    Object.assign(mon, {
      boosts: { ...ZERO_BOOSTS }, confusion: 0, taunt: 0, encore: null, substituteHp: 0, leechSeed: null, disable: null,
      torment: false, yawn: 0, perishCount: 0, lastAction: null, choiceLock: null, protectStreak: 0, flashFire: false,
      turnsActive: 0, toxicCounter: 0, healBlock: 0, ability: mon.build.ability, customAbility: mon.build.customAbility,
      types: buildTypes(mon.build), addedType: null, vol: freshVolatiles(),
    });
    return passed;
  }

  /**
   * Sends team member `index` into field position `slot`. The previous occupant must already be withdrawn
   * (or fainted). `midTurn` entrants can't use Fake Out on the following turn's... they get a fresh first turn.
   */
  switchIn(side: Side, slot: number, index: number, opts: { passed?: Passed; midTurn?: boolean } = {}) {
    const s = this.s.sides[side];
    const mon = s.team[index];
    s.mons[slot] = mon;
    mon.vol = freshVolatiles();
    mon.vol.moved = true;
    mon.itemsSuppressed = this.s.magicRoom > 0;
    // The end of this turn counts it as active for a turn; it should still get its "first turn" next turn.
    mon.turnsActive = opts.midTurn ? -1 : 0;
    this.log('switch', `Player ${side + 1} sent out ${mon.name}!`, side);
    if (opts.passed) {
      const p = opts.passed;
      Object.assign(mon, { boosts: p.boosts, substituteHp: p.substituteHp, confusion: p.confusion, leechSeed: p.leechSeed, perishCount: p.perishCount });
      this.log('info', `${mon.name} received what was passed to it!`, side);
    }
    this.entryHazards(mon);
    this.onEntry(mon);
  }

  /** Withdraws `mon` and sends in team member `index` in its place. */
  replace(mon: BattlePokemon, index: number, opts: { batonPass?: boolean; midTurn?: boolean; text?: string } = {}) {
    const slot = slotOf(this.s, mon);
    const passed = this.withdraw(mon);
    this.log('switch', opts.text ?? `Player ${mon.side + 1} withdrew ${mon.name}!`, mon.side);
    this.switchIn(mon.side, slot, index, { passed: opts.batonPass ? passed : undefined, midTurn: opts.midTurn });
  }

  /** A switch chosen as the turn's action. */
  doSwitchAction(entry: QueueEntry) {
    const mon = entry.mon;
    if (!isAlive(mon) || !this.isActive(mon) || entry.switchTo === undefined) return;
    mon.vol.moved = true;
    if (!this.bench(mon.side).includes(entry.switchTo)) {
      this.log('info', `${mon.name} couldn't switch out (that Pokémon isn't available).`, mon.side);
      return;
    }
    this.replace(mon, entry.switchTo, { midTurn: true });
  }

  /** U-turn, Volt Switch, Baton Pass...: the user leaves and `preferred` (or the first healthy bench Pokémon) comes in. */
  pivot(user: BattlePokemon, preferred: number | undefined, batonPass: boolean) {
    const options = this.bench(user.side);
    if (!options.length) return;
    const index = preferred !== undefined && options.includes(preferred) ? preferred : options[0];
    this.replace(user, index, { batonPass, midTurn: true, text: `${user.name} went back to ${this.playerName(user.side)}!` });
  }

  /** Roar, Dragon Tail: the target is replaced by a random bench Pokémon. Returns false if nothing could come in. */
  dragOut(t: BattlePokemon, announceFail: boolean): boolean {
    const options = this.isActive(t) && isAlive(t) ? this.bench(t.side) : [];
    if (!options.length) {
      if (announceFail) this.fail();
      return false;
    }
    const index = options[Math.floor(this.rng.next() * options.length)];
    this.replace(t, index, { midTurn: true, text: `${t.name} was dragged out!` });
    return true;
  }

  entryHazards(mon: BattlePokemon) {
    const h = this.s.sides[mon.side].hazards;
    if (!HAZARDS.some((k) => h[k] > 0) || getItem(mon)?.hazardImmune) return;
    const magicGuard = !!getAbility(mon)?.magicGuard;
    if (h.stealthRock && !magicGuard) {
      const eff = typesOf(mon).reduce((m, t) => m * typeMultiplier('Rock', t), 1);
      this.hurt(mon, Math.max(1, Math.floor((mon.stats.hp * eff) / 8)), 'was hurt by the pointed stones');
    }
    if (!isGrounded(mon) || !isAlive(mon)) return;
    if (h.spikes && !magicGuard) {
      const frac = [0, 1 / 8, 1 / 6, 1 / 4][h.spikes];
      this.hurt(mon, Math.max(1, Math.floor(mon.stats.hp * frac)), 'was hurt by the spikes');
    }
    if (h.toxicSpikes && isAlive(mon)) {
      if (typesOf(mon).includes('Poison')) {
        h.toxicSpikes = 0;
        this.log('field', `${mon.name} absorbed the poison spikes!`, mon.side);
      } else {
        const status = h.toxicSpikes >= 2 ? 'tox' : 'psn';
        if (this.canInflict(mon, status, null)) this.inflict(mon, status);
      }
    }
    if (h.stickyWeb && isAlive(mon)) {
      this.log('info', `${mon.name} was caught in a sticky web!`, mon.side);
      this.applyBoosts(mon, { spe: -1 }, foesOf(this.s, mon)[0] ?? null);
    }
  }

  layHazard(user: BattlePokemon, hazard: Hazard, announceFail: boolean) {
    const foeSide: Side = user.side === 0 ? 1 : 0;
    const h = this.s.sides[foeSide].hazards;
    if (h[hazard] >= HAZARD_MAX[hazard]) {
      if (announceFail) this.fail();
      return;
    }
    h[hazard]++;
    this.log('field', `${HAZARD_SET_TEXT[hazard]} ${this.teamName(foeSide)}!`, foeSide);
  }

  /** Rapid Spin ('own') or Defog ('both'). Defog also removes the foes' screens. */
  clearHazards(user: BattlePokemon, scope: 'own' | 'both') {
    const sides: Side[] = scope === 'both' ? [user.side, user.side === 0 ? 1 : 0] : [user.side];
    for (const side of sides) {
      const st = this.s.sides[side];
      for (const k of HAZARDS) {
        if (!st.hazards[k]) continue;
        st.hazards[k] = 0;
        this.log('field', `${user.name} removed ${HAZARD_LABELS[k]} from ${this.teamName(side)}'s side!`, user.side);
      }
      if (scope === 'both' && side !== user.side) {
        if (st.reflect) this.log('field', `${this.teamName(side)}'s Reflect was blown away!`, side);
        if (st.lightScreen) this.log('field', `${this.teamName(side)}'s Light Screen was blown away!`, side);
        st.reflect = 0;
        st.lightScreen = 0;
      }
    }
    if (scope === 'own' && user.leechSeed) {
      user.leechSeed = null;
      this.log('info', `${user.name} was freed from Leech Seed!`, user.side);
    }
  }

  // ---------- Types and abilities ----------

  changeType(t: BattlePokemon, change: NonNullable<MoveEffects['typeChange']>): boolean {
    const types = [...new Set(change.types)].slice(0, 2);
    if (!types.length || !isAlive(t)) return false;
    if (change.mode === 'add') {
      if (typesOf(t).includes(types[0])) return this.fail(), false;
      t.addedType = types[0];
      this.log('status', `${types[0]} type was added to ${t.name}!`, t.side);
      return true;
    }
    const current = typesOf(t);
    if (current.length === types.length && types.every((x) => current.includes(x))) return this.fail(), false;
    t.types = types;
    t.addedType = null;
    this.log('status', `${t.name} transformed into the ${types.join('/')} type!`, t.side);
    return true;
  }

  changeAbility(user: BattlePokemon, t: BattlePokemon, spec: NonNullable<MoveEffects['targetAbility']>): boolean {
    const key = (ability: string, custom?: CustomAbility) => (ability === CUSTOM_ABILITY ? `${ability}:${JSON.stringify(custom)}` : ability);
    if (spec.ability === SWAP_ABILITIES) {
      if (t === user || key(t.ability, t.customAbility) === key(user.ability, user.customAbility)) return this.fail(), false;
      const mine = { ability: user.ability, customAbility: user.customAbility };
      user.ability = t.ability;
      user.customAbility = t.customAbility;
      t.ability = mine.ability;
      t.customAbility = mine.customAbility;
      user.flashFire = false;
      t.flashFire = false;
      this.log('status', `${user.name} swapped Abilities with ${t.name}!`, user.side);
      if (user.ability) this.log('info', `${user.name} acquired ${abilityName(user)}!`, user.side);
      if (t.ability) this.log('info', `${t.name} acquired ${abilityName(t)}!`, t.side);
      this.abilityGained(user);
      this.abilityGained(t);
      return true;
    }
    const next = spec.ability === COPY_USER_ABILITY
      ? { ability: user.ability, customAbility: user.customAbility }
      : { ability: spec.ability, customAbility: spec.customAbility };
    if (key(t.ability, t.customAbility) === key(next.ability, next.customAbility)) return this.fail(), false;
    t.ability = next.ability;
    t.customAbility = next.ability === CUSTOM_ABILITY && next.customAbility ? structuredClone(next.customAbility) : undefined;
    t.flashFire = false;
    if (!t.ability) this.log('status', `${t.name}'s Ability was suppressed!`, t.side);
    else this.log('status', `${t.name} acquired ${abilityName(t)}!`, t.side);
    this.abilityGained(t);
    return true;
  }

  /** A new ability cures conditions it prevents and triggers its entry effects. */
  abilityGained(mon: BattlePokemon) {
    const ab = getAbility(mon);
    if (mon.status && ab?.statusImmune?.includes(mon.status)) {
      this.log('heal', `${mon.name}'s ${abilityName(mon)} cured its ${STATUS_CURE_TEXT[mon.status]}!`, mon.side);
      mon.status = null;
    }
    if (mon.confusion && ab?.ownTempo) {
      mon.confusion = 0;
      this.log('heal', `${mon.name}'s ${abilityName(mon)} snapped it out of its confusion!`, mon.side);
    }
    this.onEntry(mon);
  }

  // ---------- Rooms ----------

  toggleRoom(user: BattlePokemon, room: Room): boolean {
    if (this.s[room] > 0) {
      this.s[room] = 0;
      this.log('field', ROOM_TEXT[room][1]);
    } else {
      this.s[room] = 5;
      this.log('field', `${user.name} ${ROOM_TEXT[room][0]}`, user.side);
    }
    if (room === 'magicRoom') this.syncItems();
    return true;
  }

  /** Magic Room switches every held item's effects off (or back on). */
  syncItems() {
    for (const side of this.s.sides) for (const m of side.team) m.itemsSuppressed = this.s.magicRoom > 0;
  }

  // ---------- Field ----------

  get weather() {
    return activeWeather(this.s);
  }

  /** Returns false if that weather is already active. */
  setWeather(source: BattlePokemon, weather: Weather): boolean {
    if (this.s.weather === weather && this.s.weatherTurns !== -1) return false;
    this.s.weather = weather;
    this.s.weatherTurns = getItem(source)?.extendsWeather === weather ? 8 : 5;
    const text: Record<Weather, string> = {
      sun: 'The sunlight turned harsh!', rain: 'It started to rain!', sand: 'A sandstorm kicked up!', snow: 'It started to snow!',
    };
    this.log('field', text[weather], source.side);
    return true;
  }

  setTerrain(source: BattlePokemon, terrain: Terrain): boolean {
    if (this.s.terrain === terrain && this.s.terrainTurns !== -1) return false;
    this.s.terrain = terrain;
    this.s.terrainTurns = getItem(source)?.extendsTerrain ? 8 : 5;
    this.log('field', `${TERRAIN_LABELS[terrain]} covered the battlefield!`, source.side);
    return true;
  }

  // ---------- Status, stats, HP ----------

  canInflict(mon: BattlePokemon, status: MajorStatus, source: BattlePokemon | null): boolean {
    if (mon.status !== null || mon.currentHp <= 0) return false;
    if (typesOf(mon).some((t) => STATUS_IMMUNITY[status].includes(t))) return false;
    const ab = source ? defenderAbility(mon, source) : getAbility(mon);
    if (ab?.statusImmune?.includes(status)) return false;
    if (ab?.leafGuard && this.weather === 'sun') return false;
    if (status === 'frz' && this.weather === 'sun') return false;
    if (isGrounded(mon) && this.s.terrain === 'misty') return false;
    if (status === 'slp' && isGrounded(mon) && this.s.terrain === 'electric') return false;
    return true;
  }

  inflict(mon: BattlePokemon, status: MajorStatus) {
    mon.status = status;
    if (status === 'slp') mon.sleepTurns = 1 + Math.floor(this.rng.next() * 3);
    if (status === 'tox') mon.toxicCounter = 0;
    this.log('status', `${mon.name} ${STATUS_INFLICT_TEXT[status]}`, mon.side);
    this.checkLum(mon);
  }

  /** Confuse a Pokémon. `announceFail` logs why it didn't work (for status moves). */
  confuse(mon: BattlePokemon, source: BattlePokemon | null, announceFail: boolean) {
    if (!isAlive(mon)) return;
    const ab = source ? defenderAbility(mon, source) : getAbility(mon);
    if (mon.confusion > 0) {
      if (announceFail) this.log('info', `${mon.name} is already confused!`, mon.side);
      return;
    }
    if (ab?.ownTempo || (isGrounded(mon) && this.s.terrain === 'misty')) {
      if (announceFail) this.fail();
      return;
    }
    mon.confusion = 2 + Math.floor(this.rng.next() * 4);
    this.log('status', `${mon.name} became confused!`, mon.side);
    this.checkLum(mon);
  }

  checkLum(mon: BattlePokemon) {
    if (!getItem(mon)?.lum || (!mon.status && !mon.confusion)) return;
    const what = mon.status ? STATUS_CURE_TEXT[mon.status] : 'confusion';
    mon.status = null;
    mon.confusion = 0;
    mon.item = '';
    this.log('heal', `${mon.name}'s Lum Berry cured its ${what}!`, mon.side);
  }

  /** Sitrus / Oran Berry: heal at half HP or less. */
  checkPinchBerry(mon: BattlePokemon) {
    const item = getItem(mon);
    if (!item?.pinchHeal || !isAlive(mon) || mon.currentHp > mon.stats.hp / 2) return;
    const amount = item.pinchHeal.flat ? item.pinchHeal.amount : Math.floor(mon.stats.hp * item.pinchHeal.amount);
    const name = mon.item;
    mon.item = '';
    this.heal(mon, amount, `restored HP with its ${name}`);
  }

  /** Apply stat-stage changes. `source` is the Pokémon causing them (null for self-inflicted). */
  applyBoosts(target: BattlePokemon, boosts: Partial<Boosts>, source: BattlePokemon | null) {
    if (target.currentHp <= 0) return;
    const ab = source && source !== target ? defenderAbility(target, source) : getAbility(target);
    const byFoe = !!source && source.side !== target.side;
    let droppedByFoe = false;
    for (const [key, raw] of Object.entries(boosts) as [BoostableStat, number][]) {
      if (!raw) continue;
      let delta = ab?.contrary ? -raw : raw;
      if (ab?.simple) delta *= 2;
      const label = `${target.name}'s ${BOOST_LABELS[key]}`;
      if (delta < 0 && byFoe && ab?.clearBody) {
        this.log('boost', `${target.name}'s ${abilityName(target)} prevents its stats from being lowered!`, target.side);
        continue;
      }
      const before = target.boosts[key];
      const after = clampStage(before + delta);
      if (after === before) {
        this.log('boost', `${label} won't go any ${delta > 0 ? 'higher' : 'lower'}!`, target.side);
        continue;
      }
      target.boosts[key] = after;
      const change = after - before;
      const mag = Math.abs(change);
      const word = change > 0
        ? mag === 1 ? 'rose!' : mag === 2 ? 'rose sharply!' : 'rose drastically!'
        : mag === 1 ? 'fell!' : mag === 2 ? 'harshly fell!' : 'severely fell!';
      this.log('boost', `${label} ${word} (${after > 0 ? '+' : ''}${after})`, target.side);
      if (change < 0 && byFoe) droppedByFoe = true;
    }
    if (droppedByFoe && ab?.onStatDroppedByFoe) {
      this.log('info', `${target.name}'s ${abilityName(target)}!`, target.side);
      this.applyBoosts(target, ab.onStatDroppedByFoe, null);
    }
  }

  /** Restores HP (nothing happens under Heal Block). */
  heal(mon: BattlePokemon, amount: number, reason: string) {
    if (mon.healBlock > 0) return;
    const healed = Math.min(amount, mon.stats.hp - mon.currentHp);
    if (healed <= 0) return;
    mon.currentHp += healed;
    this.log('heal', `${mon.name} ${reason} (+${healed} HP).`, mon.side);
  }

  hurt(mon: BattlePokemon, amount: number, reason: string) {
    const lost = Math.min(amount, mon.currentHp);
    if (lost <= 0) return;
    mon.currentHp -= lost;
    this.log('damage', `${mon.name} ${reason} (-${lost} HP, ${pct(lost, mon.stats.hp)}).`, mon.side);
    this.checkPinchBerry(mon);
  }

  // ---------- Turn order ----------

  sortQueue() {
    const tr = this.s.trickRoom > 0;
    const speeds = new Map(this.queue.map((e) => [e, effectiveSpeed(this.s, e.mon)]));
    const rest = this.queue.filter((e) => !e.fixed).sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      const sa = speeds.get(a)!;
      const sb = speeds.get(b)!;
      if (sa !== sb) return tr ? sa - sb : sb - sa;
      return a.tiebreak - b.tiebreak;
    });
    this.queue = [
      ...this.queue.filter((e) => e.fixed === 'first'),
      ...rest,
      ...this.queue.filter((e) => e.fixed === 'last'),
    ];
  }

  buildQueue(choices: TurnChoices) {
    this.queue = [];
    for (const mon of allMons(this.s)) {
      if (!isAlive(mon)) continue;
      let action = choices[mon.uid];
      if (action?.switchTo !== undefined && this.bench(mon.side).includes(action.switchTo)) {
        this.queue.push({ mon, action, move: STRUGGLE, priority: SWITCH_PRIORITY, tiebreak: this.rng.next(), switchTo: action.switchTo });
        continue;
      }
      const allowed = availableChoices(mon);
      if (!action || !allowed.includes(action.move)) action = { move: allowed[0], target: action?.target, pivotTo: action?.pivotTo };
      const move = getChoiceMove(mon, action.move);
      this.queue.push({ mon, action, move, priority: movePriority(mon, move), tiebreak: this.rng.next() });
    }
    this.sortQueue();
  }

  orderReason(): string {
    const q = this.queue;
    const tr = this.s.trickRoom > 0;
    const spe = (m: BattlePokemon) => effectiveSpeed(this.s, m);
    const switching = (e: QueueEntry) => e.switchTo !== undefined;
    if (q.length === 2) {
      const [a, b] = q;
      if (switching(a) && !switching(b)) return `${a.mon.name} switches out first (switching happens before moves).`;
      if (a.priority !== b.priority) {
        return `${a.mon.name} moves first (priority ${a.priority > 0 ? '+' : ''}${a.priority}).`;
      }
      const speeds = `Speed ${a.mon.name} ${spe(a.mon)} vs. ${b.mon.name} ${spe(b.mon)}`;
      if (spe(a.mon) === spe(b.mon)) return `Speed tie at ${spe(a.mon)}! ${a.mon.name} won the coin flip.`;
      return tr ? `${a.mon.name} is slower and moves first under Trick Room (${speeds}).` : `${a.mon.name} is faster (${speeds}).`;
    }
    const parts = q.map((e) => `${e.mon.name} (${switching(e) ? 'switching, ' : e.priority !== 0 ? `priority ${e.priority > 0 ? '+' : ''}${e.priority}, ` : ''}Spe ${spe(e.mon)})`);
    return `Turn order: ${parts.join(' → ')}${tr ? ' (Trick Room: slower first)' : ''}.`;
  }

  // ---------- Running a turn ----------

  runTurn(choices: TurnChoices) {
    for (const mon of allMons(this.s)) mon.vol = freshVolatiles();
    for (const side of this.s.sides) {
      side.wideGuard = false;
      side.quickGuard = false;
    }
    this.buildQueue(choices);
    this.log('order', this.orderReason(), this.queue[0]?.mon.side);
    while (this.queue.length) {
      const entry = this.queue.shift()!;
      if (entry.switchTo !== undefined) this.doSwitchAction(entry);
      else this.executeAction(entry);
      if (this.checkFaints()) return;
      this.sortQueue();
    }
    this.endOfTurn();
    if (!this.checkFaints()) this.computePending();
  }

  /** Marks fainted field positions that a healthy bench Pokémon must fill before the next turn. */
  computePending() {
    this.s.pendingReplacements = [];
    if (this.s.winner !== null) return;
    this.s.sides.forEach((side, i) => {
      let available = this.bench(i as Side).length;
      side.mons.forEach((m, slot) => {
        if (!isAlive(m) && available > 0) {
          this.s.pendingReplacements.push({ side: i as Side, slot });
          available--;
        }
      });
    });
  }

  /** Fills the pending positions with the chosen team members (or the first healthy ones). */
  applyReplacements(picks: Record<string, number>) {
    const pending = this.s.pendingReplacements;
    this.s.pendingReplacements = [];
    for (const ref of pending) {
      const options = this.bench(ref.side);
      if (!options.length) continue;
      const want = picks[replacementKey(ref)];
      const index = want !== undefined && options.includes(want) ? want : options[0];
      this.switchIn(ref.side, ref.slot, index);
      if (this.checkFaints()) return;
    }
    this.computePending();
  }

  /** Returns false if the Pokémon can't act this turn. */
  preMoveCheck(mon: BattlePokemon): boolean {
    if (mon.status === 'slp') {
      if (mon.sleepTurns > 0) {
        mon.sleepTurns--;
        this.log('status', `${mon.name} is fast asleep.`, mon.side);
        return false;
      }
      mon.status = null;
      this.log('status', `${mon.name} woke up!`, mon.side);
    }
    if (mon.status === 'frz') {
      if (this.rng.next() < 0.2) {
        mon.status = null;
        this.log('status', `${mon.name} thawed out!`, mon.side);
      } else {
        this.log('status', `${mon.name} is frozen solid!`, mon.side);
        return false;
      }
    }
    if (mon.confusion > 0) {
      mon.confusion--;
      if (mon.confusion === 0) {
        this.log('status', `${mon.name} snapped out of its confusion!`, mon.side);
      } else {
        this.log('status', `${mon.name} is confused!`, mon.side);
        if (this.rng.next() < 1 / 3) {
          const roll = 85 + Math.floor(this.rng.next() * 16);
          const bd = calcDamage(mon, mon, CONFUSION_HIT, { crit: false, roll, typeless: true });
          const dealt = Math.min(bd.damage, mon.currentHp);
          mon.currentHp -= dealt;
          this.log('damage', `It hurt itself in its confusion! (-${dealt} HP, ${pct(dealt, mon.stats.hp)})`, mon.side, bd);
          this.checkPinchBerry(mon);
          return false;
        }
      }
    }
    if (mon.status === 'par' && this.rng.next() < 0.25) {
      this.log('status', `${mon.name} is fully paralyzed! It can't move!`, mon.side);
      return false;
    }
    return true;
  }

  fail() {
    this.log('info', 'But it failed!');
  }

  executeAction(entry: QueueEntry, instructed = false) {
    const user = entry.mon;
    if (!isAlive(user) || !this.isActive(user)) return;
    user.vol.moved = true;

    // An Encore that started earlier this turn replaces the chosen move.
    const enc = user.encore;
    if (enc && !instructed && entry.action.move !== STRUGGLE_INDEX && entry.action.move !== enc.move && user.pp[enc.move] > 0) {
      const encored = user.build.moves[enc.move];
      if (encored) {
        entry.action = { move: enc.move, target: entry.action.target };
        entry.move = encored;
      }
    }
    const action = entry.action;

    if (user.vol.flinched && !instructed) {
      this.log('status', `${user.name} flinched and couldn't move!`, user.side);
      user.protectStreak = 0;
      return;
    }
    if (!this.preMoveCheck(user)) {
      user.protectStreak = 0;
      return;
    }

    const struggle = action.move === STRUGGLE_INDEX;
    if (!struggle && user.disable?.move === action.move) {
      this.log('info', `${user.name}'s ${entry.move.name} is disabled!`, user.side);
      return;
    }
    if (!struggle && user.torment && user.lastAction?.move === action.move) {
      this.log('info', `${user.name} can't use the same move twice in a row due to the torment!`, user.side);
      return;
    }
    if (!struggle && user.taunt > 0 && entry.move.category === 'Status') {
      this.log('info', `${user.name} can't use ${entry.move.name} after the taunt!`, user.side);
      return;
    }
    if (!struggle && user.healBlock > 0 && isHealingMove(entry.move)) {
      this.log('info', `${user.name} can't use ${entry.move.name} because of Heal Block!`, user.side);
      return;
    }
    if (struggle) {
      this.log('info', `${user.name} has no moves left!`, user.side);
    } else {
      user.pp[action.move] = Math.max(0, user.pp[action.move] - 1);
      if (getItem(user)?.choice && user.choiceLock === null) user.choiceLock = action.move;
      user.lastAction = { move: action.move, target: action.target };
    }
    const move = effectiveMove(this.s, entry.move);
    this.log('move', `${user.name} used ${move.name}!`, user.side);

    const sp = move.special;
    if (!sp || !PROTECT_MOVES.has(sp)) user.protectStreak = 0;
    if (sp === 'fakeOut' && user.turnsActive > 0) return this.fail();

    // Field and self specials. A status move stops here unless it also has generic effects
    // (e.g. a Protect that raises a stat); a damaging move carries on to hit its targets.
    const special = this.fieldSpecial(user, move, sp);
    if (special !== undefined && move.category === 'Status' && (!special || !hasExtraEffects(move.effects))) return;

    const targets = this.resolveTargets(user, move, action);
    if (!targets.length) {
      this.log('info', 'But there was no target...');
      return;
    }

    if (sp === 'spotlight' || sp === 'afterYou' || sp === 'quash' || sp === 'instruct') {
      const t = targets[0];
      if (t === user) return this.fail();
      if (sp === 'spotlight') {
        t.vol.centerOfAttention = 'followMe';
        return this.log('info', `${t.name} became the center of attention!`, t.side);
      }
      if (sp === 'instruct') return this.doInstruct(t);
      const idx = this.queue.findIndex((e) => e.mon === t);
      if (idx < 0) return this.fail();
      const [e] = this.queue.splice(idx, 1);
      if (sp === 'afterYou') {
        e.fixed = 'first';
        this.queue.unshift(e);
        return this.log('info', `${t.name} took the kind offer!`, t.side);
      }
      e.fixed = 'last';
      this.queue.push(e);
      return this.log('info', `${t.name}'s move was postponed!`, t.side);
    }

    const damaging = move.category !== 'Status';
    const spread = damaging && SPREAD_TARGETS.has(move.target) && targets.length > 1;
    const aAb = getAbility(user);
    const sheerForce = !!aAb?.sheerForce && hasSecondary(move);
    let totalDealt = 0;
    let anyHit = false;

    for (const t of targets) {
      if (!isAlive(t)) continue;
      if (t !== user) {
        if (this.blocked(t, move, entry)) continue;
        if (!this.accuracyHit(user, t, move)) {
          this.log('info', `${t.name} avoided the attack!`, t.side);
          continue;
        }
      }
      if (sp === 'pollenPuff' && t.side === user.side) {
        anyHit = true;
        if (t.currentHp >= t.stats.hp) this.log('info', `${t.name}'s HP is full!`, t.side);
        else this.heal(t, Math.floor(t.stats.hp / 2), 'had its HP restored');
        continue;
      }
      if (damaging) {
        const dealt = this.hit(user, t, move, struggle, spread, sheerForce);
        if (dealt !== null) {
          anyHit = true;
          totalDealt += dealt;
        }
      } else if (sp === 'taunt' || sp === 'encore' || sp === 'leechSeed' || sp === 'disable' || sp === 'torment' || sp === 'yawn') {
        if (this.volatileMove(user, t, move, sp)) anyHit = true;
      } else if (this.statusEffect(user, t, move)) {
        anyHit = true;
      }
    }

    const e = move.effects;
    if (damaging && totalDealt > 0 && isAlive(user)) {
      if (e.drain) this.heal(user, Math.max(1, Math.floor((totalDealt * e.drain) / 100)), 'drained energy');
      const bell = getItem(user)?.shellBell;
      if (bell) this.heal(user, Math.max(1, Math.floor(totalDealt * bell)), 'restored HP with its Shell Bell');
      if (struggle) {
        this.hurt(user, Math.max(1, Math.round(user.stats.hp / 4)), 'is damaged by recoil');
      } else if (e.recoil && !aAb?.rockHead && !aAb?.magicGuard) {
        this.hurt(user, Math.max(1, Math.floor((totalDealt * e.recoil) / 100)), 'is damaged by recoil');
      }
      if (isAlive(user) && getItem(user)?.lifeOrb && !aAb?.magicGuard && !sheerForce) {
        this.hurt(user, Math.max(1, Math.floor(user.stats.hp / 10)), 'lost some of its HP to its Life Orb');
      }
    }
    if (anyHit && isAlive(user) && e.selfBoosts) {
      const chance = e.selfBoosts.chance * (aAb?.sereneGrace ? 2 : 1);
      if (chanceHit(chance, this.rng)) this.applyBoosts(user, e.selfBoosts.boosts, null);
    }
    if (anyHit && e.hazard) this.layHazard(user, e.hazard, !damaging);
    if (anyHit && e.clearHazards && isAlive(user)) this.clearHazards(user, e.clearHazards);
    if (anyHit && e.selfSwitch && isAlive(user) && this.isActive(user) && this.s.winner === null) {
      if (!this.bench(user.side).length) {
        if (!damaging && !hasExtraEffects({ ...e, selfSwitch: undefined })) this.fail();
      } else {
        this.pivot(user, action.pivotTo, e.selfSwitch === 'batonPass');
      }
    }
  }

  failed(): false {
    this.fail();
    return false;
  }

  /** Specials that act on the user, its side or the field. Returns undefined if `sp` isn't one, else whether it worked. */
  fieldSpecial(user: BattlePokemon, move: Move, sp: Move['special']): boolean | undefined {
    if (!sp) return undefined;
    const side = this.s.sides[user.side];
    const ally = this.ally(user);
    const weather = WEATHER_SPECIALS[sp];
    if (weather) return this.setWeather(user, weather) || this.failed();
    const terrain = TERRAIN_SPECIALS[sp];
    if (terrain) return this.setTerrain(user, terrain) || this.failed();

    switch (sp) {
      case 'protect':
      case 'wideGuard':
      case 'quickGuard':
        return this.doProtect(user, sp, move);
      case 'followMe':
      case 'ragePowder':
        if (!this.doubles) return this.failed();
        user.vol.centerOfAttention = sp === 'ragePowder' ? 'powder' : 'followMe';
        this.log('info', `${user.name} became the center of attention!`, user.side);
        return true;
      case 'helpingHand':
        if (!isAlive(ally) || ally.vol.moved) return this.failed();
        ally.vol.helpingHand = true;
        this.log('info', `${user.name} is ready to help ${ally.name}!`, user.side);
        return true;
      case 'allySwitch': {
        if (!isAlive(ally)) return this.failed();
        const [a, b] = side.mons;
        side.mons[0] = b;
        side.mons[1] = a;
        this.log('info', `${user.name} and ${ally.name} switched places!`, user.side);
        return true;
      }
      case 'tailwind':
        if (side.tailwind > 0) return this.failed();
        side.tailwind = 4;
        this.log('field', `The Tailwind blew from behind ${this.teamName(user.side)}!`, user.side);
        return true;
      case 'trickRoom':
      case 'wonderRoom':
      case 'magicRoom':
        return this.toggleRoom(user, sp);
      case 'reflect':
      case 'lightScreen': {
        const key = sp;
        if (side[key] > 0) return this.failed();
        side[key] = getItem(user)?.lightClay ? 8 : 5;
        this.log('field', `${sp === 'reflect' ? 'Reflect' : 'Light Screen'} made ${this.teamName(user.side)} stronger against ${sp === 'reflect' ? 'physical' : 'special'} moves!`, user.side);
        return true;
      }
      case 'perishSong': {
        const hearers = allMons(this.s).filter((m) => isAlive(m) && m.perishCount === 0);
        if (!hearers.length) return this.failed();
        this.log('field', 'All Pokémon that hear the song will faint in three turns!', user.side);
        for (const m of hearers) {
          const ab = m === user ? getAbility(m) : defenderAbility(m, user);
          if (ab?.immune?.({ attacker: user, defender: m, move, eff: 1, crit: false, fromAlly: false })) {
            this.log('info', `${m.name}'s ${abilityName(m)} blocks the song!`, m.side);
            continue;
          }
          m.perishCount = 4;
        }
        return true;
      }
      case 'substitute': {
        const cost = Math.floor(user.stats.hp / 4);
        if (user.substituteHp > 0) {
          this.log('info', `${user.name} already has a substitute!`, user.side);
          return false;
        }
        if (user.currentHp <= cost || cost < 1) {
          this.log('info', 'But it does not have enough HP left to make a substitute!', user.side);
          return false;
        }
        user.currentHp -= cost;
        user.substituteHp = cost;
        this.log('info', `${user.name} put in a substitute! (-${cost} HP)`, user.side);
        this.checkPinchBerry(user);
        return true;
      }
    }
    return undefined;
  }

  /** Instruct: the target immediately uses its last move again. */
  doInstruct(t: BattlePokemon) {
    const last = t.lastAction;
    const move = last ? t.build.moves[last.move] : null;
    if (!last || !move || move.special === 'instruct' || t.pp[last.move] <= 0 || !isAlive(t)) return this.fail();
    this.log('info', `${t.name} followed the instructions!`, t.side);
    this.executeAction({ mon: t, action: last, move, priority: movePriority(t, move), tiebreak: 0 }, true);
  }

  doProtect(user: BattlePokemon, kind: 'protect' | 'wideGuard' | 'quickGuard', move: Move): boolean {
    const last = this.queue.length === 0;
    const chance = 1 / 3 ** user.protectStreak;
    if (last || (user.protectStreak > 0 && this.rng.next() >= chance)) {
      user.protectStreak = 0;
      return this.failed();
    }
    user.protectStreak++;
    if (kind === 'protect') {
      const e = move.effects;
      user.vol.protect = { ...(e.protectContact ? { contact: e.protectContact } : {}), ...(e.protectAttacksOnly ? { attacksOnly: true } : {}) };
      this.log('info', `${user.name} protected itself!`, user.side);
      return true;
    }
    this.s.sides[user.side][kind] = true;
    this.log('field', `${kind === 'wideGuard' ? 'Wide Guard' : 'Quick Guard'} protected ${this.teamName(user.side)}!`, user.side);
    return true;
  }

  /** Spiky Shield, Baneful Bunker, Obstruct...: punish a Pokémon that made contact with a protected target. */
  protectContactEffects(user: BattlePokemon, t: BattlePokemon, move: Move) {
    const c = t.vol.protect?.contact;
    if (!c || !move.flags?.includes('contact') || !isAlive(user) || user === t) return;
    if (c.damage && !getAbility(user)?.magicGuard) {
      this.hurt(user, Math.max(1, Math.floor((user.stats.hp * c.damage) / 100)), `was hurt by ${t.name}'s protection`);
    }
    if (c.status && isAlive(user) && this.canInflict(user, c.status, t)) this.inflict(user, c.status);
    if (c.boosts && isAlive(user)) this.applyBoosts(user, c.boosts, t);
  }

  resolveTargets(user: BattlePokemon, move: Move, action: Action): BattlePokemon[] {
    const ally = this.ally(user);
    const foes = foesOf(this.s, user);
    switch (move.target) {
      case 'self':
      case 'allySide':
      case 'field':
        return [user];
      case 'ally':
        return isAlive(ally) ? [ally] : [];
      case 'selfAndAlly':
        return isAlive(ally) ? [user, ally] : [user];
      case 'adjacentFoes':
        return foes;
      case 'allAdjacent':
        return isAlive(ally) ? [...foes, ally] : foes;
      case 'normal': {
        let t: BattlePokemon | undefined = action.target && this.doubles ? monAt(this.s, action.target) : foes[0];
        if (!t || t === user) t = foes[0];
        if (t && t.currentHp <= 0) {
          // A fainted ally target fails; a fainted foe target retargets the other foe.
          if (t.side === user.side) return [];
          t = foes[0];
        }
        if (!t) return [];
        if (t.side !== user.side) {
          const center = foes.find((f) => f.vol.centerOfAttention && !(f.vol.centerOfAttention === 'powder' && typesOf(user).includes('Grass')));
          if (center) return [center];
        }
        const rod = allMons(this.s).find((m) => isAlive(m) && m !== user && m !== t && defenderAbility(m, user)?.redirectType === move.type);
        if (rod && this.doubles) {
          this.log('info', `${rod.name}'s ${abilityName(rod)} took the attack!`, rod.side);
          return [rod];
        }
        return [t];
      }
    }
  }

  blocked(t: BattlePokemon, move: Move, entry: QueueEntry): boolean {
    const user = entry.mon;
    const tSide = this.s.sides[t.side];
    if (move.target === 'ally' || move.target === 'selfAndAlly') return false;
    if (t.vol.protect && !(t.vol.protect.attacksOnly && move.category === 'Status')) {
      this.log('info', `${t.name} protected itself!`, t.side);
      this.protectContactEffects(user, t, move);
      return true;
    }
    if (tSide.wideGuard && SPREAD_TARGETS.has(move.target)) {
      this.log('info', `Wide Guard protected ${t.name}!`, t.side);
      return true;
    }
    if (tSide.quickGuard && entry.priority > 0 && user.side !== t.side) {
      this.log('info', `Quick Guard protected ${t.name}!`, t.side);
      return true;
    }
    if (this.s.terrain === 'psychic' && entry.priority > 0 && user.side !== t.side && isGrounded(t)) {
      this.log('info', `${t.name} is protected by the Psychic Terrain!`, t.side);
      return true;
    }
    return false;
  }

  accuracyHit(user: BattlePokemon, t: BattlePokemon, move: Move): boolean {
    if (move.accuracy === null) return true;
    const aAb = getAbility(user);
    if (aAb?.noGuard || getAbility(t)?.noGuard) return true;
    const w = this.weather;
    let accuracy = move.accuracy;
    if (move.special === 'stormAccuracy') {
      if (w === 'rain') return true;
      if (w === 'sun') accuracy = 50;
    }
    if (move.special === 'snowAccuracy' && w === 'snow') return true;
    const tAb = defenderAbility(t, user);
    const accStage = tAb?.unaware ? 0 : user.boosts.accuracy;
    const evaStage = aAb?.unaware ? 0 : t.boosts.evasion;
    const stage = clampStage(accStage - evaStage);
    const chance = accuracy * accuracyStageMultiplier(stage) * (aAb?.accuracy?.(move) ?? 1) * (tAb?.accuracyAgainst?.(w) ?? 1);
    return this.rng.next() * 100 < chance;
  }

  handleImmunity(t: BattlePokemon, imm: ImmunityResult) {
    const name = `${t.name}'s ${abilityName(t)}`;
    if (imm.flashFire) {
      t.flashFire = true;
      return this.log('info', `${name} raised the power of its Fire-type moves!`, t.side);
    }
    if (imm.heal) {
      this.log('info', `${name} absorbed the attack!`, t.side);
      if (t.currentHp < t.stats.hp) this.heal(t, Math.floor(t.stats.hp * imm.heal), 'restored HP');
      return;
    }
    if (imm.boost) {
      this.log('info', `${name} absorbed the attack!`, t.side);
      return this.applyBoosts(t, imm.boost, null);
    }
    this.log('info', `It doesn't affect ${t.name}... (${abilityName(t)})`, t.side);
  }

  /** Base powers for each hit of the move (one entry for single-hit moves). */
  hitPowers(user: BattlePokemon, move: Move): number[] {
    if (move.special === 'beatUp') {
      const party = this.s.sides[user.side].team.filter((m) => m === user || (isAlive(m) && !m.status));
      return party.map((m) => 5 + Math.floor(m.build.baseStats.atk / 10));
    }
    const range = move.effects.multiHit;
    if (!range) return [move.power];
    const [min, max] = range;
    let hits = min;
    if (getAbility(user)?.skillLink) hits = max;
    else if (min === 2 && max === 5) {
      const r = this.rng.next();
      hits = r < 0.35 ? 2 : r < 0.7 ? 3 : r < 0.85 ? 4 : 5;
    } else if (max > min) hits = min + Math.floor(this.rng.next() * (max - min + 1));
    return Array(hits).fill(move.power);
  }

  /** Effects on a Pokémon that made contact with `t`. */
  contactEffects(user: BattlePokemon, t: BattlePokemon, move: Move) {
    if (!move.flags?.includes('contact') || !isAlive(user)) return;
    const tAb = getAbility(t);
    const uAb = getAbility(user);
    const c = tAb?.onContact;
    if (c?.damage && !uAb?.magicGuard) this.hurt(user, Math.max(1, Math.floor(user.stats.hp * c.damage)), `was hurt by ${t.name}'s ${abilityName(t)}`);
    if (c?.status && isAlive(t) && isAlive(user) && this.canInflict(user, c.status.status, null) && chanceHit(c.status.chance, this.rng)) {
      this.log('info', `${t.name}'s ${abilityName(t)}!`, t.side);
      this.inflict(user, c.status.status);
    }
    const helmet = getItem(t)?.contactDamage;
    if (helmet && isAlive(user) && !uAb?.magicGuard) this.hurt(user, Math.max(1, Math.floor(user.stats.hp * helmet)), `was hurt by ${t.name}'s ${t.item}`);
  }

  /** Apply damage to the target with Sturdy / Focus Sash. Returns HP lost. */
  applyHitDamage(t: BattlePokemon, damage: number, tAb: AbilityDef | null): { dealt: number; endure: string } {
    let dmg = damage;
    let endure = '';
    if (t.currentHp === t.stats.hp && dmg >= t.currentHp) {
      if (tAb?.sturdy) {
        dmg = t.currentHp - 1;
        endure = `${t.name} endured the hit with ${abilityName(t)}!`;
      } else if (getItem(t)?.focusSash) {
        dmg = t.currentHp - 1;
        endure = `${t.name} hung on using its Focus Sash!`;
        t.item = '';
      }
    }
    const dealt = Math.min(dmg, t.currentHp);
    t.currentHp -= dealt;
    return { dealt, endure };
  }

  /** Runs a damaging move against one target. Returns damage dealt, or null if it had no effect. */
  hit(user: BattlePokemon, t: BattlePokemon, move: Move, typeless: boolean, spread: boolean, sheerForce: boolean): number | null {
    const eff = typeEffectiveness(user, t, move, typeless);
    const tAb = defenderAbility(t, user);
    const aAb = getAbility(user);
    const field = fieldDamageOpts(this.s);
    const imm = tAb?.immune?.({ attacker: user, defender: t, move, eff, crit: false, fromAlly: t.side === user.side, ...field });
    if (imm) {
      this.handleImmunity(t, imm);
      return null;
    }
    if (eff === 0) {
      this.log('info', `It doesn't affect ${t.name}...`, t.side);
      return null;
    }
    const on = spread ? ` on ${t.name}` : '';

    // Sound moves and Infiltrator go around a Substitute.
    const subBlocks = () => t.substituteHp > 0 && t !== user && !move.flags?.includes('sound') && !aAb?.infiltrator;
    const hitSubstitute = (amount: number, bd?: DamageBreakdown) => {
      const taken = Math.min(amount, t.substituteHp);
      t.substituteHp -= taken;
      this.log('damage', `The substitute took damage for ${t.name}! (${taken} HP)`, t.side, bd);
      if (t.substituteHp === 0) this.log('info', `${t.name}'s substitute faded!`, t.side);
      return taken;
    };

    // Fixed-damage moves skip the formula entirely.
    const fixed = move.effects.fixedDamage;
    if (fixed !== undefined) {
      const amount = fixed === 'level' ? user.build.level : fixed === 'halfHp' ? Math.max(1, Math.floor(t.currentHp / 2)) : fixed;
      if (subBlocks()) return hitSubstitute(amount);
      const { dealt, endure } = this.applyHitDamage(t, amount, tAb);
      this.log('damage', `${t.name} lost ${dealt} HP (${pct(dealt, t.stats.hp)}).`, t.side);
      if (endure) this.log('info', endure, t.side);
      this.contactEffects(user, t, move);
      this.checkPinchBerry(t);
      return dealt;
    }

    const powers = this.hitPowers(user, move);
    const tSide = this.s.sides[t.side];
    const screen = !aAb?.infiltrator && (move.category === 'Physical' ? tSide.reflect > 0 : tSide.lightScreen > 0);
    let total = 0;
    let hits = 0;
    let hitSub = false;
    for (const power of powers) {
      if (!isAlive(t) || !isAlive(user)) break;
      const m = power === move.power ? move : { ...move, power };
      const critStage = Math.min(3, (m.highCrit ? 1 : 0) + (aAb?.critStage ?? 0));
      const crit = this.rng.next() < CRIT_CHANCES[critStage] && !tAb?.critImmune;
      const roll = 85 + Math.floor(this.rng.next() * 16);
      const onSub = subBlocks();
      // A Substitute doesn't use the Pokémon's held item.
      const defender = onSub ? { ...t, item: '' } : t;
      const bd = calcDamage(user, defender, m, {
        crit, roll, typeless, spread, helpingHand: user.vol.helpingHand, screen, ...field,
        attackerAlly: this.ally(user), defenderAlly: this.ally(t),
      });
      if (onSub) {
        hits++;
        hitSub = true;
        if (crit) this.log('info', `A critical hit${on}!`, user.side);
        if (hits === 1 && eff > 1) this.log('info', `It's super effective${on}!`, user.side);
        if (hits === 1 && eff < 1) this.log('info', `It's not very effective${on}...`, user.side);
        total += hitSubstitute(bd.damage, bd);
        continue;
      }
      if (bd.resistBerry) {
        this.log('info', `${t.name}'s ${t.item} weakened the damage!`, t.side);
        t.item = '';
      }
      const { dealt, endure } = this.applyHitDamage(t, bd.damage, tAb);
      total += dealt;
      hits++;
      if (crit) this.log('info', `A critical hit${on}!`, user.side);
      if (hits === 1 && eff > 1) this.log('info', `It's super effective${on}!`, user.side);
      if (hits === 1 && eff < 1) this.log('info', `It's not very effective${on}...`, user.side);
      this.log('damage', `${t.name} lost ${dealt} HP (${pct(dealt, t.stats.hp)}).`, t.side, bd);
      if (endure) this.log('info', endure, t.side);
      this.contactEffects(user, t, move);
      this.checkPinchBerry(t);
    }
    if (powers.length > 1) this.log('info', `Hit ${hits} time${hits === 1 ? '' : 's'}!`, user.side);

    if (t.currentHp > 0 && t.status === 'frz' && move.type === 'Fire') {
      t.status = null;
      this.log('status', `${t.name} thawed out!`, t.side);
    }

    if (t.currentHp > 0 && !sheerForce && !hitSub) {
      const e = move.effects;
      const mult = aAb?.sereneGrace ? 2 : 1;
      if (e.status && this.canInflict(t, e.status.status, user) && chanceHit(e.status.chance * mult, this.rng)) {
        this.inflict(t, e.status.status);
      }
      if (e.targetBoosts && chanceHit(e.targetBoosts.chance * mult, this.rng)) {
        this.applyBoosts(t, e.targetBoosts.boosts, user);
      }
      if (e.confuse && chanceHit(e.confuse * mult, this.rng)) this.confuse(t, user, false);
      if (e.flinch && !t.vol.moved && !tAb?.innerFocus && chanceHit(e.flinch * mult, this.rng)) {
        t.vol.flinched = true;
      }
      if (e.healBlock && t.healBlock === 0) {
        t.healBlock = e.healBlock;
        this.log('status', `${t.name} was prevented from healing!`, t.side);
      }
    }
    if (t.currentHp > 0 && !hitSub && isAlive(user)) {
      const e = move.effects;
      if (e.typeChange) this.changeType(t, e.typeChange);
      if (e.targetAbility) this.changeAbility(user, t, e.targetAbility);
      if (e.forceSwitch) this.dragOut(t, false);
    }
    return total;
  }

  /** Runs a status move against one target. Returns true if it took effect. */
  /** Checks shared by status moves aimed at another Pokémon. Returns true (and logs why) if the move is stopped. */
  statusMoveStopped(user: BattlePokemon, t: BattlePokemon, move: Move, bypassSub: boolean): boolean {
    if (t === user) return false;
    if (getAbility(user)?.prankster && t.side !== user.side && typesOf(t).includes('Dark')) {
      this.log('info', `It doesn't affect ${t.name}...`, t.side);
      return true;
    }
    if (move.effects.status && typeEffectiveness(user, t, move) === 0) {
      this.log('info', `It doesn't affect ${t.name}...`, t.side);
      return true;
    }
    const imm = defenderAbility(t, user)?.immune?.({ attacker: user, defender: t, move, eff: 1, crit: false, fromAlly: t.side === user.side, ...fieldDamageOpts(this.s) });
    if (imm) {
      this.handleImmunity(t, imm);
      return true;
    }
    const allyMove = move.target === 'ally' || move.target === 'selfAndAlly';
    if (t.substituteHp > 0 && !bypassSub && !allyMove && !move.flags?.includes('sound') && !getAbility(user)?.infiltrator) {
      this.fail();
      return true;
    }
    return false;
  }

  /** Taunt, Encore, Leech Seed, Disable, Torment and Yawn. Returns true if it took effect. */
  volatileMove(user: BattlePokemon, t: BattlePokemon, move: Move, sp: 'taunt' | 'encore' | 'leechSeed' | 'disable' | 'torment' | 'yawn'): boolean {
    // Taunt, Encore, Disable and Torment go through a Substitute; Leech Seed and Yawn don't.
    if (this.statusMoveStopped(user, t, move, sp !== 'leechSeed' && sp !== 'yawn')) return false;
    if (sp === 'disable') {
      const last = t.lastAction;
      const lastMove = last ? t.build.moves[last.move] : null;
      if (t.disable || !last || !lastMove || t.pp[last.move] <= 0) return this.fail(), false;
      // Blocks 4 of the target's turns: this one if it hasn't moved yet, otherwise the next 4.
      t.disable = { move: last.move, turns: t.vol.moved ? 5 : 4 };
      this.log('status', `${t.name}'s ${lastMove.name} was disabled!`, t.side);
      return true;
    }
    if (sp === 'torment') {
      if (t.torment) return this.fail(), false;
      t.torment = true;
      this.log('status', `${t.name} was subjected to torment!`, t.side);
      return true;
    }
    if (sp === 'yawn') {
      if (t.status || t.yawn > 0 || !this.canInflict(t, 'slp', user)) return this.fail(), false;
      t.yawn = 2;
      this.log('status', `${t.name} grew drowsy!`, t.side);
      return true;
    }
    // Effects that last "3 turns" get an extra turn if the target has already moved this turn.
    const turns = t.vol.moved ? 4 : 3;
    if (sp === 'taunt') {
      if (t.taunt > 0) return this.fail(), false;
      t.taunt = turns;
      this.log('status', `${t.name} fell for the taunt!`, t.side);
      return true;
    }
    if (sp === 'encore') {
      const last = t.lastAction;
      const lastMove = last ? t.build.moves[last.move] : null;
      if (t.encore || !last || !lastMove || lastMove.special === 'encore' || t.pp[last.move] <= 0) return this.fail(), false;
      t.encore = { move: last.move, turns };
      this.log('status', `${t.name} must do an encore of ${lastMove.name}!`, t.side);
      return true;
    }
    if (typesOf(t).includes('Grass')) {
      this.log('info', `It doesn't affect ${t.name}...`, t.side);
      return false;
    }
    if (t.leechSeed) return this.fail(), false;
    t.leechSeed = { side: user.side, slot: slotOf(this.s, user) };
    this.log('status', `${t.name} was seeded!`, t.side);
    return true;
  }

  statusEffect(user: BattlePokemon, t: BattlePokemon, move: Move): boolean {
    const e = move.effects;
    if (this.statusMoveStopped(user, t, move, false)) return false;
    let acted = false;
    if (e.status) {
      if (!this.canInflict(t, e.status.status, user)) this.fail();
      else if (chanceHit(e.status.chance, this.rng)) this.inflict(t, e.status.status);
      acted = true;
    }
    if (e.heal) {
      if (t.healBlock > 0) this.log('info', `${t.name} can't restore HP because of Heal Block!`, t.side);
      else if (t.currentHp >= t.stats.hp) this.log('info', `${t.name}'s HP is full!`, t.side);
      else this.heal(t, Math.floor((t.stats.hp * e.heal) / 100), 'restored HP');
      acted = true;
    }
    if (e.targetBoosts && chanceHit(e.targetBoosts.chance, this.rng)) {
      this.applyBoosts(t, e.targetBoosts.boosts, t === user ? null : user);
      acted = true;
    }
    if (e.confuse) {
      if (chanceHit(e.confuse, this.rng)) this.confuse(t, t === user ? null : user, true);
      acted = true;
    }
    if (e.healBlock) {
      if (t.healBlock > 0) this.fail();
      else {
        t.healBlock = e.healBlock;
        this.log('status', `${t.name} was prevented from healing!`, t.side);
      }
      acted = true;
    }
    if (e.typeChange) {
      this.changeType(t, e.typeChange);
      acted = true;
    }
    if (e.targetAbility) {
      this.changeAbility(user, t, e.targetAbility);
      acted = true;
    }
    if (e.forceSwitch) {
      if (t !== user) this.dragOut(t, true);
      acted = true;
    }
    if (!acted && !e.selfBoosts && !e.hazard && !e.clearHazards && !e.selfSwitch) this.log('info', 'But nothing happened!');
    return true;
  }

  endOfTurn() {
    const order = () => this.speedOrder(allMons(this.s).filter(isAlive));
    const w = this.weather;

    // Weather damage and weather-based abilities
    if (w === 'sand') {
      for (const mon of order()) {
        const ab = getAbility(mon);
        if (typesOf(mon).some((t) => t === 'Rock' || t === 'Ground' || t === 'Steel') || ab?.sandImmune || ab?.magicGuard) continue;
        this.hurt(mon, Math.max(1, Math.floor(mon.stats.hp / 16)), 'is buffeted by the sandstorm');
      }
    }
    for (const mon of order()) {
      const ab = getAbility(mon);
      const frac = ab?.endOfTurnHp?.(w) ?? 0;
      if (frac > 0) this.heal(mon, Math.max(1, Math.floor(mon.stats.hp * frac)), `restored HP with its ${abilityName(mon)}`);
      if (frac < 0 && !ab?.magicGuard) this.hurt(mon, Math.max(1, Math.floor(mon.stats.hp * -frac)), `was hurt by its ${abilityName(mon)}`);
      if (ab?.cureIn && ab.cureIn === w && mon.status) {
        this.log('heal', `${mon.name}'s ${abilityName(mon)} cured its ${STATUS_CURE_TEXT[mon.status]}!`, mon.side);
        mon.status = null;
      }
    }
    if (this.s.terrain === 'grassy') {
      for (const mon of order()) if (isGrounded(mon)) this.heal(mon, Math.max(1, Math.floor(mon.stats.hp / 16)), 'restored HP from the Grassy Terrain');
    }
    // Held items
    for (const mon of order()) {
      const frac = getItem(mon)?.endOfTurnHp?.(mon) ?? 0;
      if (frac > 0) this.heal(mon, Math.max(1, Math.floor(mon.stats.hp * frac)), `restored HP with its ${mon.item}`);
      if (frac < 0 && !getAbility(mon)?.magicGuard) this.hurt(mon, Math.max(1, Math.floor(mon.stats.hp * -frac)), `was hurt by its ${mon.item}`);
    }
    // Leech Seed
    for (const mon of order()) {
      if (!mon.leechSeed || getAbility(mon)?.magicGuard) continue;
      const before = mon.currentHp;
      this.hurt(mon, Math.max(1, Math.floor(mon.stats.hp / 8)), 'had its health sapped by Leech Seed');
      const receiver = monAt(this.s, mon.leechSeed);
      if (isAlive(receiver) && receiver !== mon) this.heal(receiver, before - mon.currentHp, 'restored HP from Leech Seed');
    }
    // Status damage
    for (const mon of order()) {
      const ab = getAbility(mon);
      const max = mon.stats.hp;
      if (mon.status === 'tox') mon.toxicCounter = Math.min(15, mon.toxicCounter + 1);
      if (!ab?.magicGuard) {
        if (mon.status === 'brn') this.hurt(mon, Math.max(1, Math.floor(max / 16)), 'was hurt by its burn');
        if (mon.status === 'psn') this.hurt(mon, Math.max(1, Math.floor(max / 8)), 'was hurt by poison');
        if (mon.status === 'tox') this.hurt(mon, Math.max(1, Math.floor((max * mon.toxicCounter) / 16)), 'was hurt by poison');
      }
    }
    for (const mon of order()) {
      const ab = getAbility(mon);
      if (ab?.endOfTurnBoosts) {
        this.log('info', `${mon.name}'s ${abilityName(mon)}!`, mon.side);
        this.applyBoosts(mon, ab.endOfTurnBoosts, null);
      }
    }
    this.s.sides.forEach((side, i) => {
      const s = i as Side;
      const tick = (key: 'tailwind' | 'reflect' | 'lightScreen', ended: string) => {
        if (side[key] > 0 && --side[key] === 0) this.log('field', ended, s);
      };
      tick('tailwind', `${this.teamName(s)}'s Tailwind petered out!`);
      tick('reflect', `${this.teamName(s)}'s Reflect wore off!`);
      tick('lightScreen', `${this.teamName(s)}'s Light Screen wore off!`);
    });
    for (const room of ['trickRoom', 'wonderRoom', 'magicRoom'] as Room[]) {
      if (this.s[room] > 0 && --this.s[room] === 0) {
        this.log('field', ROOM_TEXT[room][1]);
        if (room === 'magicRoom') this.syncItems();
      }
    }
    if (this.s.weather && this.s.weatherTurns > 0 && --this.s.weatherTurns === 0) {
      const ended: Record<Weather, string> = {
        sun: 'The harsh sunlight faded.', rain: 'The rain stopped.', sand: 'The sandstorm subsided.', snow: 'The snow stopped.',
      };
      this.log('field', ended[this.s.weather]);
      this.s.weather = null;
    }
    if (this.s.terrain && this.s.terrainTurns > 0 && --this.s.terrainTurns === 0) {
      this.log('field', `The ${TERRAIN_LABELS[this.s.terrain]} disappeared.`);
      this.s.terrain = null;
    }
    // Yawn and Perish Song
    for (const mon of order()) {
      if (mon.yawn > 0 && --mon.yawn === 0 && this.canInflict(mon, 'slp', null)) this.inflict(mon, 'slp');
    }
    for (const mon of order()) {
      if (mon.perishCount <= 0) continue;
      mon.perishCount--;
      this.log('status', `${mon.name}'s perish count fell to ${mon.perishCount}.`, mon.side);
      if (mon.perishCount === 0) mon.currentHp = 0;
    }
    for (const mon of allMons(this.s)) {
      if (!isAlive(mon)) continue;
      if (mon.taunt > 0 && --mon.taunt === 0) this.log('status', `${mon.name} shook off the taunt!`, mon.side);
      if (mon.healBlock > 0 && --mon.healBlock === 0) this.log('status', `${mon.name}'s Heal Block wore off!`, mon.side);
      if (mon.disable && --mon.disable.turns <= 0) {
        mon.disable = null;
        this.log('status', `${mon.name}'s move is no longer disabled!`, mon.side);
      }
      if (mon.encore && (--mon.encore.turns <= 0 || mon.pp[mon.encore.move] <= 0)) {
        mon.encore = null;
        this.log('status', `${mon.name}'s encore ended!`, mon.side);
      }
      mon.turnsActive++;
    }
  }

  /** Logs new faints and sets the winner. Returns true if the battle is over. */
  checkFaints(): boolean {
    for (const mon of [...this.s.sides[0].team, ...this.s.sides[1].team]) {
      if (mon.currentHp <= 0 && !mon.faintLogged) {
        mon.faintLogged = true;
        this.log('faint', `${mon.name} fainted!`, mon.side);
      }
    }
    const out = this.s.sides.map((side) => side.team.every((m) => m.currentHp <= 0));
    if (!out[0] && !out[1]) return false;
    if (out[0] && out[1]) {
      this.s.winner = 'draw';
      this.log('result', 'Every Pokémon fainted. The battle is a draw!');
    } else {
      const winner: Side = out[0] ? 1 : 0;
      this.s.winner = winner;
      this.log('result', `${this.playerName(winner)} wins the battle!`, winner);
    }
    return true;
  }
}

/** Runs one full turn and returns the new state (the input state is not modified). */
export function runTurn(state: BattleState, choices: TurnChoices, rng: Rng = mathRng): BattleState {
  if (state.winner !== null) return state;
  const s = structuredClone(state);
  // Any replacements nobody picked use the first healthy bench Pokémon.
  if (s.pendingReplacements?.length) {
    new TurnRunner(s, rng).applyReplacements({});
    if (s.winner !== null) return s;
  }
  s.turn++;
  s.log.push({ turn: s.turn, kind: 'turn', text: `Turn ${s.turn}` });
  new TurnRunner(s, rng).runTurn(choices);
  return s;
}

/** The order the actions would run in at the start of the turn (uids). For tests and previews. */
export function previewOrder(state: BattleState, choices: TurnChoices, rng: Rng = mathRng): string[] {
  const runner = new TurnRunner(structuredClone(state), rng);
  runner.buildQueue(choices);
  return runner.queue.map((e) => e.mon.uid);
}

/** Sends in replacements for fainted Pokémon. `picks` maps replacementKey(position) to a team index. */
export function applyReplacements(state: BattleState, picks: Record<string, number>, rng: Rng = mathRng): BattleState {
  if (!state.pendingReplacements.length) return state;
  const s = structuredClone(state);
  new TurnRunner(s, rng).applyReplacements(picks);
  return s;
}

/** Sets a Pokémon's current HP mid-battle (0 makes it faint; raising a fainted one's HP revives it). */
export function setMonHp(state: BattleState, uid: string, hp: number, rng: Rng = mathRng): BattleState {
  if (state.winner !== null) return state;
  const s = structuredClone(state);
  const mon = findMon(s, uid);
  if (!mon) return state;
  const value = Math.max(0, Math.min(mon.stats.hp, Math.round(hp)));
  if (value === mon.currentHp) return state;
  const wasFainted = mon.currentHp <= 0;
  mon.currentHp = value;
  if (wasFainted && value > 0) {
    mon.faintLogged = false;
    mon.status = null;
  }
  s.log.push({ turn: s.turn, kind: 'info', side: mon.side, text: `${mon.name}'s HP was set to ${value}/${mon.stats.hp} (${pct(value, mon.stats.hp)}).` });
  const runner = new TurnRunner(s, rng);
  if (!runner.checkFaints()) runner.computePending();
  return s;
}

/** Ends the battle early; the field and log stay as they are. */
export function endBattle(state: BattleState): BattleState {
  if (state.winner !== null) return state;
  const s = structuredClone(state);
  s.winner = 'stopped';
  s.pendingReplacements = [];
  s.log.push({ turn: s.turn, kind: 'result', text: `The battle was stopped after ${s.turn} turn${s.turn === 1 ? '' : 's'}.` });
  return s;
}
