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
  /** Status moves: heal each target by this % of its max HP (Recover = 50 on self, Heal Pulse = 50 on a target). */
  heal?: number;
  /** Chance (%) to make the target flinch if it hasn't moved yet this turn. */
  flinch?: number;
  /** Chance (%) to confuse the target. */
  confuse?: number;
  /** Hits a random number of times in this range (2–5 uses the games' 35/35/15/15% odds). */
  multiHit?: [number, number];
  /** Deals fixed damage: the user's level, half the target's current HP, or a set number. */
  fixedDamage?: 'level' | 'halfHp' | number;
}

export const MOVE_FLAGS = ['contact', 'punch', 'bite', 'pulse', 'sound', 'powder'] as const;
export type MoveFlag = (typeof MOVE_FLAGS)[number];

export const WEATHERS = ['sun', 'rain', 'sand', 'snow'] as const;
export type Weather = (typeof WEATHERS)[number];
export const WEATHER_LABELS: Record<Weather, string> = { sun: 'Harsh sunlight', rain: 'Rain', sand: 'Sandstorm', snow: 'Snow' };

export const TERRAINS = ['electric', 'grassy', 'psychic', 'misty'] as const;
export type Terrain = (typeof TERRAINS)[number];
export const TERRAIN_LABELS: Record<Terrain, string> = {
  electric: 'Electric Terrain', grassy: 'Grassy Terrain', psychic: 'Psychic Terrain', misty: 'Misty Terrain',
};

/** Who a move hits. In singles, every foe-targeting option means "the foe". */
export const MOVE_TARGETS = ['normal', 'self', 'ally', 'selfAndAlly', 'adjacentFoes', 'allAdjacent', 'allySide', 'field'] as const;
export type MoveTarget = (typeof MOVE_TARGETS)[number];

export const MOVE_TARGET_LABELS: Record<MoveTarget, string> = {
  normal: 'One Pokémon (chosen)',
  self: 'User',
  ally: 'Ally',
  selfAndAlly: 'User and ally',
  adjacentFoes: 'Both foes (spread)',
  allAdjacent: 'Everyone else (spread)',
  allySide: "User's side",
  field: 'Whole field',
};

/** Moves with behavior that doesn't fit the generic effect fields. */
export const MOVE_SPECIALS = [
  'protect', 'wideGuard', 'quickGuard', 'followMe', 'ragePowder', 'spotlight', 'helpingHand', 'fakeOut',
  'allySwitch', 'afterYou', 'quash', 'pollenPuff', 'tailwind', 'trickRoom', 'reflect', 'lightScreen',
  'sunnyDay', 'rainDance', 'sandstorm', 'snowscape', 'electricTerrain', 'grassyTerrain', 'psychicTerrain', 'mistyTerrain',
  'weatherBall', 'stormAccuracy', 'snowAccuracy', 'instruct', 'beatUp',
  'taunt', 'encore', 'substitute', 'leechSeed', 'disable', 'torment', 'yawn', 'perishSong',
] as const;
export type MoveSpecial = (typeof MOVE_SPECIALS)[number];

export const MOVE_SPECIAL_LABELS: Record<MoveSpecial, string> = {
  protect: 'Protect (block moves this turn)',
  wideGuard: 'Wide Guard (block spread moves)',
  quickGuard: 'Quick Guard (block priority moves)',
  followMe: 'Follow Me (draw foes’ attacks)',
  ragePowder: 'Rage Powder (draw foes’ attacks)',
  spotlight: 'Spotlight (target draws attacks)',
  helpingHand: 'Helping Hand (ally ×1.5 power)',
  fakeOut: 'Fake Out (first turn only)',
  allySwitch: 'Ally Switch (swap positions)',
  afterYou: 'After You (target moves next)',
  quash: 'Quash (target moves last)',
  pollenPuff: 'Pollen Puff (heals an ally instead)',
  tailwind: 'Tailwind (side Speed ×2, 4 turns)',
  trickRoom: 'Trick Room (slower moves first, 5 turns)',
  reflect: 'Reflect (physical damage reduced, 5 turns)',
  lightScreen: 'Light Screen (special damage reduced, 5 turns)',
  sunnyDay: 'Sunny Day (sun, 5 turns)',
  rainDance: 'Rain Dance (rain, 5 turns)',
  sandstorm: 'Sandstorm (sand, 5 turns)',
  snowscape: 'Snowscape (snow, 5 turns)',
  electricTerrain: 'Electric Terrain (5 turns)',
  grassyTerrain: 'Grassy Terrain (5 turns)',
  psychicTerrain: 'Psychic Terrain (5 turns)',
  mistyTerrain: 'Misty Terrain (5 turns)',
  weatherBall: 'Weather Ball (type and power follow the weather)',
  stormAccuracy: 'Never misses in rain, 50% accuracy in sun',
  snowAccuracy: 'Never misses in snow',
  instruct: 'Instruct (target repeats its last move)',
  beatUp: 'Beat Up (one hit per healthy team member)',
  taunt: 'Taunt (target can’t use status moves, 3 turns)',
  encore: 'Encore (target repeats its last move, 3 turns)',
  substitute: 'Substitute (costs 1/4 HP, absorbs attacks)',
  leechSeed: 'Leech Seed (drains 1/8 HP each turn)',
  disable: 'Disable (target’s last move unusable, 4 turns)',
  torment: 'Torment (target can’t repeat a move)',
  yawn: 'Yawn (target falls asleep next turn)',
  perishSong: 'Perish Song (all who hear it faint in 3 turns)',
};

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
  target: MoveTarget;
  special?: MoveSpecial;
  /** Contact, punch, bite, pulse, sound and powder flags used by abilities and items. */
  flags?: MoveFlag[];
  effects: MoveEffects;
}

