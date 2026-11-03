import { describe, expect, it } from 'vitest';
import { blankBuild, findMove } from '../data/presets';
import {
  STRUGGLE_INDEX, availableChoices, createBattle, createBattlePokemon, determineOrder, runTurn,
} from './battle';
import type { Rng } from './battle';
import { calcDamage, pokeRound } from './damage';
import { calcStat, validateBuild } from './stats';
import { effectiveness } from './typeChart';
import type { Move, PokemonBuild } from './types';

/** RNG that returns the given values in order, then 0.99 (no crits, no secondary effects, max roll). */
function scripted(...values: number[]): Rng {
  let i = 0;
  return { next: () => (i < values.length ? values[i++] : 0.99) };
}

function build(over: Partial<PokemonBuild> = {}): PokemonBuild {
  return { ...blankBuild(), ...over };
}

const NO_CRIT = 0.99;
const MAX_ROLL = 0.99; // 85 + floor(0.99 * 16) = 100
const HIT = 0;

describe('stats', () => {
  it('matches known values (base 108/130/…/102, Lv100, 31 IV, 252 EV, Jolly)', () => {
    expect(calcStat('hp', 108, 31, 252, 100, 'Jolly')).toBe(420);
    expect(calcStat('atk', 130, 31, 252, 100, 'Jolly')).toBe(359);
    expect(calcStat('spe', 102, 31, 252, 100, 'Jolly')).toBe(333);
    expect(calcStat('spa', 80, 31, 0, 100, 'Jolly')).toBe(176); // floor((191+5)*0.9)
  });

  it('validates the EV total', () => {
    const b = build({ evs: { hp: 252, atk: 252, def: 252, spa: 0, spd: 0, spe: 0 } });
    expect(validateBuild(b).some((e) => e.includes('EV total'))).toBe(true);
  });
});

describe('type chart', () => {
  it('combines dual types', () => {
    expect(effectiveness('Ice', ['Dragon', 'Ground'])).toBe(4);
    expect(effectiveness('Electric', ['Water', 'Ground'])).toBe(0);
    expect(effectiveness('Fire', ['Water', 'Rock'])).toBe(0.25);
  });
});

describe('damage formula', () => {
  const attackMove: Move = { ...findMove('Tackle'), name: 'Test', type: 'Fire', power: 100, category: 'Physical' };

  function mons() {
    const a = createBattlePokemon(build({ type1: 'Fire' }));
    const d = createBattlePokemon(build({ type1: 'Grass' }));
    a.stats.atk = 150;
    d.stats.def = 100;
    return { a, d };
  }

  it('computes base damage, STAB, and type effectiveness', () => {
    const { a, d } = mons();
    // floor(floor(floor(2*50/5+2) * 100 * 150 / 100) / 50) + 2 = 68
    const max = calcDamage(a, d, attackMove, { crit: false, roll: 100 });
    expect(max.baseDamage).toBe(68);
    expect(max.damage).toBe(204); // 68 -> STAB 102 -> SE 204
    const min = calcDamage(a, d, attackMove, { crit: false, roll: 85 });
    expect(min.damage).toBe(170); // floor(68*.85)=57 -> pokeRound(85.5)=85 -> 170
  });

  it('pokeRound rounds .5 down', () => {
    expect(pokeRound(85.5)).toBe(85);
    expect(pokeRound(85.51)).toBe(86);
  });

  it('crits multiply by 1.5 and ignore the defender’s positive Defense stages', () => {
    const { a, d } = mons();
    d.boosts.def = 2;
    const crit = calcDamage(a, d, attackMove, { crit: true, roll: 100 });
    expect(crit.defense).toBe(100);
    expect(crit.damage).toBe(306); // 68 -> 102 -> STAB 153 -> SE 306
  });

  it('halves physical damage when burned', () => {
    const { a, d } = mons();
    a.status = 'brn';
    expect(calcDamage(a, d, attackMove, { crit: false, roll: 100 }).damage).toBe(102);
  });
});

describe('turn order', () => {
  it('faster Pokémon moves first; priority overrides speed', () => {
    const fast = build({ name: 'Fast', baseStats: { ...blankBuild().baseStats, spe: 150 }, moves: [findMove('Tackle'), null, null, null] });
    const slow = build({ name: 'Slow', baseStats: { ...blankBuild().baseStats, spe: 30 }, moves: [findMove('Quick Attack'), findMove('Tackle'), null, null] });
    const state = createBattle(fast, slow);
    expect(determineOrder(state, [0, 1], scripted()).order).toEqual([0, 1]);
    expect(determineOrder(state, [0, 0], scripted()).order).toEqual([1, 0]);
  });

  it('breaks speed ties with a coin flip', () => {
    const state = createBattle(build({ name: 'A' }), build({ name: 'B' }));
    expect(determineOrder(state, [0, 0], scripted(0.1)).order).toEqual([0, 1]);
    expect(determineOrder(state, [0, 0], scripted(0.9)).order).toEqual([1, 0]);
  });

  it('paralysis halves speed', () => {
    const fast = build({ name: 'Fast', baseStats: { ...blankBuild().baseStats, spe: 100 } });
    const slow = build({ name: 'Slow', baseStats: { ...blankBuild().baseStats, spe: 70 } });
    const state = createBattle(fast, slow);
    state.mons[0].status = 'par';
    expect(determineOrder(state, [0, 0], scripted()).order).toEqual([1, 0]);
  });
});

