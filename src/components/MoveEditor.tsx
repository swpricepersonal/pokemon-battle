import { ABILITY_NAMES } from '../engine/abilities';
import { MOVE_LIBRARY } from '../data/presets';
import {
  BOOSTABLE_STATS, BOOST_LABELS, COPY_USER_ABILITY, CUSTOM_ABILITY, HAZARDS, HAZARD_LABELS, MAJOR_STATUSES, MOVE_FLAGS, MOVE_SPECIALS,
  MOVE_SPECIAL_LABELS, MOVE_TARGETS, MOVE_TARGET_LABELS, STATUS_LABELS, SWAP_ABILITIES, TYPES,
} from '../engine/types';
import type { Boosts, Hazard, MajorStatus, Move, MoveCategory, MoveEffects, MoveFlag, MoveSpecial, MoveTarget, TypeName } from '../engine/types';
import { NumField, StageSelect, TypeBadge } from './common';
import { canon, useSaved } from './saved';

const CATEGORIES: MoveCategory[] = ['Physical', 'Special', 'Status'];
const LIBRARY_KEYS = MOVE_LIBRARY.map(canon);

export function MoveEditor({
  slot, move, onChange,
}: { slot: number; move: Move | null; onChange: (m: Move | null) => void }) {
  const saved = useSaved();
  const key = move ? canon(move) : '';
  const libraryIndex = move ? LIBRARY_KEYS.indexOf(key) : -1;
  const savedIndex = move && libraryIndex < 0 ? saved.moves.findIndex((m) => canon(m) === key) : -1;
  const presetValue = !move ? 'empty' : libraryIndex >= 0 ? String(libraryIndex) : savedIndex >= 0 ? `saved:${savedIndex}` : 'custom';

  function pick(value: string) {
    if (value === 'empty') onChange(null);
    else if (value === 'custom') onChange(move ?? { ...structuredClone(MOVE_LIBRARY[0]), name: 'Custom Move' });
    else if (value.startsWith('saved:')) onChange(structuredClone(saved.moves[Number(value.slice(6))]));
    else onChange(structuredClone(MOVE_LIBRARY[Number(value)]));
  }

  const set = <K extends keyof Move>(key: K, value: Move[K]) => move && onChange({ ...move, [key]: value });
  const setEffects = (effects: MoveEffects) => move && onChange({ ...move, effects });

  return (
    <div className="move-editor">
      <div className="move-head">
        <span className="slot">Move {slot + 1}</span>
        <select value={presetValue} onChange={(e) => pick(e.target.value)} aria-label={`Move ${slot + 1} preset`}>
          <option value="empty">(empty)</option>
          <option value="custom">{presetValue === 'custom' ? `Custom: ${move?.name}` : 'Custom…'}</option>
          {saved.moves.length > 0 && (
            <optgroup label="My saved moves">
              {saved.moves.map((m, i) => <option key={i} value={`saved:${i}`}>{m.name}</option>)}
            </optgroup>
          )}
          {TYPES.map((t) => {
            const moves = MOVE_LIBRARY.map((m, i) => [m, i] as const).filter(([m]) => m.type === t);
            if (!moves.length) return null;
            return (
              <optgroup key={t} label={t}>
                {moves.map(([m, i]) => <option key={i} value={i}>{m.name}</option>)}
              </optgroup>
            );
          })}
        </select>
        {move && <TypeBadge type={move.type} small />}
        {move && presetValue === 'custom' && (
          <button className="small" onClick={() => saved.saveMove(move)} title="Keep this move in your saved moves">Save move</button>
        )}
      </div>

      {move && (
        <>
          <div className="move-grid">
            <label>Name<input value={move.name} onChange={(e) => set('name', e.target.value)} /></label>
            <label>Type
              <select value={move.type} onChange={(e) => set('type', e.target.value as TypeName)}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label>Category
              <select value={move.category} onChange={(e) => set('category', e.target.value as MoveCategory)}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>Power
              <NumField value={move.power} min={0} max={250} onChange={(n) => set('power', n)} disabled={move.category === 'Status'} />
            </label>
            <label>Accuracy
              <span className="inline">
                <NumField value={move.accuracy ?? 100} min={1} max={100} onChange={(n) => set('accuracy', n)} disabled={move.accuracy === null} />
                <label className="check" title="Never misses">
                  <input type="checkbox" checked={move.accuracy === null} onChange={(e) => set('accuracy', e.target.checked ? null : 100)} />∞
                </label>
              </span>
            </label>
            <label>PP<NumField value={move.pp} min={1} max={64} onChange={(n) => set('pp', n)} /></label>
            <label>Priority<StageSelect value={move.priority} min={-7} max={5} onChange={(n) => set('priority', n)} /></label>
            <label className="check-label">
              <input type="checkbox" checked={move.highCrit} onChange={(e) => set('highCrit', e.target.checked)} />
              High crit
            </label>
            <label className="wide">Targets
              <select value={move.target} onChange={(e) => set('target', e.target.value as MoveTarget)}>
                {MOVE_TARGETS.map((t) => <option key={t} value={t}>{MOVE_TARGET_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="wide">Special behavior
              <select
                value={move.special ?? ''}
                onChange={(e) => {
                  const { special: _drop, ...rest } = move;
                  onChange(e.target.value ? { ...rest, special: e.target.value as MoveSpecial } : rest);
                }}
              >
                <option value="">None</option>
                {MOVE_SPECIALS.map((sp) => <option key={sp} value={sp}>{MOVE_SPECIAL_LABELS[sp]}</option>)}
              </select>
            </label>
          </div>
          <div className="flag-row">
            <span className="effect-label">Flags</span>
            {MOVE_FLAGS.map((f) => (
              <label key={f} className="check-label">
                <input
                  type="checkbox"
                  checked={!!move.flags?.includes(f)}
                  onChange={(e) => {
                    const next: MoveFlag[] = e.target.checked ? [...(move.flags ?? []), f] : (move.flags ?? []).filter((x) => x !== f);
                    const { flags: _drop, ...rest } = move;
                    onChange(next.length ? { ...rest, flags: next } : rest);
                  }}
                />
                {f === 'contact' ? 'Contact' : f[0].toUpperCase() + f.slice(1)}
              </label>
            ))}
          </div>
          <EffectsEditor effects={move.effects} isStatus={move.category === 'Status'} isProtect={move.special === 'protect'} onChange={setEffects} />
        </>
      )}
    </div>
  );
}

const fmtBoosts = (b: Partial<Boosts>) => Object.entries(b).filter(([, v]) => v).map(([k, v]) => `${v! > 0 ? '+' : ''}${v} ${k}`).join(' ');

function abilityLabel(a: NonNullable<MoveEffects['targetAbility']>): string {
  if (a.ability === '') return 'removes ability';
  if (a.ability === COPY_USER_ABILITY) return 'gives user’s ability';
  if (a.ability === SWAP_ABILITIES) return 'swaps abilities';
  return `ability → ${a.ability === CUSTOM_ABILITY ? a.customAbility?.name ?? 'custom' : a.ability}`;
}

function summarize(e: MoveEffects): string {
  const parts: string[] = [];
  if (e.status) parts.push(`${e.status.chance}% ${STATUS_LABELS[e.status.status]}`);
  if (e.targetBoosts) parts.push(`target ${fmtBoosts(e.targetBoosts.boosts)} (${e.targetBoosts.chance}%)`);
  if (e.selfBoosts) parts.push(`self ${fmtBoosts(e.selfBoosts.boosts)} (${e.selfBoosts.chance}%)`);
  if (e.drain) parts.push(`drain ${e.drain}%`);
  if (e.recoil) parts.push(`recoil ${e.recoil}%`);
  if (e.heal) parts.push(`heal ${e.heal}%`);
  if (e.flinch) parts.push(`${e.flinch}% flinch`);
  if (e.confuse) parts.push(`${e.confuse}% confuse`);
  if (e.multiHit) parts.push(e.multiHit[0] === e.multiHit[1] ? `${e.multiHit[0]} hits` : `${e.multiHit[0]}–${e.multiHit[1]} hits`);
  if (e.fixedDamage !== undefined) parts.push(e.fixedDamage === 'level' ? 'damage = level' : e.fixedDamage === 'halfHp' ? 'halves HP' : `${e.fixedDamage} fixed damage`);
  if (e.healBlock) parts.push(`Heal Block ${e.healBlock} turns`);
  if (e.typeChange) parts.push(`${e.typeChange.mode === 'add' ? 'adds' : 'becomes'} ${e.typeChange.types.join('/')}`);
  if (e.targetAbility) parts.push(abilityLabel(e.targetAbility));
  if (e.protectContact) {
    const c = e.protectContact;
    parts.push(`on contact: ${[c.damage ? `${c.damage}% HP` : '', c.status ? STATUS_LABELS[c.status] : '', c.boosts ? fmtBoosts(c.boosts) : ''].filter(Boolean).join(', ')}`);
  }
  if (e.protectAttacksOnly) parts.push('blocks attacks only');
  if (e.hazard) parts.push(`sets ${HAZARD_LABELS[e.hazard]}`);
  if (e.clearHazards) parts.push(e.clearHazards === 'own' ? 'clears own hazards' : 'clears all hazards');
  if (e.selfSwitch) parts.push(e.selfSwitch === 'batonPass' ? 'Baton Pass' : 'user switches out');
  if (e.forceSwitch) parts.push('forces a switch');
  return parts.join(', ') || 'none';
}

function EffectsEditor({
  effects, isStatus, isProtect, onChange,
}: { effects: MoveEffects; isStatus: boolean; isProtect: boolean; onChange: (e: MoveEffects) => void }) {
  const update = (patch: Partial<MoveEffects>) => {
    const next = { ...effects, ...patch };
    for (const k of Object.keys(next) as (keyof MoveEffects)[]) if (next[k] === undefined) delete next[k];
    onChange(next);
  };

  return (
    <details className="effects">
      <summary>Effects: <span className="muted">{summarize(effects)}</span></summary>
      <div className="effects-body">
        <div className="effect-row">
          <span className="effect-label">Status</span>
          <select
            value={effects.status?.status ?? ''}
            onChange={(e) => update({
              status: e.target.value ? { status: e.target.value as MajorStatus, chance: effects.status?.chance ?? (isStatus ? 100 : 10) } : undefined,
            })}
          >
            <option value="">None</option>
            {MAJOR_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          {effects.status && (
            <label className="inline">Chance
              <NumField value={effects.status.chance} min={1} max={100} onChange={(n) => update({ status: { ...effects.status!, chance: n } })} />%
            </label>
          )}
        </div>
        <BoostsEditor
          label="Target stats"
          value={effects.targetBoosts}
          defaultChance={isStatus ? 100 : 10}
          onChange={(targetBoosts) => update({ targetBoosts })}
        />
        <BoostsEditor
          label="User stats"
          value={effects.selfBoosts}
          defaultChance={100}
          onChange={(selfBoosts) => update({ selfBoosts })}
        />
        <div className="effect-row">
          {!isStatus && (
            <>
              <label className="inline">Drain <NumField value={effects.drain ?? 0} min={0} max={100} onChange={(n) => update({ drain: n || undefined })} />%</label>
              <label className="inline">Recoil <NumField value={effects.recoil ?? 0} min={0} max={100} onChange={(n) => update({ recoil: n || undefined })} />%</label>
              <label className="inline">Flinch <NumField value={effects.flinch ?? 0} min={0} max={100} onChange={(n) => update({ flinch: n || undefined })} />%</label>
            </>
          )}
          {isStatus && (
            <label className="inline">Heal target <NumField value={effects.heal ?? 0} min={0} max={100} onChange={(n) => update({ heal: n || undefined })} />% max HP</label>
          )}
          <label className="inline">Confuse <NumField value={effects.confuse ?? 0} min={0} max={100} onChange={(n) => update({ confuse: n || undefined })} />%</label>
          <label className="inline" title="The target can't restore HP for this many turns">Heal Block <NumField value={effects.healBlock ?? 0} min={0} max={10} onChange={(n) => update({ healBlock: n || undefined })} /> turns</label>
        </div>
        {!isStatus && (
          <div className="effect-row">
            <label className="inline">Hits
              <NumField value={effects.multiHit?.[0] ?? 1} min={1} max={10} onChange={(n) => {
                const max = Math.max(n, effects.multiHit?.[1] ?? n);
                update({ multiHit: n === 1 && max === 1 ? undefined : [n, max] });
              }} />
              to
              <NumField value={effects.multiHit?.[1] ?? 1} min={1} max={10} onChange={(n) => {
                const min = Math.min(n, effects.multiHit?.[0] ?? 1);
                update({ multiHit: n === 1 && min === 1 ? undefined : [min, n] });
              }} />
            </label>
            <label className="inline">Fixed damage
              <select
                value={effects.fixedDamage === undefined ? '' : typeof effects.fixedDamage === 'number' ? 'number' : effects.fixedDamage}
                onChange={(e) => {
                  const v = e.target.value;
                  update({ fixedDamage: v === '' ? undefined : v === 'number' ? 40 : (v as 'level' | 'halfHp') });
                }}
              >
                <option value="">No (use the formula)</option>
                <option value="level">Equal to user’s level</option>
                <option value="halfHp">Half the target’s HP</option>
                <option value="number">A set amount</option>
              </select>
              {typeof effects.fixedDamage === 'number' && (
                <><NumField value={effects.fixedDamage} min={1} max={999} onChange={(n) => update({ fixedDamage: n })} /> HP</>
              )}
            </label>
          </div>
        )}
        <TypeChangeEditor value={effects.typeChange} onChange={(typeChange) => update({ typeChange })} />
        <AbilityChangeEditor value={effects.targetAbility} onChange={(targetAbility) => update({ targetAbility })} />
        <div className="effect-row">
          <span className="effect-label">Switching</span>
          <select
            value={effects.selfSwitch ?? ''} aria-label="User switches out"
            onChange={(e) => update({ selfSwitch: (e.target.value || undefined) as MoveEffects['selfSwitch'] })}
          >
            <option value="">User stays in</option>
            <option value="switch">User switches out after (U-turn)</option>
            <option value="batonPass">User switches out, passing stat changes (Baton Pass)</option>
          </select>
          <label className="check-label">
            <input type="checkbox" checked={!!effects.forceSwitch} onChange={(e) => update({ forceSwitch: e.target.checked || undefined })} />
            Forces the target out (Roar)
          </label>
        </div>
        <div className="effect-row">
          <span className="effect-label">Hazards</span>
          <select value={effects.hazard ?? ''} aria-label="Hazard it sets" onChange={(e) => update({ hazard: (e.target.value || undefined) as Hazard | undefined })}>
            <option value="">Sets no hazard</option>
            {HAZARDS.map((h) => <option key={h} value={h}>Sets {HAZARD_LABELS[h]} on the foes’ side</option>)}
          </select>
          <select
            value={effects.clearHazards ?? ''} aria-label="Hazards it removes"
            onChange={(e) => update({ clearHazards: (e.target.value || undefined) as MoveEffects['clearHazards'] })}
          >
            <option value="">Removes no hazards</option>
            <option value="own">Removes hazards from the user’s side (Rapid Spin)</option>
            <option value="both">Removes hazards from both sides (Defog)</option>
          </select>
        </div>
        {isProtect && <ProtectEditor effects={effects} update={update} />}
      </div>
    </details>
  );
}

function TypeChangeEditor({ value, onChange }: { value: MoveEffects['typeChange']; onChange: (v: MoveEffects['typeChange']) => void }) {
  const types = value?.types ?? ['Ghost'];
  return (
    <div className="effect-row">
      <span className="effect-label">Target type</span>
      <select
        value={value?.mode ?? ''} aria-label="Type change"
        onChange={(e) => onChange(e.target.value ? { mode: e.target.value as 'add' | 'replace', types: types.slice(0, e.target.value === 'add' ? 1 : 2) } : undefined)}
      >
        <option value="">No change</option>
        <option value="add">Adds a type (Trick-or-Treat)</option>
        <option value="replace">Becomes a new type (Soak)</option>
      </select>
      {value && (
        <>
          <select value={types[0]} aria-label="New type" onChange={(e) => onChange({ ...value, types: [e.target.value as TypeName, ...types.slice(1)] })}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          {value.mode === 'replace' && (
            <select
              value={types[1] ?? ''} aria-label="Second new type"
              onChange={(e) => onChange({ ...value, types: e.target.value ? [types[0], e.target.value as TypeName] : [types[0]] })}
            >
              <option value="">(one type)</option>
              {TYPES.filter((t) => t !== types[0]).map((t) => <option key={t}>{t}</option>)}
            </select>
          )}
        </>
      )}
    </div>
  );
}

function AbilityChangeEditor({ value, onChange }: { value: MoveEffects['targetAbility']; onChange: (v: MoveEffects['targetAbility']) => void }) {
  const saved = useSaved();
  let current = '';
  if (value) {
    if (value.ability === CUSTOM_ABILITY) {
      const i = saved.abilities.findIndex((a) => canon(a) === canon(value.customAbility));
      current = i >= 0 ? `saved:${i}` : 'custom';
    } else current = value.ability === '' ? '@none' : value.ability;
  }
  function pick(v: string) {
    if (!v) onChange(undefined);
    else if (v === '@none') onChange({ ability: '' });
    else if (v === 'custom') return;
    else if (v.startsWith('saved:')) onChange({ ability: CUSTOM_ABILITY, customAbility: structuredClone(saved.abilities[Number(v.slice(6))]) });
    else onChange({ ability: v });
  }
  return (
    <div className="effect-row">
      <span className="effect-label">Target ability</span>
      <select value={current} aria-label="Ability change" onChange={(e) => pick(e.target.value)}>
        <option value="">No change</option>
        <option value="@none">Removes its ability (Gastro Acid)</option>
        <option value={COPY_USER_ABILITY}>Gets the user’s ability (Entrainment)</option>
        <option value={SWAP_ABILITIES}>Swaps abilities with the user (Skill Swap)</option>
        {current === 'custom' && <option value="custom">Custom: {value?.customAbility?.name}</option>}
        {saved.abilities.length > 0 && (
          <optgroup label="Becomes one of my saved abilities">
            {saved.abilities.map((a, i) => <option key={i} value={`saved:${i}`}>{a.name}</option>)}
          </optgroup>
        )}
        <optgroup label="Becomes">
          {ABILITY_NAMES.map((a) => <option key={a} value={a}>{a}</option>)}
        </optgroup>
      </select>
      {saved.abilities.length === 0 && <span className="muted hint">Save a custom ability to hand it out with a move.</span>}
    </div>
  );
}

function ProtectEditor({ effects, update }: { effects: MoveEffects; update: (p: Partial<MoveEffects>) => void }) {
  const c = effects.protectContact ?? {};
  const setC = (patch: Partial<NonNullable<MoveEffects['protectContact']>>) => {
    const next = { ...c, ...patch };
    for (const k of Object.keys(next) as (keyof typeof next)[]) if (!next[k]) delete next[k];
    update({ protectContact: Object.keys(next).length ? next : undefined });
  };
  const boosts = c.boosts ?? {};
  return (
    <div className="protect-editor">
      <div className="effect-row">
        <span className="effect-label">Protect</span>
        <label className="check-label">
          <input type="checkbox" checked={!!effects.protectAttacksOnly} onChange={(e) => update({ protectAttacksOnly: e.target.checked || undefined })} />
          Only blocks damaging moves (King’s Shield)
        </label>
      </div>
      <div className="effect-row">
        <span className="effect-label">If a blocked move made contact</span>
        <label className="inline">Attacker loses <NumField value={c.damage ?? 0} min={0} max={100} onChange={(n) => setC({ damage: n || undefined })} />% HP</label>
        <select value={c.status ?? ''} aria-label="Status on contact" onChange={(e) => setC({ status: (e.target.value || undefined) as MajorStatus | undefined })}>
          <option value="">No status</option>
          {MAJOR_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>
      <div className="effect-row boosts">
        <span className="effect-label">Attacker’s stats</span>
        {BOOSTABLE_STATS.map((k) => (
          <label key={k} className="boost" title={BOOST_LABELS[k]}>
            {k === 'accuracy' ? 'Acc' : k === 'evasion' ? 'Eva' : k.toUpperCase()}
            <StageSelect
              value={boosts[k] ?? 0} label={`Attacker ${BOOST_LABELS[k]}`}
              onChange={(n) => {
                const next = { ...boosts, [k]: n };
                if (!n) delete next[k];
                setC({ boosts: Object.keys(next).length ? next : undefined });
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function BoostsEditor({
  label, value, defaultChance, onChange,
}: {
  label: string;
  value: MoveEffects['targetBoosts'];
  defaultChance: number;
  onChange: (v: MoveEffects['targetBoosts']) => void;
}) {
  const boosts = value?.boosts ?? {};
  const chance = value?.chance ?? defaultChance;
  const setStage = (k: keyof Boosts, n: number) => {
    const next = { ...boosts, [k]: n };
    if (!n) delete next[k];
    onChange(Object.keys(next).length ? { boosts: next, chance } : undefined);
  };
  return (
    <div className="effect-row boosts">
      <span className="effect-label">{label}</span>
      {BOOSTABLE_STATS.map((k) => (
        <label key={k} className="boost" title={BOOST_LABELS[k]}>
          {k === 'accuracy' ? 'Acc' : k === 'evasion' ? 'Eva' : k.toUpperCase()}
          <StageSelect value={boosts[k] ?? 0} label={`${label}: ${BOOST_LABELS[k]}`} onChange={(n) => setStage(k, n)} />
        </label>
      ))}
      {value && (
        <label className="inline">Chance
          <NumField value={chance} min={1} max={100} onChange={(n) => onChange({ boosts, chance: n })} />%
        </label>
      )}
    </div>
  );
}
