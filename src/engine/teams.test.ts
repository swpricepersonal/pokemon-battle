import { describe, expect, it } from 'vitest';
import { blankBuild, findMove } from '../data/presets';
import { blankCustomAbility, getAbility } from './abilities';
import {
  SWITCH_INDEX, applyReplacements, availableChoices, benchOptions, createBattle, endBattle, findMon, replacementKey,
  runTurn as engineRunTurn, setMonHp,
} from './battle';
import type { BattleState, Rng, TurnChoices } from './battle';
import { CUSTOM_ABILITY, typesOf } from './types';
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
const battle = (a: PokemonBuild[], b: PokemonBuild[]) => createBattle([a, b], 'singles', fixed());
const sc = (a: number, b: number): TurnChoices => ({ p1a: { move: a }, p2a: { move: b } });
const texts = (s: BattleState) => s.log.map((l) => l.text);
const mon = (s: BattleState, uid: string) => findMon(s, uid)!;
const active = (s: BattleState, side: 0 | 1, slot = 0) => s.sides[side].mons[slot];

describe('Teams and switching', () => {
  it('starts with the first team member and keeps the rest on the bench', () => {
    const s = battle([fast('A', ['Tackle']), fast('A2', ['Tackle']), fast('A3', ['Tackle'])], [slow('B', ['Tackle'])]);
    expect(active(s, 0).name).toBe('A');
    expect(s.sides[0].team.map((m) => m.uid)).toEqual(['p1a', 'p1b', 'p1c']);
    expect(benchOptions(s, 0)).toEqual([1, 2]);
  });

  it('switches before any move and the newcomer takes the hit', () => {
    let s = battle([slow('A', ['Tackle']), slow('A2', ['Tackle'])], [fast('B', ['Extreme Speed'])]);
    s = runTurn(s, { p1a: { move: SWITCH_INDEX, switchTo: 1 }, p2a: { move: 0 } });
    const t = texts(s);
    expect(t.indexOf('Player 1 withdrew A!')).toBeLessThan(t.indexOf('B used Extreme Speed!'));
    expect(active(s, 0).name).toBe('A2');
    expect(mon(s, 'p1a').currentHp).toBe(mon(s, 'p1a').stats.hp);
    expect(mon(s, 'p1b').currentHp).toBeLessThan(mon(s, 'p1b').stats.hp);
  });

  it('clears stat changes and volatile conditions on switching out, but keeps HP, status and PP', () => {
    let s = battle([fast('A', ['Swords Dance', 'Tackle']), fast('A2', ['Tackle'])], [slow('B', ['Will-O-Wisp', 'Taunt'])]);
    s = runTurn(s, sc(0, 0));
    expect(mon(s, 'p1a').boosts.atk).toBe(2);
    s = runTurn(s, sc(1, 1));
    expect(mon(s, 'p1a').taunt).toBeGreaterThan(0);
    s = runTurn(s, { p1a: { move: SWITCH_INDEX, switchTo: 1 }, p2a: { move: 0 } });
    const a = mon(s, 'p1a');
    expect(a.boosts.atk).toBe(0);
    expect(a.taunt).toBe(0);
    expect(a.status).toBe('brn');
    expect(a.pp[0]).toBe(findMove('Swords Dance').pp - 1);
  });

  it('asks for a replacement after a faint, and the battle goes on until the whole team is down', () => {
    let s = battle([fast('A', ['Tackle'], { level: 100 })], [slow('B', ['Tackle'], { level: 1 }), slow('B2', ['Tackle'], { level: 1 })]);
    s = runTurn(s, sc(0, 0));
    expect(texts(s)).toContain('B fainted!');
    expect(s.winner).toBeNull();
    expect(s.pendingReplacements).toEqual([{ side: 1, slot: 0 }]);
    s = applyReplacements(s, { [replacementKey({ side: 1, slot: 0 })]: 1 }, fixed());
    expect(texts(s)).toContain('Player 2 sent out B2!');
    expect(active(s, 1).name).toBe('B2');
    expect(s.pendingReplacements).toEqual([]);
    s = runTurn(s, sc(0, 0));
    expect(s.winner).toBe(0);
    expect(texts(s)).toContain('Player 1 wins the battle!');
  });

  it('fills a fainted slot in doubles from the bench', () => {
    const team1 = [fast('A', ['Tackle'], { level: 100 }), fast('A2', ['Tackle'], { level: 100 })];
    const team2 = [slow('B', ['Tackle'], { level: 1 }), slow('B2', ['Tackle']), slow('B3', ['Tackle'])];
    let s = createBattle([team1, team2], 'doubles', fixed());
    s = runTurn(s, {
      p1a: { move: 0, target: { side: 1, slot: 0 } }, p1b: { move: 0, target: { side: 1, slot: 0 } },
      p2a: { move: 0, target: { side: 0, slot: 0 } }, p2b: { move: 0, target: { side: 0, slot: 0 } },
    });
    expect(s.pendingReplacements).toEqual([{ side: 1, slot: 0 }]);
    s = applyReplacements(s, { '1:0': 2 }, fixed());
    expect(s.sides[1].mons.map((m) => m.name)).toEqual(['B3', 'B2']);
  });
});

