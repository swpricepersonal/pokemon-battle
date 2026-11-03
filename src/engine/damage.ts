import { abilityName, defenderAbility, getAbility, isGrounded } from './abilities';
import type { DamageCtx } from './abilities';
import { getItem } from './items';
import { applyMod, chainMods, fmtMod, modify } from './modifiers';
import { stageMultiplier } from './stats';
import { typeMultiplier } from './typeChart';
import type { BattlePokemon, Move, Terrain, TypeName, Weather } from './types';

export const CRIT_MULTIPLIER = 1.5;
/** Crit chance by crit stage (Gen 7+): 1/24, 1/8, 1/2, guaranteed. */
export const CRIT_CHANCES = [1 / 24, 1 / 8, 1 / 2, 1];
/** Reflect/Light Screen multiplier in doubles (singles is 0.5). */
export const DOUBLES_SCREEN = 2732 / 4096;

export interface DamageStep {
  label: string;
  multiplier: string;
  result: number;
}

export interface DamageBreakdown {
  level: number;
  movePower: number;
  power: number;
  powerNotes: string[];
  attackLabel: string;
  attack: number;
  attackNotes: string[];
  defenseLabel: string;
  defense: number;
  defenseNotes: string[];
  baseDamage: number;
  crit: boolean;
  roll: number;
  stab: number;
  effectiveness: number;
  burned: boolean;
  steps: DamageStep[];
  damage: number;
  /** The defender's resist berry activated. */
  resistBerry: boolean;
}

export interface DamageOptions {
  crit: boolean;
  /** Random roll from 85 to 100 (inclusive). */
  roll: number;
  /** Struggle-style: ignores type effectiveness and STAB. */
  typeless?: boolean;
  /** The move is hitting more than one target (×0.75). */
  spread?: boolean;
  helpingHand?: boolean;
  /** Reflect / Light Screen protects the defender's side against this move. */
  screen?: boolean;
  doubles?: boolean;
  attackerAlly?: BattlePokemon | null;
  defenderAlly?: BattlePokemon | null;
  /** Active weather (null when none or suppressed by Cloud Nine). */
  weather?: Weather | null;
  terrain?: Terrain | null;
}

const TERRAIN_TYPE: Record<Terrain, TypeName> = { electric: 'Electric', grassy: 'Grass', psychic: 'Psychic', misty: 'Fairy' };
const GRASSY_HALVED = new Set(['Earthquake', 'Bulldoze', 'Magnitude']);

/** Round to nearest integer, with .5 rounding down (Game Freak's rounding). */
export function pokeRound(n: number): number {
  return n % 1 > 0.5 ? Math.ceil(n) : Math.floor(n);
}

export function typesOf(p: BattlePokemon): TypeName[] {
  return p.build.type2 && p.build.type2 !== p.build.type1 ? [p.build.type1, p.build.type2] : [p.build.type1];
}

/** Type effectiveness including Scrappy. */
export function typeEffectiveness(attacker: BattlePokemon, defender: BattlePokemon, move: Move, typeless = false): number {
  if (typeless) return 1;
  const scrappy = !!getAbility(attacker)?.scrappy && (move.type === 'Normal' || move.type === 'Fighting');
  return typesOf(defender).reduce((m, t) => m * (scrappy && t === 'Ghost' ? 1 : typeMultiplier(move.type, t)), 1);
}

type Mod = [label: string, multiplier: number];

function collect(mods: (Mod | null | undefined)[]): Mod[] {
  return mods.filter((m): m is Mod => !!m && m[1] !== 1 && Number.isFinite(m[1]));
}

function notes(mods: Mod[]): string[] {
  return mods.map(([label, m]) => `${label} ×${Math.round(m * 1000) / 1000}`);
}

