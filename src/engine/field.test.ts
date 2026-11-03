import { describe, expect, it } from 'vitest';
import { blankBuild, findMove } from '../data/presets';
import { activeWeather, createBattle, createBattlePokemon, effectiveSpeed, findMon, runTurn as engineRunTurn } from './battle';
import type { BattleState, FieldSetup, Rng, TurnChoices } from './battle';
import { calcDamage } from './damage';
import type { PokemonBuild } from './types';

const fixed = (v = 0.5): Rng => ({ next: () => v });
const runTurn = (s: BattleState, c: TurnChoices, rng: Rng = fixed()) => engineRunTurn(s, c, rng);

function build(over: Partial<PokemonBuild> & { moveNames?: string[] } = {}): PokemonBuild {
  const { moveNames, ...rest } = over;
  const b = { ...blankBuild(), ...rest };
  if (moveNames) b.moves = [...moveNames.map(findMove), null, null, null, null].slice(0, 4);
  return b;
}
const spe = (n: number) => ({ ...blankBuild().baseStats, spe: n });
const singles = (a: PokemonBuild, b: PokemonBuild, setup: FieldSetup = {}, rng: Rng = fixed()) =>
  createBattle([[a], [b]], 'singles', rng, setup);
const doubles = (t1: PokemonBuild[], t2: PokemonBuild[], setup: FieldSetup = {}, rng: Rng = fixed()) =>
  createBattle([t1, t2], 'doubles', rng, setup);
const sc = (a: number, b: number): TurnChoices => ({ p1a: { move: a }, p2a: { move: b } });
const texts = (s: BattleState) => s.log.map((l) => l.text);
const mon = (s: BattleState, uid: string) => findMon(s, uid)!;
const hitsBy = (s: BattleState) => s.log.filter((l) => l.breakdown);
const idle = (name: string, over: Partial<PokemonBuild> = {}) => build({ name, moveNames: ['Swords Dance'], ...over });

