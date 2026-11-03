import { describe, expect, it } from 'vitest';
import { blankBuild, findMove } from '../data/presets';
import { SWITCH_INDEX, availableChoices, createBattle, findMon, lockedReason, runTurn as engineRunTurn } from './battle';
import type { BattleState, Rng, TurnChoices } from './battle';
import type { Move, PokemonBuild } from './types';

const fixed = (v = 0.5): Rng => ({ next: () => v });
const runTurn = (s: BattleState, c: TurnChoices, rng: Rng = fixed()) => engineRunTurn(s, c, rng);

function build(name: string, moveNames: (string | Move)[], over: Partial<PokemonBuild> = {}): PokemonBuild {
  const b = { ...blankBuild(), name, ...over };
  b.moves = [...moveNames.map((m) => (typeof m === 'string' ? findMove(m) : m)), null, null, null, null].slice(0, 4);
  return b;
}
const spe = (n: number) => ({ ...blankBuild().baseStats, spe: n });
const fast = (name: string, moves: (string | Move)[], over: Partial<PokemonBuild> = {}) => build(name, moves, { baseStats: spe(200), ...over });
const slow = (name: string, moves: (string | Move)[], over: Partial<PokemonBuild> = {}) => build(name, moves, { baseStats: spe(20), ...over });
const battle = (a: PokemonBuild[], b: PokemonBuild[], setup = {}) => createBattle([a, b], 'singles', fixed(), setup);
const sc = (a: number, b: number): TurnChoices => ({ p1a: { move: a }, p2a: { move: b } });
const texts = (s: BattleState) => s.log.map((l) => l.text);
const mon = (s: BattleState, uid: string) => findMon(s, uid)!;
const lost = (s: BattleState, uid: string) => mon(s, uid).stats.hp - mon(s, uid).currentHp;

describe('Two-turn moves', () => {
  it('Solar Beam charges on turn 1, attacks on turn 2, and uses PP once', () => {
    let s = battle([fast('A', ['Solar Beam', 'Tackle'])], [slow('B', ['Growl'])]);
    s = runTurn(s, sc(0, 0));
    expect(texts(s)).toContain('A absorbed light!');
    expect(lost(s, 'p2a')).toBe(0);
    expect(availableChoices(mon(s, 'p1a'))).toEqual([0]);
    expect(lockedReason(mon(s, 'p1a'))).toBe('A will finish Solar Beam this turn.');
    s = runTurn(s, sc(1, 0)); // the choice is ignored: Solar Beam fires
    expect(texts(s)).toContain('A used Solar Beam!');
    expect(lost(s, 'p2a')).toBeGreaterThan(0);
    expect(mon(s, 'p1a').pp[0]).toBe(findMove('Solar Beam').pp - 1);
    expect(availableChoices(mon(s, 'p1a'))).toEqual([0, 1]);
  });

  it('Solar Beam fires at once in sun and is halved in rain', () => {
    let s = runTurn(battle([fast('A', ['Solar Beam'])], [slow('B', ['Growl'])], { weather: 'sun' }), sc(0, 0));
    expect(lost(s, 'p2a')).toBeGreaterThan(0);
    s = runTurn(battle([fast('A', ['Solar Beam'])], [slow('B', ['Growl'])], { weather: 'rain' }), sc(0, 0));
    s = runTurn(s, sc(0, 0));
    const rainBd = s.log.find((l) => l.breakdown)!.breakdown!;
    expect(rainBd.movePower).toBe(60);
  });

  it('Power Herb skips the charging turn once', () => {
    let s = battle([fast('A', ['Skull Bash'], { item: 'Power Herb' })], [slow('B', ['Growl'])]);
    s = runTurn(s, sc(0, 0));
    expect(texts(s)).toContain('A became fully charged due to its Power Herb!');
    expect(mon(s, 'p1a').boosts.def).toBe(1); // Skull Bash still raises Defense
    expect(lost(s, 'p2a')).toBeGreaterThan(0);
    expect(mon(s, 'p1a').item).toBe('');
  });

  it('Fly dodges most moves on the charging turn; Thunder still hits', () => {
    let s = battle([fast('A', ['Fly'])], [slow('B', ['Tackle', 'Thunder'])]);
    s = runTurn(s, sc(0, 0));
    expect(texts(s)).toContain('A flew up high!');
    expect(texts(s)).toContain('A avoided the attack!');
    expect(lost(s, 'p1a')).toBe(0);
    s = runTurn(battle([fast('A', ['Fly'])], [slow('B', ['Tackle', 'Thunder'])]), sc(0, 1));
    expect(lost(s, 'p1a')).toBeGreaterThan(0);
  });

  it('Earthquake hits a Pokémon using Dig for double power', () => {
    const s = runTurn(battle([fast('A', ['Dig'])], [slow('B', ['Earthquake'])]), sc(0, 0));
    const bd = s.log.find((l) => l.breakdown)!.breakdown!;
    expect(bd.movePower).toBe(200);
  });

  it('being stopped on the second turn cancels the move; switching out cancels it too', () => {
    let s = battle([fast('A', ['Solar Beam']), fast('A2', ['Tackle'])], [slow('B', ['Growl'])]);
    s = runTurn(s, sc(0, 0));
    s = runTurn(s, { p1a: { move: SWITCH_INDEX, switchTo: 1 }, p2a: { move: 0 } }); // locked in: the switch is ignored
    expect(texts(s)).toContain('A used Solar Beam!');
    expect(mon(s, 'p1a').charging).toBeNull();
  });

  it('Phantom Force goes through Protect', () => {
    let s = battle([slow('A', ['Phantom Force'])], [fast('B', ['Protect', 'Growl'], { type1: 'Fire' })]);
    s = runTurn(s, sc(0, 1));
    s = runTurn(s, sc(0, 0));
    expect(texts(s)).toContain("It broke through B's protection!");
    expect(lost(s, 'p2a')).toBeGreaterThan(0);
  });
});

