import { describe, expect, it } from 'vitest';
import { blankBuild, findMove } from '../data/presets';
import { availableChoices, createBattle, findMon, runTurn as engineRunTurn } from './battle';
import type { BattleState, Rng, TurnChoices } from './battle';
import type { PokemonBuild } from './types';

const fixed = (v = 0.5): Rng => ({ next: () => v });
const runTurn = (s: BattleState, c: TurnChoices, rng: Rng = fixed()) => engineRunTurn(s, c, rng);

function build(name: string, moveNames: string[], over: Partial<PokemonBuild> = {}): PokemonBuild {
  const b = { ...blankBuild(), name, ...over };
  b.moves = [...moveNames.map(findMove), null, null, null, null].slice(0, 4);
  return b;
}
const spe = (n: number) => ({ ...blankBuild().baseStats, spe: n });
const fast = (name: string, moves: string[], over: Partial<PokemonBuild> = {}) => build(name, moves, { baseStats: spe(200), ...over });
const slow = (name: string, moves: string[], over: Partial<PokemonBuild> = {}) => build(name, moves, { baseStats: spe(20), ...over });
const singles = (a: PokemonBuild, b: PokemonBuild) => createBattle([[a], [b]], 'singles', fixed());
const sc = (a: number, b: number): TurnChoices => ({ p1a: { move: a }, p2a: { move: b } });
const texts = (s: BattleState) => s.log.map((l) => l.text);
const mon = (s: BattleState, uid: string) => findMon(s, uid)!;

describe('Taunt', () => {
  it('stops status moves, even one already chosen this turn, for 3 turns', () => {
    let s = singles(fast('A', ['Taunt', 'Tackle']), slow('B', ['Swords Dance', 'Tackle']));
    s = runTurn(s, sc(0, 0));
    expect(texts(s)).toContain('B fell for the taunt!');
    expect(texts(s)).toContain("B can't use Swords Dance after the taunt!");
    expect(mon(s, 'p2a').boosts.atk).toBe(0);
    expect(availableChoices(mon(s, 'p2a'))).toEqual([1]);
    s = runTurn(s, sc(1, 1));
    s = runTurn(s, sc(1, 1));
    expect(texts(s)).toContain('B shook off the taunt!');
    expect(availableChoices(mon(s, 'p2a'))).toEqual([0, 1]);
  });

  it('lasts an extra turn if the target already moved', () => {
    const s = runTurn(singles(slow('A', ['Taunt']), fast('B', ['Tackle'])), sc(0, 0));
    expect(mon(s, 'p2a').taunt).toBe(3); // 4, minus the end of this turn
  });
});

describe('Encore', () => {
  it('fails with no previous move, then locks the target into its last move', () => {
    let s = singles(fast('A', ['Encore']), slow('B', ['Swords Dance', 'Tackle']));
    s = runTurn(s, sc(0, 0));
    expect(texts(s)).toContain('But it failed!');
    s = runTurn(s, sc(0, 1)); // B picks Tackle, but Encore replaces it with Swords Dance
    expect(texts(s)).toContain('B must do an encore of Swords Dance!');
    expect(texts(s).filter((t) => t === 'B used Swords Dance!')).toHaveLength(2);
    expect(texts(s)).not.toContain('B used Tackle!');
    expect(availableChoices(mon(s, 'p2a'))).toEqual([0]);
    s = runTurn(s, sc(0, 0)); // Encore fails: already encored
    s = runTurn(s, sc(0, 0));
    expect(texts(s)).toContain("B's encore ended!");
    expect(availableChoices(mon(s, 'p2a'))).toEqual([0, 1]);
  });
});