describe('weather', () => {
  const fire = { ...findMove('Flamethrower') };
  const water = { ...findMove('Surf'), target: 'normal' as const };

  it('sun boosts Fire and weakens Water; rain does the opposite', () => {
    const a = createBattlePokemon(build());
    const d = createBattlePokemon(build(), 1);
    const plain = calcDamage(a, d, fire, { crit: false, roll: 100 }).damage;
    expect(calcDamage(a, d, fire, { crit: false, roll: 100, weather: 'sun' }).damage).toBe(Math.floor(plain * 1.5));
    expect(calcDamage(a, d, fire, { crit: false, roll: 100, weather: 'rain' }).damage).toBe(Math.floor(plain / 2));
    const w = calcDamage(a, d, water, { crit: false, roll: 100 }).damage;
    expect(calcDamage(a, d, water, { crit: false, roll: 100, weather: 'sun' }).damage).toBe(Math.floor(w / 2));
  });

  it('sand boosts Rock types’ Sp. Def; snow boosts Ice types’ Defense', () => {
    const a = createBattlePokemon(build());
    const rock = createBattlePokemon(build({ type1: 'Rock' }), 1);
    const ice = createBattlePokemon(build({ type1: 'Ice' }), 1);
    expect(calcDamage(a, rock, fire, { crit: false, roll: 100, weather: 'sand' }).defense).toBe(Math.floor(rock.stats.spd * 1.5));
    expect(calcDamage(a, ice, findMove('Tackle'), { crit: false, roll: 100, weather: 'snow' }).defense).toBe(Math.floor(ice.stats.def * 1.5));
  });

  it('Drizzle sets rain for 5 turns; Swift Swim doubles Speed in it', () => {
    const s = singles(idle('D', { ability: 'Drizzle' }), idle('S', { ability: 'Swift Swim' }));
    expect(s.weather).toBe('rain');
    expect(s.weatherTurns).toBe(5);
    expect(effectiveSpeed(s, mon(s, 'p2a'))).toBe(mon(s, 'p2a').stats.spe * 2);
    let t = s;
    for (let i = 0; i < 5; i++) t = runTurn(t, sc(0, 0));
    expect(t.weather).toBeNull();
    expect(texts(t)).toContain('The rain stopped.');
  });

  it('weather from the battle setup lasts the whole battle', () => {
    let s = singles(idle('A'), idle('B'), { weather: 'sun' });
    for (let i = 0; i < 8; i++) s = runTurn(s, sc(0, 0));
    expect(s.weather).toBe('sun');
  });

  it('Rain Dance sets rain; Damp Rock makes it last 8 turns', () => {
    const s = runTurn(singles(build({ name: 'R', item: 'Damp Rock', moveNames: ['Rain Dance'] }), idle('B')), sc(0, 0));
    expect(s.weather).toBe('rain');
    expect(s.weatherTurns).toBe(7);
  });

  it('sandstorm damages everything but Rock, Ground and Steel types', () => {
    const s = runTurn(singles(idle('N'), idle('R', { type1: 'Rock' }), { weather: 'sand' }), sc(0, 0));
    const n = mon(s, 'p1a');
    expect(n.currentHp).toBe(n.stats.hp - Math.floor(n.stats.hp / 16));
    expect(mon(s, 'p2a').currentHp).toBe(mon(s, 'p2a').stats.hp);
  });

  it('Cloud Nine suppresses the weather', () => {
    const s = singles(idle('C', { ability: 'Cloud Nine' }), idle('B'), { weather: 'sun' });
    expect(activeWeather(s)).toBeNull();
  });

  it('Thunder never misses in rain', () => {
    const t = () => singles(build({ name: 'T', moveNames: ['Thunder'] }), idle('B'), {}, fixed(0.99));
    expect(mon(runTurn(t(), sc(0, 0), fixed(0.99)), 'p2a').currentHp).toBe(mon(t(), 'p2a').stats.hp);
    const rain = singles(build({ name: 'T', moveNames: ['Thunder'] }), idle('B'), { weather: 'rain' });
    const s = runTurn(rain, sc(0, 0), fixed(0.99));
    expect(mon(s, 'p2a').currentHp).toBeLessThan(mon(s, 'p2a').stats.hp);
  });

  it('Weather Ball becomes a 100-power Fire move in sun', () => {
    const s = runTurn(singles(build({ name: 'W', moveNames: ['Weather Ball'] }), idle('G', { type1: 'Grass' }), { weather: 'sun' }), sc(0, 0));
    const bd = hitsBy(s)[0].breakdown!;
    expect(bd.power).toBe(100);
    expect(bd.effectiveness).toBe(2);
    expect(bd.steps.some((st) => st.label === 'Harsh sunlight')).toBe(true);
  });

  it('Hydration cures status in rain', () => {
    const state = singles(idle('H', { ability: 'Hydration' }), idle('B'), { weather: 'rain' });
    mon(state, 'p1a').status = 'brn';
    const s = runTurn(state, sc(0, 0));
    expect(mon(s, 'p1a').status).toBeNull();
    expect(mon(s, 'p1a').currentHp).toBe(mon(s, 'p1a').stats.hp);
  });
});

describe('terrain', () => {
  it('Electric Terrain boosts grounded Electric moves and prevents sleep', () => {
    const a = createBattlePokemon(build());
    const d = createBattlePokemon(build(), 1);
    expect(calcDamage(a, d, findMove('Thunderbolt'), { crit: false, roll: 100, terrain: 'electric' }).power).toBe(117);
    const flyer = createBattlePokemon(build({ type2: 'Flying' }));
    expect(calcDamage(flyer, d, findMove('Thunderbolt'), { crit: false, roll: 100, terrain: 'electric' }).power).toBe(90);
    const s = runTurn(singles(build({ name: 'S', moveNames: ['Spore'] }), idle('B'), { terrain: 'electric' }), sc(0, 0));
    expect(mon(s, 'p2a').status).toBeNull();
  });

  it('Grassy Terrain heals grounded Pokémon and halves Earthquake', () => {
    const state = singles(idle('A'), idle('B', { type2: 'Flying' }), { terrain: 'grassy' });
    mon(state, 'p1a').currentHp = 50;
    mon(state, 'p2a').currentHp = 50;
    const s = runTurn(state, sc(0, 0));
    expect(mon(s, 'p1a').currentHp).toBe(50 + Math.floor(mon(s, 'p1a').stats.hp / 16));
    expect(mon(s, 'p2a').currentHp).toBe(50);
    const a = createBattlePokemon(build());
    const d = createBattlePokemon(build(), 1);
    expect(calcDamage(a, d, findMove('Earthquake'), { crit: false, roll: 100, terrain: 'grassy' }).power).toBe(50);
  });

  it('Psychic Terrain blocks priority moves against grounded Pokémon', () => {
    const s = runTurn(singles(build({ name: 'Q', moveNames: ['Quick Attack'] }), idle('B'), { terrain: 'psychic' }), sc(0, 0));
    expect(texts(s)).toContain('B is protected by the Psychic Terrain!');
  });

  it('Misty Terrain prevents status conditions and confusion', () => {
    const s = runTurn(singles(build({ name: 'W', moveNames: ['Will-O-Wisp'] }), idle('B'), { terrain: 'misty' }), sc(0, 0));
    expect(mon(s, 'p2a').status).toBeNull();
  });

  it('Electric Surge sets Electric Terrain at the start', () => {
    const s = singles(idle('E', { ability: 'Electric Surge' }), idle('B'));
    expect(s.terrain).toBe('electric');
    expect(s.terrainTurns).toBe(5);
  });
});

