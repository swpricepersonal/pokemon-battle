/**
 * The games apply multipliers as fixed-point fractions of 4096 and round
 * "half down" (x.5 rounds toward zero). These helpers reproduce that.
 */

export function toMod(multiplier: number): number {
  return Math.round(multiplier * 4096);
}

/** Chain several multipliers into one 4096-based modifier. */
export function chainMods(multipliers: number[]): number {
  let mod = 4096;
  for (const m of multipliers) mod = Math.floor((mod * toMod(m) + 2048) / 4096);
  return mod;
}

/** Apply a 4096-based modifier to a value, rounding .5 down. */
export function applyMod(value: number, mod4096: number): number {
  return Math.floor((value * mod4096 + 2047) / 4096);
}

/** Apply a decimal multiplier the way the games do. */
export function modify(value: number, multiplier: number): number {
  return applyMod(value, toMod(multiplier));
}

/** Format a 4096-based modifier for display, e.g. "×1.5". */
export function fmtMod(mod4096: number): string {
  return `×${Math.round((mod4096 / 4096) * 1000) / 1000}`;
}
