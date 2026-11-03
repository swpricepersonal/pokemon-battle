# Battle Simulator

A browser-based Pokémon-style battle simulator for singles (1v1) and doubles (2v2). Build Pokémon with custom stats, types, natures, IVs, EVs, abilities, held items and four fully customizable moves, then pick a move (and target) for each Pokémon every turn and watch the engine resolve it with the standard damage formula.

## Running it

```bash
npm install
npm run dev      # start the dev server, then open the printed URL
npm test         # engine unit tests
npm run build    # production build in dist/
npm run build:artifact  # one standalone HTML page in dist-artifact/
```

## Features

- **Builder**: name, level (1–100), one or two of the 18 types, all 25 natures, base stats, IVs (0–31) and EVs (0–252 each, 510 total). Final stats update live.
- **Formats**: singles (1v1) or doubles (2v2, all four on the field). Each player has two team slots; singles uses slot A.
- **Abilities**: 61 preset abilities, or a **custom ability** built from generic effects (stat multipliers, a type power boost, a type immunity that can heal or raise a stat, a type resistance, STAB multiplier, super-effective damage reduction, crit immunity, status immunities, Intimidate-style start effects and Speed Boost-style end-of-turn boosts).
- **Held items**: the items that change damage or turn order: Choice Band/Specs/Scarf, Life Orb, Expert Belt, Muscle Band, Wise Glasses, the 18 type-boosting items, Assault Vest, Eviolite, Focus Sash, the 18 resist berries and Light Clay.
- **Moves**: pick from a ~100-move library or make your own: type, Physical/Special/Status, power, accuracy (or never-miss), PP, priority, high crit ratio, and effects (status chance, stat-stage changes to the target or user, flinch, drain, recoil, healing), who the move targets, and an optional special behavior (Protect, Follow Me, Helping Hand, Tailwind, Trick Room, etc.).
- **Battle**: choose a move for each Pokémon (and a target in doubles), or use "Random moves", then run the turn. Each move button previews the min–max damage as a % of each foe's HP.
- **Battle log**: game-style messages; click any damage line to see the full calculation.
- **Saving**: both teams, the format, and a library of saved builds persist in your browser's local storage. Import/export the library as JSON.

## Mechanics

**Stats** (Gen 3+):
`HP = floor((2·Base + IV + floor(EV/4)) · Lv / 100) + Lv + 10`,
`Other = floor((floor((2·Base + IV + floor(EV/4)) · Lv / 100) + 5) · Nature)`.

**Turn order**: higher move priority goes first (Prankster adds +1 to status moves); otherwise the higher effective Speed (after stat stages, Choice Scarf, Tailwind and the paralysis halving), reversed under Trick Room; random on ties. As in Gen 8+, Speed is re-checked after every action, so a Tailwind or Trick Room takes effect immediately.

**Each move**: sleep/freeze/paralysis checks → PP spent → accuracy check (accuracy × accuracy/evasion stage multiplier) → damage → secondary effects. Each Pokémon acts in turn order; fainted Pokémon don't act, and the battle ends as soon as one side has no Pokémon left. At the end of the turn burn (1/16), poison (1/8) and bad poison (n/16) deal damage.

**Damage** (Gen 5+):
`base = floor(floor(floor(2·Lv/5 + 2) · Power · A/D) / 50) + 2`, where Power, A and D include ability and item modifiers (Technician, Helping Hand, type-boosting items; Huge Power, Choice Band, Thick Fat; Assault Vest, Eviolite, Fur Coat). Then in order: spread move ×0.75 (doubles, more than one target), critical hit ×1.5 (1/24 chance, 1/8 for high-crit moves; ignores harmful stat stages), random roll 85–100%, STAB ×1.5 (×2 with Adaptability), type effectiveness (full 18-type chart), burn ×0.5 on physical moves (not with Guts), then final modifiers: Reflect/Light Screen (×0.5 singles, ×0.67 doubles, ignored by crits), Multiscale, Filter, Friend Guard, Sniper, Tinted Lens, Expert Belt, Life Orb and resist berries. All multipliers use the games' 4096-based fixed-point rounding. Minimum 1 damage unless immune.

**Doubles**: you choose a target for single-target moves (either foe or your ally). Spread moves hit both foes (Earthquake, Surf and Discharge also hit your ally). If a target faints first, the move goes to the other foe. A side loses when both of its Pokémon have fainted. Partner and field moves: Protect/Detect (fails more often when repeated and when used last), Wide Guard, Quick Guard, Follow Me, Rage Powder, Spotlight, Helping Hand, Fake Out (first turn only), Ally Switch, After You, Quash, Coaching, Howl, Decorate, Aromatic Mist, Heal Pulse, Pollen Puff, Life Dew, Tailwind, Trick Room, Reflect and Light Screen. Ally-related abilities: Intimidate (both foes), Friend Guard, Telepathy, Battery, Power Spot, Lightning Rod and Storm Drain (redirect).

**Status**: burn, paralysis (25% full paralysis, 0.5× Speed), poison, bad poison, sleep (1–3 turns), freeze (20% thaw chance per turn, thawed by Fire moves). Type immunities apply (Fire can't be burned, Electric can't be paralyzed, Poison/Steel can't be poisoned, Ice can't be frozen). Stat stages run from −6 to +6. When every move is out of PP the Pokémon uses Struggle.

**Not modeled**: weather and terrain (and abilities that depend on them), contact effects (Rough Skin, Static, Rocky Helmet), healing items and berries other than resist berries, confusion and other volatile statuses, multi-hit, fixed-damage and switching moves, and bench Pokémon.

## Code layout

- `src/engine/`: pure TypeScript battle engine (no UI): `stats.ts`, `typeChart.ts`, `modifiers.ts` (4096-based rounding), `abilities.ts`, `items.ts`, `damage.ts`, `battle.ts` (turn resolution for singles and doubles with an injectable RNG). Tests live in `engine.test.ts`.
- `src/data/presets.ts`: the move library and sample creatures.
- `src/components/`: React UI (builder, move editor, battle view).
- `src/storage.ts`: local storage persistence and JSON import validation.
