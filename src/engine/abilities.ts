import { CUSTOM_ABILITY } from './types';
import type { BattlePokemon, Boosts, CustomAbility, MajorStatus, Move, Terrain, TypeName, Weather } from './types';

/** Context passed to damage-related ability hooks. */
export interface DamageCtx {
  attacker: BattlePokemon;
  defender: BattlePokemon;
  move: Move;
  /** Type effectiveness of the move against the defender. */
  eff: number;
  crit: boolean;
  /** Active weather (already accounting for Cloud Nine / Air Lock). */
  weather?: Weather | null;
  terrain?: Terrain | null;
}

export interface ImmunityResult {
  /** Fraction of max HP to heal (Water Absorb = 0.25). */
  heal?: number;
  boost?: Partial<Boosts>;
  flashFire?: boolean;
}

export interface AbilityDef {
  desc: string;
  /** Ignored by an attacker with Mold Breaker. */
  breakable?: boolean;

  // Attacking side
  basePower?(c: DamageCtx): number;
  attack?(c: DamageCtx): number;
  attackerFinal?(c: DamageCtx): number;
  stab?: number;
  critStage?: number;
  /** Final damage multiplier on critical hits (Sniper). */
  critFinal?: number;
  guts?: boolean;
  scrappy?: boolean;
  moldBreaker?: boolean;
  /** Ignore the other Pokémon's stat stages (Unaware). */
  unaware?: boolean;
  sheerForce?: boolean;
  sereneGrace?: boolean;
  rockHead?: boolean;
  magicGuard?: boolean;
  noGuard?: boolean;
  accuracy?(move: Move): number;
  priority?(move: Move): number;
  prankster?: boolean;

  // Ally hooks (doubles)
  allyBasePower?(c: DamageCtx): number;
  allyDefenderFinal?(c: DamageCtx): number;

  // Defending side
  defense?(c: DamageCtx): number;
  /** Modifies the attacker's attacking stat (Thick Fat). */
  defenderAttackMod?(c: DamageCtx): number;
  defenderFinal?(c: DamageCtx): number;
  /** Return an immunity result if the move doesn't affect this Pokémon. */
  immune?(c: DamageCtx & { fromAlly: boolean }): ImmunityResult | null;
  /** Redirects single-target moves of this type to this Pokémon (Lightning Rod). */
  redirectType?: TypeName;
  critImmune?: boolean;
  statusImmune?: MajorStatus[];
  sturdy?: boolean;
  innerFocus?: boolean;
  clearBody?: boolean;
  simple?: boolean;
  contrary?: boolean;
  onStatDroppedByFoe?: Partial<Boosts>;

  /** Base power multiplier applied by the target's ability (Dry Skin vs Fire). */
  defenderBasePower?(c: DamageCtx): number;
  /** Multiplier on moves' accuracy against this Pokémon (Sand Veil). */
  accuracyAgainst?(weather: Weather | null): number;
  /** Effects on a Pokémon that makes contact with this one. */
  onContact?: { status?: { status: MajorStatus; chance: number }; damage?: number };
  leafGuard?: boolean;
  ownTempo?: boolean;
  skillLink?: boolean;
  /** Its moves ignore Substitute, Reflect and Light Screen. */
  infiltrator?: boolean;
  /** Not grounded (Levitate): ignores terrain and Ground moves. */
  airborne?: boolean;

  // Field
  speed?(mon: BattlePokemon, weather: Weather | null, terrain: Terrain | null): number;
  onStartFoeBoosts?: Partial<Boosts>;
  endOfTurnBoosts?: Partial<Boosts>;
  onStartWeather?: Weather;
  onStartTerrain?: Terrain;
  /** Suppresses weather effects while on the field (Cloud Nine). */
  negatesWeather?: boolean;
  /** Takes no damage from sandstorm. */
  sandImmune?: boolean;
  /** End-of-turn HP change as a fraction of max HP (negative = damage). */
  endOfTurnHp?(weather: Weather | null): number;
  /** Cures its status at the end of the turn in this weather (Hydration). */
  cureIn?: Weather;
}