/**
 * The standard (Gen 5+) damage formula:
 *   base = floor(floor(floor(2 * Level / 5 + 2) * Power * A / D) / 50) + 2
 * then, in order: spread (0.75), critical (1.5), random (85–100%), STAB,
 * type effectiveness, burn (0.5), and final modifiers (screens, abilities, items).
 * Multipliers use the games' 4096-based fixed-point rounding.
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
  const aAb = getAbility(attacker);
  const dAb = defenderAbility(defender, attacker);
  const aItem = getItem(attacker);
  const dItem = getItem(defender);
  const eff = typeEffectiveness(attacker, defender, move, opts.typeless);
  const weather = opts.weather ?? null;
  const terrain = opts.terrain ?? null;
  const ctx: DamageCtx = { attacker, defender, move, eff, crit: opts.crit, weather, terrain };
  const attackerGrounded = isGrounded(attacker);
  const defenderGrounded = isGrounded(defender);
  const terrainLabel = terrain ? `${terrain[0].toUpperCase()}${terrain.slice(1)} Terrain` : '';
  const aName = abilityName(attacker);
  const dName = abilityName(defender);
  const ally = opts.attackerAlly && opts.attackerAlly.currentHp > 0 ? opts.attackerAlly : null;
  const dAlly = opts.defenderAlly && opts.defenderAlly.currentHp > 0 ? opts.defenderAlly : null;

  // Base power
  const allyAb = ally ? getAbility(ally) : null;
  const powerMods = collect([
    aAb?.basePower && [aName, aAb.basePower(ctx)],
    ally && allyAb?.allyBasePower && [`${ally.name}'s ${abilityName(ally)}`, allyAb.allyBasePower(ctx)],
    opts.helpingHand ? ['Helping Hand', 1.5] : null,
    dAb?.defenderBasePower && [`${defender.name}'s ${dName}`, dAb.defenderBasePower(ctx)],
    aItem?.basePower && [attacker.item, aItem.basePower(ctx)],
    terrain && terrain !== 'misty' && attackerGrounded && move.type === TERRAIN_TYPE[terrain] ? [terrainLabel, 1.3] : null,
    terrain === 'grassy' && defenderGrounded && GRASSY_HALVED.has(move.name) ? [terrainLabel, 0.5] : null,
    terrain === 'misty' && defenderGrounded && move.type === 'Dragon' ? [terrainLabel, 0.5] : null,
  ]);
  const power = Math.max(1, applyMod(move.power, chainMods(powerMods.map((m) => m[1]))));

  // Attack and Defense with stat stages (crits ignore the harmful ones; Unaware ignores them all)
  let atkStage = attacker.boosts[atkKey];
  let defStage = defender.boosts[defKey];
  if (dAb?.unaware) atkStage = 0;
  if (aAb?.unaware) defStage = 0;
  if (opts.crit) {
    atkStage = Math.max(0, atkStage);
    defStage = Math.min(0, defStage);
  }
  const attackMods = collect([
    aAb?.attack && [aName, aAb.attack(ctx)],
    dAb?.defenderAttackMod && [`${defender.name}'s ${dName}`, dAb.defenderAttackMod(ctx)],
    aItem?.attack && [attacker.item, aItem.attack(ctx)],
  ]);
  const defTypes = typesOf(defender);
  const defenseMods = collect([
    dAb?.defense && [dName, dAb.defense(ctx)],
    dItem?.defense && [defender.item, dItem.defense(ctx)],
    weather === 'sand' && !physical && defTypes.includes('Rock') ? ['Sandstorm', 1.5] : null,
    weather === 'snow' && physical && defTypes.includes('Ice') ? ['Snow', 1.5] : null,
  ]);
  const attack = Math.max(1, applyMod(Math.floor(attacker.stats[atkKey] * stageMultiplier(atkStage)), chainMods(attackMods.map((m) => m[1]))));
  const defense = Math.max(1, applyMod(Math.floor(defender.stats[defKey] * stageMultiplier(defStage)), chainMods(defenseMods.map((m) => m[1]))));
  const level = attacker.build.level;

  const fmtStage = (n: number) => (n === 0 ? '' : ` (${n > 0 ? '+' : ''}${n})`);
  const attackLabel = `${physical ? 'Atk' : 'SpA'}${fmtStage(atkStage)}`;
  const defenseLabel = `${physical ? 'Def' : 'SpD'}${fmtStage(defStage)}`;

  const baseDamage = Math.floor(Math.floor((Math.floor((2 * level) / 5 + 2) * power * attack) / defense) / 50) + 2;
  const steps: DamageStep[] = [{ label: 'Base damage', multiplier: '', result: baseDamage }];
  let d = baseDamage;

  if (opts.spread) {
    d = modify(d, 0.75);
    steps.push({ label: 'Spread move', multiplier: '×0.75', result: d });
  }
  const weatherMod =
    weather === 'sun' ? (move.type === 'Fire' ? 1.5 : move.type === 'Water' ? 0.5 : 1)
    : weather === 'rain' ? (move.type === 'Water' ? 1.5 : move.type === 'Fire' ? 0.5 : 1)
    : 1;
  if (weatherMod !== 1 && !opts.typeless) {
    d = modify(d, weatherMod);
    steps.push({ label: weather === 'sun' ? 'Harsh sunlight' : 'Rain', multiplier: `×${weatherMod}`, result: d });
  }
  if (opts.crit) {
    d = Math.floor(d * CRIT_MULTIPLIER);
    steps.push({ label: 'Critical hit', multiplier: '×1.5', result: d });
  }
  d = Math.floor((d * opts.roll) / 100);
  steps.push({ label: 'Random roll', multiplier: `×${opts.roll}%`, result: d });

  const stab = !opts.typeless && typesOf(attacker).includes(move.type) ? aAb?.stab ?? 1.5 : 1;
  if (stab !== 1) {
    d = modify(d, stab);
    steps.push({ label: stab === 1.5 ? 'STAB' : `STAB (${aName})`, multiplier: `×${stab}`, result: d });
  }
  if (eff !== 1) {
    d = Math.floor(d * eff);
    steps.push({ label: 'Type effectiveness', multiplier: `×${eff}`, result: d });
  }
  const burned = physical && attacker.status === 'brn' && !aAb?.guts;
  if (burned) {
    d = modify(d, 0.5);
    steps.push({ label: 'Burn', multiplier: '×0.5', result: d });
  }

  const dAllyAb = dAlly ? defenderAbility(dAlly, attacker) : null;
  const resistBerry = !!dItem?.resistBerry && !opts.typeless && dItem.resistBerry === move.type && (eff > 1 || move.type === 'Normal');
  const finalMods = collect([
    opts.screen && !opts.crit ? [physical ? 'Reflect' : 'Light Screen', opts.doubles ? DOUBLES_SCREEN : 0.5] : null,
    dAb?.defenderFinal && [`${defender.name}'s ${dName}`, dAb.defenderFinal(ctx)],
    dAlly && dAllyAb?.allyDefenderFinal && [`${dAlly.name}'s ${abilityName(dAlly)}`, dAllyAb.allyDefenderFinal(ctx)],
    opts.crit && aAb?.critFinal ? [aName, aAb.critFinal] : null,
    aAb?.attackerFinal && [aName, aAb.attackerFinal(ctx)],
    aItem?.attackerFinal && [attacker.item, aItem.attackerFinal(ctx)],
    resistBerry ? [defender.item, 0.5] : null,
  ]);
  if (finalMods.length) {
    const mod = chainMods(finalMods.map((m) => m[1]));
    d = applyMod(d, mod);
    steps.push({ label: finalMods.map((m) => m[0]).join(', '), multiplier: fmtMod(mod), result: d });
  }

  const damage = eff === 0 ? 0 : Math.max(1, d);
  return {
    level, movePower: move.power, power, powerNotes: notes(powerMods),
    attackLabel, attack, attackNotes: notes(attackMods),
    defenseLabel, defense, defenseNotes: notes(defenseMods),
    baseDamage, crit: opts.crit, roll: opts.roll, stab, effectiveness: eff, burned, steps, damage, resistBerry,
  };
}

/** Min/max damage with no crit (rolls 85 and 100), for previews. */
export function damageRange(attacker: BattlePokemon, defender: BattlePokemon, move: Move, opts: Partial<DamageOptions> = {}) {
  if (move.category === 'Status' || move.power <= 0) return null;
  const min = calcDamage(attacker, defender, move, { ...opts, crit: false, roll: 85 }).damage;
  const max = calcDamage(attacker, defender, move, { ...opts, crit: false, roll: 100 }).damage;
  return { min, max };
}
