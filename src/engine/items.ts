import type { DamageCtx } from './abilities';
import type { BattlePokemon, TypeName } from './types';

export interface ItemDef {
  desc: string;
  group: 'Choice' | 'Power' | 'Defense' | 'Type boost' | 'Resist berry' | 'Other';
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
  'Focus Sash': { group: 'Defense', desc: 'Survives one hit from full HP with 1 HP, then is used up.', focusSash: true },
  'Light Clay': { group: 'Other', desc: 'Reflect and Light Screen last 8 turns.', lightClay: true },
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

export const ITEM_GROUPS: ItemDef['group'][] = ['Choice', 'Power', 'Defense', 'Type boost', 'Resist berry', 'Other'];

export function getItem(mon: BattlePokemon): ItemDef | null {
  return mon.item ? ITEMS[mon.item] ?? null : null;
}
