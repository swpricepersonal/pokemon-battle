import { describe, expect, it } from 'vitest';
import { blankBuild, findMove } from '../data/presets';
import { blankCustomAbility } from './abilities';
import {
  STRUGGLE_INDEX, availableChoices, createBattle, createBattlePokemon, effectiveSpeed, findMon, previewOrder,
  runTurn as engineRunTurn,
} from './battle';
import type { BattleState, Rng, TurnChoices } from './battle';
import { DOUBLES_SCREEN, calcDamage, pokeRound } from './damage';
import { chainMods, modify } from './modifiers';
import { calcStat, validateBuild } from './stats';
import { effectiveness } from './typeChart';
import { CUSTOM_ABILITY } from './types';
import type { Move, PokemonBuild } from './types';

/** RNG that returns the given values in order, then `rest`. */
function scripted(values: number[], rest = 0.99): Rng {
  let i = 0;
  return { next: () => (i < values.length ? values[i++] : rest) };
}
/** Constant RNG: 0.5 hits anything with >50% accuracy, never crits, rolls 93, and skips <50% effects. */
const fixed = (v = 0.5): Rng => ({ next: () => v });
/** Tests always run turns with a deterministic RNG. */
const runTurn = (s: BattleState, c: TurnChoices, rng: Rng = fixed()) => engineRunTurn(s, c, rng);

function build(over: Partial<PokemonBuild> & { moveNames?: string[] } = {}): PokemonBuild {
  const { moveNames, ...rest } = over;
  const b = { ...blankBuild(), ...rest };
  if (moveNames) b.moves = [...moveNames.map(findMove), null, null, null, null].slice(0, 4);
  return b;
}

const spe = (n: number) => ({ ...blankBuild().baseStats, spe: n });

function singles(a: PokemonBuild, b: PokemonBuild, rng: Rng = fixed()) {
  return createBattle([[a], [b]], 'singles', rng);
}
function doubles(team1: PokemonBuild[], team2: PokemonBuild[], rng: Rng = fixed()) {
  return createBattle([team1, team2], 'doubles', rng);
}
/** Singles choices: move slot for P1 and P2. */
const sc = (a: number, b: number): TurnChoices => ({ p1a: { move: a }, p2a: { move: b } });
const texts = (s: BattleState) => s.log.map((l) => l.text);
const mon = (s: BattleState, uid: string) => findMon(s, uid)!;

describe('stats', () => {
  it('matches known values (base 108/130/…/102, Lv100, 31 IV, 252 EV, Jolly)', () => {
    expect(calcStat('hp', 108, 31, 252, 100, 'Jolly')).toBe(420);
    expect(calcStat('atk', 130, 31, 252, 100, 'Jolly')).toBe(359);
    expect(calcStat('spe', 102, 31, 252, 100, 'Jolly')).toBe(333);
    expect(calcStat('spa', 80, 31, 0, 100, 'Jolly')).toBe(176);
  });

  it('validates the EV total', () => {
    const b = build({ evs: { hp: 252, atk: 252, def: 252, spa: 0, spd: 0, spe: 0 } });
    expect(validateBuild(b).some((e) => e.includes('EV total'))).toBe(true);
  });
});

describe('type chart and modifiers', () => {
  it('combines dual types', () => {
    expect(effectiveness('Ice', ['Dragon', 'Ground'])).toBe(4);
    expect(effectiveness('Electric', ['Water', 'Ground'])).toBe(0);
    expect(effectiveness('Fire', ['Water', 'Rock'])).toBe(0.25);
  });

  it('uses 4096-based rounding that rounds .5 down', () => {
    expect(modify(57, 1.5)).toBe(85);
    expect(modify(58, 1.5)).toBe(87);
    expect(chainMods([1.5, 1.5])).toBe(9216);
    expect(pokeRound(85.5)).toBe(85);
    expect(pokeRound(85.51)).toBe(86);
  });
});

