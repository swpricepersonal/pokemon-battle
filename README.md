# Battle Simulator

A browser-based Pokémon-style battle simulator for singles and doubles with teams of up to six. Build Pokémon with custom stats, types, natures, IVs, EVs, abilities, held items and four fully customizable moves, then pick a move (and target) or a switch for each Pokémon every turn and watch the engine resolve it with the standard damage formula.

## Running it

```bash
npm install
npm run dev      # start the dev server, then open the printed URL
npm test         # engine unit tests
npm run build    # production build in dist/
npm run build:artifact  # one standalone HTML page in dist-artifact/
npm run preview  # serve the production build (installable, works offline)
```

## Install it on a phone

The app is published with GitHub Pages at **https://swpricepersonal.github.io/pokemon-battle/** (every push to `main` runs the tests and redeploys).

**iPhone / iPad:** open that link in Safari, tap the **Share** button, then **Add to Home Screen**. It gets its own icon, opens full-screen like an app, and works with no internet connection after the first visit.

**Android:** open the link in Chrome and tap **Install app** (or ⋮ → **Add to Home screen**).

Saved builds, moves and abilities live on each device. To send them to someone, use **Share** (or **Copy JSON**) under *My saved builds, moves and abilities*; they use **Import JSON** to add them. Files exported by older versions (a list of builds) still import.

Updates arrive automatically: the next time the app is opened with a connection it picks up the newest version.

## Features

- **Builder**: name, level (1–100), one or two of the 18 types, all 25 natures, base stats, IVs (0–31) and EVs (0–252 each, 510 total). Final stats update live.
- **Teams and formats**: each player brings 1–6 Pokémon. Singles puts the first one on the field, doubles the first two; the rest wait on the bench. Reorder, add and remove team members in the builder. You can also start the battle with weather or terrain that lasts the whole battle.
- **Abilities**: 101 preset abilities, or a **custom ability** built from generic effects (stat multipliers, a type power boost, a type immunity that can heal or raise a stat, a type resistance, STAB multiplier, super-effective damage reduction, crit immunity, status immunities, Simple- and Contrary-style doubled or reversed stat changes, weather or terrain on entry, contact status or damage, Intimidate-style start effects and Speed Boost-style end-of-turn boosts). **Save ability** keeps a custom ability for reuse.
- **Held items** (60): Choice Band/Specs/Scarf, Life Orb, Expert Belt, Muscle Band, Wise Glasses, the 18 type-boosting items, Assault Vest, Eviolite, Heavy-Duty Boots, Focus Sash, the 18 resist berries, Leftovers, Black Sludge, Sitrus Berry, Oran Berry, Lum Berry, Shell Bell, Rocky Helmet, Heat/Damp/Smooth/Icy Rock, Terrain Extender and Light Clay.
- **Moves**: pick from a 178-move library or make your own: type, Physical/Special/Status, power, accuracy (or never-miss), PP, priority, high crit ratio, flags (contact, punch, bite, pulse, sound, powder), and effects (status chance, stat-stage changes to the target or user, flinch, confusion, drain, recoil, healing, multi-hit, fixed damage, Heal Block, adding or replacing the target's types, changing the target's ability, switching out after the move, forcing the target out, setting or clearing entry hazards, and what a Protect move does to an attacker that makes contact), who the move targets, and an optional special behavior (Protect, Follow Me, Helping Hand, Tailwind, Trick Room, Wonder Room, Magic Room, weather and terrain moves, Weather Ball, Instruct, Beat Up, etc.). A special move can also have regular effects (for example a Protect that raises Defense). **Save move** keeps a custom move for reuse in any slot.
- **Battle**: choose a move or a switch for each Pokémon (and a target in doubles), or use "Random moves", then run the turn. Each move button previews the min–max damage as a % of each foe's HP. When a Pokémon faints and its player has healthy Pokémon left, they choose who to send in. **Set HP** on any Pokémon (on the field or the bench) changes its HP to a percentage of its max mid-battle (0% makes it faint).
- **Stopping and resuming**: **End battle** stops a battle early and keeps the field and log on screen. **Back to builder** keeps the battle so you can **Resume** it; an unfinished battle is also restored if you close and reopen the app.
- **Battle log**: game-style messages; click any damage line to see the full calculation.
- **Saving**: both teams, the format, the battle in progress, and your saved builds, moves and abilities persist in your browser's local storage. Import/export them as JSON.

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

