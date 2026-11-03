import { effectiveness } from './typeChart';
import { stageMultiplier } from './stats';
import type { BattlePokemon, Move, TypeName } from './types';

export const CRIT_MULTIPLIER = 1.5;
/** Crit chance by crit stage (Gen 7+): 1/24, 1/8, 1/2, guaranteed. */
export const CRIT_CHANCES = [1 / 24, 1 / 8, 1 / 2, 1];

export interface DamageStep {
  label: string;
  multiplier: string;
  result: number;
}

export interface DamageBreakdown {
  level: number;
  power: number;
  attackLabel: string;
  attack: number;
  defenseLabel: string;
  defense: number;
  baseDamage: number;
  crit: boolean;
  roll: number;
  stab: number;
  effectiveness: number;
  burned: boolean;
  steps: DamageStep[];
  damage: number;
}

export interface DamageOptions {
  crit: boolean;
  /** Random roll from 85 to 100 (inclusive). */
  roll: number;
  /** Struggle-style: ignores type effectiveness and STAB. */
  typeless?: boolean;
}

/** Round to nearest integer, with .5 rounding down (Game Freak's rounding). */
export function pokeRound(n: number): number {
  return n % 1 > 0.5 ? Math.ceil(n) : Math.floor(n);
}

export function typesOf(p: BattlePokemon): TypeName[] {
  return p.build.type2 && p.build.type2 !== p.build.type1 ? [p.build.type1, p.build.type2] : [p.build.type1];
}

/**
 * The standard (Gen 5+) damage formula:
 *   base = floor(floor(floor(2 * Level / 5 + 2) * Power * A / D) / 50) + 2
 * then, in order: critical (1.5x), random (85–100%), STAB (1.5x),
 * type effectiveness, and burn (0.5x on physical moves).
 */
export function calcDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  opts: DamageOptions,
): DamageBreakdown {
  const physical = move.category === 'Physical';
  const atkKey = physical ? 'atk' : 'spa';
  const defKey = physical ? 'def' : 'spd';

  // Critical hits ignore the attacker's negative offensive stages and the defender's positive defensive stages.
  let atkStage = attacker.boosts[atkKey];
  let defStage = defender.boosts[defKey];
  if (opts.crit) {
    atkStage = Math.max(0, atkStage);
    defStage = Math.min(0, defStage);
  }
  const attack = Math.max(1, Math.floor(attacker.stats[atkKey] * stageMultiplier(atkStage)));
  const defense = Math.max(1, Math.floor(defender.stats[defKey] * stageMultiplier(defStage)));
  const level = attacker.build.level;

  const fmtStage = (n: number) => (n === 0 ? '' : ` (${n > 0 ? '+' : ''}${n})`);
  const attackLabel = `${physical ? 'Atk' : 'SpA'}${fmtStage(atkStage)}`;
  const defenseLabel = `${physical ? 'Def' : 'SpD'}${fmtStage(defStage)}`;

  const baseDamage = Math.floor(Math.floor((Math.floor((2 * level) / 5 + 2) * move.power * attack) / defense) / 50) + 2;
  const steps: DamageStep[] = [{ label: 'Base damage', multiplier: '', result: baseDamage }];
  let d = baseDamage;

  if (opts.crit) {
    d = Math.floor(d * CRIT_MULTIPLIER);
    steps.push({ label: 'Critical hit', multiplier: '×1.5', result: d });
  }

  d = Math.floor((d * opts.roll) / 100);
  steps.push({ label: 'Random roll', multiplier: `×${opts.roll}%`, result: d });

  const stab = !opts.typeless && typesOf(attacker).includes(move.type) ? 1.5 : 1;
  if (stab !== 1) {
    d = pokeRound(d * stab);
    steps.push({ label: 'STAB', multiplier: '×1.5', result: d });
  }

  const eff = opts.typeless ? 1 : effectiveness(move.type, typesOf(defender));
  if (eff !== 1) {
    d = Math.floor(d * eff);
    steps.push({ label: 'Type effectiveness', multiplier: `×${eff}`, result: d });
  }

  const burned = physical && attacker.status === 'brn';
  if (burned) {
    d = pokeRound(d * 0.5);
    steps.push({ label: 'Burn', multiplier: '×0.5', result: d });
  }

  const damage = eff === 0 ? 0 : Math.max(1, d);
  return {
    level, power: move.power, attackLabel, attack, defenseLabel, defense, baseDamage,
    crit: opts.crit, roll: opts.roll, stab, effectiveness: eff, burned, steps, damage,
  };
}

/** Min/max damage with no crit (rolls 85 and 100), for previews. */
export function damageRange(attacker: BattlePokemon, defender: BattlePokemon, move: Move, typeless = false) {
  if (move.category === 'Status' || move.power <= 0) return null;
  const min = calcDamage(attacker, defender, move, { crit: false, roll: 85, typeless }).damage;
  const max = calcDamage(attacker, defender, move, { crit: false, roll: 100, typeless }).damage;
  return { min, max };
}
