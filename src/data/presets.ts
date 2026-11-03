import type { Move, MoveCategory, MoveEffects, MoveFlag, MoveSpecial, MoveTarget, PokemonBuild, StatTable, TypeName } from '../engine/types';

/** Default target: status moves that only affect the user target 'self', everything else one Pokémon. */
export function defaultMoveTarget(category: MoveCategory, effects: MoveEffects): MoveTarget {
  return category === 'Status' && !effects.status && !effects.targetBoosts && !effects.confuse ? 'self' : 'normal';
}

/** Move flags by name, so library entries stay one line each. */
const FLAG_LISTS: Record<MoveFlag, string[]> = {
  contact: [
    'Tackle', 'Quick Attack', 'Extreme Speed', 'Body Slam', 'Double-Edge', 'Slash', 'Fake Out', 'Headbutt', 'Double Hit',
    'Super Fang', 'Flare Blitz', 'Fire Punch', 'Aqua Jet', 'Waterfall', 'Wild Charge', 'Thunder Punch', 'Leaf Blade',
    'Ice Punch', 'Close Combat', 'Drain Punch', 'Mach Punch', 'Dynamic Punch', 'Seismic Toss', 'Poison Jab', 'High Horsepower',
    'Brave Bird', 'Dual Wingbeat', 'Zen Headbutt', 'X-Scissor', 'Shadow Sneak', 'Dragon Claw', 'Crunch', 'Iron Head',
    'Bullet Punch', 'Play Rough',
  ],
  punch: ['Fire Punch', 'Thunder Punch', 'Ice Punch', 'Drain Punch', 'Mach Punch', 'Dynamic Punch', 'Bullet Punch'],
  bite: ['Crunch'],
  pulse: ['Water Pulse', 'Aura Sphere', 'Dragon Pulse', 'Dark Pulse', 'Heal Pulse'],
  sound: ['Hyper Voice', 'Bug Buzz', 'Snarl', 'Growl', 'Screech'],
  powder: ['Spore', 'Rage Powder'],
};

function flagsFor(name: string): MoveFlag[] {
  return (Object.keys(FLAG_LISTS) as MoveFlag[]).filter((f) => FLAG_LISTS[f].includes(name));
}

function mv(
  name: string, type: TypeName, category: MoveCategory, power: number, accuracy: number | null, pp: number,
  extra: Partial<Pick<Move, 'priority' | 'highCrit'>> & { effects?: MoveEffects; target?: MoveTarget; special?: MoveSpecial } = {},
): Move {
  const effects = extra.effects ?? {};
  const move: Move = {
    name, type, category, power, accuracy, pp,
    priority: extra.priority ?? 0, highCrit: extra.highCrit ?? false,
    target: extra.target ?? defaultMoveTarget(category, effects),
    effects,
  };
  if (extra.special) move.special = extra.special;
  const flags = flagsFor(name);
  if (flags.length) move.flags = flags;
  return move;
}

const FOES = { target: 'adjacentFoes' as const };
const ALL = { target: 'allAdjacent' as const };