**Disable, Torment, Yawn, Perish Song**: Disable blocks the target's last-used move for 4 of its turns (including the current one if it hasn't moved yet); it goes through a Substitute. Torment stops the target from using the same move twice in a row for the rest of the battle. Yawn makes the target drowsy; it falls asleep at the end of the next turn unless it has gained a status by then (fails against Substitute, sleep immunity or an existing status). Perish Song gives every Pokémon on the field that hears it a perish count of 3; it falls by 1 at the end of each turn and the Pokémon faints at 0 (Soundproof is immune).

**Switching**: a switch happens before any move (faster Pokémon first). Leaving the field clears stat changes, confusion, Taunt, Encore, Disable, Torment, Substitute, Leech Seed, Yawn, Perish Song, Heal Block, Choice locks, changed types and changed abilities; HP, status, PP and items stay (bad poison's counter restarts). A Pokémon that faints is replaced at the end of the turn, and a side loses when its whole team has fainted. U-turn, Volt Switch, Flip Turn, Parting Shot and Teleport switch the user out after the move (you pick who comes in when you choose the move); Baton Pass also passes stat changes, Substitute, confusion, Leech Seed and the perish count. Roar, Whirlwind, Dragon Tail and Circle Throw replace the target with a random healthy bench Pokémon (Dragon Tail doesn't get through a Substitute).

**Entry hazards** hurt Pokémon that switch in: Stealth Rock (1/8 max HP × Rock effectiveness), Spikes (1/8, 1/6, 1/4 for 1–3 layers, grounded only), Toxic Spikes (poison, bad poison with 2 layers; a grounded Poison type absorbs them) and Sticky Web (−1 Speed). Stone Axe and Ceaseless Edge set them while attacking; Rapid Spin clears the user's side (and Leech Seed), Defog clears both sides and the foes' screens. Heavy-Duty Boots and Magic Guard prevent the damage.

**Protect variants**: Spiky Shield (attacker loses 1/8), Baneful Bunker (poison), Burning Bulwark (burn), King's Shield (−1 Attack), Obstruct (−2 Defense) and Silk Trap (−1 Speed) punish contact moves; the last four only block damaging moves.

**Ability and type changes**: Simple Beam, Worry Seed (wakes a sleeping target), Entrainment, Skill Swap and Gastro Acid change abilities; Trick-or-Treat and Forest's Curse add a type, Soak and Magic Powder replace the target's types. A new ability's entry effects (Intimidate, weather) trigger. Changes last until the Pokémon switches out.

**Heal Block** stops HP recovery (healing moves can't be chosen; drain, items, abilities, Leech Seed and Grassy Terrain don't heal) for 5 turns, or 2 from Psychic Noise.

**Rooms**: Trick Room (slower Pokémon move first), Wonder Room (each Pokémon's Defense and Sp. Def stats swap for damage; stat stages don't) and Magic Room (held items have no effect) last 5 turns; using the move again ends it early.

**Not modeled**: trapping (Arena Trap, Shadow Tag, binding moves), and other volatile conditions (Imprison, Embargo, etc.).

## Code layout

- `src/engine/`: pure TypeScript battle engine (no UI): `stats.ts`, `typeChart.ts`, `modifiers.ts` (4096-based rounding), `abilities.ts`, `items.ts`, `damage.ts`, `battle.ts` (turn resolution for singles and doubles, weather, terrain and field effects, with an injectable RNG). Tests live in `engine.test.ts`, `field.test.ts`, `volatiles.test.ts` and `teams.test.ts`.
- `src/data/presets.ts`: the move library and sample creatures.
- `src/components/`: React UI (builder, move editor, battle view).
- `src/storage.ts`: local storage persistence (teams, saved builds, moves and abilities, the battle in progress) and JSON import validation.
