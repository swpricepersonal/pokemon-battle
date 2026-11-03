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
- **Formats**: singles (1v1) or doubles (2v2, all four on the field). Each player has two team slots; singles uses slot A. You can also start the battle with weather or terrain that lasts the whole battle.
- **Abilities**: 101 preset abilities, or a **custom ability** built from generic effects (stat multipliers, a type power boost, a type immunity that can heal or raise a stat, a type resistance, STAB multiplier, super-effective damage reduction, crit immunity, status immunities, weather or terrain on entry, contact status or damage, Intimidate-style start effects and Speed Boost-style end-of-turn boosts).
- **Held items** (59): Choice Band/Specs/Scarf, Life Orb, Expert Belt, Muscle Band, Wise Glasses, the 18 type-boosting items, Assault Vest, Eviolite, Focus Sash, the 18 resist berries, Leftovers, Black Sludge, Sitrus Berry, Oran Berry, Lum Berry, Shell Bell, Rocky Helmet, Heat/Damp/Smooth/Icy Rock, Terrain Extender and Light Clay.
- **Moves**: pick from a 137-move library or make your own: type, Physical/Special/Status, power, accuracy (or never-miss), PP, priority, high crit ratio, flags (contact, punch, bite, pulse, sound, powder), and effects (status chance, stat-stage changes to the target or user, flinch, confusion, drain, recoil, healing, multi-hit, fixed damage), who the move targets, and an optional special behavior (Protect, Follow Me, Helping Hand, Tailwind, Trick Room, weather and terrain moves, Weather Ball, Instruct, Beat Up, etc.).
- **Battle**: choose a move for each Pokémon (and a target in doubles), or use "Random moves", then run the turn. Each move button previews the min–max damage as a % of each foe's HP.
- **Battle log**: game-style messages; click any damage line to see the full calculation.
- **Saving**: both teams, the format, and a library of saved builds persist in your browser's local storage. Import/export the library as JSON.

## Mechanics

**Stats** (Gen 3+):
`HP = floor((2·Base + IV + floor(EV/4)) · Lv / 100) + Lv + 10`,
`Other = floor((floor((2·Base + IV + floor(EV/4)) · Lv / 100) + 5) · Nature)`.

**Turn order**: higher move priority goes first (Prankster adds +1 to status moves); otherwise the higher effective Speed (after stat stages, Choice Scarf, Tailwind and the paralysis halving), reversed under Trick Room; random on ties. As in Gen 8+, Speed is re-checked after every action, so a Tailwind or Trick Room takes effect immediately.

**Each move**: sleep/freeze/confusion/paralysis checks (a confused Pokémon hurts itself 1/3 of the time with a 40-power typeless hit, for 1–4 turns) → PP spent → accuracy check (accuracy × accuracy/evasion stage multiplier) → damage → secondary effects. Each Pokémon acts in turn order; fainted Pokémon don't act, and the battle ends as soon as one side has no Pokémon left. At the end of the turn burn (1/16), poison (1/8) and bad poison (n/16) deal damage.

**Weather** (sun, rain, sand, snow) lasts 5 turns (8 with the matching rock), or the whole battle when chosen in the builder. Sun: Fire ×1.5, Water ×0.5, no freezing. Rain: Water ×1.5, Fire ×0.5; Thunder and Hurricane never miss (50% accuracy in sun). Sand: Rock types get ×1.5 Sp. Def; non-Rock/Ground/Steel Pokémon lose 1/16 HP each turn. Snow: Ice types get ×1.5 Defense; Blizzard never misses. Weather Ball doubles to 100 power and takes the weather's type. Cloud Nine and Air Lock suppress weather. Weather abilities include Drought, Drizzle, Sand Stream, Snow Warning, Chlorophyll, Swift Swim, Sand Rush, Slush Rush, Solar Power, Sand Force, Sand Veil, Snow Cloak, Rain Dish, Ice Body, Dry Skin, Hydration, Leaf Guard and Overcoat.

**Terrain** lasts 5 turns (8 with Terrain Extender) and affects grounded Pokémon (not Flying types or Levitate). Electric: Electric moves ×1.3, no sleep. Grassy: Grass moves ×1.3, heals 1/16 per turn, Earthquake and Bulldoze ×0.5. Psychic: Psychic moves ×1.3, blocks foes' priority moves. Misty: Dragon moves ×0.5, no status conditions or confusion. Set by the terrain moves or the Surge abilities.