describe('Pivot and phazing moves', () => {
  it('U-turn hits and then brings in the chosen team member', () => {
    let s = battle([fast('A', ['U-turn']), fast('A2', ['Tackle']), fast('A3', ['Tackle'])], [slow('B', ['Tackle'])]);
    s = runTurn(s, { p1a: { move: 0, pivotTo: 2 }, p2a: { move: 0 } });
    expect(texts(s)).toContain('A went back to Player 1!');
    expect(active(s, 0).name).toBe('A3');
    expect(mon(s, 'p2a').currentHp).toBeLessThan(mon(s, 'p2a').stats.hp);
  });

  it('U-turn without anyone to switch to just hits', () => {
    const s = runTurn(battle([fast('A', ['U-turn'])], [slow('B', ['Tackle'])]), sc(0, 0));
    expect(active(s, 0).name).toBe('A');
    expect(texts(s)).not.toContain('But it failed!');
  });

  it('Baton Pass hands over stat changes and Substitute', () => {
    let s = battle([fast('A', ['Swords Dance', 'Substitute', 'Baton Pass']), fast('A2', ['Tackle'])], [slow('B', ['Swords Dance'])]);
    s = runTurn(s, sc(0, 0));
    s = runTurn(s, sc(1, 0));
    const sub = mon(s, 'p1a').substituteHp;
    s = runTurn(s, { p1a: { move: 2, pivotTo: 1 }, p2a: { move: 0 } });
    const a2 = active(s, 0);
    expect(a2.name).toBe('A2');
    expect(a2.boosts.atk).toBe(2);
    expect(a2.substituteHp).toBe(sub);
    expect(mon(s, 'p1a').boosts.atk).toBe(0);
  });

  it('Roar drags the target out for a random bench member; Dragon Tail does it after hitting', () => {
    let s = battle([fast('A', ['Roar', 'Dragon Tail'])], [slow('B', ['Tackle']), slow('B2', ['Tackle'])]);
    s = runTurn(s, sc(0, 0));
    expect(texts(s)).toContain('B was dragged out!');
    expect(active(s, 1).name).toBe('B2');
    expect(texts(s)).not.toContain('B2 used Tackle!');
    s = runTurn(s, sc(1, 0));
    expect(texts(s)).toContain('B2 was dragged out!');
    expect(active(s, 1).name).toBe('B');
  });

  it('Roar fails when the target has no one to switch to', () => {
    const s = runTurn(battle([fast('A', ['Roar'])], [slow('B', ['Tackle'])]), sc(0, 0));
    expect(texts(s)).toContain('But it failed!');
  });
});