describe('damage formula', () => {
  const fireMove: Move = { ...findMove('Tackle'), name: 'Test', type: 'Fire', power: 100, category: 'Physical' };

  function mons(atkOver: Partial<PokemonBuild> = {}, defOver: Partial<PokemonBuild> = {}) {
    const a = createBattlePokemon(build({ type1: 'Fire', ...atkOver }));
    const d = createBattlePokemon(build({ type1: 'Grass', ...defOver }), 1);
    a.stats.atk = 150;
    d.stats.def = 100;
    return { a, d };
  }

  it('computes base damage, STAB, and type effectiveness', () => {
    const { a, d } = mons();
    const max = calcDamage(a, d, fireMove, { crit: false, roll: 100 });
    expect(max.baseDamage).toBe(68);
    expect(max.damage).toBe(204);
    expect(calcDamage(a, d, fireMove, { crit: false, roll: 85 }).damage).toBe(170);
  });

  it('crits multiply by 1.5 and ignore the defender’s positive Defense stages', () => {
    const { a, d } = mons();
    d.boosts.def = 2;
    const crit = calcDamage(a, d, fireMove, { crit: true, roll: 100 });
    expect(crit.defense).toBe(100);
    expect(crit.damage).toBe(306);
  });

  it('halves physical damage when burned, unless the attacker has Guts', () => {
    const { a, d } = mons();
    a.status = 'brn';
    expect(calcDamage(a, d, fireMove, { crit: false, roll: 100 }).damage).toBe(102);
    const g = mons({ ability: 'Guts' });
    g.a.status = 'brn';
    // Guts: Attack ×1.5 (225) and no burn penalty
    expect(calcDamage(g.a, g.d, fireMove, { crit: false, roll: 100 }).attack).toBe(225);
    expect(calcDamage(g.a, g.d, fireMove, { crit: false, roll: 100 }).burned).toBe(false);
  });

  it('applies spread and doubles screen modifiers', () => {
    const { a, d } = mons();
    expect(calcDamage(a, d, fireMove, { crit: false, roll: 100, spread: true }).damage).toBe(152); // 68→51→76→152
    const screened = calcDamage(a, d, fireMove, { crit: false, roll: 100, screen: true, doubles: true });
    expect(screened.damage).toBe(modify(204, DOUBLES_SCREEN));
    expect(calcDamage(a, d, fireMove, { crit: true, roll: 100, screen: true }).damage).toBe(306);
  });

  it('applies ability modifiers', () => {
    const huge = mons({ ability: 'Huge Power' });
    expect(calcDamage(huge.a, huge.d, fireMove, { crit: false, roll: 100 }).attack).toBe(300);
    const adapt = mons({ ability: 'Adaptability' });
    expect(calcDamage(adapt.a, adapt.d, fireMove, { crit: false, roll: 100 }).damage).toBe(272); // 68→136→272
    const tech = mons({ ability: 'Technician' });
    expect(calcDamage(tech.a, tech.d, { ...fireMove, power: 60 }, { crit: false, roll: 100 }).power).toBe(90);
    const fat = mons({}, { ability: 'Thick Fat' });
    expect(calcDamage(fat.a, fat.d, fireMove, { crit: false, roll: 100 }).attack).toBe(75);
    const scale = mons({}, { ability: 'Multiscale' });
    expect(calcDamage(scale.a, scale.d, fireMove, { crit: false, roll: 100 }).damage).toBe(102);
    const filter = mons({}, { ability: 'Filter' });
    expect(calcDamage(filter.a, filter.d, fireMove, { crit: false, roll: 100 }).damage).toBe(153);
  });

  it('Mold Breaker ignores defensive abilities', () => {
    const { a, d } = mons({ ability: 'Mold Breaker' }, { ability: 'Multiscale' });
    expect(calcDamage(a, d, fireMove, { crit: false, roll: 100 }).damage).toBe(204);
  });

  it('applies item modifiers', () => {
    const band = mons({ item: 'Choice Band' });
    expect(calcDamage(band.a, band.d, fireMove, { crit: false, roll: 100 }).attack).toBe(225);
    const orb = mons({ item: 'Life Orb' });
    expect(calcDamage(orb.a, orb.d, fireMove, { crit: false, roll: 100 }).damage).toBe(modify(204, 1.3));
    const charcoal = mons({ item: 'Charcoal' });
    expect(calcDamage(charcoal.a, charcoal.d, fireMove, { crit: false, roll: 100 }).power).toBe(120);
    const belt = mons({ item: 'Expert Belt' });
    expect(calcDamage(belt.a, belt.d, fireMove, { crit: false, roll: 100 }).damage).toBe(modify(204, 1.2));
    const berry = mons({}, { item: 'Occa Berry' });
    const bd = calcDamage(berry.a, berry.d, fireMove, { crit: false, roll: 100 });
    expect(bd.resistBerry).toBe(true);
    expect(bd.damage).toBe(102);
    const vest = mons({}, { item: 'Assault Vest' });
    expect(calcDamage(vest.a, vest.d, { ...fireMove, category: 'Special' }, { crit: false, roll: 100 }).defense).toBe(Math.floor(vest.d.stats.spd * 1.5));
  });

  it('builds a working custom ability', () => {
    const custom = { ...blankCustomAbility(), statMultipliers: { atk: 2 }, boostType: 'Fire' as const, boostMultiplier: 1.5 };
    const { a, d } = mons({ ability: CUSTOM_ABILITY, customAbility: custom });
    const bd = calcDamage(a, d, fireMove, { crit: false, roll: 100 });
    expect(bd.attack).toBe(300);
    expect(bd.power).toBe(150);
  });
});