const physical = (m: Move) => m.category === 'Physical';
const special = (m: Move) => m.category === 'Special';
const atThird = (mon: BattlePokemon) => mon.currentHp <= Math.floor(mon.stats.hp / 3);

function pinch(type: TypeName): AbilityDef {
  return {
    desc: `${type} moves get ×1.5 Attack/Sp. Atk at 1/3 HP or less.`,
    attack: (c) => (c.move.type === type && atThird(c.attacker) ? 1.5 : 1),
  };
}

function absorb(type: TypeName, result: ImmunityResult, what: string, redirect = false): AbilityDef {
  return {
    desc: `Immune to ${type} moves${what}.${redirect ? ' Draws in single-target ' + type + ' moves.' : ''}`,
    breakable: true,
    immune: (c) => (c.move.type === type ? result : null),
    redirectType: redirect ? type : undefined,
  };
}

function statusImmunity(statuses: MajorStatus[], what: string): AbilityDef {
  return { desc: `Can't be ${what}.`, breakable: true, statusImmune: statuses };
}

/** Moves whose extra effects Sheer Force removes. */
export function hasSecondary(move: Move): boolean {
  if (move.category === 'Status') return false;
  const e = move.effects;
  return !!(e.status || e.targetBoosts || e.flinch || e.confuse);
}

