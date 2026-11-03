export const TYPES = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice',
  'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug',
  'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
] as const;
export type TypeName = (typeof TYPES)[number];

export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type StatTable = Record<StatKey, number>;

export const STAT_LABELS: Record<StatKey, string> = {
  hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed',
};

export const BOOSTABLE_STATS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'] as const;
export type BoostableStat = (typeof BOOSTABLE_STATS)[number];
export type Boosts = Record<BoostableStat, number>;

export const BOOST_LABELS: Record<BoostableStat, string> = {
  atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed',
  accuracy: 'Accuracy', evasion: 'Evasion',
};

export type MoveCategory = 'Physical' | 'Special' | 'Status';

export const MAJOR_STATUSES = ['brn', 'par', 'psn', 'tox', 'slp', 'frz'] as const;
export type MajorStatus = (typeof MAJOR_STATUSES)[number];

export const STATUS_LABELS: Record<MajorStatus, string> = {
  brn: 'Burn', par: 'Paralysis', psn: 'Poison', tox: 'Bad Poison', slp: 'Sleep', frz: 'Freeze',
};

/** Chances are percentages from 0 to 100. */
export interface MoveEffects {
  /** Inflict a major status on the target. */
  status?: { status: MajorStatus; chance: number };
  /** Change the target's stat stages. */
  targetBoosts?: { boosts: Partial<Boosts>; chance: number };
  /** Change the user's stat stages. */
  selfBoosts?: { boosts: Partial<Boosts>; chance: number };
  /** Heal this % of damage dealt (e.g. Giga Drain = 50). */
  drain?: number;
  /** User takes this % of damage dealt (e.g. Double-Edge = 33). */
  recoil?: number;
  /** Heal this % of the user's max HP (e.g. Recover = 50). */
  heal?: number;
}

export interface Move {
  name: string;
  type: TypeName;
  category: MoveCategory;
  power: number;
  /** Percent accuracy, or null for moves that never miss. */
  accuracy: number | null;
  pp: number;
  priority: number;
  /** Raises the critical-hit stage by 1 (e.g. Slash, Stone Edge). */
  highCrit: boolean;
  effects: MoveEffects;
}

export interface PokemonBuild {
  id: string;
  name: string;
  level: number;
  type1: TypeName;
  type2: TypeName | null;
  nature: NatureName;
  baseStats: StatTable;
  ivs: StatTable;
  evs: StatTable;
  moves: (Move | null)[];
}

export const NATURES = {
  Hardy: [null, null], Lonely: ['atk', 'def'], Brave: ['atk', 'spe'], Adamant: ['atk', 'spa'], Naughty: ['atk', 'spd'],
  Bold: ['def', 'atk'], Docile: [null, null], Relaxed: ['def', 'spe'], Impish: ['def', 'spa'], Lax: ['def', 'spd'],
  Timid: ['spe', 'atk'], Hasty: ['spe', 'def'], Serious: [null, null], Jolly: ['spe', 'spa'], Naive: ['spe', 'spd'],
  Modest: ['spa', 'atk'], Mild: ['spa', 'def'], Quiet: ['spa', 'spe'], Bashful: [null, null], Rash: ['spa', 'spd'],
  Calm: ['spd', 'atk'], Gentle: ['spd', 'def'], Sassy: ['spd', 'spe'], Careful: ['spd', 'spa'], Quirky: [null, null],
} as const satisfies Record<string, readonly [StatKey | null, StatKey | null]>;
export type NatureName = keyof typeof NATURES;
export const NATURE_NAMES = Object.keys(NATURES) as NatureName[];

/** A Pokémon's live state during a battle. */
export interface BattlePokemon {
  build: PokemonBuild;
  stats: StatTable;
  currentHp: number;
  status: MajorStatus | null;
  /** Turns of sleep remaining before waking. */
  sleepTurns: number;
  /** Turns spent badly poisoned (damage = counter/16 of max HP). */
  toxicCounter: number;
  boosts: Boosts;
  /** Remaining PP for each move slot. */
  pp: number[];
}
