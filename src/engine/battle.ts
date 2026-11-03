import { CRIT_CHANCES, calcDamage, typesOf } from './damage';
import type { DamageBreakdown } from './damage';
import { accuracyStageMultiplier, calcAllStats, clampStage, stageMultiplier } from './stats';
import { effectiveness } from './typeChart';
import { BOOST_LABELS } from './types';
import type { BattlePokemon, BoostableStat, Boosts, MajorStatus, Move, PokemonBuild } from './types';

export type Side = 0 | 1;

export type LogKind = 'turn' | 'order' | 'move' | 'info' | 'damage' | 'heal' | 'status' | 'boost' | 'faint' | 'result';

export interface LogEntry {
  turn: number;
  kind: LogKind;
  text: string;
  /** The side this entry is about (used for coloring). */
  side?: Side;
  breakdown?: DamageBreakdown;
}

export interface BattleState {
  mons: [BattlePokemon, BattlePokemon];
  names: [string, string];
  turn: number;
  winner: Side | 'draw' | null;
  log: LogEntry[];
}

/** A move slot index (0–3), or STRUGGLE_INDEX when every move is out of PP. */
export type MoveChoice = number;
export const STRUGGLE_INDEX = -1;

export const STRUGGLE: Move = {
  name: 'Struggle', type: 'Normal', category: 'Physical', power: 50, accuracy: null,
  pp: 1, priority: 0, highCrit: false, effects: {},
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

export function createBattlePokemon(build: PokemonBuild): BattlePokemon {
  const stats = calcAllStats(build);
  return {
    build: structuredClone(build),
    stats,
    currentHp: stats.hp,
    status: null,
    sleepTurns: 0,
    toxicCounter: 0,
    boosts: { ...ZERO_BOOSTS },
    pp: build.moves.map((m) => (m ? m.pp : 0)),
  };
}

export function createBattle(a: PokemonBuild, b: PokemonBuild): BattleState {
  const rawA = a.name.trim() || 'Pokémon 1';
  const rawB = b.name.trim() || 'Pokémon 2';
  const names: [string, string] = rawA === rawB ? [`${rawA} (P1)`, `${rawB} (P2)`] : [rawA, rawB];
  return {
    mons: [createBattlePokemon(a), createBattlePokemon(b)],
    names,
    turn: 0,
    winner: null,
    log: [{ turn: 0, kind: 'info', text: `${names[0]} vs. ${names[1]}: battle start!` }],
  };
}

/** Move slots that can be selected this turn; [STRUGGLE_INDEX] if none have PP. */
export function availableChoices(mon: BattlePokemon): MoveChoice[] {
  const choices = mon.build.moves.flatMap((m, i) => (m && mon.pp[i] > 0 ? [i] : []));
  return choices.length ? choices : [STRUGGLE_INDEX];
}

export function getChoiceMove(mon: BattlePokemon, choice: MoveChoice): Move {
  if (choice === STRUGGLE_INDEX) return STRUGGLE;
  const move = mon.build.moves[choice];
  if (!move) throw new Error(`No move in slot ${choice}`);
  return move;
}

/** Speed after stat stages and paralysis (0.5x). */
export function effectiveSpeed(mon: BattlePokemon): number {
  const spe = Math.floor(mon.stats.spe * stageMultiplier(mon.boosts.spe));
  return mon.status === 'par' ? Math.floor(spe * 0.5) : spe;
}

export function determineOrder(
  state: BattleState,
  choices: [MoveChoice, MoveChoice],
  rng: Rng,
): { order: [Side, Side]; reason: string } {
  const [m0, m1] = [getChoiceMove(state.mons[0], choices[0]), getChoiceMove(state.mons[1], choices[1])];
  const [n0, n1] = state.names;
  let first: Side;
  let reason: string;
  if (m0.priority !== m1.priority) {
    first = m0.priority > m1.priority ? 0 : 1;
    const p = first === 0 ? m0.priority : m1.priority;
    reason = `${state.names[first]} moves first (priority ${p > 0 ? '+' : ''}${p}).`;
  } else {
    const s0 = effectiveSpeed(state.mons[0]);
    const s1 = effectiveSpeed(state.mons[1]);
    if (s0 !== s1) {
      first = s0 > s1 ? 0 : 1;
      reason = `${state.names[first]} is faster (Speed ${n0} ${s0} vs. ${n1} ${s1}).`;
    } else {
      first = rng.next() < 0.5 ? 0 : 1;
      reason = `Speed tie at ${s0}! ${state.names[first]} won the coin flip.`;
    }
  }
  return { order: first === 0 ? [0, 1] : [1, 0], reason };
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

function chanceHit(chance: number, rng: Rng): boolean {
  return chance >= 100 || rng.next() * 100 < chance;
}

function pct(n: number, max: number): string {
  return `${Math.round((n / max) * 1000) / 10}%`;
}

class TurnRunner {
  constructor(private s: BattleState, private rng: Rng) {}

  log(kind: LogKind, text: string, side?: Side, breakdown?: DamageBreakdown) {
    this.s.log.push({ turn: this.s.turn, kind, text, side, breakdown });
  }

  name(side: Side) {
    return this.s.names[side];
  }

  canInflict(mon: BattlePokemon, status: MajorStatus): boolean {
    if (mon.status !== null || mon.currentHp <= 0) return false;
    return !typesOf(mon).some((t) => STATUS_IMMUNITY[status].includes(t));
  }

  inflict(side: Side, status: MajorStatus) {
    const mon = this.s.mons[side];
    mon.status = status;
    if (status === 'slp') mon.sleepTurns = 1 + Math.floor(this.rng.next() * 3);
    if (status === 'tox') mon.toxicCounter = 0;
    this.log('status', `${this.name(side)} ${STATUS_INFLICT_TEXT[status]}`, side);
  }

  applyBoosts(side: Side, boosts: Partial<Boosts>) {
    const mon = this.s.mons[side];
    for (const [key, delta] of Object.entries(boosts) as [BoostableStat, number][]) {
      if (!delta) continue;
      const before = mon.boosts[key];
      const after = clampStage(before + delta);
      const label = `${this.name(side)}'s ${BOOST_LABELS[key]}`;
      if (after === before) {
        this.log('boost', `${label} won't go any ${delta > 0 ? 'higher' : 'lower'}!`, side);
        continue;
      }
      mon.boosts[key] = after;
      const change = after - before;
      const mag = Math.abs(change);
      const word = change > 0
        ? mag === 1 ? 'rose!' : mag === 2 ? 'rose sharply!' : 'rose drastically!'
        : mag === 1 ? 'fell!' : mag === 2 ? 'harshly fell!' : 'severely fell!';
      this.log('boost', `${label} ${word} (${after > 0 ? '+' : ''}${after})`, side);
    }
  }

  heal(side: Side, amount: number, reason: string) {
    const mon = this.s.mons[side];
    const healed = Math.min(amount, mon.stats.hp - mon.currentHp);
    if (healed <= 0) return;
    mon.currentHp += healed;
    this.log('heal', `${this.name(side)} ${reason} (+${healed} HP).`, side);
  }

  hurt(side: Side, amount: number, reason: string) {
    const mon = this.s.mons[side];
    const lost = Math.min(amount, mon.currentHp);
    mon.currentHp -= lost;
    this.log('damage', `${this.name(side)} ${reason} (-${lost} HP, ${pct(lost, mon.stats.hp)}).`, side);
  }

  /** Returns false if the Pokémon can't act this turn. */
  preMoveCheck(side: Side): boolean {
    const mon = this.s.mons[side];
    const n = this.name(side);
    if (mon.status === 'slp') {
      if (mon.sleepTurns > 0) {
        mon.sleepTurns--;
        this.log('status', `${n} is fast asleep.`, side);
        return false;
      }
      mon.status = null;
      this.log('status', `${n} woke up!`, side);
    }
    if (mon.status === 'frz') {
      if (this.rng.next() < 0.2) {
        mon.status = null;
        this.log('status', `${n} thawed out!`, side);
      } else {
        this.log('status', `${n} is frozen solid!`, side);
        return false;
      }
    }
    if (mon.status === 'par' && this.rng.next() < 0.25) {
      this.log('status', `${n} is fully paralyzed! It can't move!`, side);
      return false;
    }
    return true;
  }

  executeMove(side: Side, choice: MoveChoice) {
    const foe: Side = side === 0 ? 1 : 0;
    const user = this.s.mons[side];
    const target = this.s.mons[foe];
    const move = getChoiceMove(user, choice);

    if (!this.preMoveCheck(side)) return;

    if (choice === STRUGGLE_INDEX) {
      this.log('info', `${this.name(side)} has no moves left!`, side);
    } else {
      user.pp[choice] = Math.max(0, user.pp[choice] - 1);
    }
    this.log('move', `${this.name(side)} used ${move.name}!`, side);

    const e = move.effects;
    const affectsTarget = move.category !== 'Status' || !!e.status || !!e.targetBoosts;

    if (affectsTarget && move.accuracy !== null) {
      const stage = clampStage(user.boosts.accuracy - target.boosts.evasion);
      const hitChance = move.accuracy * accuracyStageMultiplier(stage);
      if (this.rng.next() * 100 >= hitChance) {
        this.log('info', `${this.name(foe)} avoided the attack! (${Math.round(hitChance)}% to hit)`, side);
        return;
      }
    }

    if (move.category === 'Status') {
      this.executeStatusMove(side, move);
    } else {
      this.executeDamagingMove(side, move, choice === STRUGGLE_INDEX);
    }
  }

  executeStatusMove(side: Side, move: Move) {
    const foe: Side = side === 0 ? 1 : 0;
    const user = this.s.mons[side];
    const target = this.s.mons[foe];
    const e = move.effects;
    let acted = false;

    if (e.status) {
      if (effectiveness(move.type, typesOf(target)) === 0) {
        this.log('info', `It doesn't affect ${this.name(foe)}...`, foe);
        return;
      }
      if (!this.canInflict(target, e.status.status)) {
        this.log('info', 'But it failed!');
      } else if (chanceHit(e.status.chance, this.rng)) {
        this.inflict(foe, e.status.status);
      }
      acted = true;
    }
    if (e.heal) {
      if (user.currentHp >= user.stats.hp) this.log('info', `${this.name(side)}'s HP is full!`, side);
      else this.heal(side, Math.floor((user.stats.hp * e.heal) / 100), 'restored HP');
      acted = true;
    }
    if (e.targetBoosts && chanceHit(e.targetBoosts.chance, this.rng)) {
      this.applyBoosts(foe, e.targetBoosts.boosts);
      acted = true;
    }
    if (e.selfBoosts && chanceHit(e.selfBoosts.chance, this.rng)) {
      this.applyBoosts(side, e.selfBoosts.boosts);
      acted = true;
    }
    if (!acted) this.log('info', 'But nothing happened!');
  }

  executeDamagingMove(side: Side, move: Move, typeless: boolean) {
    const foe: Side = side === 0 ? 1 : 0;
    const user = this.s.mons[side];
    const target = this.s.mons[foe];
    const e = move.effects;

    const eff = typeless ? 1 : effectiveness(move.type, typesOf(target));
    if (eff === 0) {
      this.log('info', `It doesn't affect ${this.name(foe)}...`, foe);
      return;
    }

    const crit = this.rng.next() < CRIT_CHANCES[move.highCrit ? 1 : 0];
    const roll = 85 + Math.floor(this.rng.next() * 16);
    const bd = calcDamage(user, target, move, { crit, roll, typeless });
    const dealt = Math.min(bd.damage, target.currentHp);
    target.currentHp -= dealt;

    if (crit) this.log('info', 'A critical hit!', side);
    if (eff > 1) this.log('info', "It's super effective!", side);
    if (eff < 1) this.log('info', "It's not very effective...", side);
    this.log('damage', `${this.name(foe)} lost ${dealt} HP (${pct(dealt, target.stats.hp)}).`, foe, bd);

    if (target.currentHp > 0 && target.status === 'frz' && move.type === 'Fire') {
      target.status = null;
      this.log('status', `${this.name(foe)} thawed out!`, foe);
    }

    if (e.drain && dealt > 0) {
      this.heal(side, Math.max(1, Math.floor((dealt * e.drain) / 100)), 'drained energy');
    }
    if (typeless) {
      this.hurt(side, Math.max(1, Math.floor(user.stats.hp / 4)), 'is damaged by recoil');
    } else if (e.recoil && dealt > 0) {
      this.hurt(side, Math.max(1, Math.floor((dealt * e.recoil) / 100)), 'is damaged by recoil');
    }

    if (target.currentHp > 0) {
      if (e.status && this.canInflict(target, e.status.status) && chanceHit(e.status.chance, this.rng)) {
        this.inflict(foe, e.status.status);
      }
      if (e.targetBoosts && chanceHit(e.targetBoosts.chance, this.rng)) {
        this.applyBoosts(foe, e.targetBoosts.boosts);
      }
    }
    if (user.currentHp > 0 && e.selfBoosts && chanceHit(e.selfBoosts.chance, this.rng)) {
      this.applyBoosts(side, e.selfBoosts.boosts);
    }
  }

  endOfTurn(order: [Side, Side]) {
    for (const side of order) {
      const mon = this.s.mons[side];
      if (mon.currentHp <= 0) continue;
      const max = mon.stats.hp;
      if (mon.status === 'brn') this.hurt(side, Math.max(1, Math.floor(max / 16)), 'was hurt by its burn');
      if (mon.status === 'psn') this.hurt(side, Math.max(1, Math.floor(max / 8)), 'was hurt by poison');
      if (mon.status === 'tox') {
        mon.toxicCounter = Math.min(15, mon.toxicCounter + 1);
        this.hurt(side, Math.max(1, Math.floor((max * mon.toxicCounter) / 16)), 'was hurt by poison');
      }
    }
  }

  /** Logs faints and sets the winner. Returns true if the battle is over. */
  checkFaints(): boolean {
    const fainted = ([0, 1] as Side[]).filter((side) => this.s.mons[side].currentHp <= 0);
    if (!fainted.length) return false;
    for (const side of fainted) this.log('faint', `${this.name(side)} fainted!`, side);
    if (fainted.length === 2) {
      this.s.winner = 'draw';
      this.log('result', 'Both Pokémon fainted. The battle is a draw!');
    } else {
      const winner: Side = fainted[0] === 0 ? 1 : 0;
      this.s.winner = winner;
      this.log('result', `${this.name(winner)} wins the battle!`, winner);
    }
    return true;
  }
}

/** Runs one full turn and returns the new state (the input state is not modified). */
export function runTurn(state: BattleState, choices: [MoveChoice, MoveChoice], rng: Rng = mathRng): BattleState {
  if (state.winner !== null) return state;
  const s = structuredClone(state);
  s.turn++;
  s.log.push({ turn: s.turn, kind: 'turn', text: `Turn ${s.turn}` });
  const runner = new TurnRunner(s, rng);

  const { order, reason } = determineOrder(s, choices, rng);
  runner.log('order', reason, order[0]);

  for (const side of order) {
    runner.executeMove(side, choices[side]);
    if (runner.checkFaints()) return s;
  }
  runner.endOfTurn(order);
  runner.checkFaints();
  return s;
}