export const ABILITIES: Record<string, AbilityDef> = {
  Adaptability: { desc: 'STAB is ×2 instead of ×1.5.', stab: 2 },
  'Battle Armor': { desc: 'Can’t be hit by critical hits.', breakable: true, critImmune: true },
  Battery: { desc: 'Ally’s special moves get ×1.3 power.', allyBasePower: (c) => (special(c.move) ? 1.3 : 1) },
  Blaze: pinch('Fire'),
  'Clear Body': { desc: 'Other Pokémon can’t lower its stats.', breakable: true, clearBody: true },
  Competitive: { desc: 'Sp. Atk +2 when a foe lowers its stats.', onStatDroppedByFoe: { spa: 2 } },
  'Compound Eyes': { desc: 'Accuracy ×1.3.', accuracy: () => 1.3 },
  Contrary: { desc: 'Stat changes are reversed.', breakable: true, contrary: true },
  Defiant: { desc: 'Attack +2 when a foe lowers its stats.', onStatDroppedByFoe: { atk: 2 } },
  Filter: {
    desc: 'Super-effective damage taken ×0.75.', breakable: true,
    defenderFinal: (c) => (c.eff > 1 ? 0.75 : 1),
  },
  'Flash Fire': {
    desc: 'Immune to Fire moves; once hit, its Fire moves get ×1.5 Attack/Sp. Atk.', breakable: true,
    immune: (c) => (c.move.type === 'Fire' ? { flashFire: true } : null),
    attack: (c) => (c.attacker.flashFire && c.move.type === 'Fire' ? 1.5 : 1),
  },
  'Friend Guard': {
    desc: 'Ally takes ×0.75 damage.', breakable: true,
    allyDefenderFinal: () => 0.75,
  },
  'Fur Coat': { desc: 'Defense ×2 against physical moves.', breakable: true, defense: (c) => (physical(c.move) ? 2 : 1) },
  Guts: {
    desc: 'Attack ×1.5 while statused; burn doesn’t halve its damage.', guts: true,
    attack: (c) => (c.attacker.status && physical(c.move) ? 1.5 : 1),
  },
  'Huge Power': { desc: 'Attack ×2.', attack: (c) => (physical(c.move) ? 2 : 1) },
  Hustle: {
    desc: 'Attack ×1.5, but physical moves have ×0.8 accuracy.',
    attack: (c) => (physical(c.move) ? 1.5 : 1),
    accuracy: (m) => (physical(m) ? 0.8 : 1),
  },
  Immunity: statusImmunity(['psn', 'tox'], 'poisoned'),
  'Inner Focus': { desc: 'Can’t flinch; immune to Intimidate.', breakable: true, innerFocus: true },
  Insomnia: statusImmunity(['slp'], 'put to sleep'),
  Intimidate: { desc: 'Lowers foes’ Attack by 1 when the battle starts.', onStartFoeBoosts: { atk: -1 } },
  Levitate: {
    desc: 'Immune to Ground moves and unaffected by terrain.', breakable: true, airborne: true,
    immune: (c) => (c.move.type === 'Ground' && c.move.category !== 'Status' ? {} : null),
  },
  'Lightning Rod': absorb('Electric', { boost: { spa: 1 } }, '; raises Sp. Atk when hit by one', true),
  Limber: statusImmunity(['par'], 'paralyzed'),
  'Magic Guard': { desc: 'Only takes damage from attacks (no recoil, burn, poison or Life Orb).', magicGuard: true },
  'Magma Armor': statusImmunity(['frz'], 'frozen'),
  'Marvel Scale': {
    desc: 'Defense ×1.5 while statused.', breakable: true,
    defense: (c) => (c.defender.status && physical(c.move) ? 1.5 : 1),
  },
  'Mold Breaker': { desc: 'Its moves ignore the target’s defensive abilities.', moldBreaker: true },
  'Motor Drive': absorb('Electric', { boost: { spe: 1 } }, '; raises Speed when hit by one'),
  Multiscale: {
    desc: 'Damage taken ×0.5 at full HP.', breakable: true,
    defenderFinal: (c) => (c.defender.currentHp === c.defender.stats.hp ? 0.5 : 1),
  },
  'No Guard': { desc: 'Moves used by or against it always hit.', noGuard: true },
  Overgrow: pinch('Grass'),
  'Power Spot': { desc: 'Ally’s moves get ×1.3 power.', allyBasePower: () => 1.3 },
  Prankster: {
    desc: 'Status moves get +1 priority (they fail against Dark-type foes).', prankster: true,
    priority: (m) => (m.category === 'Status' ? 1 : 0),
  },
  'Prism Armor': { desc: 'Super-effective damage taken ×0.75 (not ignored by Mold Breaker).', defenderFinal: (c) => (c.eff > 1 ? 0.75 : 1) },
  'Pure Power': { desc: 'Attack ×2.', attack: (c) => (physical(c.move) ? 2 : 1) },
  'Rock Head': { desc: 'No recoil damage.', rockHead: true },
  'Sap Sipper': absorb('Grass', { boost: { atk: 1 } }, '; raises Attack when hit by one'),
  Scrappy: { desc: 'Normal and Fighting moves can hit Ghost types.', scrappy: true },
  'Serene Grace': { desc: 'Extra effect chances are doubled.', sereneGrace: true },
  'Shadow Shield': {
    desc: 'Damage taken ×0.5 at full HP (not ignored by Mold Breaker).',
    defenderFinal: (c) => (c.defender.currentHp === c.defender.stats.hp ? 0.5 : 1),
  },
  'Sheer Force': {
    desc: 'Moves with extra effects get ×1.3 power but lose the effects (and Life Orb recoil).', sheerForce: true,
    basePower: (c) => (hasSecondary(c.move) ? 1.3 : 1),
  },
  'Shell Armor': { desc: 'Can’t be hit by critical hits.', breakable: true, critImmune: true },
  Simple: { desc: 'Stat changes are doubled.', breakable: true, simple: true },
  Sniper: { desc: 'Critical hits deal ×1.5 more damage.', critFinal: 1.5 },
  'Solid Rock': {
    desc: 'Super-effective damage taken ×0.75.', breakable: true,
    defenderFinal: (c) => (c.eff > 1 ? 0.75 : 1),
  },
  'Speed Boost': { desc: 'Speed +1 at the end of each turn.', endOfTurnBoosts: { spe: 1 } },
  'Storm Drain': absorb('Water', { boost: { spa: 1 } }, '; raises Sp. Atk when hit by one', true),
  Sturdy: { desc: 'Survives any hit from full HP with 1 HP.', breakable: true, sturdy: true },
  'Super Luck': { desc: 'Critical-hit stage +1.', critStage: 1 },
  Swarm: pinch('Bug'),
  Technician: { desc: 'Moves with 60 power or less get ×1.5 power.', basePower: (c) => (c.move.power <= 60 ? 1.5 : 1) },
  Telepathy: {
    desc: 'Immune to its ally’s attacks.', breakable: true,
    immune: (c) => (c.fromAlly && c.move.category !== 'Status' ? {} : null),
  },
  'Thick Fat': {
    desc: 'Fire and Ice moves deal half damage to it.', breakable: true,
    defenderAttackMod: (c) => (c.move.type === 'Fire' || c.move.type === 'Ice' ? 0.5 : 1),
  },
  'Tinted Lens': { desc: 'Not-very-effective moves deal ×2 damage.', attackerFinal: (c) => (c.eff < 1 ? 2 : 1) },
  Torrent: pinch('Water'),
  Unaware: { desc: 'Ignores the other Pokémon’s stat stages when attacking or being attacked.', breakable: true, unaware: true },
  'Vital Spirit': statusImmunity(['slp'], 'put to sleep'),
  'Volt Absorb': absorb('Electric', { heal: 0.25 }, '; heals 25% when hit by one'),
  'Water Absorb': absorb('Water', { heal: 0.25 }, '; heals 25% when hit by one'),
  'Water Veil': statusImmunity(['brn'], 'burned'),
  'Wonder Guard': {
    desc: 'Only super-effective attacks can hit it.', breakable: true,
    immune: (c) => (c.move.category !== 'Status' && c.eff <= 1 ? {} : null),
  },

  // Weather
  Drought: { desc: 'Summons harsh sunlight for 5 turns when the battle starts.', onStartWeather: 'sun' },
  Drizzle: { desc: 'Summons rain for 5 turns when the battle starts.', onStartWeather: 'rain' },
  'Sand Stream': { desc: 'Summons a sandstorm for 5 turns when the battle starts.', onStartWeather: 'sand', sandImmune: true },
  'Snow Warning': { desc: 'Summons snow for 5 turns when the battle starts.', onStartWeather: 'snow' },
  'Cloud Nine': { desc: 'Weather has no effect while it’s on the field.', negatesWeather: true },
  'Air Lock': { desc: 'Weather has no effect while it’s on the field.', negatesWeather: true },
  Chlorophyll: { desc: 'Speed ×2 in harsh sunlight.', speed: (_m, w) => (w === 'sun' ? 2 : 1) },
  'Swift Swim': { desc: 'Speed ×2 in rain.', speed: (_m, w) => (w === 'rain' ? 2 : 1) },
  'Sand Rush': { desc: 'Speed ×2 in a sandstorm; no sandstorm damage.', sandImmune: true, speed: (_m, w) => (w === 'sand' ? 2 : 1) },
  'Slush Rush': { desc: 'Speed ×2 in snow.', speed: (_m, w) => (w === 'snow' ? 2 : 1) },
  'Solar Power': {
    desc: 'Sp. Atk ×1.5 in harsh sunlight, but loses 1/8 max HP each turn in it.',
    attack: (c) => (c.weather === 'sun' && special(c.move) ? 1.5 : 1),
    endOfTurnHp: (w) => (w === 'sun' ? -1 / 8 : 0),
  },
  'Sand Force': {
    desc: 'Rock, Ground and Steel moves ×1.3 power in a sandstorm; no sandstorm damage.', sandImmune: true,
    basePower: (c) => (c.weather === 'sand' && ['Rock', 'Ground', 'Steel'].includes(c.move.type) ? 1.3 : 1),
  },
  'Sand Veil': { desc: 'Moves against it have ×0.8 accuracy in a sandstorm; no sandstorm damage.', breakable: true, sandImmune: true, accuracyAgainst: (w) => (w === 'sand' ? 0.8 : 1) },
  'Snow Cloak': { desc: 'Moves against it have ×0.8 accuracy in snow.', breakable: true, accuracyAgainst: (w) => (w === 'snow' ? 0.8 : 1) },
  'Rain Dish': { desc: 'Heals 1/16 max HP each turn in rain.', endOfTurnHp: (w) => (w === 'rain' ? 1 / 16 : 0) },
  'Ice Body': { desc: 'Heals 1/16 max HP each turn in snow.', endOfTurnHp: (w) => (w === 'snow' ? 1 / 16 : 0) },
  'Dry Skin': {
    desc: 'Immune to Water moves (heals 25%); heals 1/8 in rain, loses 1/8 in sun; Fire moves ×1.25 power against it.', breakable: true,
    immune: (c) => (c.move.type === 'Water' ? { heal: 0.25 } : null),
    defenderBasePower: (c) => (c.move.type === 'Fire' ? 1.25 : 1),
    endOfTurnHp: (w) => (w === 'rain' ? 1 / 8 : w === 'sun' ? -1 / 8 : 0),
  },
  Hydration: { desc: 'Cures its status condition at the end of each turn in rain.', cureIn: 'rain' },
  'Leaf Guard': { desc: 'Can’t get a status condition in harsh sunlight.', breakable: true, leafGuard: true },
  Overcoat: {
    desc: 'No weather damage; immune to powder moves (Spore, Rage Powder).', breakable: true, sandImmune: true,
    immune: (c) => (c.move.flags?.includes('powder') ? {} : null),
  },

  // Terrain
  'Electric Surge': { desc: 'Sets Electric Terrain for 5 turns when the battle starts.', onStartTerrain: 'electric' },
  'Grassy Surge': { desc: 'Sets Grassy Terrain for 5 turns when the battle starts.', onStartTerrain: 'grassy' },
  'Psychic Surge': { desc: 'Sets Psychic Terrain for 5 turns when the battle starts.', onStartTerrain: 'psychic' },
  'Misty Surge': { desc: 'Sets Misty Terrain for 5 turns when the battle starts.', onStartTerrain: 'misty' },
  'Surge Surfer': { desc: 'Speed ×2 on Electric Terrain.', speed: (_m, _w, t) => (t === 'electric' ? 2 : 1) },
  'Grass Pelt': { desc: 'Defense ×1.5 on Grassy Terrain.', breakable: true, defense: (c) => (c.terrain === 'grassy' && physical(c.move) ? 1.5 : 1) },

  // Contact and move flags
  Static: { desc: '30% chance to paralyze a Pokémon that makes contact with it.', onContact: { status: { status: 'par', chance: 30 } } },
  'Flame Body': { desc: '30% chance to burn a Pokémon that makes contact with it.', onContact: { status: { status: 'brn', chance: 30 } } },
  'Poison Point': { desc: '30% chance to poison a Pokémon that makes contact with it.', onContact: { status: { status: 'psn', chance: 30 } } },
  'Rough Skin': { desc: 'A Pokémon that makes contact with it loses 1/8 of its max HP.', onContact: { damage: 1 / 8 } },
  'Iron Barbs': { desc: 'A Pokémon that makes contact with it loses 1/8 of its max HP.', onContact: { damage: 1 / 8 } },
  'Tough Claws': { desc: 'Contact moves ×1.3 power.', basePower: (c) => (c.move.flags?.includes('contact') ? 1.3 : 1) },
  'Iron Fist': { desc: 'Punching moves ×1.2 power.', basePower: (c) => (c.move.flags?.includes('punch') ? 1.2 : 1) },
  'Strong Jaw': { desc: 'Biting moves ×1.5 power.', basePower: (c) => (c.move.flags?.includes('bite') ? 1.5 : 1) },
  'Mega Launcher': { desc: 'Pulse moves ×1.5 power.', basePower: (c) => (c.move.flags?.includes('pulse') ? 1.5 : 1) },
  Fluffy: {
    desc: 'Contact moves deal half damage to it, but Fire moves deal double.', breakable: true,
    defenderFinal: (c) => (c.move.flags?.includes('contact') ? 0.5 : 1) * (c.move.type === 'Fire' ? 2 : 1),
  },
  Soundproof: {
    desc: 'Immune to sound-based moves.', breakable: true,
    immune: (c) => (c.move.flags?.includes('sound') ? {} : null),
  },
  'Skill Link': { desc: 'Multi-hit moves always hit the maximum number of times.', skillLink: true },
  Infiltrator: { desc: 'Its moves ignore the target’s Substitute, Reflect and Light Screen.', infiltrator: true },
  'Own Tempo': { desc: 'Can’t be confused; immune to Intimidate.', breakable: true, ownTempo: true },
};

