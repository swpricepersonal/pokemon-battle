import { abilityName, defenderAbility, getAbility, hasSecondary, isGrounded } from './abilities';
import { CRIT_CHANCES, calcDamage, typeEffectiveness, typesOf } from './damage';
import type { DamageBreakdown } from './damage';
import { getItem } from './items';
import { applyMod, chainMods } from './modifiers';
import { accuracyStageMultiplier, calcAllStats, clampStage, stageMultiplier } from './stats';
import { BOOST_LABELS } from './types';
import type {
  BattlePokemon, BoostableStat, Boosts, Format, MajorStatus, Move, PokemonBuild, Side, Terrain, TurnVolatiles, TypeName, Weather,
} from './types';
import { TERRAIN_LABELS, WEATHER_LABELS } from './types';
import type { AbilityDef, ImmunityResult } from './abilities';

export type { Side } from './types';

export type LogKind = 'turn' | 'order' | 'move' | 'info' | 'damage' | 'heal' | 'status' | 'boost' | 'faint' | 'result' | 'field';

export interface LogEntry {
  turn: number;
  kind: LogKind;
  text: string;
  /** The side this entry is about (used for coloring). */
  side?: Side;
  breakdown?: DamageBreakdown;
}

export interface SideState {
  /** Active Pokémon by field position (index = slot). */
  mons: BattlePokemon[];
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
  weather: Weather | null;
  /** Turns of weather left; -1 means it lasts the whole battle. */
  weatherTurns: number;
  terrain: Terrain | null;
  /** Turns of terrain left; -1 means it lasts the whole battle. */
  terrainTurns: number;
  turn: number;
  winner: Side | 'draw' | null;
  log: LogEntry[];
}

/** A move slot index (0–3), or STRUGGLE_INDEX when every usable move is out of PP. */
export type MoveChoice = number;
export const STRUGGLE_INDEX = -1;

/** A field position. */
export interface TargetRef {
  side: Side;
  slot: number;
}

export interface Action {
  move: MoveChoice;
  /** Required for single-target moves in doubles. */
  target?: TargetRef;
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
  return { moved: false, protected: false, flinched: false, helpingHand: false, centerOfAttention: null };
}

export function createBattlePokemon(build: PokemonBuild, side: Side = 0, slot = 0, name?: string): BattlePokemon {
  const stats = calcAllStats(build);
  return {
    uid: `p${side + 1}${'ab'[slot]}`,
    name: name ?? (build.name.trim() || `Pokémon ${side + 1}`),
    side,
    build: structuredClone(build),
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
    vol: freshVolatiles(),
  };
}

export const activeCount = (format: Format) => (format === 'doubles' ? 2 : 1);

/** Weather and terrain that are in place for the whole battle. */
export interface FieldSetup {
  weather?: Weather | null;
  terrain?: Terrain | null;
}

