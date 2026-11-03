import { ABILITIES, ABILITY_NAMES, blankCustomAbility } from '../engine/abilities';
import { ITEMS, ITEM_GROUPS } from '../engine/items';
import { BOOSTABLE_STATS, BOOST_LABELS, CUSTOM_ABILITY, MAJOR_STATUSES, STATUS_LABELS, TERRAINS, TERRAIN_LABELS, TYPES, WEATHERS, WEATHER_LABELS } from '../engine/types';
import type { BoostableStat, Boosts, CustomAbility, MajorStatus, PokemonBuild, Terrain, TypeName, Weather } from '../engine/types';
import { NumField, StageSelect } from './common';
import { canon, useSaved } from './saved';

const ITEM_NAMES = Object.keys(ITEMS);

export function AbilityItemFields({
  build, onChange, idPrefix,
}: { build: PokemonBuild; onChange: (b: PokemonBuild) => void; idPrefix: string }) {
  const saved = useSaved();
  const isCustom = build.ability === CUSTOM_ABILITY;
  const desc = isCustom ? 'Your own ability, built from the effects below.' : build.ability ? ABILITIES[build.ability]?.desc : '';
  const savedIndex = isCustom ? saved.abilities.findIndex((a) => canon(a) === canon(build.customAbility)) : -1;
  const value = savedIndex >= 0 ? `saved:${savedIndex}` : build.ability;

  function setAbility(value: string) {
    if (value.startsWith('saved:')) {
      onChange({ ...build, ability: CUSTOM_ABILITY, customAbility: structuredClone(saved.abilities[Number(value.slice(6))]) });
    } else if (value === CUSTOM_ABILITY) {
      onChange({ ...build, ability: value, customAbility: build.customAbility ?? blankCustomAbility() });
    } else {
      onChange({ ...build, ability: value });
    }
  }

  return (
    <div className="ability-item">
      <div className="ability-item-row">
        <label className="grow" htmlFor={`${idPrefix}-ability`}>Ability
          <select id={`${idPrefix}-ability`} value={value} onChange={(e) => setAbility(e.target.value)}>
            <option value="">None</option>
            <option value={CUSTOM_ABILITY}>{isCustom && savedIndex < 0 ? `Custom: ${build.customAbility?.name ?? ''}` : 'Custom…'}</option>
            {saved.abilities.length > 0 && (
              <optgroup label="My saved abilities">
                {saved.abilities.map((a, i) => <option key={i} value={`saved:${i}`}>{a.name}</option>)}
              </optgroup>
            )}
            <optgroup label="Abilities">
              {ABILITY_NAMES.map((a) => <option key={a} value={a}>{a}</option>)}
            </optgroup>
          </select>
        </label>
        <label className="grow" htmlFor={`${idPrefix}-item`}>Held item
          <select id={`${idPrefix}-item`} value={build.item} onChange={(e) => onChange({ ...build, item: e.target.value })}>
            <option value="">None</option>
            {ITEM_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {ITEM_NAMES.filter((n) => ITEMS[n].group === g).map((n) => <option key={n} value={n}>{n}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {(desc || build.item) && (
        <div className="ability-desc muted">
          {desc && <div><strong>{isCustom ? build.customAbility?.name : build.ability}:</strong> {desc}</div>}
          {build.item && <div><strong>{build.item}:</strong> {ITEMS[build.item]?.desc}</div>}
        </div>
      )}
      {isCustom && build.customAbility && (
        <CustomAbilityEditor
          value={build.customAbility}
          onChange={(customAbility) => onChange({ ...build, customAbility })}
        />
      )}
    </div>
  );
}

const MULT_STATS = ['atk', 'def', 'spa', 'spd', 'spe'] as const;

function TypeSelect({ value, onChange, label }: { value: TypeName | null; onChange: (t: TypeName | null) => void; label: string }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange((e.target.value || null) as TypeName | null)} aria-label={label}>
      <option value="">None</option>
      {TYPES.map((t) => <option key={t}>{t}</option>)}
    </select>
  );
}

/** Decimal input for multipliers like 1.5 (stored as numbers, edited as text). */
function MultField({ value, onChange, label, max = 10 }: { value: number; onChange: (n: number) => void; label: string; max?: number }) {
  return (
    <input
      className="num mult" type="number" step="0.05" min={0} max={max} value={value} aria-label={label}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n)) onChange(Math.max(0, Math.min(max, n)));
      }}
    />
  );
}