export const ABILITY_NAMES = Object.keys(ABILITIES).sort();

export function blankCustomAbility(): CustomAbility {
  return {
    name: 'My Ability',
    statMultipliers: {},
    boostType: null, boostMultiplier: 1.5,
    immuneType: null, onImmune: 'none', immuneBoost: 'atk',
    resistType: null, resistMultiplier: 0.5,
    stabMultiplier: 1.5,
    superEffectiveTaken: 1,
    critImmune: false,
    statusImmune: [],
    onStartFoeBoosts: {},
    endOfTurnBoosts: {},
    onStartWeather: null,
    onStartTerrain: null,
    contactStatus: null,
    contactDamage: 0,
  };
}

function hasBoosts(b: Partial<Boosts>) {
  return Object.values(b).some((v) => v);
}

/** Turn a user-defined ability into the same hook shape as the presets. */
export function compileCustomAbility(c: CustomAbility): AbilityDef {
  const sm = c.statMultipliers;
  const def: AbilityDef = { desc: 'Custom ability.' };
  def.attack = (ctx) => (ctx.move.category === 'Physical' ? sm.atk ?? 1 : sm.spa ?? 1);
  if (c.boostType) {
    const type = c.boostType;
    def.basePower = (ctx) => (ctx.move.type === type ? c.boostMultiplier : 1);
  }
  def.defense = (ctx) => (ctx.move.category === 'Physical' ? sm.def ?? 1 : sm.spd ?? 1);
  if (sm.spe && sm.spe !== 1) def.speed = () => sm.spe!;
  if (c.stabMultiplier !== 1.5) def.stab = c.stabMultiplier;
  def.defenderFinal = (ctx) => {
    let m = 1;
    if (c.resistType && ctx.move.type === c.resistType) m *= c.resistMultiplier;
    if (ctx.eff > 1) m *= c.superEffectiveTaken;
    return m;
  };
  if (c.immuneType) {
    const type = c.immuneType;
    const result: ImmunityResult =
      c.onImmune === 'heal' ? { heal: 0.25 } : c.onImmune === 'boost' ? { boost: { [c.immuneBoost]: 1 } } : {};
    def.immune = (ctx) => (ctx.move.type === type ? result : null);
  }
  if (c.critImmune) def.critImmune = true;
  if (c.statusImmune.length) def.statusImmune = c.statusImmune;
  if (hasBoosts(c.onStartFoeBoosts)) def.onStartFoeBoosts = c.onStartFoeBoosts;
  if (hasBoosts(c.endOfTurnBoosts)) def.endOfTurnBoosts = c.endOfTurnBoosts;
  if (c.onStartWeather) def.onStartWeather = c.onStartWeather;
  if (c.onStartTerrain) def.onStartTerrain = c.onStartTerrain;
  if (c.contactStatus || c.contactDamage) {
    def.onContact = {
      ...(c.contactStatus ? { status: c.contactStatus } : {}),
      ...(c.contactDamage ? { damage: c.contactDamage / 100 } : {}),
    };
  }
  return def;
}

