import { useEffect, useMemo, useRef, useState } from 'react';
import { BattleView } from './components/BattleView';
import { BuildEditor } from './components/BuildEditor';
import { TypeBadge } from './components/common';
import { SavedContext } from './components/saved';
import type { SavedStuff } from './components/saved';
import { blankBuild } from './data/presets';
import { MAX_TEAM, activeCount, applyReplacements, createBattle, endBattle, mathRng, runTurn, setMonHp } from './engine/battle';
import type { BattleState, TurnChoices } from './engine/battle';
import { validateBuild } from './engine/stats';
import { TERRAINS, TERRAIN_LABELS, WEATHERS, WEATHER_LABELS } from './engine/types';
import type { CustomAbility, Format, Move, PokemonBuild, Terrain, Weather } from './engine/types';
import {
  defaultTeams, loadBattle, loadLibrary, loadSavedAbilities, loadSavedMoves, loadTeams, parseBundle, saveBattle, saveLibrary,
  saveSavedAbilities, saveSavedMoves, saveTeams,
} from './storage';
import type { FieldChoice, Teams } from './storage';

const saved = loadTeams();
const savedBattle = loadBattle();

/** Replace the item with the same name, or add it. */
function upsertByName<T extends { name: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.name === item.name);
  return i >= 0 ? list.map((x, j) => (j === i ? structuredClone(item) : x)) : [...list, structuredClone(item)];
}