export const MOVE_LIBRARY: Move[] = [
  // Normal
  mv('Tackle', 'Normal', 'Physical', 40, 100, 35),
  mv('Quick Attack', 'Normal', 'Physical', 40, 100, 30, { priority: 1 }),
  mv('Extreme Speed', 'Normal', 'Physical', 80, 100, 5, { priority: 2 }),
  mv('Body Slam', 'Normal', 'Physical', 85, 100, 15, { effects: { status: { status: 'par', chance: 30 } } }),
  mv('Double-Edge', 'Normal', 'Physical', 120, 100, 15, { effects: { recoil: 33 } }),
  mv('Slash', 'Normal', 'Physical', 70, 100, 20, { highCrit: true }),
  mv('Hyper Voice', 'Normal', 'Special', 90, 100, 10, FOES),
  mv('Fake Out', 'Normal', 'Physical', 40, 100, 10, { priority: 3, special: 'fakeOut', effects: { flinch: 100 } }),
  mv('Headbutt', 'Normal', 'Physical', 70, 100, 15, { effects: { flinch: 30 } }),
  mv('Double Hit', 'Normal', 'Physical', 35, 90, 10, { effects: { multiHit: [2, 2] } }),
  mv('Super Fang', 'Normal', 'Physical', 1, 90, 10, { effects: { fixedDamage: 'halfHp' } }),
  mv('Weather Ball', 'Normal', 'Special', 50, 100, 10, { special: 'weatherBall' }),
  mv('Swagger', 'Normal', 'Status', 0, 85, 15, { effects: { targetBoosts: { boosts: { atk: 2 }, chance: 100 }, confuse: 100 } }),
  // Fire
  mv('Flamethrower', 'Fire', 'Special', 90, 100, 15, { effects: { status: { status: 'brn', chance: 10 } } }),
  mv('Fire Blast', 'Fire', 'Special', 110, 85, 5, { effects: { status: { status: 'brn', chance: 10 } } }),
  mv('Heat Wave', 'Fire', 'Special', 95, 90, 10, { ...FOES, effects: { status: { status: 'brn', chance: 10 } } }),
  mv('Flare Blitz', 'Fire', 'Physical', 120, 100, 15, { effects: { recoil: 33, status: { status: 'brn', chance: 10 } } }),
  mv('Fire Punch', 'Fire', 'Physical', 75, 100, 15, { effects: { status: { status: 'brn', chance: 10 } } }),
  mv('Sunny Day', 'Fire', 'Status', 0, null, 5, { target: 'field', special: 'sunnyDay' }),
  mv('Will-O-Wisp', 'Fire', 'Status', 0, 85, 15, { effects: { status: { status: 'brn', chance: 100 } } }),
  // Water
  mv('Surf', 'Water', 'Special', 90, 100, 15, ALL),
  mv('Muddy Water', 'Water', 'Special', 90, 85, 10, { ...FOES, effects: { targetBoosts: { boosts: { accuracy: -1 }, chance: 30 } } }),
  mv('Hydro Pump', 'Water', 'Special', 110, 80, 5),
  mv('Scald', 'Water', 'Special', 80, 100, 15, { effects: { status: { status: 'brn', chance: 30 } } }),
  mv('Aqua Jet', 'Water', 'Physical', 40, 100, 20, { priority: 1 }),
  mv('Waterfall', 'Water', 'Physical', 80, 100, 15, { effects: { flinch: 20 } }),
  mv('Water Pulse', 'Water', 'Special', 60, 100, 20, { effects: { confuse: 20 } }),
  mv('Water Shuriken', 'Water', 'Special', 15, 100, 20, { priority: 1, effects: { multiHit: [2, 5] } }),
  mv('Rain Dance', 'Water', 'Status', 0, null, 5, { target: 'field', special: 'rainDance' }),
  // Electric
  mv('Thunderbolt', 'Electric', 'Special', 90, 100, 15, { effects: { status: { status: 'par', chance: 10 } } }),
  mv('Thunder', 'Electric', 'Special', 110, 70, 10, { special: 'stormAccuracy', effects: { status: { status: 'par', chance: 30 } } }),
  mv('Thunder Punch', 'Electric', 'Physical', 75, 100, 15, { effects: { status: { status: 'par', chance: 10 } } }),
  mv('Electric Terrain', 'Electric', 'Status', 0, null, 10, { target: 'field', special: 'electricTerrain' }),
  mv('Thunder Wave', 'Electric', 'Status', 0, 90, 20, { effects: { status: { status: 'par', chance: 100 } } }),
  mv('Wild Charge', 'Electric', 'Physical', 90, 100, 15, { effects: { recoil: 25 } }),
  mv('Discharge', 'Electric', 'Special', 80, 100, 15, { ...ALL, effects: { status: { status: 'par', chance: 30 } } }),
  mv('Electroweb', 'Electric', 'Special', 55, 95, 15, { ...FOES, effects: { targetBoosts: { boosts: { spe: -1 }, chance: 100 } } }),
  // Grass
  mv('Energy Ball', 'Grass', 'Special', 90, 100, 10, { effects: { targetBoosts: { boosts: { spd: -1 }, chance: 10 } } }),
  mv('Giga Drain', 'Grass', 'Special', 75, 100, 10, { effects: { drain: 50 } }),
  mv('Leaf Blade', 'Grass', 'Physical', 90, 100, 15, { highCrit: true }),
  mv('Spore', 'Grass', 'Status', 0, 100, 15, { effects: { status: { status: 'slp', chance: 100 } } }),
  mv('Bullet Seed', 'Grass', 'Physical', 25, 100, 30, { effects: { multiHit: [2, 5] } }),
  mv('Grassy Terrain', 'Grass', 'Status', 0, null, 10, { target: 'field', special: 'grassyTerrain' }),
  mv('Rage Powder', 'Bug', 'Status', 0, null, 20, { priority: 2, special: 'ragePowder' }),
  // Ice
  mv('Ice Beam', 'Ice', 'Special', 90, 100, 10, { effects: { status: { status: 'frz', chance: 10 } } }),
  mv('Ice Shard', 'Ice', 'Physical', 40, 100, 30, { priority: 1 }),
  mv('Blizzard', 'Ice', 'Special', 110, 70, 5, { ...FOES, special: 'snowAccuracy', effects: { status: { status: 'frz', chance: 10 } } }),
  mv('Ice Punch', 'Ice', 'Physical', 75, 100, 15, { effects: { status: { status: 'frz', chance: 10 } } }),
  mv('Icicle Spear', 'Ice', 'Physical', 25, 100, 30, { effects: { multiHit: [2, 5] } }),
  mv('Snowscape', 'Ice', 'Status', 0, null, 10, { target: 'field', special: 'snowscape' }),
  mv('Icy Wind', 'Ice', 'Special', 55, 95, 15, { ...FOES, effects: { targetBoosts: { boosts: { spe: -1 }, chance: 100 } } }),
  mv('Icicle Crash', 'Ice', 'Physical', 85, 90, 10),
  // Fighting
  mv('Close Combat', 'Fighting', 'Physical', 120, 100, 5, { effects: { selfBoosts: { boosts: { def: -1, spd: -1 }, chance: 100 } } }),
  mv('Drain Punch', 'Fighting', 'Physical', 75, 100, 10, { effects: { drain: 50 } }),
  mv('Mach Punch', 'Fighting', 'Physical', 40, 100, 30, { priority: 1 }),
  mv('Dynamic Punch', 'Fighting', 'Physical', 100, 50, 5, { effects: { confuse: 100 } }),
  mv('Seismic Toss', 'Fighting', 'Physical', 1, 100, 20, { effects: { fixedDamage: 'level' } }),
  mv('Aura Sphere', 'Fighting', 'Special', 80, null, 20),
  mv('Coaching', 'Fighting', 'Status', 0, null, 10, { target: 'ally', effects: { targetBoosts: { boosts: { atk: 1, def: 1 }, chance: 100 } } }),
  mv('Quick Guard', 'Fighting', 'Status', 0, null, 15, { priority: 3, target: 'allySide', special: 'quickGuard' }),
  // Poison
  mv('Sludge Bomb', 'Poison', 'Special', 90, 100, 10, { effects: { status: { status: 'psn', chance: 30 } } }),
  mv('Poison Jab', 'Poison', 'Physical', 80, 100, 20, { effects: { status: { status: 'psn', chance: 30 } } }),
  mv('Toxic', 'Poison', 'Status', 0, 90, 10, { effects: { status: { status: 'tox', chance: 100 } } }),
  // Ground
  mv('Earthquake', 'Ground', 'Physical', 100, 100, 10, ALL),
  mv('High Horsepower', 'Ground', 'Physical', 95, 95, 10),
  mv('Bulldoze', 'Ground', 'Physical', 60, 100, 20, { ...ALL, effects: { targetBoosts: { boosts: { spe: -1 }, chance: 100 } } }),
  mv('Earth Power', 'Ground', 'Special', 90, 100, 10, { effects: { targetBoosts: { boosts: { spd: -1 }, chance: 10 } } }),
  mv('Sandstorm', 'Rock', 'Status', 0, null, 10, { target: 'field', special: 'sandstorm' }),
  // Flying
  mv('Brave Bird', 'Flying', 'Physical', 120, 100, 15, { effects: { recoil: 33 } }),
  mv('Air Slash', 'Flying', 'Special', 75, 95, 15, { effects: { flinch: 30 } }),
  mv('Tailwind', 'Flying', 'Status', 0, null, 15, { target: 'allySide', special: 'tailwind' }),
  mv('Hurricane', 'Flying', 'Special', 110, 70, 10, { special: 'stormAccuracy', effects: { confuse: 30 } }),
  mv('Dual Wingbeat', 'Flying', 'Physical', 40, 90, 10, { effects: { multiHit: [2, 2] } }),
  // Psychic
  mv('Psychic', 'Psychic', 'Special', 90, 100, 10, { effects: { targetBoosts: { boosts: { spd: -1 }, chance: 10 } } }),
  mv('Zen Headbutt', 'Psychic', 'Physical', 80, 90, 15),
  mv('Hypnosis', 'Psychic', 'Status', 0, 60, 20, { effects: { status: { status: 'slp', chance: 100 } } }),
  mv('Expanding Force', 'Psychic', 'Special', 80, 100, 10),
  mv('Trick Room', 'Psychic', 'Status', 0, null, 5, { priority: -7, target: 'field', special: 'trickRoom' }),
  mv('Reflect', 'Psychic', 'Status', 0, null, 20, { target: 'allySide', special: 'reflect' }),
  mv('Light Screen', 'Psychic', 'Status', 0, null, 30, { target: 'allySide', special: 'lightScreen' }),
  mv('Ally Switch', 'Psychic', 'Status', 0, null, 15, { priority: 2, special: 'allySwitch' }),
  mv('Instruct', 'Psychic', 'Status', 0, null, 15, { target: 'normal', special: 'instruct' }),
  mv('Psychic Terrain', 'Psychic', 'Status', 0, null, 10, { target: 'field', special: 'psychicTerrain' }),
  mv('Heal Pulse', 'Psychic', 'Status', 0, null, 10, { target: 'normal', effects: { heal: 50 } }),
  // Bug
  mv('Bug Buzz', 'Bug', 'Special', 90, 100, 10, { effects: { targetBoosts: { boosts: { spd: -1 }, chance: 10 } } }),
  mv('X-Scissor', 'Bug', 'Physical', 80, 100, 15),
  mv('Pin Missile', 'Bug', 'Physical', 25, 95, 20, { effects: { multiHit: [2, 5] } }),
  mv('Pollen Puff', 'Bug', 'Special', 90, 100, 15, { special: 'pollenPuff' }),
  // Rock
  mv('Stone Edge', 'Rock', 'Physical', 100, 80, 5, { highCrit: true }),
  mv('Rock Slide', 'Rock', 'Physical', 75, 90, 10, { ...FOES, effects: { flinch: 30 } }),
  mv('Rock Blast', 'Rock', 'Physical', 25, 90, 10, { effects: { multiHit: [2, 5] } }),
  mv('Wide Guard', 'Rock', 'Status', 0, null, 10, { priority: 3, target: 'allySide', special: 'wideGuard' }),
  // Ghost
  mv('Shadow Ball', 'Ghost', 'Special', 80, 100, 15, { effects: { targetBoosts: { boosts: { spd: -1 }, chance: 20 } } }),
  mv('Shadow Sneak', 'Ghost', 'Physical', 40, 100, 30, { priority: 1 }),
  mv('Night Shade', 'Ghost', 'Special', 1, 100, 15, { effects: { fixedDamage: 'level' } }),
  mv('Confuse Ray', 'Ghost', 'Status', 0, 100, 10, { effects: { confuse: 100 } }),
  // Dragon
  mv('Dragon Claw', 'Dragon', 'Physical', 80, 100, 15),
  mv('Draco Meteor', 'Dragon', 'Special', 130, 90, 5, { effects: { selfBoosts: { boosts: { spa: -2 }, chance: 100 } } }),
  mv('Dragon Pulse', 'Dragon', 'Special', 85, 100, 10),
  // Dark
  mv('Crunch', 'Dark', 'Physical', 80, 100, 15, { effects: { targetBoosts: { boosts: { def: -1 }, chance: 20 } } }),
  mv('Dark Pulse', 'Dark', 'Special', 80, 100, 15, { effects: { flinch: 20 } }),
  mv('Snarl', 'Dark', 'Special', 55, 95, 15, { ...FOES, effects: { targetBoosts: { boosts: { spa: -1 }, chance: 100 } } }),
  mv('Quash', 'Dark', 'Status', 0, 100, 15, { target: 'normal', special: 'quash' }),
  mv('Beat Up', 'Dark', 'Physical', 1, 100, 10, { special: 'beatUp' }),
  // Steel
  mv('Iron Head', 'Steel', 'Physical', 80, 100, 15, { effects: { flinch: 30 } }),
  mv('Flash Cannon', 'Steel', 'Special', 80, 100, 10, { effects: { targetBoosts: { boosts: { spd: -1 }, chance: 10 } } }),
  mv('Bullet Punch', 'Steel', 'Physical', 40, 100, 30, { priority: 1 }),
  // Fairy
  mv('Moonblast', 'Fairy', 'Special', 95, 100, 15, { effects: { targetBoosts: { boosts: { spa: -1 }, chance: 30 } } }),
  mv('Play Rough', 'Fairy', 'Physical', 90, 90, 10, { effects: { targetBoosts: { boosts: { atk: -1 }, chance: 10 } } }),
  mv('Dazzling Gleam', 'Fairy', 'Special', 80, 100, 10, FOES),
  mv('Decorate', 'Fairy', 'Status', 0, null, 15, { target: 'normal', effects: { targetBoosts: { boosts: { atk: 2, spa: 2 }, chance: 100 } } }),
  mv('Aromatic Mist', 'Fairy', 'Status', 0, null, 20, { target: 'ally', effects: { targetBoosts: { boosts: { spd: 1 }, chance: 100 } } }),
  mv('Misty Terrain', 'Fairy', 'Status', 0, null, 10, { target: 'field', special: 'mistyTerrain' }),
  // Status: stat changes and healing
  mv('Swords Dance', 'Normal', 'Status', 0, null, 20, { effects: { selfBoosts: { boosts: { atk: 2 }, chance: 100 } } }),
  mv('Nasty Plot', 'Dark', 'Status', 0, null, 20, { effects: { selfBoosts: { boosts: { spa: 2 }, chance: 100 } } }),
  mv('Dragon Dance', 'Dragon', 'Status', 0, null, 20, { effects: { selfBoosts: { boosts: { atk: 1, spe: 1 }, chance: 100 } } }),
  mv('Calm Mind', 'Psychic', 'Status', 0, null, 20, { effects: { selfBoosts: { boosts: { spa: 1, spd: 1 }, chance: 100 } } }),
  mv('Bulk Up', 'Fighting', 'Status', 0, null, 20, { effects: { selfBoosts: { boosts: { atk: 1, def: 1 }, chance: 100 } } }),
  mv('Iron Defense', 'Steel', 'Status', 0, null, 15, { effects: { selfBoosts: { boosts: { def: 2 }, chance: 100 } } }),
  mv('Agility', 'Psychic', 'Status', 0, null, 30, { effects: { selfBoosts: { boosts: { spe: 2 }, chance: 100 } } }),
  mv('Double Team', 'Normal', 'Status', 0, null, 15, { effects: { selfBoosts: { boosts: { evasion: 1 }, chance: 100 } } }),
  mv('Growl', 'Normal', 'Status', 0, 100, 40, { ...FOES, effects: { targetBoosts: { boosts: { atk: -1 }, chance: 100 } } }),
  mv('Screech', 'Normal', 'Status', 0, 85, 40, { effects: { targetBoosts: { boosts: { def: -2 }, chance: 100 } } }),
  mv('Sand Attack', 'Ground', 'Status', 0, 100, 15, { effects: { targetBoosts: { boosts: { accuracy: -1 }, chance: 100 } } }),
  mv('Recover', 'Normal', 'Status', 0, null, 5, { effects: { heal: 50 } }),
  // Protection and partner support
  mv('Protect', 'Normal', 'Status', 0, null, 10, { priority: 4, special: 'protect' }),
  mv('Detect', 'Fighting', 'Status', 0, null, 5, { priority: 4, special: 'protect' }),
  mv('Follow Me', 'Normal', 'Status', 0, null, 20, { priority: 2, special: 'followMe' }),
  mv('Spotlight', 'Normal', 'Status', 0, null, 15, { priority: 3, target: 'normal', special: 'spotlight' }),
  mv('Helping Hand', 'Normal', 'Status', 0, null, 20, { priority: 5, target: 'ally', special: 'helpingHand' }),
  mv('After You', 'Normal', 'Status', 0, null, 15, { target: 'normal', special: 'afterYou' }),
  mv('Howl', 'Normal', 'Status', 0, null, 40, { target: 'selfAndAlly', effects: { targetBoosts: { boosts: { atk: 1 }, chance: 100 } } }),
  mv('Life Dew', 'Water', 'Status', 0, null, 10, { target: 'selfAndAlly', effects: { heal: 25 } }),
];