describe('singles turns', () => {
  it('faster Pokémon moves first; priority overrides speed', () => {
    const state = singles(
      build({ name: 'Fast', baseStats: spe(150), moveNames: ['Tackle'] }),
      build({ name: 'Slow', baseStats: spe(30), moveNames: ['Quick Attack', 'Tackle'] }),
    );
    expect(previewOrder(state, sc(0, 1))).toEqual(['p1a', 'p2a']);
    expect(previewOrder(state, sc(0, 0))).toEqual(['p2a', 'p1a']);
  });

  it('breaks speed ties randomly', () => {
    const state = singles(build({ name: 'A' }), build({ name: 'B' }));
    expect(previewOrder(state, sc(0, 0), scripted([0.1, 0.9]))).toEqual(['p1a', 'p2a']);
    expect(previewOrder(state, sc(0, 0), scripted([0.9, 0.1]))).toEqual(['p2a', 'p1a']);
  });

  it('paralysis halves speed; Choice Scarf and Tailwind raise it', () => {
    const state = singles(build({ name: 'A', baseStats: spe(100), item: 'Choice Scarf' }), build({ name: 'B' }));
    const a = mon(state, 'p1a');
    expect(effectiveSpeed(state, a)).toBe(Math.floor(a.stats.spe * 1.5));
    a.status = 'par';
    expect(effectiveSpeed(state, a)).toBe(Math.floor(Math.floor(a.stats.spe * 1.5) / 2));
  });

  it('first attacker KOs and the second does not attack', () => {
    const strong = build({ name: 'Strong', level: 100, baseStats: { hp: 100, atk: 200, def: 100, spa: 100, spd: 100, spe: 200 }, moveNames: ['Double-Edge'] });
    const s = runTurn(singles(strong, build({ name: 'Weak', level: 5 })), sc(0, 0));
    expect(s.winner).toBe(0);
    expect(s.log.filter((l) => l.kind === 'move').map((l) => l.text)).toEqual(['Strong used Double-Edge!']);
  });

  it('both attack, then the turn ends; PP is spent', () => {
    const s = runTurn(singles(build({ name: 'A' }), build({ name: 'B' })), sc(0, 0));
    expect(s.log.filter((l) => l.kind === 'move')).toHaveLength(2);
    expect(mon(s, 'p1a').currentHp).toBeLessThan(mon(s, 'p1a').stats.hp);
    expect(mon(s, 'p1a').pp[0]).toBe(34);
    expect(s.winner).toBeNull();
  });

  it('full paralysis prevents moving', () => {
    const state = singles(build({ name: 'A' }), build({ name: 'B', baseStats: spe(10) }));
    mon(state, 'p1a').status = 'par';
    // tiebreaks (2), then A's paralysis check 0.1 < 0.25
    const s = runTurn(state, sc(0, 0), scripted([0.5, 0.5, 0.1], 0.5));
    expect(texts(s)).toContain("A is fully paralyzed! It can't move!");
    expect(mon(s, 'p2a').currentHp).toBe(mon(s, 'p2a').stats.hp);
  });

  it('respects type immunity and status immunity', () => {
    let s = runTurn(singles(build({ name: 'G', type1: 'Ground' }), build({ name: 'E', moveNames: ['Thunder Wave'] })), sc(0, 0));
    expect(mon(s, 'p1a').status).toBeNull();
    expect(texts(s)).toContain("It doesn't affect G...");
    s = runTurn(singles(build({ name: 'F', type1: 'Fire' }), build({ name: 'W', moveNames: ['Will-O-Wisp'] })), sc(0, 0));
    expect(mon(s, 'p1a').status).toBeNull();
    expect(texts(s)).toContain('But it failed!');
  });

  it('applies and clamps stat stages', () => {
    const sd = (name: string) => build({ name, moveNames: ['Swords Dance'] });
    let s = singles(sd('S'), sd('T'));
    for (let i = 0; i < 3; i++) s = runTurn(s, sc(0, 0));
    expect(mon(s, 'p1a').boosts.atk).toBe(6);
    s = runTurn(s, sc(0, 0));
    expect(texts(s)).toContain("S's Attack won't go any higher!");
  });

  it('deals burn damage at the end of the turn (not with Magic Guard)', () => {
    const sd = (name: string, ability = '') => build({ name, ability, moveNames: ['Swords Dance'] });
    let state = singles(sd('A'), sd('B', 'Magic Guard'));
    mon(state, 'p1a').status = 'brn';
    mon(state, 'p2a').status = 'brn';
    const s = runTurn(state, sc(0, 0));
    const a = mon(s, 'p1a');
    expect(a.currentHp).toBe(a.stats.hp - Math.floor(a.stats.hp / 16));
    expect(mon(s, 'p2a').currentHp).toBe(mon(s, 'p2a').stats.hp);
    state = s;
  });

  it('uses Struggle when out of PP', () => {
    const state = singles(build({ name: 'A' }), build({ name: 'B' }));
    mon(state, 'p1a').pp = [0, 0, 0, 0];
    expect(availableChoices(mon(state, 'p1a'))).toEqual([STRUGGLE_INDEX]);
    const s = runTurn(state, sc(STRUGGLE_INDEX, 0));
    expect(texts(s)).toContain('A used Struggle!');
    expect(texts(s).some((t) => t.startsWith('A is damaged by recoil'))).toBe(true);
  });

  it('does not mutate the input state', () => {
    const state = singles(build({ name: 'A' }), build({ name: 'B' }));
    const copy = structuredClone(state);
    runTurn(state, sc(0, 0));
    expect(state).toEqual(copy);
  });
});