export default function App() {
  const [teams, setTeams] = useState<Teams>(() => saved?.teams ?? defaultTeams());
  const [format, setFormat] = useState<Format>(() => saved?.format ?? 'singles');
  const [field, setField] = useState<FieldChoice>(() => saved?.field ?? { weather: null, terrain: null });
  const [activeSlot, setActiveSlot] = useState<[number, number]>([0, 0]);
  const [library, setLibrary] = useState(loadLibrary);
  const [moves, setMoves] = useState(loadSavedMoves);
  const [abilities, setAbilities] = useState(loadSavedAbilities);
  const [battle, setBattle] = useState<BattleState | null>(savedBattle);
  // Reopen straight into a battle that was still going when the app was closed.
  const [inBattle, setInBattle] = useState(() => !!savedBattle && savedBattle.winner === null);
  const [notice, setNotice] = useState('');

  useEffect(() => { saveTeams(teams, format, field); }, [teams, format, field]);
  useEffect(() => { saveLibrary(library); }, [library]);
  useEffect(() => { saveSavedMoves(moves); }, [moves]);
  useEffect(() => { saveSavedAbilities(abilities); }, [abilities]);
  useEffect(() => { saveBattle(battle && battle.winner === null ? battle : null); }, [battle]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const savedStuff = useMemo<SavedStuff>(() => ({
    moves, abilities,
    saveMove: (m: Move) => {
      setMoves((prev) => upsertByName(prev, m));
      setNotice(`Saved the move “${m.name}”. Pick it from “My saved moves” in any move slot.`);
    },
    saveAbility: (a: CustomAbility) => {
      setAbilities((prev) => upsertByName(prev, a));
      setNotice(`Saved the ability “${a.name}”. Pick it from “My saved abilities”.`);
    },
  }), [moves, abilities]);

  const n = activeCount(format);
  const slotFor = (side: 0 | 1) => Math.min(activeSlot[side], teams[side].length - 1);
  const setSlot = (side: 0 | 1, i: number) => setActiveSlot((prev) => (side === 0 ? [i, prev[1]] : [prev[0], i]));

  function setBuild(side: 0 | 1, slot: number, b: PokemonBuild) {
    setTeams((prev) => {
      const next = [prev[0].slice(), prev[1].slice()] as Teams;
      next[side][slot] = b;
      return next;
    });
  }

  function editTeam(side: 0 | 1, fn: (team: PokemonBuild[]) => PokemonBuild[]) {
    setTeams((prev) => {
      const next = [prev[0].slice(), prev[1].slice()] as Teams;
      next[side] = fn(next[side]);
      return next;
    });
  }

  function saveToLibrary(b: PokemonBuild) {
    setLibrary((prev) => {
      const exists = prev.some((x) => x.id === b.id);
      return exists ? prev.map((x) => (x.id === b.id ? structuredClone(b) : x)) : [...prev, structuredClone(b)];
    });
    setNotice(`Saved “${b.name}” to your library.`);
  }

  const canBattle = teams.every((t) => t.length > 0 && t.every((b) => validateBuild(b).length === 0));
  const start = () => {
    setBattle(createBattle(teams, format, mathRng, field));
    setInBattle(true);
  };
  const resumable = battle && battle.winner === null ? battle : null;

  if (battle && inBattle) {
    return (
      <SavedContext.Provider value={savedStuff}>
        <Shell notice={notice} format={battle.format}>
          <BattleView
            battle={battle}
            onRunTurn={(choices: TurnChoices) => setBattle(runTurn(battle, choices))}
            onReplace={(picks) => setBattle(applyReplacements(battle, picks))}
            onSetHp={(uid, hp) => setBattle(setMonHp(battle, uid, hp))}
            onEnd={() => setBattle(endBattle(battle))}
            onRematch={start}
            onExit={() => setInBattle(false)}
          />
        </Shell>
      </SavedContext.Provider>
    );
  }

  return (
    <SavedContext.Provider value={savedStuff}>
      <Shell notice={notice} format={format}>
        {resumable && (
          <div className="resume-bar">
            <span>You have a battle in progress (turn {resumable.turn}).</span>
            <button className="primary" onClick={() => setInBattle(true)}>Resume battle</button>
            <button className="ghost small" onClick={() => setBattle(null)}>Discard it</button>
          </div>
        )}
        <div className="start-bar">
          <div className="segmented" role="radiogroup" aria-label="Battle format">
            {(['singles', 'doubles'] as Format[]).map((f) => (
              <button key={f} role="radio" aria-checked={format === f} className={format === f ? 'on' : ''} onClick={() => setFormat(f)}>
                {f === 'singles' ? 'Singles' : 'Doubles'}
              </button>
            ))}
          </div>
          <label className="inline field-select" htmlFor="start-weather">Weather
            <select id="start-weather" value={field.weather ?? ''} onChange={(e) => setField({ ...field, weather: (e.target.value || null) as Weather | null })}>
              <option value="">None</option>
              {WEATHERS.map((w) => <option key={w} value={w}>{WEATHER_LABELS[w]}</option>)}
            </select>
          </label>
          <label className="inline field-select" htmlFor="start-terrain">Terrain
            <select id="start-terrain" value={field.terrain ?? ''} onChange={(e) => setField({ ...field, terrain: (e.target.value || null) as Terrain | null })}>
              <option value="">None</option>
              {TERRAINS.map((t) => <option key={t} value={t}>{TERRAIN_LABELS[t]}</option>)}
            </select>
          </label>
          <button className="primary big" disabled={!canBattle} onClick={start}>{resumable ? 'Start new battle' : 'Start battle'}</button>
          {!canBattle && <span className="muted">Fix the errors below to start.</span>}
          <button className="ghost" onClick={() => setTeams(([a, b]) => [b, a])}>Swap sides</button>
        </div>
        <p className="muted team-help">
          Each player brings 1–6 Pokémon. The first {n === 1 ? 'one starts' : 'two start'} on the field; the rest wait on the bench and can switch in.
        </p>
        <div className="builders">
          {([0, 1] as const).map((side) => {
            const slot = slotFor(side);
            const team = teams[side];
            const tabs = (
              <div className="team-bar">
                <div className="slot-tabs" role="tablist" aria-label={`Player ${side + 1} team`}>
                  {team.map((b, i) => {
                    const invalid = validateBuild(b).length > 0;
                    return (
                      <button
                        key={i} role="tab" aria-selected={slot === i} className={`${slot === i ? 'on' : ''}${i < n ? ' lead' : ''}`}
                        onClick={() => setSlot(side, i)} title={i < n ? 'Starts on the field' : 'Starts on the bench'}
                      >
                        <span className="slot-letter">{i + 1}</span> {b.name || 'Unnamed'}{invalid && <span className="tab-error" title="Has errors"> ⚠</span>}
                      </button>
                    );
                  })}
                  {team.length < MAX_TEAM && (
                    <button
                      className="ghost add-member"
                      onClick={() => {
                        editTeam(side, (t) => [...t, blankBuild()]);
                        setSlot(side, team.length);
                      }}
                    >
                      + Add
                    </button>
                  )}
                </div>
                <div className="row team-actions">
                  <span className="muted">{slot < n ? 'Starts on the field' : 'On the bench'}</span>
                  <button
                    className="small ghost" disabled={slot === 0} title="Move earlier in the team"
                    onClick={() => {
                      editTeam(side, (t) => { const c = t.slice(); [c[slot - 1], c[slot]] = [c[slot], c[slot - 1]]; return c; });
                      setSlot(side, slot - 1);
                    }}
                  >
                    ◀ Earlier
                  </button>
                  <button
                    className="small ghost" disabled={slot >= team.length - 1} title="Move later in the team"
                    onClick={() => {
                      editTeam(side, (t) => { const c = t.slice(); [c[slot], c[slot + 1]] = [c[slot + 1], c[slot]]; return c; });
                      setSlot(side, slot + 1);
                    }}
                  >
                    Later ▶
                  </button>
                  <button
                    className="small ghost danger" disabled={team.length <= 1}
                    onClick={() => {
                      editTeam(side, (t) => t.filter((_, i) => i !== slot));
                      setSlot(side, Math.max(0, slot - 1));
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
            return (
              <BuildEditor
                key={side}
                label={`Player ${side + 1}`}
                tabs={tabs}
                build={team[slot]}
                onChange={(b) => setBuild(side, slot, b)}
                library={library}
                onSave={saveToLibrary}
              />
            );
          })}
        </div>
        <LibraryPanel
          library={library}
          setLibrary={setLibrary}
          moves={moves}
          setMoves={setMoves}
          abilities={abilities}
          setAbilities={setAbilities}
          onLoad={(b, side) => setBuild(side, slotFor(side), structuredClone(b))}
          loadLabel={(side) => `To P${side + 1} #${slotFor(side) + 1}`}
          setNotice={setNotice}
        />
      </Shell>
    </SavedContext.Provider>
  );
}

function Shell({ children, notice, format }: { children: React.ReactNode; notice: string; format: Format }) {
  return (
    <div className="app">
      <header className="app-head">
        <h1>Battle Simulator</h1>
        <span className="muted">{format === 'doubles' ? 'Doubles' : 'Singles'} · Gen 5+ damage formula</span>
      </header>
      {children}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

function LibraryPanel({
  library, setLibrary, moves, setMoves, abilities, setAbilities, onLoad, loadLabel, setNotice,
}: {
  library: PokemonBuild[];
  setLibrary: (fn: (prev: PokemonBuild[]) => PokemonBuild[]) => void;
  moves: Move[];
  setMoves: (fn: (prev: Move[]) => Move[]) => void;
  abilities: CustomAbility[];
  setAbilities: (fn: (prev: CustomAbility[]) => CustomAbility[]) => void;
  onLoad: (b: PokemonBuild, side: 0 | 1) => void;
  loadLabel: (side: 0 | 1) => string;
  setNotice: (s: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const empty = !library.length && !moves.length && !abilities.length;
  const bundleJson = () => JSON.stringify({ version: 2, builds: library, moves, abilities }, null, 2);

  const buildsFile = () => new File([bundleJson()], 'battle-builds.json', { type: 'application/json' });
  const canShareFiles = (() => {
    try {
      return !import.meta.env.VITE_ARTIFACT && typeof navigator.canShare === 'function'
        && navigator.canShare({ files: [new File(['[]'], 'x.json', { type: 'application/json' })] });
    } catch {
      return false;
    }
  })();

  async function shareJson() {
    try {
      await navigator.share({ files: [buildsFile()], title: 'Battle Simulator builds' });
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') setNotice('Sharing didn’t work here. Try Copy JSON instead.');
    }
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(bundleJson());
      setNotice('Copied your builds, moves and abilities as JSON. Paste them into a .json file to back them up.');
    } catch {
      setNotice('Copying is blocked here. Use Export JSON in the desktop version instead.');
    }
  }

  function exportJson() {
    const blob = new Blob([bundleJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'battle-builds.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File) {
    try {
      const bundle = parseBundle(JSON.parse(await file.text()));
      const total = bundle.builds.length + bundle.moves.length + bundle.abilities.length;
      if (!total) throw new Error('Nothing found');
      setLibrary((prev) => {
        const byId = new Map(prev.map((b) => [b.id, b]));
        for (const b of bundle.builds) byId.set(b.id, b);
        return [...byId.values()];
      });
      setMoves((prev) => bundle.moves.reduce(upsertByName, prev));
      setAbilities((prev) => bundle.abilities.reduce(upsertByName, prev));
      const parts = [
        bundle.builds.length && `${bundle.builds.length} build${bundle.builds.length === 1 ? '' : 's'}`,
        bundle.moves.length && `${bundle.moves.length} move${bundle.moves.length === 1 ? '' : 's'}`,
        bundle.abilities.length && `${bundle.abilities.length} abilit${bundle.abilities.length === 1 ? 'y' : 'ies'}`,
      ].filter(Boolean);
      setNotice(`Imported ${parts.join(', ')}.`);
    } catch {
      setNotice('Could not import that file. Use a JSON file exported from this app.');
    }
  }

  const deleteButton = (id: string, label: string, remove: () => void) => (
    pendingDelete === id ? (
      <>
        <button
          className="small danger"
          onClick={() => {
            remove();
            setPendingDelete(null);
            setNotice(`Deleted “${label}”.`);
          }}
        >
          Confirm delete
        </button>
        <button className="small ghost" onClick={() => setPendingDelete(null)}>Cancel</button>
      </>
    ) : (
      <button className="small danger" onClick={() => setPendingDelete(id)}>Delete</button>
    )
  );

  return (
    <section className="panel library">
      <header className="panel-head">
        <h2>My saved builds, moves and abilities</h2>
        <div className="row">
          {!import.meta.env.VITE_ARTIFACT && (
            <button onClick={exportJson} disabled={empty}>Export JSON</button>
          )}
          {canShareFiles && <button onClick={shareJson} disabled={empty}>Share</button>}
          <button onClick={copyJson} disabled={empty}>Copy JSON</button>
          <button onClick={() => fileInput.current?.click()}>Import JSON</button>
          <input
            ref={fileInput} type="file" accept="application/json,.json" hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>
      <h3 className="lib-heading">Builds</h3>
      {library.length === 0 ? (
        <p className="muted">No saved builds yet. Press “Save” on a build above to keep it in this browser.</p>
      ) : (
        <ul className="library-list">
          {library.map((b) => (
            <li key={b.id}>
              <span className="lib-name">
                <strong>{b.name}</strong> <span className="muted">Lv {b.level}</span>
                {(b.ability || b.item) && (
                  <span className="muted lib-extra">{[b.ability === 'Custom' ? b.customAbility?.name : b.ability, b.item].filter(Boolean).join(' · ')}</span>
                )}
              </span>
              <span className="types-line">
                <TypeBadge type={b.type1} small />
                {b.type2 && <TypeBadge type={b.type2} small />}
              </span>
              <span className="muted lib-moves">{b.moves.filter(Boolean).map((m) => m!.name).join(' · ')}</span>
              <span className="row">
                <button className="small" onClick={() => onLoad(b, 0)}>{loadLabel(0)}</button>
                <button className="small" onClick={() => onLoad(b, 1)}>{loadLabel(1)}</button>
                {deleteButton(`build:${b.id}`, b.name, () => setLibrary((prev) => prev.filter((x) => x.id !== b.id)))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="lib-heading">Moves</h3>
      {moves.length === 0 ? (
        <p className="muted">No saved moves yet. Make a custom move and press “Save move” next to it.</p>
      ) : (
        <ul className="library-list compact">
          {moves.map((m) => (
            <li key={m.name}>
              <span className="lib-name"><strong>{m.name}</strong></span>
              <span className="types-line"><TypeBadge type={m.type} small /></span>
              <span className="muted lib-moves">{m.category}{m.category !== 'Status' ? ` · ${m.power} power` : ''} · {m.accuracy === null ? 'never misses' : `${m.accuracy}%`}</span>
              <span className="row">{deleteButton(`move:${m.name}`, m.name, () => setMoves((prev) => prev.filter((x) => x.name !== m.name)))}</span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="lib-heading">Abilities</h3>
      {abilities.length === 0 ? (
        <p className="muted">No saved abilities yet. Choose “Custom…” as an ability and press “Save ability”.</p>
      ) : (
        <ul className="library-list compact">
          {abilities.map((a) => (
            <li key={a.name}>
              <span className="lib-name"><strong>{a.name}</strong></span>
              <span />
              <span />
              <span className="row">{deleteButton(`ability:${a.name}`, a.name, () => setAbilities((prev) => prev.filter((x) => x.name !== a.name)))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