describe('contact effects', () => {
  it('Rough Skin and Rocky Helmet hurt attackers that make contact', () => {
    let s = runTurn(singles(build({ name: 'A', moveNames: ['Tackle'] }), idle('R', { ability: 'Rough Skin' })), sc(0, 0));
    const a = mon(s, 'p1a');
    expect(a.currentHp).toBe(a.stats.hp - Math.floor(a.stats.hp / 8));
    s = runTurn(singles(build({ name: 'A', moveNames: ['Tackle'] }), idle('H', { item: 'Rocky Helmet' })), sc(0, 0));
    expect(mon(s, 'p1a').currentHp).toBe(a.stats.hp - Math.floor(a.stats.hp / 6));
    s = runTurn(singles(build({ name: 'A', moveNames: ['Earthquake'] }), idle('R', { ability: 'Rough Skin' })), sc(0, 0));
    expect(mon(s, 'p1a').currentHp).toBe(a.stats.hp);
  });

  it('Static can paralyze an attacker that makes contact', () => {
    const s = runTurn(singles(build({ name: 'A', moveNames: ['Tackle'] }), idle('S', { ability: 'Static' })), sc(0, 0), fixed(0.1));
    expect(mon(s, 'p1a').status).toBe('par');
  });

  it('Tough Claws boosts contact moves; Iron Fist boosts punches', () => {
    const tc = createBattlePokemon(build({ ability: 'Tough Claws' }));
    const fist = createBattlePokemon(build({ ability: 'Iron Fist' }));
    const d = createBattlePokemon(build(), 1);
    expect(calcDamage(tc, d, findMove('Tackle'), { crit: false, roll: 100 }).power).toBe(52);
    expect(calcDamage(fist, d, findMove('Mach Punch'), { crit: false, roll: 100 }).power).toBe(48);
  });
});

describe('healing items', () => {
  it('Leftovers heals 1/16; Black Sludge hurts non-Poison types', () => {
    const state = singles(idle('L', { item: 'Leftovers' }), idle('B', { item: 'Black Sludge' }));
    mon(state, 'p1a').currentHp = 50;
    const s = runTurn(state, sc(0, 0));
    expect(mon(s, 'p1a').currentHp).toBe(50 + Math.floor(mon(s, 'p1a').stats.hp / 16));
    const b = mon(s, 'p2a');
    expect(b.currentHp).toBe(b.stats.hp - Math.floor(b.stats.hp / 8));
  });

  it('Sitrus Berry heals 25% at half HP', () => {
    const state = singles(idle('S', { item: 'Sitrus Berry' }), idle('B'));
    const m = mon(state, 'p1a');
    m.status = 'psn';
    m.currentHp = Math.floor(m.stats.hp / 2) + 1;
    const s = runTurn(state, sc(0, 0));
    expect(texts(s).some((t) => t.includes('Sitrus Berry'))).toBe(true);
    expect(mon(s, 'p1a').item).toBe('');
  });

  it('Lum Berry cures a status right away', () => {
    const s = runTurn(singles(build({ name: 'W', moveNames: ['Will-O-Wisp'] }), idle('L', { item: 'Lum Berry' })), sc(0, 0));
    expect(mon(s, 'p2a').status).toBeNull();
    expect(mon(s, 'p2a').item).toBe('');
  });

  it('Shell Bell heals 1/8 of damage dealt', () => {
    const state = singles(build({ name: 'S', item: 'Shell Bell', moveNames: ['Tackle'] }), idle('B'));
    mon(state, 'p1a').currentHp = 10;
    const s = runTurn(state, sc(0, 0));
    const dealt = mon(s, 'p2a').stats.hp - mon(s, 'p2a').currentHp;
    expect(mon(s, 'p1a').currentHp).toBe(10 + Math.max(1, Math.floor(dealt / 8)));
  });
});

