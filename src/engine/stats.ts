import { NATURES, STAT_KEYS } from './types';
import type { NatureName, PokemonBuild, StatKey, StatTable } from './types';

export const MAX_EV = 252;
export const MAX_EV_TOTAL = 510;
export const MAX_IV = 31;

export function natureMultiplier(nature: NatureName, stat: StatKey): number {
  const [up, down] = NATURES[nature];
  if (up === down) return 1;
  if (stat === up) return 1.1;
  if (stat === down) return 0.9;
  return 1;
}

/** Standard Gen 3+ stat formula. */
export function calcStat(stat: StatKey, base: number, iv: number, ev: number, level: number, nature: NatureName): number {
  const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100);
  if (stat === 'hp') return core + level + 10;
  return Math.floor((core + 5) * natureMultiplier(nature, stat));
}

export function calcAllStats(build: PokemonBuild): StatTable {
  const out = {} as StatTable;
  for (const s of STAT_KEYS) {
    out[s] = calcStat(s, build.baseStats[s], build.ivs[s], build.evs[s], build.level, build.nature);
  }
  return out;
}

/** Multiplier for Atk/Def/SpA/SpD/Spe stages (-6..+6). */
export function stageMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

/** Multiplier for accuracy/evasion stages (-6..+6). */
export function accuracyStageMultiplier(stage: number): number {
  return stage >= 0 ? (3 + stage) / 3 : 3 / (3 - stage);
}

export function clampStage(n: number): number {
  return Math.max(-6, Math.min(6, n));
}

export function evTotal(build: PokemonBuild): number {
  return STAT_KEYS.reduce((sum, s) => sum + build.evs[s], 0);
}

export function validateBuild(build: PokemonBuild): string[] {
  const errors: string[] = [];
  if (!build.name.trim()) errors.push('Name is required.');
  if (build.level < 1 || build.level > 100) errors.push('Level must be 1–100.');
  for (const s of STAT_KEYS) {
    if (build.baseStats[s] < 1 || build.baseStats[s] > 255) errors.push(`Base ${s.toUpperCase()} must be 1–255.`);
    if (build.ivs[s] < 0 || build.ivs[s] > MAX_IV) errors.push(`${s.toUpperCase()} IV must be 0–${MAX_IV}.`);
    if (build.evs[s] < 0 || build.evs[s] > MAX_EV) errors.push(`${s.toUpperCase()} EV must be 0–${MAX_EV}.`);
  }
  const total = evTotal(build);
  if (total > MAX_EV_TOTAL) errors.push(`EV total is ${total}; the maximum is ${MAX_EV_TOTAL}.`);
  if (!build.moves.some((m) => m)) errors.push('At least one move is required.');
  return errors;
}