export function findMove(name: string): Move {
  const m = MOVE_LIBRARY.find((x) => x.name === name);
  if (!m) throw new Error(`Unknown preset move: ${name}`);
  return structuredClone(m);
}

export const PERFECT_IVS: StatTable = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
export const ZERO_EVS: StatTable = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function preset(
  name: string, type1: TypeName, type2: TypeName | null, nature: PokemonBuild['nature'],
  base: [number, number, number, number, number, number], evs: Partial<StatTable>, moves: string[],
  ability: string, item: string,
): PokemonBuild {
  const [hp, atk, def, spa, spd, spe] = base;
  return {
    id: `preset-${name.toLowerCase()}`,
    name, level: 50, type1, type2, nature, ability, item,
    baseStats: { hp, atk, def, spa, spd, spe },
    ivs: { ...PERFECT_IVS },
    evs: { ...ZERO_EVS, ...evs },
    moves: moves.map(findMove),
  };
}

/** Original sample creatures. Enter any species' real base stats to battle with them. */
export const PRESET_BUILDS: PokemonBuild[] = [
  preset('Cinderlynx', 'Fire', 'Dark', 'Jolly', [70, 105, 65, 85, 65, 110],
    { atk: 252, spe: 252, hp: 4 }, ['Flare Blitz', 'Crunch', 'Fake Out', 'Protect'], 'Intimidate', 'Life Orb'),
  preset('Bramblehorn', 'Grass', 'Ground', 'Adamant', [100, 120, 100, 60, 80, 60],
    { hp: 252, atk: 252, def: 4 }, ['High Horsepower', 'Leaf Blade', 'Rock Slide', 'Protect'], 'Sap Sipper', 'Assault Vest'),
  preset('Tidewarden', 'Water', 'Steel', 'Calm', [95, 75, 110, 90, 105, 55],
    { hp: 252, spd: 252, def: 4 }, ['Scald', 'Flash Cannon', 'Follow Me', 'Life Dew'], 'Friend Guard', 'Leftovers'),
  preset('Voltwing', 'Electric', 'Flying', 'Timid', [75, 70, 70, 115, 75, 120],
    { spa: 252, spe: 252, hp: 4 }, ['Thunder', 'Hurricane', 'Tailwind', 'Protect'], 'Drizzle', 'Damp Rock'),
  preset('Gloomshade', 'Ghost', 'Fairy', 'Modest', [70, 60, 80, 115, 100, 95],
    { spa: 252, spe: 252, hp: 4 }, ['Shadow Ball', 'Dazzling Gleam', 'Helping Hand', 'Trick Room'], 'Prankster', 'Focus Sash'),
  preset('Rokdrake', 'Dragon', 'Fighting', 'Adamant', [90, 125, 90, 70, 80, 95],
    { atk: 252, spe: 252, hp: 4 }, ['Dragon Claw', 'Close Combat', 'Earthquake', 'Protect'], 'Mold Breaker', 'Haban Berry'),
];

export function blankBuild(): PokemonBuild {
  return {
    id: newId(), name: 'New Pokémon', level: 50, type1: 'Normal', type2: null, nature: 'Hardy', ability: '', item: '',
    baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 },
    ivs: { ...PERFECT_IVS }, evs: { ...ZERO_EVS },
    moves: [findMove('Tackle'), null, null, null],
  };
}