describe('runTurn', () => {
  it('first attacker KOs and the second does not attack', () => {
    const strong = build({ name: 'Strong', level: 100, baseStats: { hp: 100, atk: 200, def: 100, spa: 100, spd: 100, spe: 200 }, moves: [findMove('Double-Edge'), null, null, null] });
    const weak = build({ name: 'Weak', level: 5 });
    const s = runTurn(createBattle(strong, weak), [0, 0], scripted());
    expect(s.winner).toBe(0);
    expect(s.log.filter((l) => l.kind === 'move').map((l) => l.text)).toEqual(['Strong used Double-Edge!']);
  });

  it('both attack, then the turn ends; PP is spent', () => {
    const s = runTurn(createBattle(build({ name: 'A' }), build({ name: 'B' })), [0, 0], scripted(0.1));
    expect(s.log.filter((l) => l.kind === 'move')).toHaveLength(2);
    expect(s.mons[0].currentHp).toBeLessThan(s.mons[0].stats.hp);
    expect(s.mons[1].currentHp).toBeLessThan(s.mons[1].stats.hp);
    expect(s.mons[0].pp[0]).toBe(34);
    expect(s.winner).toBeNull();
  });

  it('full paralysis prevents moving', () => {
    const state = createBattle(build({ name: 'A' }), build({ name: 'B', baseStats: { ...blankBuild().baseStats, spe: 10 } }));
    state.mons[0].status = 'par';
    // A: Speed 100, halved to 50 by paralysis; B: Speed 30. A moves first and fails the paralysis check (0.1 < 0.25).
    const s = runTurn(state, [0, 0], scripted(0.1, NO_CRIT, MAX_ROLL));
    expect(s.log.some((l) => l.text.includes('fully paralyzed'))).toBe(true);
    expect(s.mons[1].currentHp).toBe(s.mons[1].stats.hp);
  });

  it('respects type immunity and status immunity', () => {
    const ground = build({ name: 'G', type1: 'Ground', moves: [findMove('Tackle'), null, null, null] });
    const elec = build({ name: 'E', type1: 'Electric', moves: [findMove('Thunder Wave'), findMove('Thunderbolt'), null, null] });
    let s = runTurn(createBattle(ground, elec), [0, 0], scripted(0.1, HIT, NO_CRIT, MAX_ROLL, HIT));
    expect(s.mons[0].status).toBeNull();
    expect(s.log.some((l) => l.text.startsWith("It doesn't affect G"))).toBe(true);

    const fire = build({ name: 'F', type1: 'Fire' });
    const wisp = build({ name: 'W', moves: [findMove('Will-O-Wisp'), null, null, null] });
    s = runTurn(createBattle(fire, wisp), [0, 0], scripted(0.1, HIT, NO_CRIT, MAX_ROLL, HIT));
    expect(s.mons[0].status).toBeNull();
    expect(s.log.some((l) => l.text === 'But it failed!')).toBe(true);
  });

  it('applies and clamps stat stages', () => {
    const sd = () => build({ name: 'S', moves: [findMove('Swords Dance'), null, null, null] });
    let s = createBattle(sd(), { ...sd(), name: 'T' });
    for (let i = 0; i < 3; i++) s = runTurn(s, [0, 0], scripted(0.1));
    expect(s.mons[0].boosts.atk).toBe(6);
    s = runTurn(s, [0, 0], scripted(0.1));
    expect(s.mons[0].boosts.atk).toBe(6);
    expect(s.log.some((l) => l.text === "S's Attack won't go any higher!")).toBe(true);
  });

  it('lowers the target’s stats', () => {
    const s = runTurn(
      createBattle(build({ name: 'A', moves: [findMove('Growl'), null, null, null] }), build({ name: 'B', moves: [findMove('Growl'), null, null, null] })),
      [0, 0],
      scripted(0.1, HIT, HIT),
    );
    expect(s.mons[0].boosts.atk).toBe(-1);
    expect(s.mons[1].boosts.atk).toBe(-1);
  });

  it('deals burn damage at the end of the turn', () => {
    const state = createBattle(
      build({ name: 'A', moves: [findMove('Swords Dance'), null, null, null] }),
      build({ name: 'B', moves: [findMove('Swords Dance'), null, null, null] }),
    );
    state.mons[0].status = 'brn';
    const s = runTurn(state, [0, 0], scripted(0.1));
    const max = s.mons[0].stats.hp;
    expect(s.mons[0].currentHp).toBe(max - Math.floor(max / 16));
  });

  it('uses Struggle when out of PP', () => {
    const state = createBattle(build({ name: 'A' }), build({ name: 'B' }));
    state.mons[0].pp = [0, 0, 0, 0];
    expect(availableChoices(state.mons[0])).toEqual([STRUGGLE_INDEX]);
    const s = runTurn(state, [STRUGGLE_INDEX, 0], scripted(0.1));
    expect(s.log.some((l) => l.text === 'A used Struggle!')).toBe(true);
    expect(s.log.some((l) => l.text.startsWith('A is damaged by recoil'))).toBe(true);
  });

  it('does not mutate the input state', () => {
    const state = createBattle(build({ name: 'A' }), build({ name: 'B' }));
    const copy = structuredClone(state);
    runTurn(state, [0, 0], scripted(0.1));
    expect(state).toEqual(copy);
  });
});
