import { PRESET_BUILDS, blankBuild, newId } from '../data/presets';
import { MAX_EV, MAX_EV_TOTAL, MAX_IV, calcAllStats, evTotal, natureMultiplier, validateBuild } from '../engine/stats';
import { NATURES, NATURE_NAMES, STAT_KEYS, STAT_LABELS, TYPES } from '../engine/types';
import type { Move, NatureName, PokemonBuild, StatKey, TypeName } from '../engine/types';
import { MoveEditor } from './MoveEditor';
import { NumField, TypeBadge } from './common';

function natureLabel(n: NatureName) {
  const [up, down] = NATURES[n];
  return up && down && up !== down ? `${n} (+${STAT_LABELS[up]}, −${STAT_LABELS[down]})` : `${n} (neutral)`;
}

export function BuildEditor({
  label, build, onChange, library, onSave,
}: {
  label: string;
  build: PokemonBuild;
  onChange: (b: PokemonBuild) => void;
  library: PokemonBuild[];
  onSave: (b: PokemonBuild) => void;
}) {
  const stats = calcAllStats(build);
  const total = evTotal(build);
  const errors = validateBuild(build);
  const set = <K extends keyof PokemonBuild>(key: K, value: PokemonBuild[K]) => onChange({ ...build, [key]: value });
  const setStat = (table: 'baseStats' | 'ivs' | 'evs', stat: StatKey, n: number) =>
    onChange({ ...build, [table]: { ...build[table], [stat]: n } });
  const setMove = (i: number, m: Move | null) => set('moves', build.moves.map((x, j) => (j === i ? m : x)));

  function load(value: string) {
    const [source, id] = value.split(':');
    const pool = source === 'preset' ? PRESET_BUILDS : library;
    const found = pool.find((b) => b.id === id);
    if (found) onChange({ ...structuredClone(found), id: source === 'preset' ? newId() : found.id });
  }

  return (
    <section className="panel build-editor">
      <header className="panel-head">
        <h2>{label}</h2>
        <div className="row">
          <select value="" onChange={(e) => load(e.target.value)} aria-label={`Load a build into ${label}`}>
            <option value="">Load…</option>
            <optgroup label="Samples">
              {PRESET_BUILDS.map((b) => <option key={b.id} value={`preset:${b.id}`}>{b.name}</option>)}
            </optgroup>
            {library.length > 0 && (
              <optgroup label="My saved builds">
                {library.map((b) => <option key={b.id} value={`saved:${b.id}`}>{b.name} (Lv {b.level})</option>)}
              </optgroup>
            )}
          </select>
          <button onClick={() => onSave(build)} title="Save this build to your library (overwrites a build with the same ID)">Save</button>
          <button className="ghost" onClick={() => onChange(blankBuild())}>New</button>
        </div>
      </header>

      <div className="identity">
        <label className="grow">Name<input value={build.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="narrow">Level<NumField value={build.level} min={1} max={100} onChange={(n) => set('level', n)} /></label>
        <label>Type 1
          <select value={build.type1} onChange={(e) => set('type1', e.target.value as TypeName)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label>Type 2
          <select value={build.type2 ?? ''} onChange={(e) => set('type2', (e.target.value || null) as TypeName | null)}>
            <option value="">None</option>
            {TYPES.filter((t) => t !== build.type1).map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="grow">Nature
          <select value={build.nature} onChange={(e) => set('nature', e.target.value as NatureName)}>
            {NATURE_NAMES.map((n) => <option key={n} value={n}>{natureLabel(n)}</option>)}
          </select>
        </label>
      </div>
      <div className="types-line">
        <TypeBadge type={build.type1} />
        {build.type2 && build.type2 !== build.type1 && <TypeBadge type={build.type2} />}
      </div>

      <table className="stat-table">
        <thead>
          <tr><th>Stat</th><th>Base</th><th>IV</th><th>EV</th><th className="final">Final</th></tr>
        </thead>
        <tbody>
          {STAT_KEYS.map((s) => {
            const nm = natureMultiplier(build.nature, s);
            return (
              <tr key={s}>
                <th className={nm > 1 ? 'nature-up' : nm < 1 ? 'nature-down' : ''}>
                  {STAT_LABELS[s]}{nm > 1 ? ' ▲' : nm < 1 ? ' ▼' : ''}
                </th>
                <td><NumField value={build.baseStats[s]} min={1} max={255} onChange={(n) => setStat('baseStats', s, n)} /></td>
                <td><NumField value={build.ivs[s]} min={0} max={MAX_IV} onChange={(n) => setStat('ivs', s, n)} /></td>
                <td className="ev-cell">
                  <input
                    type="range" min={0} max={MAX_EV} step={4} value={build.evs[s]}
                    onChange={(e) => setStat('evs', s, Number(e.target.value))}
                    aria-label={`${STAT_LABELS[s]} EVs`}
                  />
                  <NumField value={build.evs[s]} min={0} max={MAX_EV} onChange={(n) => setStat('evs', s, n)} />
                </td>
                <td className="final">{stats[s]}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            <td>{STAT_KEYS.reduce((a, s) => a + build.baseStats[s], 0)}</td>
            <td />
            <td className={total > MAX_EV_TOTAL ? 'over' : ''}>{total} / {MAX_EV_TOTAL}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      <div className="moves">
        {build.moves.map((m, i) => <MoveEditor key={i} slot={i} move={m} onChange={(nm) => setMove(i, nm)} />)}
      </div>

      {errors.length > 0 && (
        <ul className="errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
      )}
    </section>
  );
}