**Contact**: Static, Flame Body and Poison Point (30% status), Rough Skin, Iron Barbs (1/8 HP) and Rocky Helmet (1/6 HP) punish contact moves; Tough Claws, Iron Fist, Strong Jaw, Mega Launcher and Fluffy key off move flags.

**Multi-hit**: 2–5 hit moves hit 2/3/4/5 times with 35/35/15/15% odds (always 5 with Skill Link); each hit rolls its own damage and crit. Beat Up hits once per healthy team member. Fixed-damage moves (Seismic Toss, Night Shade, Super Fang) skip the formula but respect type immunities.

**Damage** (Gen 5+):
`base = floor(floor(floor(2·Lv/5 + 2) · Power · A/D) / 50) + 2`, where Power, A and D include ability and item modifiers (Technician, Helping Hand, type-boosting items; Huge Power, Choice Band, Thick Fat; Assault Vest, Eviolite, Fur Coat). Then in order: spread move ×0.75 (doubles, more than one target), critical hit ×1.5 (1/24 chance, 1/8 for high-crit moves; ignores harmful stat stages), random roll 85–100%, STAB ×1.5 (×2 with Adaptability), type effectiveness (full 18-type chart), burn ×0.5 on physical moves (not with Guts), then final modifiers: Reflect/Light Screen (×0.5 singles, ×0.67 doubles, ignored by crits), Multiscale, Filter, Friend Guard, Sniper, Tinted Lens, Expert Belt, Life Orb and resist berries. All multipliers use the games' 4096-based fixed-point rounding. Minimum 1 damage unless immune.

**Doubles**: you choose a target for single-target moves (either foe or your ally). Spread moves hit both foes (Earthquake, Surf and Discharge also hit your ally). If a target faints first, the move goes to the other foe. A side loses when both of its Pokémon have fainted. Partner and field moves: Protect/Detect (fails more often when repeated and when used last), Wide Guard, Quick Guard, Follow Me, Rage Powder, Spotlight, Helping Hand, Fake Out (first turn only), Ally Switch, After You, Quash, Coaching, Howl, Decorate, Aromatic Mist, Heal Pulse, Pollen Puff, Life Dew, Tailwind, Trick Room, Reflect and Light Screen. Ally-related abilities: Intimidate (both foes), Friend Guard, Telepathy, Battery, Power Spot, Lightning Rod and Storm Drain (redirect).

**Status**: burn, paralysis (25% full paralysis, 0.5× Speed), poison, bad poison, sleep (1–3 turns), freeze (20% thaw chance per turn, thawed by Fire moves). Type immunities apply (Fire can't be burned, Electric can't be paralyzed, Poison/Steel can't be poisoned, Ice can't be frozen). Stat stages run from −6 to +6. When every move is out of PP the Pokémon uses Struggle.

**Taunt, Encore, Substitute, Leech Seed**: Taunt blocks status moves for 3 turns (4 if the target already moved that turn), including a status move already chosen that turn. Encore locks the target into its last move for 3 turns (4 if it already moved), replacing whatever it chose that turn; it fails if the target hasn't moved yet or is already encored. Substitute costs 1/4 max HP and takes damage in its place, blocking status moves (Taunt and Encore still work) and extra effects; sound moves and Infiltrator go around it. Leech Seed drains 1/8 max HP each turn to whoever is in the user's position (not Grass types, not through a Substitute; Magic Guard blocks it).

**Not modeled**: bench Pokémon and switching (including switching moves), and other volatile conditions (Disable, Torment, Yawn, Perish Song, etc.).

## Code layout

- `src/engine/`: pure TypeScript battle engine (no UI): `stats.ts`, `typeChart.ts`, `modifiers.ts` (4096-based rounding), `abilities.ts`, `items.ts`, `damage.ts`, `battle.ts` (turn resolution for singles and doubles, weather, terrain and field effects, with an injectable RNG). Tests live in `engine.test.ts`, `field.test.ts` and `volatiles.test.ts`.
- `src/data/presets.ts`: the move library and sample creatures.
- `src/components/`: React UI (builder, move editor, battle view).
- `src/storage.ts`: local storage persistence and JSON import validation.