describe('Entry hazards', () => {
  it('Stealth Rock hurts by type effectiveness when a Pokémon switches in', () => {
    let s = battle([fast('A', ['Stealth Rock'])], [slow('B', ['Tackle']), slow('Moth', ['Tackle'], { type1: 'Fire', type2: 'Flying' })]);
    s = runTurn(s, sc(0, 0));
    expect(s.sides[1].hazards.stealthRock).toBe(1);
    s = runTurn(s, { p1a: { move: 0 }, p2a: { move: SWITCH_INDEX, switchTo: 1 } });
    expect(texts(s)).toContain('But it failed!'); // only one layer of Stealth Rock
    const moth = mon(s, 'p2b');
    expect(moth.stats.hp - moth.currentHp).toBe(Math.floor((moth.stats.hp * 4) / 8));
  });

  it('Spikes stack, skip Flying types and Heavy-Duty Boots ignore all hazards', () => {
    let s = battle([fast('A', ['Spikes'])], [slow('B', ['Tackle']), slow('Bird', ['Tackle'], { type1: 'Flying' }), slow('Boots', ['Tackle'], { item: 'Heavy-Duty Boots' })]);
    s = runTurn(s, sc(0, 0));
    s = runTurn(s, sc(0, 0));
    expect(s.sides[1].hazards.spikes).toBe(2);
    s = runTurn(s, { p1a: { move: 0 }, p2a: { move: SWITCH_INDEX, switchTo: 1 } });
    expect(mon(s, 'p2b').currentHp).toBe(mon(s, 'p2b').stats.hp);
    s = runTurn(s, { p1a: { move: 0 }, p2b: { move: SWITCH_INDEX, switchTo: 2 } });
    expect(mon(s, 'p2c').currentHp).toBe(mon(s, 'p2c').stats.hp);
    s = runTurn(s, { p1a: { move: 0 }, p2c: { move: SWITCH_INDEX, switchTo: 0 } });
    const b = mon(s, 'p2a');
    expect(b.stats.hp - b.currentHp).toBe(Math.floor(b.stats.hp / 4)); // 3 layers
  });

  it('Toxic Spikes poison grounded Pokémon; a grounded Poison type absorbs them', () => {
    let s = battle([fast('A', ['Toxic Spikes'])], [slow('B', ['Tackle']), slow('B2', ['Tackle']), slow('Gunk', ['Tackle'], { type1: 'Poison' })]);
    s = runTurn(s, sc(0, 0));
    s = runTurn(s, { p1a: { move: 0 }, p2a: { move: SWITCH_INDEX, switchTo: 1 } });
    expect(mon(s, 'p2b').status).toBe('psn');
    s = runTurn(s, { p1a: { move: 0 }, p2b: { move: SWITCH_INDEX, switchTo: 2 } });
    expect(mon(s, 'p2c').status).toBeNull();
    expect(texts(s)).toContain('Gunk absorbed the poison spikes!');
    expect(s.sides[1].hazards.toxicSpikes).toBe(1); // re-laid this turn by A
  });

  it('Sticky Web lowers Speed; Rapid Spin and Defog clear hazards', () => {
    let s = battle([fast('A', ['Sticky Web', 'Stealth Rock'])], [slow('B', ['Rapid Spin', 'Tackle']), slow('B2', ['Defog'])]);
    s = runTurn(s, sc(0, 1));
    s = runTurn(s, { p1a: { move: 1 }, p2a: { move: SWITCH_INDEX, switchTo: 1 } });
    expect(mon(s, 'p2b').boosts.spe).toBe(-1);
    expect(texts(s)).toContain('B2 was caught in a sticky web!');
    s = runTurn(s, { p1a: { move: 0 }, p2b: { move: 0 } }); // Sticky Web fails (already up), Defog clears
    expect(s.sides[1].hazards).toEqual({ stealthRock: 0, spikes: 0, toxicSpikes: 0, stickyWeb: 0 });
    expect(mon(s, 'p1a').boosts.evasion).toBe(-1);
  });
});

describe('Protect variants', () => {
  it('a Protect move can also raise the user’s stats', () => {
    const shield: Move = { ...findMove('Protect'), name: 'Shield Up', effects: { selfBoosts: { boosts: { def: 1 }, chance: 100 } } };
    const s = runTurn(battle([fast('A', [shield])], [slow('B', ['Tackle'])]), sc(0, 0));
    expect(texts(s)).toContain('A protected itself!');
    expect(mon(s, 'p1a').boosts.def).toBe(1);
    expect(mon(s, 'p1a').currentHp).toBe(mon(s, 'p1a').stats.hp);
  });

  it('Spiky Shield hurts a Pokémon that makes contact; non-contact moves are just blocked', () => {
    let s = runTurn(battle([fast('A', ['Spiky Shield'])], [slow('B', ['Tackle', 'Water Pulse'])]), sc(0, 0));
    const b = mon(s, 'p2a');
    expect(b.stats.hp - b.currentHp).toBe(Math.floor(b.stats.hp / 8));
    s = runTurn(battle([fast('A', ['Spiky Shield'])], [slow('B', ['Tackle', 'Water Pulse'])]), sc(0, 1));
    expect(mon(s, 'p2a').currentHp).toBe(mon(s, 'p2a').stats.hp);
  });

  it("King's Shield lowers a contact attacker's Attack and lets status moves through", () => {
    let s = runTurn(battle([fast('A', ["King's Shield"])], [slow('B', ['Tackle', 'Will-O-Wisp'])]), sc(0, 0));
    expect(mon(s, 'p2a').boosts.atk).toBe(-1);
    s = runTurn(battle([fast('A', ["King's Shield"])], [slow('B', ['Tackle', 'Will-O-Wisp'], { baseStats: spe(20) })]), sc(0, 1));
    expect(mon(s, 'p1a').status).toBe('brn');
  });

  it('Baneful Bunker poisons on contact', () => {
    const s = runTurn(battle([fast('A', ['Baneful Bunker'])], [slow('B', ['Tackle'])]), sc(0, 0));
    expect(mon(s, 'p2a').status).toBe('psn');
  });
});