export type Side = 0 | 1;
export type Format = 'singles' | 'doubles';

/** Value used in PokemonBuild.ability to select the user-defined ability. */
export const CUSTOM_ABILITY = 'Custom';

/** A user-defined ability made from generic effects. Multipliers of 1 mean "no change". */
export interface CustomAbility {
  name: string;
  /** Multiply the user's stats in battle (e.g. atk 2 for Huge Power). */
  statMultipliers: Partial<Record<Exclude<StatKey, 'hp'>, number>>;
  /** Power multiplier for the user's moves of one type. */
  boostType: TypeName | null;
  boostMultiplier: number;
  /** Immune to one type; optionally heal 25% or raise a stat when hit by it. */
  immuneType: TypeName | null;
  onImmune: 'none' | 'heal' | 'boost';
  immuneBoost: BoostableStat;
  /** Damage taken from one type is multiplied (e.g. 0.5). */
  resistType: TypeName | null;
  resistMultiplier: number;
  /** STAB multiplier (1.5 normally, 2 for Adaptability). */
  stabMultiplier: number;
  /** Multiplier on super-effective damage taken (Filter = 0.75). */
  superEffectiveTaken: number;
  critImmune: boolean;
  statusImmune: MajorStatus[];
  /** Applied to each foe when the battle starts (Intimidate = atk -1). */
  onStartFoeBoosts: Partial<Boosts>;
  /** Applied to the user at the end of each turn (Speed Boost = spe +1). */
  endOfTurnBoosts: Partial<Boosts>;
  /** Sets weather / terrain for 5 turns when the battle starts (Drought, Electric Surge). */
  onStartWeather: Weather | null;
  onStartTerrain: Terrain | null;
  /** Chance (%) to inflict a status on a Pokémon that makes contact (Static = par 30). */
  contactStatus: { status: MajorStatus; chance: number } | null;
  /** % of the attacker's max HP lost when it makes contact (Rough Skin = 12.5). */
  contactDamage: number;
}

export interface PokemonBuild {
  id: string;
  name: string;
  level: number;
  type1: TypeName;
  type2: TypeName | null;
  nature: NatureName;
  /** Preset ability name, CUSTOM_ABILITY, or '' for none. */
  ability: string;
  customAbility?: CustomAbility;
  /** Held item name, or '' for none. */
  item: string;
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

/** Per-turn flags, reset at the start of every turn. */
export interface TurnVolatiles {
  moved: boolean;
  protected: boolean;
  flinched: boolean;
  helpingHand: boolean;
  /** Set by Follow Me / Spotlight ('followMe') or Rage Powder ('powder', ignored by Grass types). */
  centerOfAttention: 'followMe' | 'powder' | null;
}

/** A Pokémon's live state during a battle. */
export interface BattlePokemon {
  /** Stable id for this battle, e.g. "p1a". */
  uid: string;
  /** Display name (made unique within the battle). */
  name: string;
  side: Side;
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
  /** Current held item ('' once consumed). */
  item: string;
  /** Move slot a Choice item has locked in, if any. */
  choiceLock: number | null;
  /** Consecutive successful Protect-family uses. */
  protectStreak: number;
  /** Turns completed on the field (Fake Out needs 0). */
  turnsActive: number;
  /** Flash Fire has been activated. */
  flashFire: boolean;
  /** The faint message has been logged. */
  faintLogged: boolean;
  /** Confusion turns remaining (0 = not confused). */
  confusion: number;
  /** Turns of Taunt left (0 = not taunted). */
  taunt: number;
  /** Encore: the move slot it's locked into and turns left. */
  encore: { move: number; turns: number } | null;
  /** HP left on its Substitute (0 = none). */
  substituteHp: number;
  /** Seeded by Leech Seed: the field position that receives the drained HP. */
  leechSeed: { side: Side; slot: number } | null;
  /** Disable: the move slot that can't be used and turns left. */
  disable: { move: number; turns: number } | null;
  /** Can't use the same move twice in a row. */
  torment: boolean;
  /** Yawn: turns until it falls asleep (0 = not drowsy). */
  yawn: number;
  /** Perish Song count (0 = none); faints when it reaches 0 from 1. */
  perishCount: number;
  /** The last move this Pokémon used (for Instruct, Encore, Disable and Torment). */
  lastAction: { move: number; target?: { side: Side; slot: number } } | null;
  vol: TurnVolatiles;
}