describe('Substitute', () => {
  it('costs 1/4 HP and takes hits in place of the user', () => {
    const s = runTurn(singles(fast('A', ['Substitute']), slow('B', ['Tackle'])), sc(0, 0));
    const a = mon(s, 'p1a');
    const cost = Math.floor(a.stats.hp / 4);
    expect(a.currentHp).toBe(a.stats.hp - cost);
    expect(texts(s).some((t) => t.startsWith('The substitute took damage for A!'))).toBe(true);
    expect(a.substituteHp).toBeLessThan(cost);
  });

  it('fades when its HP runs out, and blocks status moves and extra effects', () => {
    let s = singles(fast('A', ['Substitute']), slow('B', ['Will-O-Wisp', 'Icy Wind', 'Double-Edge'], { level: 100 }));
    s = runTurn(s, sc(0, 0));
    expect(mon(s, 'p1a').status).toBeNull();
    expect(texts(s)).toContain('But it failed!');
    s = runTurn(s, sc(0, 1));
    expect(mon(s, 'p1a').boosts.spe).toBe(0);
    s = runTurn(s, sc(0, 2)); // A can't afford another substitute? It still has one: "already has"
    expect(texts(s)).toContain('A already has a substitute!');
    expect(texts(s)).toContain("A's substitute faded!");
  });

  it('sound moves and Infiltrator go around it', () => {
    let s = runTurn(singles(fast('A', ['Substitute']), slow('B', ['Hyper Voice'])), sc(0, 0));
    expect(mon(s, 'p1a').currentHp).toBeLessThan(mon(s, 'p1a').stats.hp - Math.floor(mon(s, 'p1a').stats.hp / 4));
    s = runTurn(singles(fast('A', ['Substitute']), slow('B', ['Tackle'], { ability: 'Infiltrator' })), sc(0, 0));
    expect(mon(s, 'p1a').substituteHp).toBe(Math.floor(mon(s, 'p1a').stats.hp / 4));
  });

  it('fails without enough HP', () => {
    const state = singles(fast('A', ['Substitute']), slow('B', ['Swords Dance']));
    mon(state, 'p1a').currentHp = 10;
    const s = runTurn(state, sc(0, 0));
    expect(texts(s)).toContain('But it does not have enough HP left to make a substitute!');
    expect(mon(s, 'p1a').currentHp).toBe(10);
  });
});

describe('Leech Seed', () => {
  it('drains 1/8 of the target’s max HP to the user each turn', () => {
    const state = singles(fast('A', ['Leech Seed']), slow('B', ['Swords Dance']));
    mon(state, 'p1a').currentHp = 10;
    const s = runTurn(state, sc(0, 0));
    const drained = Math.floor(mon(s, 'p2a').stats.hp / 8);
    expect(mon(s, 'p2a').currentHp).toBe(mon(s, 'p2a').stats.hp - drained);
    expect(mon(s, 'p1a').currentHp).toBe(10 + drained);
  });

  it('doesn’t affect Grass types or a Substitute; Magic Guard blocks the drain', () => {
    let s = runTurn(singles(fast('A', ['Leech Seed']), slow('G', ['Swords Dance'], { type1: 'Grass' })), sc(0, 0));
    expect(mon(s, 'p2a').leechSeed).toBeNull();
    s = runTurn(singles(slow('A', ['Leech Seed']), fast('S', ['Substitute'])), sc(0, 0));
    expect(mon(s, 'p2a').leechSeed).toBeNull();
    s = runTurn(singles(fast('A', ['Leech Seed']), slow('M', ['Swords Dance'], { ability: 'Magic Guard' })), sc(0, 0));
    expect(mon(s, 'p2a').leechSeed).not.toBeNull();
    expect(mon(s, 'p2a').currentHp).toBe(mon(s, 'p2a').stats.hp);
  });

  it('in doubles, heals whoever is in the user’s position', () => {
    const state = createBattle(
      [[fast('A', ['Leech Seed']), build('B', ['Swords Dance'])], [slow('C', ['Swords Dance']), slow('D', ['Swords Dance'])]],
      'doubles',
      fixed(),
    );
    mon(state, 'p1a').currentHp = 10;
    const s = runTurn(state, { p1a: { move: 0, target: { side: 1, slot: 1 } } });
    expect(mon(s, 'p1a').currentHp).toBe(10 + Math.floor(mon(s, 'p2b').stats.hp / 8));
  });
});