describe('Recharge moves', () => {
  it('Hyper Beam makes the user skip its next turn, but not after a miss', () => {
    let s = battle([fast('A', ['Hyper Beam', 'Tackle'], { level: 5 })], [slow('B', ['Growl'], { level: 100 })]);
    s = runTurn(s, sc(0, 0));
    expect(lockedReason(mon(s, 'p1a'))).toBe('A must recharge this turn.');
    s = runTurn(s, sc(1, 0));
    expect(texts(s)).toContain('A must recharge!');
    expect(texts(s).filter((t) => t === 'A used Tackle!')).toHaveLength(0);
    s = runTurn(s, sc(1, 0));
    expect(texts(s)).toContain('A used Tackle!');
    const miss = runTurn(battle([fast('A', ['Hyper Beam'])], [slow('B', ['Growl'])]), sc(0, 0), fixed(0.95));
    expect(texts(miss)).toContain('B avoided the attack!');
    expect(mon(miss, 'p1a').mustRecharge).toBe(false);
  });
});

describe('Item-changing moves', () => {
  it('Knock Off removes the item and gets ×1.5 power against a held item', () => {
    const s = runTurn(battle([fast('A', ['Knock Off'])], [slow('B', ['Growl'], { item: 'Leftovers' })]), sc(0, 0));
    expect(texts(s)).toContain("A knocked off B's Leftovers!");
    expect(mon(s, 'p2a').item).toBe('');
    const bd = s.log.find((l) => l.breakdown)!.breakdown!;
    expect(bd.powerNotes.join()).toContain('holds an item');
  });

  it('Thief steals only when the user has no item', () => {
    let s = runTurn(battle([fast('A', ['Thief'])], [slow('B', ['Growl'], { item: 'Choice Band' })]), sc(0, 0));
    expect(mon(s, 'p1a').item).toBe('Choice Band');
    expect(mon(s, 'p2a').item).toBe('');
    s = runTurn(battle([fast('A', ['Thief'], { item: 'Leftovers' })], [slow('B', ['Growl'], { item: 'Choice Band' })]), sc(0, 0));
    expect(mon(s, 'p1a').item).toBe('Leftovers');
  });

  it('Trick swaps items (handing over a Choice Scarf locks the target); Bestow gives one', () => {
    let s = battle([fast('A', ['Trick', 'Growl'], { item: 'Choice Scarf' })], [slow('B', ['Growl', 'Tackle'], { item: 'Leftovers' })]);
    s = runTurn(s, sc(0, 0));
    expect(mon(s, 'p1a').item).toBe('Leftovers');
    expect(mon(s, 'p2a').item).toBe('Choice Scarf');
    // B got the Scarf before it moved on turn 1, so it's locked into Growl.
    expect(availableChoices(mon(s, 'p2a'))).toEqual([0]);
    s = runTurn(battle([fast('A', ['Bestow'], { item: 'Sitrus Berry' })], [slow('B', ['Growl'])]), sc(0, 0));
    expect(mon(s, 'p2a').item).toBe('Sitrus Berry');
    expect(texts(s)).toContain('B received Sitrus Berry from A!');
  });

  it('Trick fails when neither Pokémon has an item', () => {
    const s = runTurn(battle([fast('A', ['Trick'])], [slow('B', ['Growl'])]), sc(0, 0));
    expect(texts(s)).toContain('But it failed!');
  });

  it('items are kept through switching', () => {
    let s = battle([fast('A', ['Knock Off'])], [slow('B', ['Growl'], { item: 'Leftovers' }), slow('B2', ['Growl'])]);
    s = runTurn(s, sc(0, 0));
    s = runTurn(s, { p1a: { move: 0 }, p2a: { move: SWITCH_INDEX, switchTo: 1 } });
    expect(mon(s, 'p2a').item).toBe('');
  });
});
