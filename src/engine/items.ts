import type { DamageCtx } from './abilities';
import { typesOf } from './types';
import type { BattlePokemon, TypeName, Weather } from './types';

export interface ItemDef {
  desc: string;
  group: 'Choice' | 'Power' | 'Defense' | 'Recovery' | 'Contact' | 'Field' | 'Type boost' | 'Resist berry' | 'Other';
  basePower?(c: DamageCtx): number;
  attack?(c: DamageCtx): number;
  defense?(c: DamageCtx): number;
  attackerFinal?(c: DamageCtx): number;
  speed?: number;
  /** Locks the holder into its first move. */
  choice?: boolean;
  /** Holder loses 10% max HP after dealing damage. */
  lifeOrb?: boolean;
  /** Holder can't select status moves. */
  noStatusMoves?: boolean;
  /** Halves a super-effective hit of this type (Normal: any hit), then is used up. */
  resistBerry?: TypeName;
  focusSash?: boolean;
  /** Screens last 8 turns instead of 5. */
  lightClay?: boolean;
  /** End-of-turn HP change as a fraction of max HP (Leftovers = 1/16). */
  endOfTurnHp?(mon: BattlePokemon): number;
  /** Heals when HP drops to half or less, then is used up. Fraction of max HP, or flat HP when `flat`. */
  pinchHeal?: { amount: number; flat?: boolean };
  /** Cures a status condition or confusion, then is used up. */
  lum?: boolean;
  /** Heals this fraction of the damage the holder deals. */
  shellBell?: number;
  /** An attacker that makes contact loses this fraction of its max HP. */
  contactDamage?: number;
  /** Weather it sets lasts 8 turns. */
  extendsWeather?: Weather;
  /** Terrain it sets lasts 8 turns. */
  extendsTerrain?: boolean;
  /** Unaffected by entry hazards. */
  hazardImmune?: boolean;
}

const TYPE_BOOSTERS: [string, TypeName][] = [
  ['Silk Scarf', 'Normal'], ['Charcoal', 'Fire'], ['Mystic Water', 'Water'], ['Magnet', 'Electric'],
  ['Miracle Seed', 'Grass'], ['Never-Melt Ice', 'Ice'], ['Black Belt', 'Fighting'], ['Poison Barb', 'Poison'],
  ['Soft Sand', 'Ground'], ['Sharp Beak', 'Flying'], ['Twisted Spoon', 'Psychic'], ['Silver Powder', 'Bug'],
  ['Hard Stone', 'Rock'], ['Spell Tag', 'Ghost'], ['Dragon Fang', 'Dragon'], ['Black Glasses', 'Dark'],
  ['Metal Coat', 'Steel'], ['Fairy Feather', 'Fairy'],
];

const RESIST_BERRIES: [string, TypeName][] = [
  ['Chilan Berry', 'Normal'], ['Occa Berry', 'Fire'], ['Passho Berry', 'Water'], ['Wacan Berry', 'Electric'],
  ['Rindo Berry', 'Grass'], ['Yache Berry', 'Ice'], ['Chople Berry', 'Fighting'], ['Kebia Berry', 'Poison'],
  ['Shuca Berry', 'Ground'], ['Coba Berry', 'Flying'], ['Payapa Berry', 'Psychic'], ['Tanga Berry', 'Bug'],
  ['Charti Berry', 'Rock'], ['Kasib Berry', 'Ghost'], ['Haban Berry', 'Dragon'], ['Colbur Berry', 'Dark'],
  ['Babiri Berry', 'Steel'], ['Roseli Berry', 'Fairy'],
];