describe('Disable', () => {
  it('fails with no previous move, then blocks the last move for 4 turns', () => {
    let s = singles(fast('A', ['Disable', 'Swords Dance']), slow('B', ['Tackle', 'Growl']));
    s = runTurn(s, sc(0, 0)); // B hasn't used a move yet
    expect(texts(s)).toContain('But it failed!');
    s = runTurn(s, sc(0, 0)); // B used Tackle last turn; it's disabled before B moves
    expect(texts(s)).toContain("B's Tackle was disabled!");
    expect(texts(s)).toContain("B's Tackle is disabled!");
    expect(availableChoices(mon(s, 'p2a'))).toEqual([1]);
    for (let i = 0; i < 2; i++) s = runTurn(s, sc(1, 1));
    expect(texts(s)).not.toContain("B's move is no longer disabled!");
    s = runTurn(s, sc(1, 1));
    expect(texts(s)).toContain("B's move is no longer disabled!");
    expect(availableChoices(mon(s, 'p2a'))).toEqual([0, 1]);
  });
});

describe('Torment', () => {
  it('stops the target from using the same move twice in a row', () => {
    let s = singles(fast('A', ['Swords Dance', 'Torment']), slow('B', ['Tackle', 'Growl']));
    s = runTurn(s, sc(0, 0)); // B uses Tackle
    s = runTurn(s, sc(1, 0)); // A torments B before B repeats Tackle
    expect(texts(s)).toContain('B was subjected to torment!');
    expect(texts(s)).toContain("B can't use the same move twice in a row due to the torment!");
    s = runTurn(s, sc(0, 1)); // B uses Growl
    expect(availableChoices(mon(s, 'p2a'))).toEqual([0]);
    s = runTurn(s, sc(0, 0));
    expect(availableChoices(mon(s, 'p2a'))).toEqual([1]);
  });
});

describe('Yawn', () => {
  it('puts the target to sleep at the end of the next turn', () => {
    let s = runTurn(singles(fast('A', ['Yawn', 'Swords Dance']), slow('B', ['Swords Dance'])), sc(0, 0));
    expect(texts(s)).toContain('B grew drowsy!');
    expect(mon(s, 'p2a').status).toBeNull();
    s = runTurn(s, sc(1, 0));
    expect(mon(s, 'p2a').status).toBe('slp');
  });

  it('fails against Insomnia, a status condition, or a Substitute', () => {
    let s = runTurn(singles(fast('A', ['Yawn']), slow('I', ['Swords Dance'], { ability: 'Insomnia' })), sc(0, 0));
    expect(mon(s, 'p2a').yawn).toBe(0);
    const burned = singles(fast('A', ['Yawn']), slow('B', ['Swords Dance']));
    mon(burned, 'p2a').status = 'brn';
    s = runTurn(burned, sc(0, 0));
    expect(mon(s, 'p2a').yawn).toBe(0);
    s = runTurn(singles(slow('A', ['Yawn']), fast('S', ['Substitute'])), sc(0, 0));
    expect(mon(s, 'p2a').yawn).toBe(0);
  });
});

describe('Perish Song', () => {
  it('makes every Pokémon that hears it faint after three more turns', () => {
    let s = singles(fast('A', ['Perish Song', 'Swords Dance']), slow('B', ['Swords Dance']));
    s = runTurn(s, sc(0, 0));
    expect(texts(s)).toContain('All Pokémon that hear the song will faint in three turns!');
    expect(texts(s)).toContain("A's perish count fell to 3.");
    s = runTurn(s, sc(1, 0));
    s = runTurn(s, sc(1, 0));
    expect(s.winner).toBeNull();
    s = runTurn(s, sc(1, 0));
    expect(s.winner).toBe('draw');
  });

  it('Soundproof is immune', () => {
    let s = singles(fast('A', ['Perish Song', 'Swords Dance']), slow('S', ['Swords Dance'], { ability: 'Soundproof' }));
    s = runTurn(s, sc(0, 0));
    for (let i = 0; i < 3; i++) s = runTurn(s, sc(1, 0));
    expect(s.winner).toBe(1);
  });
});