export function abilityName(mon: BattlePokemon): string {
  const a = mon.build.ability;
  return a === CUSTOM_ABILITY ? mon.build.customAbility?.name || 'Custom ability' : a;
}

const customCache = new WeakMap<CustomAbility, AbilityDef>();

/** The Pokémon's ability hooks, or null if it has none. */
export function getAbility(mon: BattlePokemon): AbilityDef | null {
  const a = mon.build.ability;
  if (!a) return null;
  if (a === CUSTOM_ABILITY) {
    const c = mon.build.customAbility;
    if (!c) return null;
    let def = customCache.get(c);
    if (!def) customCache.set(c, (def = compileCustomAbility(c)));
    return def;
  }
  return ABILITIES[a] ?? null;
}

/** The defender's ability, unless the attacker's Mold Breaker ignores it. */
export function defenderAbility(defender: BattlePokemon, attacker: BattlePokemon | null): AbilityDef | null {
  const def = getAbility(defender);
  if (!def) return null;
  if (attacker && attacker !== defender && def.breakable && getAbility(attacker)?.moldBreaker) return null;
  return def;
}

/** Grounded Pokémon are affected by terrain (not Flying types or Levitate). */
export function isGrounded(mon: BattlePokemon): boolean {
  if (mon.build.type1 === 'Flying' || mon.build.type2 === 'Flying') return false;
  return !getAbility(mon)?.airborne;
}