function BoostRow({ label, value, onChange }: { label: string; value: Partial<Boosts>; onChange: (b: Partial<Boosts>) => void }) {
  return (
    <div className="effect-row boosts">
      <span className="effect-label">{label}</span>
      {BOOSTABLE_STATS.map((k) => (
        <label key={k} className="boost" title={BOOST_LABELS[k]}>
          {k === 'accuracy' ? 'Acc' : k === 'evasion' ? 'Eva' : k.toUpperCase()}
          <StageSelect
            value={value[k] ?? 0} label={`${label}: ${BOOST_LABELS[k]}`}
            onChange={(n) => {
              const next = { ...value, [k]: n };
              if (!n) delete next[k];
              onChange(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

function CustomAbilityEditor({ value: c, onChange }: { value: CustomAbility; onChange: (c: CustomAbility) => void }) {
  const saved = useSaved();
  const set = <K extends keyof CustomAbility>(k: K, v: CustomAbility[K]) => onChange({ ...c, [k]: v });
  const isSaved = saved.abilities.some((a) => canon(a) === canon(c));
  return (
    <div className="custom-ability">
      <div className="row custom-ability-head">
        <label>Ability name<input value={c.name} onChange={(e) => set('name', e.target.value)} /></label>
        <button className="small" disabled={isSaved} onClick={() => saved.saveAbility(c)} title="Keep this ability in your saved abilities">
          {isSaved ? 'Saved' : 'Save ability'}
        </button>
      </div>

      <div className="effect-row">
        <span className="effect-label">Stat ×</span>
        {MULT_STATS.map((k) => (
          <label key={k} className="boost">{k.toUpperCase()}
            <MultField
              label={`${k} multiplier`} value={c.statMultipliers[k] ?? 1}
              onChange={(n) => set('statMultipliers', { ...c.statMultipliers, [k]: n })}
            />
          </label>
        ))}
      </div>

      <div className="effect-row">
        <span className="effect-label">Power</span>
        <TypeSelect label="Boosted type" value={c.boostType} onChange={(t) => set('boostType', t)} />
        {c.boostType && <span className="inline">moves ×<MultField label="Power multiplier" value={c.boostMultiplier} onChange={(n) => set('boostMultiplier', n)} /></span>}
      </div>

      <div className="effect-row">
        <span className="effect-label">Immune to</span>
        <TypeSelect label="Immune type" value={c.immuneType} onChange={(t) => set('immuneType', t)} />
        {c.immuneType && (
          <>
            <select value={c.onImmune} onChange={(e) => set('onImmune', e.target.value as CustomAbility['onImmune'])} aria-label="When hit">
              <option value="none">and nothing else</option>
              <option value="heal">and heal 25% when hit</option>
              <option value="boost">and raise a stat when hit</option>
            </select>
            {c.onImmune === 'boost' && (
              <select value={c.immuneBoost} onChange={(e) => set('immuneBoost', e.target.value as BoostableStat)} aria-label="Stat raised">
                {BOOSTABLE_STATS.map((k) => <option key={k} value={k}>{BOOST_LABELS[k]} +1</option>)}
              </select>
            )}
          </>
        )}
      </div>

      <div className="effect-row">
        <span className="effect-label">Resists</span>
        <TypeSelect label="Resisted type" value={c.resistType} onChange={(t) => set('resistType', t)} />
        {c.resistType && <span className="inline">damage ×<MultField label="Damage taken multiplier" value={c.resistMultiplier} onChange={(n) => set('resistMultiplier', n)} /></span>}
      </div>

      <div className="effect-row">
        <label className="inline">STAB ×<MultField label="STAB multiplier" value={c.stabMultiplier} onChange={(n) => set('stabMultiplier', n)} /></label>
        <label className="inline">Super-effective damage taken ×<MultField label="Super-effective damage taken" value={c.superEffectiveTaken} onChange={(n) => set('superEffectiveTaken', n)} /></label>
        <label className="check-label"><input type="checkbox" checked={c.critImmune} onChange={(e) => set('critImmune', e.target.checked)} /> No critical hits</label>
      </div>

      <div className="effect-row">
        <span className="effect-label">Stat changes</span>
        <label className="check-label">
          <input type="checkbox" checked={!!c.simple} onChange={(e) => set('simple', e.target.checked)} /> Doubled (Simple)
        </label>
        <label className="check-label">
          <input type="checkbox" checked={!!c.contrary} onChange={(e) => set('contrary', e.target.checked)} /> Reversed (Contrary)
        </label>
      </div>

      <div className="effect-row">
        <span className="effect-label">Can’t get</span>
        {MAJOR_STATUSES.map((st) => (
          <label key={st} className="check-label">
            <input
              type="checkbox" checked={c.statusImmune.includes(st)}
              onChange={(e) => set('statusImmune', e.target.checked ? [...c.statusImmune, st] : c.statusImmune.filter((x: MajorStatus) => x !== st))}
            />
            {STATUS_LABELS[st]}
          </label>
        ))}
      </div>

      <div className="effect-row">
        <span className="effect-label">At start</span>
        <select value={c.onStartWeather ?? ''} onChange={(e) => set('onStartWeather', (e.target.value || null) as Weather | null)} aria-label="Weather it sets">
          <option value="">No weather</option>
          {WEATHERS.map((w) => <option key={w} value={w}>Sets {WEATHER_LABELS[w].toLowerCase()}</option>)}
        </select>
        <select value={c.onStartTerrain ?? ''} onChange={(e) => set('onStartTerrain', (e.target.value || null) as Terrain | null)} aria-label="Terrain it sets">
          <option value="">No terrain</option>
          {TERRAINS.map((t) => <option key={t} value={t}>Sets {TERRAIN_LABELS[t]}</option>)}
        </select>
      </div>

      <div className="effect-row">
        <span className="effect-label">On contact</span>
        <select
          value={c.contactStatus?.status ?? ''}
          onChange={(e) => set('contactStatus', e.target.value ? { status: e.target.value as MajorStatus, chance: c.contactStatus?.chance ?? 30 } : null)}
          aria-label="Status inflicted on contact"
        >
          <option value="">No status</option>
          {MAJOR_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
        </select>
        {c.contactStatus && (
          <label className="inline"><NumField value={c.contactStatus.chance} min={1} max={100} onChange={(n) => set('contactStatus', { ...c.contactStatus!, chance: n })} />% chance</label>
        )}
        <label className="inline">Attacker loses <MultField label="Contact damage percent" max={100} value={c.contactDamage} onChange={(n) => set('contactDamage', n)} />% HP</label>
      </div>

      <BoostRow label="Foes at start" value={c.onStartFoeBoosts} onChange={(b) => set('onStartFoeBoosts', b)} />
      <BoostRow label="Self each turn" value={c.endOfTurnBoosts} onChange={(b) => set('endOfTurnBoosts', b)} />
    </div>
  );
}
