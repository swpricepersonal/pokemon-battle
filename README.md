# Battle Simulator

A browser-based 1v1 Pokémon-style battle simulator. Build two Pokémon with custom stats, types, natures, IVs, EVs and four fully customizable moves, then pick a move for each side every turn and watch the engine resolve it with the standard damage formula.

## Running it

```bash
npm install
npm run dev      # start the dev server, then open the printed URL
npm test         # engine unit tests
npm run build    # production build in dist/
```

## Features

- **Builder**: name, level (1–100), one or two of the 18 types, all 25 natures, base stats, IVs (0–31) and EVs (0–252 each, 510 total). Final stats update live.
- **Moves**: pick from a ~70-move library or make your own: type, Physical/Special/Status, power, accuracy (or never-miss), PP, priority, high crit ratio, and effects (status chance, stat-stage changes to the foe or user, drain, recoil, healing).
- **Battle**: choose a move for each side (or "Random move"), then run the turn. Each move button previews the min–max damage as a % of the foe's HP.
- **Battle log**: game-style messages; click any damage line to see the full calculation.
- **Saving**: the current two builds and a library of saved builds persist in your browser's local storage. Import/export the library as JSON.

## Mechanics

**Stats** (Gen 3+):
`HP = floor((2·Base + IV + floor(EV/4)) · Lv / 100) + Lv + 10`,
`Other = floor((floor((2·Base + IV + floor(EV/4)) · Lv / 100) + 5) · Nature)`.

**Turn order**: higher move priority goes first; otherwise the higher effective Speed (after stat stages and the paralysis halving); a coin flip on ties.

**Each move**: sleep/freeze/paralysis checks → PP spent → accuracy check (accuracy × accuracy/evasion stage multiplier) → damage → secondary effects. If the target faints, the battle ends immediately; otherwise the second Pokémon attacks the same way. At the end of the turn burn (1/16), poison (1/8) and bad poison (n/16) deal damage.

**Damage** (Gen 5+):
`base = floor(floor(floor(2·Lv/5 + 2) · Power · A/D) / 50) + 2`, then in order:
critical hit ×1.5 (1/24 chance, 1/8 for high-crit moves; ignores harmful stat stages), random roll 85–100%, STAB ×1.5, type effectiveness (full 18-type chart), burn ×0.5 on physical moves. Minimum 1 damage unless immune.

**Status**: burn, paralysis (25% full paralysis, 0.5× Speed), poison, bad poison, sleep (1–3 turns), freeze (20% thaw chance per turn, thawed by Fire moves). Type immunities apply (Fire can't be burned, Electric can't be paralyzed, Poison/Steel can't be poisoned, Ice can't be frozen). Stat stages run from −6 to +6. When every move is out of PP the Pokémon uses Struggle.

**Not modeled**: abilities, held items, weather/terrain, confusion and other volatile statuses, multi-hit, fixed-damage and switching moves.

## Code layout

- `src/engine/`: pure TypeScript battle engine (no UI): `stats.ts`, `typeChart.ts`, `damage.ts`, `battle.ts` (turn resolution with an injectable RNG). Tests live in `engine.test.ts`.
- `src/data/presets.ts`: the move library and sample creatures.
- `src/components/`: React UI (builder, move editor, battle view).
- `src/storage.ts`: local storage persistence and JSON import validation.