describe('multi-hit, Beat Up and Instruct', () => {
  it('2–5 hit moves roll the number of hits; Skill Link always hits 5 times', () => {
    let s = runTurn(singles(build({ name: 'A', moveNames: ['Bullet Seed'] }), idle('B')), sc(0, 0));
    expect(hitsBy(s)).toHaveLength(3); // 0.5 → 3 hits
    expect(texts(s)).toContain('Hit 3 times!');
    s = runTurn(singles(build({ name: 'A', ability: 'Skill Link', moveNames: ['Bullet Seed'] }), idle('B')), sc(0, 0));
    expect(hitsBy(s)).toHaveLength(5);
  });

  it('Technician applies to each hit', () => {
    const s = runTurn(singles(build({ name: 'A', ability: 'Technician', moveNames: ['Double Hit'] }), idle('B')), sc(0, 0));
    expect(hitsBy(s).map((h) => h.breakdown!.power)).toEqual([52, 52]);
  });

  it('Beat Up hits once per healthy team member', () => {
    const state = doubles([build({ name: 'A', moveNames: ['Beat Up'] }), idle('B')], [idle('C'), idle('D')]);
    const s = runTurn(state, { p1a: { move: 0, target: { side: 1, slot: 0 } } });
    expect(hitsBy(s)).toHaveLength(2);
    expect(hitsBy(s)[0].breakdown!.power).toBe(13);
  });

  it('Instruct makes the target use its last move again', () => {
    const state = doubles(
      [build({ name: 'I', baseStats: spe(10), moveNames: ['Instruct'] }), build({ name: 'T', baseStats: spe(200), moveNames: ['Tackle'] })],
      [idle('C'), idle('D')],
    );
    const s = runTurn(state, { p1a: { move: 0, target: { side: 0, slot: 1 } }, p1b: { move: 0, target: { side: 1, slot: 0 } } });
    expect(texts(s).filter((t) => t === 'T used Tackle!')).toHaveLength(2);
    expect(mon(s, 'p1b').pp[0]).toBe(33);
  });
});

describe('confusion and fixed damage', () => {
  it('Confuse Ray confuses; a confused Pokémon can hurt itself', () => {
    const state = singles(build({ name: 'C', moveNames: ['Confuse Ray'] }), build({ name: 'B', baseStats: spe(10), moveNames: ['Tackle'] }));
    const s = runTurn(state, sc(0, 0), fixed(0.1));
    expect(texts(s)).toContain('B became confused!');
    expect(texts(s)).toContain('B is confused!');
    expect(texts(s).some((t) => t.startsWith('It hurt itself in its confusion!'))).toBe(true);
    expect(mon(s, 'p1a').currentHp).toBe(mon(s, 'p1a').stats.hp);
  });

  it('Own Tempo prevents confusion', () => {
    const s = runTurn(singles(build({ name: 'C', moveNames: ['Confuse Ray'] }), idle('O', { ability: 'Own Tempo' })), sc(0, 0));
    expect(mon(s, 'p2a').confusion).toBe(0);
  });

  it('Seismic Toss deals damage equal to level; Night Shade can’t hit Normal types; Super Fang halves HP', () => {
    let s = runTurn(singles(build({ name: 'S', moveNames: ['Seismic Toss'] }), idle('B')), sc(0, 0));
    expect(mon(s, 'p2a').stats.hp - mon(s, 'p2a').currentHp).toBe(50);
    s = runTurn(singles(build({ name: 'N', moveNames: ['Night Shade'] }), idle('B')), sc(0, 0));
    expect(mon(s, 'p2a').currentHp).toBe(mon(s, 'p2a').stats.hp);
    s = runTurn(singles(build({ name: 'F', moveNames: ['Super Fang'] }), idle('B')), sc(0, 0));
    const b = mon(s, 'p2a');
    expect(b.currentHp).toBe(b.stats.hp - Math.floor(b.stats.hp / 2));
  });
});