export const ITEMS: Record<string, ItemDef> = {
  'Choice Band': { group: 'Choice', desc: 'Attack ×1.5, but locked into the first move used.', choice: true, attack: (c) => (c.move.category === 'Physical' ? 1.5 : 1) },
  'Choice Specs': { group: 'Choice', desc: 'Sp. Atk ×1.5, but locked into the first move used.', choice: true, attack: (c) => (c.move.category === 'Special' ? 1.5 : 1) },
  'Choice Scarf': { group: 'Choice', desc: 'Speed ×1.5, but locked into the first move used.', choice: true, speed: 1.5 },
  'Life Orb': { group: 'Power', desc: 'Damage ×1.3; the holder loses 10% max HP after attacking.', lifeOrb: true, attackerFinal: () => 1.3 },
  'Expert Belt': { group: 'Power', desc: 'Super-effective damage ×1.2.', attackerFinal: (c) => (c.eff > 1 ? 1.2 : 1) },
  'Muscle Band': { group: 'Power', desc: 'Physical moves ×1.1 power.', basePower: (c) => (c.move.category === 'Physical' ? 1.1 : 1) },
  'Wise Glasses': { group: 'Power', desc: 'Special moves ×1.1 power.', basePower: (c) => (c.move.category === 'Special' ? 1.1 : 1) },
  'Assault Vest': { group: 'Defense', desc: 'Sp. Def ×1.5, but can’t use status moves.', noStatusMoves: true, defense: (c) => (c.move.category === 'Special' ? 1.5 : 1) },
  Eviolite: { group: 'Defense', desc: 'Defense and Sp. Def ×1.5 (for Pokémon that can still evolve).', defense: () => 1.5 },
  'Heavy-Duty Boots': { group: 'Defense', desc: 'Unaffected by entry hazards (Stealth Rock, Spikes, Toxic Spikes, Sticky Web).', hazardImmune: true },
  'Focus Sash': { group: 'Defense', desc: 'Survives one hit from full HP with 1 HP, then is used up.', focusSash: true },
  Leftovers: { group: 'Recovery', desc: 'Heals 1/16 max HP at the end of each turn.', endOfTurnHp: () => 1 / 16 },
  'Black Sludge': {
    group: 'Recovery', desc: 'Poison types heal 1/16 max HP each turn; anything else loses 1/8.',
    endOfTurnHp: (mon) => (typesOf(mon).includes('Poison') ? 1 / 16 : -1 / 8),
  },
  'Sitrus Berry': { group: 'Recovery', desc: 'Heals 25% max HP at half HP or less, then is used up.', pinchHeal: { amount: 0.25 } },
  'Oran Berry': { group: 'Recovery', desc: 'Heals 10 HP at half HP or less, then is used up.', pinchHeal: { amount: 10, flat: true } },
  'Lum Berry': { group: 'Recovery', desc: 'Cures any status condition or confusion once, then is used up.', lum: true },
  'Shell Bell': { group: 'Recovery', desc: 'Heals 1/8 of the damage the holder deals.', shellBell: 1 / 8 },
  'Rocky Helmet': { group: 'Contact', desc: 'A Pokémon that makes contact with the holder loses 1/6 of its max HP.', contactDamage: 1 / 6 },
  'Heat Rock': { group: 'Field', desc: 'Harsh sunlight the holder sets lasts 8 turns.', extendsWeather: 'sun' },
  'Damp Rock': { group: 'Field', desc: 'Rain the holder sets lasts 8 turns.', extendsWeather: 'rain' },
  'Smooth Rock': { group: 'Field', desc: 'A sandstorm the holder sets lasts 8 turns.', extendsWeather: 'sand' },
  'Icy Rock': { group: 'Field', desc: 'Snow the holder sets lasts 8 turns.', extendsWeather: 'snow' },
  'Terrain Extender': { group: 'Field', desc: 'Terrain the holder sets lasts 8 turns.', extendsTerrain: true },
  'Light Clay': { group: 'Field', desc: 'Reflect and Light Screen last 8 turns.', lightClay: true },
};

for (const [name, type] of TYPE_BOOSTERS) {
  ITEMS[name] = { group: 'Type boost', desc: `${type} moves ×1.2 power.`, basePower: (c) => (c.move.type === type ? 1.2 : 1) };
}
for (const [name, type] of RESIST_BERRIES) {
  ITEMS[name] = {
    group: 'Resist berry',
    desc: type === 'Normal' ? 'Halves damage from one Normal-type hit, then is used up.' : `Halves damage from one super-effective ${type} hit, then is used up.`,
    resistBerry: type,
  };
}

export const ITEM_GROUPS: ItemDef['group'][] = ['Choice', 'Power', 'Defense', 'Recovery', 'Contact', 'Field', 'Type boost', 'Resist berry'];

/** The held item's effects, or null if it has none (no item, used up, or Magic Room). */
export function getItem(mon: BattlePokemon): ItemDef | null {
  return mon.item && !mon.itemsSuppressed ? ITEMS[mon.item] ?? null : null;
}