describe('Ability-changing moves', () => {
  it('Simple Beam gives the target Simple, doubling its later stat changes', () => {
    let s = battle([fast('A', ['Simple Beam'])], [slow('B', ['Swords Dance'], { ability: 'Intimidate' })]);
    s = runTurn(s, sc(0, 0));
    expect(texts(s)).toContain('B acquired Simple!');
    expect(mon(s, 'p2a').boosts.atk).toBe(4);
  });

  it('Worry Seed gives Insomnia and wakes a sleeping target', () => {
    let s = battle([fast('A', ['Spore', 'Worry Seed'])], [slow('B', ['Tackle'])]);
    s = runTurn(s, sc(0, 0));
    expect(mon(s, 'p2a').status).toBe('slp');
    s = runTurn(s, sc(1, 0));
    expect(mon(s, 'p2a').status).toBeNull();
    expect(mon(s, 'p2a').ability).toBe('Insomnia');
  });

  it('Entrainment copies the user’s ability; Skill Swap trades them; Gastro Acid removes it', () => {
    let s = runTurn(battle([fast('A', ['Entrainment'], { ability: 'Huge Power' })], [slow('B', ['Tackle'], { ability: 'Levitate' })]), sc(0, 0));
    expect(mon(s, 'p2a').ability).toBe('Huge Power');
    s = runTurn(battle([fast('A', ['Skill Swap'], { ability: 'Huge Power' })], [slow('B', ['Tackle'], { ability: 'Levitate' })]), sc(0, 0));
    expect(mon(s, 'p1a').ability).toBe('Levitate');
    expect(mon(s, 'p2a').ability).toBe('Huge Power');
    s = runTurn(battle([fast('A', ['Gastro Acid'])], [slow('B', ['Tackle'], { ability: 'Levitate' })]), sc(0, 0));
    expect(texts(s)).toContain("B's Ability was suppressed!");
    expect(getAbility(mon(s, 'p2a'))).toBeNull();
  });

  it('a custom move can hand out a custom ability, which resets on switching out', () => {
    const custom = { ...blankCustomAbility(), name: 'Glass', statMultipliers: { def: 0.5 } };
    const curse: Move = { ...findMove('Simple Beam'), name: 'Curse Beam', effects: { targetAbility: { ability: CUSTOM_ABILITY, customAbility: custom } } };
    let s = battle([fast('A', [curse])], [slow('B', ['Tackle'], { ability: 'Levitate' }), slow('B2', ['Tackle'])]);
    s = runTurn(s, sc(0, 0));
    expect(texts(s)).toContain('B acquired Glass!');
    s = runTurn(s, { p1a: { move: 0 }, p2a: { move: SWITCH_INDEX, switchTo: 1 } });
    expect(mon(s, 'p2a').ability).toBe('Levitate');
  });
});

describe('Type-changing moves', () => {
  it('Trick-or-Treat adds Ghost; Soak replaces every type', () => {
    let s = battle([fast('A', ['Trick-or-Treat', 'Soak'])], [slow('B', ['Tackle'], { type1: 'Fire', type2: 'Flying' })]);
    s = runTurn(s, sc(0, 0));
    expect(typesOf(mon(s, 'p2a'))).toEqual(['Fire', 'Flying', 'Ghost']);
    s = runTurn(s, sc(1, 0));
    expect(typesOf(mon(s, 'p2a'))).toEqual(['Water']);
    s = runTurn(s, sc(1, 0));
    expect(texts(s)).toContain('But it failed!');
  });

  it('a custom move can give the target two new types', () => {
    const recolor: Move = { ...findMove('Soak'), name: 'Recolor', effects: { typeChange: { mode: 'replace', types: ['Dragon', 'Fairy'] } } };
    const s = runTurn(battle([fast('A', [recolor])], [slow('B', ['Tackle'])]), sc(0, 0));
    expect(typesOf(mon(s, 'p2a'))).toEqual(['Dragon', 'Fairy']);
    expect(texts(s)).toContain('B transformed into the Dragon/Fairy type!');
  });
});