describe('abilities in battle', () => {
  it('Intimidate lowers the foe’s Attack at the start; Clear Body and Inner Focus block it', () => {
    expect(mon(singles(build({ name: 'I', ability: 'Intimidate' }), build({ name: 'B' })), 'p2a').boosts.atk).toBe(-1);
    expect(mon(singles(build({ name: 'I', ability: 'Intimidate' }), build({ name: 'B', ability: 'Clear Body' })), 'p2a').boosts.atk).toBe(0);
    expect(mon(singles(build({ name: 'I', ability: 'Intimidate' }), build({ name: 'B', ability: 'Inner Focus' })), 'p2a').boosts.atk).toBe(0);
    expect(mon(singles(build({ name: 'I', ability: 'Intimidate' }), build({ name: 'B', ability: 'Defiant' })), 'p2a').boosts.atk).toBe(1);
  });

  it('Levitate and Water Absorb grant immunities; Mold Breaker ignores Levitate', () => {
    let s = runTurn(singles(build({ name: 'A', moveNames: ['High Horsepower'] }), build({ name: 'L', ability: 'Levitate', moveNames: ['Swords Dance'] })), sc(0, 0));
    expect(mon(s, 'p2a').currentHp).toBe(mon(s, 'p2a').stats.hp);
    s = runTurn(singles(build({ name: 'A', ability: 'Mold Breaker', moveNames: ['High Horsepower'] }), build({ name: 'L', ability: 'Levitate', moveNames: ['Swords Dance'] })), sc(0, 0));
    expect(mon(s, 'p2a').currentHp).toBeLessThan(mon(s, 'p2a').stats.hp);
    const absorb = singles(build({ name: 'A', moveNames: ['Surf'] }), build({ name: 'W', ability: 'Water Absorb', moveNames: ['Swords Dance'] }));
    mon(absorb, 'p2a').currentHp = 10;
    s = runTurn(absorb, sc(0, 0));
    expect(mon(s, 'p2a').currentHp).toBe(10 + Math.floor(mon(s, 'p2a').stats.hp / 4));
  });

  it('Sturdy and Focus Sash survive a KO from full HP', () => {
    const nuke = build({ name: 'N', level: 100, baseStats: { hp: 100, atk: 255, def: 100, spa: 100, spd: 100, spe: 200 }, moveNames: ['Double-Edge'] });
    let s = runTurn(singles(nuke, build({ name: 'S', level: 5, ability: 'Sturdy' })), sc(0, 0));
    expect(mon(s, 'p2a').currentHp).toBe(1);
    s = runTurn(singles(nuke, build({ name: 'F', level: 5, item: 'Focus Sash' })), sc(0, 0));
    expect(mon(s, 'p2a').currentHp).toBe(1);
    expect(mon(s, 'p2a').item).toBe('');
  });

  it('Prankster status moves fail against Dark types', () => {
    const s = runTurn(singles(build({ name: 'P', ability: 'Prankster', moveNames: ['Thunder Wave'] }), build({ name: 'D', type1: 'Dark' })), sc(0, 0));
    expect(mon(s, 'p2a').status).toBeNull();
    expect(previewOrder(singles(build({ name: 'P', ability: 'Prankster', baseStats: spe(10), moveNames: ['Thunder Wave'] }), build({ name: 'D' })), sc(0, 0))).toEqual(['p1a', 'p2a']);
  });

  it('Speed Boost raises Speed at the end of each turn', () => {
    const s = runTurn(singles(build({ name: 'S', ability: 'Speed Boost' }), build({ name: 'B' })), sc(0, 0));
    expect(mon(s, 'p1a').boosts.spe).toBe(1);
  });
});

