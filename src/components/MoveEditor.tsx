import { MOVE_LIBRARY } from '../data/presets';
import { BOOSTABLE_STATS, BOOST_LABELS, MAJOR_STATUSES, MOVE_SPECIALS, MOVE_SPECIAL_LABELS, MOVE_TARGETS, MOVE_TARGET_LABELS, STATUS_LABELS, TYPES } from '../engine/types';
import type { Boosts, MajorStatus, Move, MoveCategory, MoveEffects, MoveSpecial, MoveTarget, TypeName } from '../engine/types';
import { NumField, TypeBadge } from './common';

const CATEGORIES: MoveCategory[] = ['Physical', 'Special', 'Status'];

/** JSON with sorted keys, so moves compare equal regardless of property order. */
function canon(v: unknown): string {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${k}:${canon(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
const LIBRARY_KEYS = MOVE_LIBRARY.map(canon);

export function MoveEditor({
  slot, move, onChange,
}: { slot: number; move: Move | null; onChange: (m: Move | null) => void }) {
  const libraryIndex = move ? LIBRARY_KEYS.indexOf(canon(move)) : -1;
  const presetValue = !move ? 'empty' : libraryIndex >= 0 ? String(libraryIndex) : 'custom';

  function pick(value: string) {
    if (value === 'empty') onChange(null);
    else if (value === 'custom') onChange(move ?? { ...structuredClone(MOVE_LIBRARY[0]), name: 'Custom Move' });
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
          <option value="custom">Custom…</option>
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
            <label>Priority<NumField value={move.priority} min={-7} max={5} onChange={(n) => set('priority', n)} /></label>
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
          <EffectsEditor effects={move.effects} isStatus={move.category === 'Status'} onChange={setEffects} />
        </>
      )}
    </div>
  );
}

function summarize(e: MoveEffects): string {
  const parts: string[] = [];
  if (e.status) parts.push(`${e.status.chance}% ${STATUS_LABELS[e.status.status]}`);
  const fmt = (b: Partial<Boosts>) => Object.entries(b).filter(([, v]) => v).map(([k, v]) => `${v! > 0 ? '+' : ''}${v} ${k}`).join(' ');
  if (e.targetBoosts) parts.push(`foe ${fmt(e.targetBoosts.boosts)} (${e.targetBoosts.chance}%)`);
  if (e.selfBoosts) parts.push(`self ${fmt(e.selfBoosts.boosts)} (${e.selfBoosts.chance}%)`);
  if (e.drain) parts.push(`drain ${e.drain}%`);
  if (e.recoil) parts.push(`recoil ${e.recoil}%`);
  if (e.heal) parts.push(`heal ${e.heal}%`);
  if (e.flinch) parts.push(`${e.flinch}% flinch`);
  return parts.join(', ') || 'none';
}

function EffectsEditor({
  effects, isStatus, onChange,
}: { effects: MoveEffects; isStatus: boolean; onChange: (e: MoveEffects) => void }) {
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
        </div>
      </div>
    </details>
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
          <NumField value={boosts[k] ?? 0} min={-6} max={6} onChange={(n) => setStage(k, n)} />
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