describe('Heal Block', () => {
  it('stops healing moves and passive healing until it wears off', () => {
    let s = battle([fast('A', ['Heal Block', 'Tackle'], { level: 100 })], [slow('B', ['Recover', 'Tackle'], { item: 'Leftovers' })]);
    s = runTurn(s, sc(1, 1));
    const hp = mon(s, 'p2a').currentHp;
    s = runTurn(s, sc(0, 1));
    expect(texts(s)).toContain('B was prevented from healing!');
    expect(availableChoices(mon(s, 'p2a'))).toEqual([1]);
    const after = mon(s, 'p2a').currentHp;
    expect(after).toBeLessThanOrEqual(hp);
    for (let i = 0; i < 4; i++) s = runTurn(s, sc(0, 1));
    expect(texts(s)).toContain("B's Heal Block wore off!");
  });
});

describe('Rooms', () => {
  it('Wonder Room swaps Defense and Sp. Def for damage', () => {
    const wall = (name: string) => slow(name, ['Wonder Room', 'Tackle'], { baseStats: { hp: 80, atk: 80, def: 200, spa: 80, spd: 20, spe: 20 } });
    let s = battle([fast('A', ['Tackle'])], [wall('B')]);
    s = runTurn(s, sc(0, 1));
    const normal = mon(s, 'p2a').stats.hp - mon(s, 'p2a').currentHp;
    s = runTurn(battle([slow('A', ['Tackle'], { baseStats: spe(10) })], [wall('B')]), sc(0, 0));
    expect(texts(s).some((t) => t.includes('Defense and Sp. Def stats are swapped'))).toBe(true);
    const swapped = mon(s, 'p2a').stats.hp - mon(s, 'p2a').currentHp;
    expect(swapped).toBeGreaterThan(normal * 3);
  });

  it('Magic Room turns held items off for 5 turns', () => {
    let s = battle([fast('A', ['Magic Room', 'Tackle'])], [slow('B', ['Tackle'], { item: 'Leftovers' })]);
    s = runTurn(s, sc(0, 0));
    expect(texts(s).some((t) => t.includes('Leftovers'))).toBe(false);
    expect(s.magicRoom).toBe(4);
    for (let i = 0; i < 4; i++) s = runTurn(s, sc(1, 0));
    expect(texts(s)).toContain('Magic Room wore off, and held items’ effects returned to normal!');
    expect(mon(s, 'p2a').itemsSuppressed).toBe(false);
  });
});

describe('Custom Simple and Contrary', () => {
  it('custom abilities can double or reverse stat changes', () => {
    const simple = { ...blankCustomAbility(), name: 'Twice', simple: true };
    const contrary = { ...blankCustomAbility(), name: 'Backwards', contrary: true };
    let s = runTurn(battle([fast('A', ['Swords Dance'], { ability: CUSTOM_ABILITY, customAbility: simple })], [slow('B', ['Tackle'])]), sc(0, 0));
    expect(mon(s, 'p1a').boosts.atk).toBe(4);
    s = runTurn(battle([fast('A', ['Close Combat'], { ability: CUSTOM_ABILITY, customAbility: contrary })], [slow('B', ['Tackle'])]), sc(0, 0));
    expect(mon(s, 'p1a').boosts.def).toBe(1);
  });
});

describe('Editing HP and stopping a battle', () => {
  it('sets HP mid-battle; 0 HP faints and asks for a replacement', () => {
    let s = battle([fast('A', ['Tackle'])], [slow('B', ['Tackle']), slow('B2', ['Tackle'])]);
    const max = mon(s, 'p2a').stats.hp;
    s = setMonHp(s, 'p2a', Math.round(max / 2), fixed());
    expect(mon(s, 'p2a').currentHp).toBe(Math.round(max / 2));
    s = setMonHp(s, 'p2a', 0, fixed());
    expect(texts(s)).toContain('B fainted!');
    expect(s.pendingReplacements).toEqual([{ side: 1, slot: 0 }]);
    s = setMonHp(s, 'p2a', max, fixed());
    expect(s.pendingReplacements).toEqual([]);
  });

  it('ending a battle early stops further turns', () => {
    let s = battle([fast('A', ['Tackle'])], [slow('B', ['Tackle'])]);
    s = endBattle(runTurn(s, sc(0, 0)));
    expect(s.winner).toBe('stopped');
    expect(texts(s)).toContain('The battle was stopped after 1 turn.');
    expect(runTurn(s, sc(0, 0))).toBe(s);
  });
});
