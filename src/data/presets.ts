import type { Move, PokemonBuild, StatTable, TypeName, MoveCategory, MoveEffects } from '../engine/types';

function mv(
  name: string, type: TypeName, category: MoveCategory, power: number, accuracy: number | null,
  pp: number, extra: Partial<Pick<Move, 'priority' | 'highCrit'>> & { effects?: MoveEffects } = {},
): Move {
  return {
    name, type, category, power, accuracy, pp,
    priority: extra.priority ?? 0, highCrit: extra.highCrit ?? false, effects: extra.effects ?? {},
  };
}

export const MOVE_LIBRARY: Move[] = [
  // Normal
  mv('Tackle', 'Normal', 'Physical', 40, 100, 35),
  mv('Quick Attack', 'Normal', 'Physical', 40, 100, 30, { priority: 1 }),
  mv('Extreme Speed', 'Normal', 'Physical', 80, 100, 5, { priority: 2 }),
  mv('Body Slam', 'Normal', 'Physical', 85, 100, 15, { effects: { status: { status: 'par', chance: 30 } } }),
  mv('Double-Edge', 'Normal', 'Physical', 120, 100, 15, { effects: { recoil: 33 } }),
  mv('Slash', 'Normal', 'Physical', 70, 100, 20, { highCrit: true }),
  mv('Hyper Voice', 'Normal', 'Special', 90, 100, 10),
  // Fire
  mv('Flamethrower', 'Fire', 'Special', 90, 100, 15, { effects: { status: { status: 'brn', chance: 10 } } }),
  mv('Fire Blast', 'Fire', 'Special', 110, 85, 5, { effects: { status: { status: 'brn', chance: 10 } } }),
  mv('Flare Blitz', 'Fire', 'Physical', 120, 100, 15, { effects: { recoil: 33, status: { status: 'brn', chance: 10 } } }),
  mv('Will-O-Wisp', 'Fire', 'Status', 0, 85, 15, { effects: { status: { status: 'brn', chance: 100 } } }),
  // Water
  mv('Surf', 'Water', 'Special', 90, 100, 15),
  mv('Hydro Pump', 'Water', 'Special', 110, 80, 5),
  mv('Scald', 'Water', 'Special', 80, 100, 15, { effects: { status: { status: 'brn', chance: 30 } } }),
  mv('Aqua Jet', 'Water', 'Physical', 40, 100, 20, { priority: 1 }),
  mv('Waterfall', 'Water', 'Physical', 80, 100, 15),
  // Electric
  mv('Thunderbolt', 'Electric', 'Special', 90, 100, 15, { effects: { status: { status: 'par', chance: 10 } } }),
  mv('Thunder', 'Electric', 'Special', 110, 70, 10, { effects: { status: { status: 'par', chance: 30 } } }),
  mv('Thunder Wave', 'Electric', 'Status', 0, 90, 20, { effects: { status: { status: 'par', chance: 100 } } }),
  mv('Wild Charge', 'Electric', 'Physical', 90, 100, 15, { effects: { recoil: 25 } }),
  // Grass
  mv('Energy Ball', 'Grass', 'Special', 90, 100, 10, { effects: { targetBoosts: { boosts: { spd: -1 }, chance: 10 } } }),
  mv('Giga Drain', 'Grass', 'Special', 75, 100, 10, { effects: { drain: 50 } }),
  mv('Leaf Blade', 'Grass', 'Physical', 90, 100, 15, { highCrit: true }),
  mv('Spore', 'Grass', 'Status', 0, 100, 15, { effects: { status: { status: 'slp', chance: 100 } } }),
  // Ice
  mv('Ice Beam', 'Ice', 'Special', 90, 100, 10, { effects: { status: { status: 'frz', chance: 10 } } }),
  mv('Ice Shard', 'Ice', 'Physical', 40, 100, 30, { priority: 1 }),
  mv('Icicle Crash', 'Ice', 'Physical', 85, 90, 10),
  // Fighting
  mv('Close Combat', 'Fighting', 'Physical', 120, 100, 5, { effects: { selfBoosts: { boosts: { def: -1, spd: -1 }, chance: 100 } } }),
  mv('Drain Punch', 'Fighting', 'Physical', 75, 100, 10, { effects: { drain: 50 } }),
  mv('Mach Punch', 'Fighting', 'Physical', 40, 100, 30, { priority: 1 }),
  mv('Aura Sphere', 'Fighting', 'Special', 80, null, 20),
  // Poison
  mv('Sludge Bomb', 'Poison', 'Special', 90, 100, 10, { effects: { status: { status: 'psn', chance: 30 } } }),
  mv('Poison Jab', 'Poison', 'Physical', 80, 100, 20, { effects: { status: { status: 'psn', chance: 30 } } }),
  mv('Toxic', 'Poison', 'Status', 0, 90, 10, { effects: { status: { status: 'tox', chance: 100 } } }),
  // Ground
  mv('Earthquake', 'Ground', 'Physical', 100, 100, 10),
  mv('Earth Power', 'Ground', 'Special', 90, 100, 10, { effects: { targetBoosts: { boosts: { spd: -1 }, chance: 10 } } }),
  // Flying
  mv('Brave Bird', 'Flying', 'Physical', 120, 100, 15, { effects: { recoil: 33 } }),
  mv('Air Slash', 'Flying', 'Special', 75, 95, 15),
  // Psychic
  mv('Psychic', 'Psychic', 'Special', 90, 100, 10, { effects: { targetBoosts: { boosts: { spd: -1 }, chance: 10 } } }),
  mv('Zen Headbutt', 'Psychic', 'Physical', 80, 90, 15),
  mv('Hypnosis', 'Psychic', 'Status', 0, 60, 20, { effects: { status: { status: 'slp', chance: 100 } } }),
  // Bug
  mv('Bug Buzz', 'Bug', 'Special', 90, 100, 10, { effects: { targetBoosts: { boosts: { spd: -1 }, chance: 10 } } }),
  mv('X-Scissor', 'Bug', 'Physical', 80, 100, 15),
  // Rock
  mv('Stone Edge', 'Rock', 'Physical', 100, 80, 5, { highCrit: true }),
  mv('Rock Slide', 'Rock', 'Physical', 75, 90, 10),
  // Ghost
  mv('Shadow Ball', 'Ghost', 'Special', 80, 100, 15, { effects: { targetBoosts: { boosts: { spd: -1 }, chance: 20 } } }),
  mv('Shadow Sneak', 'Ghost', 'Physical', 40, 100, 30, { priority: 1 }),
  // Dragon
  mv('Dragon Claw', 'Dragon', 'Physical', 80, 100, 15),
  mv('Draco Meteor', 'Dragon', 'Special', 130, 90, 5, { effects: { selfBoosts: { boosts: { spa: -2 }, chance: 100 } } }),
  mv('Dragon Pulse', 'Dragon', 'Special', 85, 100, 10),
  // Dark
  mv('Crunch', 'Dark', 'Physical', 80, 100, 15, { effects: { targetBoosts: { boosts: { def: -1 }, chance: 20 } } }),
  mv('Dark Pulse', 'Dark', 'Special', 80, 100, 15),
  // Steel
  mv('Iron Head', 'Steel', 'Physical', 80, 100, 15),
  mv('Flash Cannon', 'Steel', 'Special', 80, 100, 10, { effects: { targetBoosts: { boosts: { spd: -1 }, chance: 10 } } }),
  mv('Bullet Punch', 'Steel', 'Physical', 40, 100, 30, { priority: 1 }),
  // Fairy
  mv('Moonblast', 'Fairy', 'Special', 95, 100, 15, { effects: { targetBoosts: { boosts: { spa: -1 }, chance: 30 } } }),
  mv('Play Rough', 'Fairy', 'Physical', 90, 90, 10, { effects: { targetBoosts: { boosts: { atk: -1 }, chance: 10 } } }),
  // Status: stat changes and healing
  mv('Swords Dance', 'Normal', 'Status', 0, null, 20, { effects: { selfBoosts: { boosts: { atk: 2 }, chance: 100 } } }),
  mv('Nasty Plot', 'Dark', 'Status', 0, null, 20, { effects: { selfBoosts: { boosts: { spa: 2 }, chance: 100 } } }),
  mv('Dragon Dance', 'Dragon', 'Status', 0, null, 20, { effects: { selfBoosts: { boosts: { atk: 1, spe: 1 }, chance: 100 } } }),
  mv('Calm Mind', 'Psychic', 'Status', 0, null, 20, { effects: { selfBoosts: { boosts: { spa: 1, spd: 1 }, chance: 100 } } }),
  mv('Bulk Up', 'Fighting', 'Status', 0, null, 20, { effects: { selfBoosts: { boosts: { atk: 1, def: 1 }, chance: 100 } } }),
  mv('Iron Defense', 'Steel', 'Status', 0, null, 15, { effects: { selfBoosts: { boosts: { def: 2 }, chance: 100 } } }),
  mv('Agility', 'Psychic', 'Status', 0, null, 30, { effects: { selfBoosts: { boosts: { spe: 2 }, chance: 100 } } }),
  mv('Double Team', 'Normal', 'Status', 0, null, 15, { effects: { selfBoosts: { boosts: { evasion: 1 }, chance: 100 } } }),
  mv('Growl', 'Normal', 'Status', 0, 100, 40, { effects: { targetBoosts: { boosts: { atk: -1 }, chance: 100 } } }),
  mv('Screech', 'Normal', 'Status', 0, 85, 40, { effects: { targetBoosts: { boosts: { def: -2 }, chance: 100 } } }),
  mv('Sand Attack', 'Ground', 'Status', 0, 100, 15, { effects: { targetBoosts: { boosts: { accuracy: -1 }, chance: 100 } } }),
  mv('Recover', 'Normal', 'Status', 0, null, 5, { effects: { heal: 50 } }),
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
): PokemonBuild {
  const [hp, atk, def, spa, spd, spe] = base;
  return {
    id: `preset-${name.toLowerCase()}`,
    name, level: 50, type1, type2, nature,
    baseStats: { hp, atk, def, spa, spd, spe },
    ivs: { ...PERFECT_IVS },
    evs: { ...ZERO_EVS, ...evs },
    moves: moves.map(findMove),
  };
}