describe('items in battle', () => {
  it('Choice items lock the first move; Assault Vest blocks status moves', () => {
    const state = singles(build({ name: 'C', item: 'Choice Band', moveNames: ['Tackle', 'Quick Attack'] }), build({ name: 'B' }));
    const s = runTurn(state, sc(1, 0));
    expect(availableChoices(mon(s, 'p1a'))).toEqual([1]);
    const vest = singles(build({ name: 'V', item: 'Assault Vest', moveNames: ['Swords Dance', 'Tackle'] }), build({ name: 'B' }));
    expect(availableChoices(mon(vest, 'p1a'))).toEqual([1]);
  });

  it('Life Orb costs 10% max HP after attacking', () => {
    const s = runTurn(singles(build({ name: 'L', item: 'Life Orb' }), build({ name: 'B', moveNames: ['Swords Dance'] })), sc(0, 0));
    const l = mon(s, 'p1a');
    expect(l.currentHp).toBe(l.stats.hp - Math.floor(l.stats.hp / 10));
  });
});

describe('doubles', () => {
  const t = (name: string, moves: string[], over: Partial<PokemonBuild> = {}) => build({ name, moveNames: moves, ...over });
  const at = (side: 0 | 1, slot: number) => ({ side, slot });

  it('spread moves hit both foes at ×0.75; Earthquake also hits the ally', () => {
    const state = doubles(
      [t('A', ['Rock Slide', 'Earthquake'], { baseStats: spe(200) }), t('B', ['Swords Dance'])],
      [t('C', ['Swords Dance']), t('D', ['Swords Dance'])],
    );
    let s = runTurn(state, { p1a: { move: 0 }, p1b: { move: 0 }, p2a: { move: 0 }, p2b: { move: 0 } });
    const hits = s.log.filter((l) => l.kind === 'damage' && l.breakdown);
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.breakdown!.steps.some((st) => st.label === 'Spread move'))).toBe(true);
    s = runTurn(state, { p1a: { move: 1 }, p1b: { move: 0 }, p2a: { move: 0 }, p2b: { move: 0 } });
    expect(s.log.filter((l) => l.kind === 'damage' && l.breakdown)).toHaveLength(3);
    expect(mon(s, 'p1b').currentHp).toBeLessThan(mon(s, 'p1b').stats.hp);
  });

  it('Protect blocks attacks; Wide Guard blocks spread moves', () => {
    const state = doubles(
      [t('A', ['Tackle', 'Rock Slide'], { baseStats: spe(50) }), t('B', ['Swords Dance'], { baseStats: spe(50) })],
      [t('C', ['Protect', 'Wide Guard']), t('D', ['Swords Dance'])],
    );
    let s = runTurn(state, { p1a: { move: 0, target: at(1, 0) }, p1b: { move: 0 }, p2a: { move: 0 }, p2b: { move: 0 } });
    expect(texts(s)).toContain('C protected itself!');
    expect(mon(s, 'p2a').currentHp).toBe(mon(s, 'p2a').stats.hp);
    s = runTurn(state, { p1a: { move: 1 }, p1b: { move: 0 }, p2a: { move: 1 }, p2b: { move: 0 } });
    expect(texts(s)).toContain('Wide Guard protected C!');
    expect(texts(s)).toContain('Wide Guard protected D!');
  });

  it('Protect fails more often when used repeatedly', () => {
    let s = doubles([t('A', ['Protect']), t('B', ['Swords Dance'])], [t('C', ['Swords Dance']), t('D', ['Swords Dance'])]);
    s = runTurn(s, { p1a: { move: 0 } });
    expect(mon(s, 'p1a').protectStreak).toBe(1);
    s = runTurn(s, { p1a: { move: 0 } }); // 0.5 >= 1/3: fails
    expect(mon(s, 'p1a').protectStreak).toBe(0);
  });

  it('Follow Me redirects single-target attacks', () => {
    const state = doubles(
      [t('A', ['Tackle'], { baseStats: spe(10) }), t('B', ['Swords Dance'])],
      [t('C', ['Follow Me']), t('D', ['Swords Dance'])],
    );
    const s = runTurn(state, { p1a: { move: 0, target: at(1, 1) } });
    expect(mon(s, 'p2b').currentHp).toBe(mon(s, 'p2b').stats.hp);
    expect(mon(s, 'p2a').currentHp).toBeLessThan(mon(s, 'p2a').stats.hp);
  });

  it('Helping Hand boosts the ally’s power by 1.5', () => {
    const state = doubles(
      [t('A', ['Tackle'], { baseStats: spe(10) }), t('B', ['Helping Hand'])],
      [t('C', ['Swords Dance']), t('D', ['Swords Dance'])],
    );
    const s = runTurn(state, { p1a: { move: 0, target: at(1, 0) } });
    const hit = s.log.find((l) => l.breakdown)!;
    expect(hit.breakdown!.power).toBe(60);
    expect(hit.breakdown!.powerNotes).toContain('Helping Hand ×1.5');
  });

  it('Fake Out flinches on the first turn only', () => {
    const state = doubles(
      [t('A', ['Fake Out']), t('B', ['Swords Dance'])],
      [t('C', ['Tackle'], { baseStats: spe(10) }), t('D', ['Swords Dance'])],
    );
    let s = runTurn(state, { p1a: { move: 0, target: at(1, 0) }, p2a: { move: 0, target: at(0, 0) } });
    expect(texts(s)).toContain("C flinched and couldn't move!");
    s = runTurn(s, { p1a: { move: 0, target: at(1, 0) }, p2a: { move: 0, target: at(0, 0) } });
    expect(texts(s)).toContain('But it failed!');
  });

  it('Tailwind doubles Speed for 4 turns; Trick Room reverses the order', () => {
    let s = doubles(
      [t('Slow', ['Tackle', 'Tailwind', 'Trick Room'], { baseStats: spe(40) }), t('B', ['Swords Dance'], { baseStats: spe(10) })],
      [t('Fast', ['Tackle'], { baseStats: spe(60) }), t('D', ['Swords Dance'], { baseStats: spe(10) })],
    );
    s = runTurn(s, { p1a: { move: 1 } });
    expect(s.sides[0].tailwind).toBe(3);
    expect(previewOrder(s, { p1a: { move: 0, target: at(1, 0) }, p2a: { move: 0, target: at(0, 0) } })[0]).toBe('p1a');
    for (let i = 0; i < 3; i++) s = runTurn(s, { p1a: { move: 0, target: at(1, 0) } });
    expect(s.sides[0].tailwind).toBe(0);
    expect(texts(s)).toContain("Player 1's team's Tailwind petered out!");
    s = runTurn(s, { p1a: { move: 2 } });
    expect(s.trickRoom).toBe(4);
    const order = previewOrder(s, { p1a: { move: 0, target: at(1, 0) }, p2a: { move: 0, target: at(0, 0) } });
    expect(order.indexOf('p1a')).toBeLessThan(order.indexOf('p2a'));
  });

  it('retargets the other foe when the chosen target has fainted', () => {
    const state = doubles([t('A', ['Tackle']), t('B', ['Swords Dance'])], [t('C', ['Swords Dance']), t('D', ['Swords Dance'])]);
    mon(state, 'p2a').currentHp = 0;
    mon(state, 'p2a').faintLogged = true;
    const s = runTurn(state, { p1a: { move: 0, target: at(1, 0) } });
    expect(mon(s, 'p2b').currentHp).toBeLessThan(mon(s, 'p2b').stats.hp);
    expect(s.winner).toBeNull();
  });

  it('a side loses only when both of its Pokémon have fainted', () => {
    const state = doubles([t('A', ['Tackle']), t('B', ['Swords Dance'])], [t('C', ['Swords Dance']), t('D', ['Swords Dance'])]);
    mon(state, 'p2a').currentHp = 0;
    mon(state, 'p2a').faintLogged = true;
    mon(state, 'p2b').currentHp = 1;
    const s = runTurn(state, { p1a: { move: 0, target: at(1, 1) } });
    expect(s.winner).toBe(0);
    expect(texts(s)).toContain('Player 1 wins the battle!');
  });

  it('After You and Quash change the order', () => {
    const state = doubles(
      [t('A', ['After You', 'Quash'], { baseStats: spe(200) }), t('B', ['Swords Dance'], { baseStats: spe(150) })],
      [t('C', ['Swords Dance'], { baseStats: spe(100) }), t('D', ['Swords Dance'], { baseStats: spe(10) })],
    );
    let s = runTurn(state, { p1a: { move: 0, target: at(1, 1) } });
    let movers = s.log.filter((l) => l.kind === 'move').map((l) => l.text.split(' ')[0]);
    expect(movers).toEqual(['A', 'D', 'B', 'C']);
    s = runTurn(state, { p1a: { move: 1, target: at(0, 1) } });
    movers = s.log.filter((l) => l.kind === 'move').map((l) => l.text.split(' ')[0]);
    expect(movers).toEqual(['A', 'C', 'D', 'B']);
  });

  it('Ally Switch swaps positions so attacks hit the other Pokémon', () => {
    const state = doubles(
      [t('A', ['Ally Switch']), t('B', ['Swords Dance'])],
      [t('C', ['Tackle'], { baseStats: spe(10) }), t('D', ['Swords Dance'])],
    );
    const s = runTurn(state, { p2a: { move: 0, target: at(0, 0) } });
    expect(s.sides[0].mons[0].name).toBe('B');
    expect(mon(s, 'p1b').currentHp).toBeLessThan(mon(s, 'p1b').stats.hp);
    expect(mon(s, 'p1a').currentHp).toBe(mon(s, 'p1a').stats.hp);
  });

  it('Friend Guard reduces damage to the ally; Telepathy ignores ally attacks', () => {
    const state = doubles(
      [t('A', ['Tackle']), t('B', ['Swords Dance'])],
      [t('C', ['Swords Dance']), t('D', ['Swords Dance'], { ability: 'Friend Guard' })],
    );
    const s = runTurn(state, { p1a: { move: 0, target: at(1, 0) } });
    expect(s.log.find((l) => l.breakdown)!.breakdown!.steps.some((st) => st.label.includes('Friend Guard'))).toBe(true);
    const tele = doubles(
      [t('A', ['Earthquake']), t('B', ['Swords Dance'], { ability: 'Telepathy' })],
      [t('C', ['Swords Dance']), t('D', ['Swords Dance'])],
    );
    const s2 = runTurn(tele, { p1a: { move: 0 } });
    expect(mon(s2, 'p1b').currentHp).toBe(mon(s2, 'p1b').stats.hp);
  });

  it('partner support moves boost and heal the ally', () => {
    const state = doubles(
      [t('A', ['Coaching', 'Heal Pulse', 'Pollen Puff']), t('B', ['Swords Dance'])],
      [t('C', ['Swords Dance']), t('D', ['Swords Dance'])],
    );
    let s = runTurn(state, { p1a: { move: 0 } });
    expect(mon(s, 'p1b').boosts.atk).toBe(3); // Coaching +1, then Swords Dance +2
    mon(state, 'p1b').currentHp = 1;
    s = runTurn(state, { p1a: { move: 2, target: at(0, 1) } });
    expect(mon(s, 'p1b').currentHp).toBe(1 + Math.floor(mon(s, 'p1b').stats.hp / 2));
  });
});