/** Create a battle from each side's team (the first 1 or 2 builds are used). */
export function createBattle(
  teams: [PokemonBuild[], PokemonBuild[]],
  format: Format = 'singles',
  rng: Rng = mathRng,
  setup: FieldSetup = {},
): BattleState {
  const n = activeCount(format);
  const picked = teams.map((t) => t.slice(0, n)) as [PokemonBuild[], PokemonBuild[]];
  const raw = picked.flatMap((t, side) => t.map((b, slot) => ({ side, slot, name: b.name.trim() || `Pokémon ${side + 1}${'AB'[slot]}` })));
  const counts = new Map<string, number>();
  for (const r of raw) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
  const display = (side: number, slot: number) => {
    const r = raw.find((x) => x.side === side && x.slot === slot)!;
    if (counts.get(r.name)! === 1) return r.name;
    const sameSide = raw.filter((x) => x.side === side && x.name === r.name).length > 1;
    return `${r.name} (P${side + 1}${sameSide ? 'AB'[slot] : ''})`;
  };
  const sides = picked.map((team, side) => ({
    mons: team.map((b, slot) => createBattlePokemon(b, side as Side, slot, display(side, slot))),
    tailwind: 0, reflect: 0, lightScreen: 0, wideGuard: false, quickGuard: false,
  })) as [SideState, SideState];
  const state: BattleState = {
    format, sides, trickRoom: 0, turn: 0, winner: null, log: [],
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

export function allMons(state: BattleState): BattlePokemon[] {
  return [...state.sides[0].mons, ...state.sides[1].mons];
}

export const isAlive = (m: BattlePokemon | null | undefined): m is BattlePokemon => !!m && m.currentHp > 0;

export function findMon(state: BattleState, uid: string): BattlePokemon | undefined {
  return allMons(state).find((m) => m.uid === uid);
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

/** Move slots that can be selected this turn; [STRUGGLE_INDEX] if none. */
export function availableChoices(mon: BattlePokemon): MoveChoice[] {
  const item = getItem(mon);
  if (mon.encore && mon.pp[mon.encore.move] > 0 && mon.build.moves[mon.encore.move]) return [mon.encore.move];
  const choices = mon.build.moves.flatMap((m, i) => {
    if (!m || mon.pp[i] <= 0) return [];
    if (mon.choiceLock !== null && mon.choiceLock !== i) return [];
    if (item?.noStatusMoves && m.category === 'Status') return [];
    if (mon.taunt > 0 && m.category === 'Status') return [];
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
  return { weather: activeWeather(state), terrain: state.terrain, doubles: state.format === 'doubles' };
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

  teamName(side: Side) {
    return this.doubles ? `Player ${side + 1}'s team` : this.s.sides[side].mons[0].name;
  }

  ally(mon: BattlePokemon) {
    return allyOf(this.s, mon);
  }

  speedOrder(mons: BattlePokemon[]): BattlePokemon[] {
    return [...mons].sort((a, b) => effectiveSpeed(this.s, b) - effectiveSpeed(this.s, a));
  }

  // ---------- Start of battle ----------

  startOfBattle() {
    for (const mon of this.speedOrder(allMons(this.s))) {
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
      if (!ab?.onStartFoeBoosts) continue;
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

  heal(mon: BattlePokemon, amount: number, reason: string) {
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
      const allowed = availableChoices(mon);
      let action = choices[mon.uid];
      if (!action || !allowed.includes(action.move)) action = { move: allowed[0], target: action?.target };
      const move = getChoiceMove(mon, action.move);
      this.queue.push({ mon, action, move, priority: movePriority(mon, move), tiebreak: this.rng.next() });
    }
    this.sortQueue();
  }

  orderReason(): string {
    const q = this.queue;
    const tr = this.s.trickRoom > 0;
    const spe = (m: BattlePokemon) => effectiveSpeed(this.s, m);
    if (q.length === 2) {
      const [a, b] = q;
      if (a.priority !== b.priority) {
        return `${a.mon.name} moves first (priority ${a.priority > 0 ? '+' : ''}${a.priority}).`;
      }
      const speeds = `Speed ${a.mon.name} ${spe(a.mon)} vs. ${b.mon.name} ${spe(b.mon)}`;
      if (spe(a.mon) === spe(b.mon)) return `Speed tie at ${spe(a.mon)}! ${a.mon.name} won the coin flip.`;
      return tr ? `${a.mon.name} is slower and moves first under Trick Room (${speeds}).` : `${a.mon.name} is faster (${speeds}).`;
    }
    const parts = q.map((e) => `${e.mon.name} (${e.priority !== 0 ? `priority ${e.priority > 0 ? '+' : ''}${e.priority}, ` : ''}Spe ${spe(e.mon)})`);
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
      this.executeAction(entry);
      if (this.checkFaints()) return;
      this.sortQueue();
    }
    this.endOfTurn();
    this.checkFaints();
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
    if (!isAlive(user)) return;
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
    if (!struggle && user.taunt > 0 && entry.move.category === 'Status') {
      this.log('info', `${user.name} can't use ${entry.move.name} after the taunt!`, user.side);
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
    const side = this.s.sides[user.side];
    const ally = this.ally(user);

    const weather = sp ? WEATHER_SPECIALS[sp] : undefined;
    if (weather) {
      if (!this.setWeather(user, weather)) this.fail();
      return;
    }
    const terrain = sp ? TERRAIN_SPECIALS[sp] : undefined;
    if (terrain) {
      if (!this.setTerrain(user, terrain)) this.fail();
      return;
    }

    switch (sp) {
      case 'protect':
      case 'wideGuard':
      case 'quickGuard':
        return this.doProtect(user, sp);
      case 'followMe':
      case 'ragePowder':
        if (!this.doubles) return this.fail();
        user.vol.centerOfAttention = sp === 'ragePowder' ? 'powder' : 'followMe';
        return this.log('info', `${user.name} became the center of attention!`, user.side);
      case 'helpingHand':
        if (!isAlive(ally) || ally.vol.moved) return this.fail();
        ally.vol.helpingHand = true;
        return this.log('info', `${user.name} is ready to help ${ally.name}!`, user.side);
      case 'allySwitch': {
        if (!isAlive(ally)) return this.fail();
        const [a, b] = side.mons;
        side.mons[0] = b;
        side.mons[1] = a;
        return this.log('info', `${user.name} and ${ally.name} switched places!`, user.side);
      }
      case 'tailwind':
        if (side.tailwind > 0) return this.fail();
        side.tailwind = 4;
        return this.log('field', `The Tailwind blew from behind ${this.teamName(user.side)}!`, user.side);
      case 'trickRoom':
        if (this.s.trickRoom > 0) {
          this.s.trickRoom = 0;
          return this.log('field', 'The twisted dimensions returned to normal!');
        }
        this.s.trickRoom = 5;
        return this.log('field', `${user.name} twisted the dimensions!`, user.side);
      case 'reflect':
      case 'lightScreen': {
        const key = sp;
        if (side[key] > 0) return this.fail();
        side[key] = getItem(user)?.lightClay ? 8 : 5;
        return this.log('field', `${sp === 'reflect' ? 'Reflect' : 'Light Screen'} made ${this.teamName(user.side)} stronger against ${sp === 'reflect' ? 'physical' : 'special'} moves!`, user.side);
      }
      case 'fakeOut':
        if (user.turnsActive > 0) return this.fail();
        break;
      case 'substitute': {
        const cost = Math.floor(user.stats.hp / 4);
        if (user.substituteHp > 0) return this.log('info', `${user.name} already has a substitute!`, user.side);
        if (user.currentHp <= cost || cost < 1) {
          return this.log('info', 'But it does not have enough HP left to make a substitute!', user.side);
        }
        user.currentHp -= cost;
        user.substituteHp = cost;
        this.log('info', `${user.name} put in a substitute! (-${cost} HP)`, user.side);
        this.checkPinchBerry(user);
        return;
      }
    }

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
      } else if (sp === 'taunt' || sp === 'encore' || sp === 'leechSeed') {
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
  }

  /** Instruct: the target immediately uses its last move again. */
  doInstruct(t: BattlePokemon) {
    const last = t.lastAction;
    const move = last ? t.build.moves[last.move] : null;
    if (!last || !move || move.special === 'instruct' || t.pp[last.move] <= 0 || !isAlive(t)) return this.fail();
    this.log('info', `${t.name} followed the instructions!`, t.side);
    this.executeAction({ mon: t, action: last, move, priority: movePriority(t, move), tiebreak: 0 }, true);
  }

  doProtect(user: BattlePokemon, kind: 'protect' | 'wideGuard' | 'quickGuard') {
    const last = this.queue.length === 0;
    const chance = 1 / 3 ** user.protectStreak;
    if (last || (user.protectStreak > 0 && this.rng.next() >= chance)) {
      user.protectStreak = 0;
      return this.fail();
    }
    user.protectStreak++;
    if (kind === 'protect') {
      user.vol.protected = true;
      return this.log('info', `${user.name} protected itself!`, user.side);
    }
    this.s.sides[user.side][kind] = true;
    return this.log('field', `${kind === 'wideGuard' ? 'Wide Guard' : 'Quick Guard'} protected ${this.teamName(user.side)}!`, user.side);
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
    if (t.vol.protected) {
      this.log('info', `${t.name} protected itself!`, t.side);
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
      const party = this.s.sides[user.side].mons.filter((m) => m === user || (isAlive(m) && !m.status));
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

  /** Taunt, Encore and Leech Seed. Returns true if it took effect. */
  volatileMove(user: BattlePokemon, t: BattlePokemon, move: Move, sp: 'taunt' | 'encore' | 'leechSeed'): boolean {
    // Taunt and Encore go through a Substitute; Leech Seed doesn't.
    if (this.statusMoveStopped(user, t, move, sp !== 'leechSeed')) return false;
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
      if (t.currentHp >= t.stats.hp) this.log('info', `${t.name}'s HP is full!`, t.side);
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
    if (!acted && !e.selfBoosts) this.log('info', 'But nothing happened!');
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
    if (this.s.trickRoom > 0 && --this.s.trickRoom === 0) this.log('field', 'The twisted dimensions returned to normal!');
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
    for (const mon of allMons(this.s)) {
      if (!isAlive(mon)) continue;
      if (mon.taunt > 0 && --mon.taunt === 0) this.log('status', `${mon.name} shook off the taunt!`, mon.side);
      if (mon.encore && (--mon.encore.turns <= 0 || mon.pp[mon.encore.move] <= 0)) {
        mon.encore = null;
        this.log('status', `${mon.name}'s encore ended!`, mon.side);
      }
      mon.turnsActive++;
    }
  }

  /** Logs new faints and sets the winner. Returns true if the battle is over. */
  checkFaints(): boolean {
    for (const mon of allMons(this.s)) {
      if (mon.currentHp <= 0 && !mon.faintLogged) {
        mon.faintLogged = true;
        this.log('faint', `${mon.name} fainted!`, mon.side);
      }
    }
    const out = this.s.sides.map((side) => side.mons.every((m) => m.currentHp <= 0));
    if (!out[0] && !out[1]) return false;
    if (out[0] && out[1]) {
      this.s.winner = 'draw';
      this.log('result', 'Every Pokémon fainted. The battle is a draw!');
    } else {
      const winner: Side = out[0] ? 1 : 0;
      this.s.winner = winner;
      const who = this.doubles ? `Player ${winner + 1}` : this.s.sides[winner].mons[0].name;
      this.log('result', `${who} wins the battle!`, winner);
    }
    return true;
  }
}

/** Runs one full turn and returns the new state (the input state is not modified). */
export function runTurn(state: BattleState, choices: TurnChoices, rng: Rng = mathRng): BattleState {
  if (state.winner !== null) return state;
  const s = structuredClone(state);
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