/** Original sample creatures. Enter any species' real base stats to battle with them. */
export const PRESET_BUILDS: PokemonBuild[] = [
  preset('Cinderlynx', 'Fire', 'Dark', 'Jolly', [70, 105, 65, 85, 65, 110],
    { atk: 252, spe: 252, hp: 4 }, ['Flare Blitz', 'Crunch', 'Quick Attack', 'Swords Dance']),
  preset('Bramblehorn', 'Grass', 'Ground', 'Adamant', [100, 120, 100, 60, 80, 60],
    { hp: 252, atk: 252, def: 4 }, ['Earthquake', 'Leaf Blade', 'Stone Edge', 'Bulk Up']),
  preset('Tidewarden', 'Water', 'Steel', 'Calm', [95, 75, 110, 90, 105, 55],
    { hp: 252, spd: 252, def: 4 }, ['Scald', 'Flash Cannon', 'Recover', 'Toxic']),
  preset('Voltwing', 'Electric', 'Flying', 'Timid', [75, 70, 70, 115, 75, 120],
    { spa: 252, spe: 252, hp: 4 }, ['Thunderbolt', 'Air Slash', 'Thunder Wave', 'Nasty Plot']),
  preset('Gloomshade', 'Ghost', 'Fairy', 'Modest', [70, 60, 80, 115, 100, 95],
    { spa: 252, spe: 252, hp: 4 }, ['Shadow Ball', 'Moonblast', 'Hypnosis', 'Calm Mind']),
  preset('Rokdrake', 'Dragon', 'Fighting', 'Adamant', [90, 125, 90, 70, 80, 95],
    { atk: 252, spe: 252, hp: 4 }, ['Dragon Claw', 'Close Combat', 'Mach Punch', 'Dragon Dance']),
];

export function blankBuild(): PokemonBuild {
  return {
    id: newId(), name: 'New Pokémon', level: 50, type1: 'Normal', type2: null, nature: 'Hardy',
    baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 },
    ivs: { ...PERFECT_IVS }, evs: { ...ZERO_EVS },
    moves: [findMove('Tackle'), null, null, null],
  };
}
