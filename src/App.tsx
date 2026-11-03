import { useEffect, useRef, useState } from 'react';
import { BattleView } from './components/BattleView';
import { BuildEditor } from './components/BuildEditor';
import { TypeBadge } from './components/common';
import { activeCount, createBattle, mathRng, runTurn } from './engine/battle';
import type { BattleState, TurnChoices } from './engine/battle';
import { validateBuild } from './engine/stats';
import { TERRAINS, TERRAIN_LABELS, WEATHERS, WEATHER_LABELS } from './engine/types';
import type { Format, PokemonBuild, Terrain, Weather } from './engine/types';
import { defaultTeams, loadLibrary, loadTeams, normalizeBuild, saveLibrary, saveTeams } from './storage';
import type { FieldChoice, Teams } from './storage';

const saved = loadTeams();

export default function App() {
  const [teams, setTeams] = useState<Teams>(() => saved?.teams ?? defaultTeams());
  const [format, setFormat] = useState<Format>(() => saved?.format ?? 'singles');
  const [field, setField] = useState<FieldChoice>(() => saved?.field ?? { weather: null, terrain: null });
  const [activeSlot, setActiveSlot] = useState<[number, number]>([0, 0]);
  const [library, setLibrary] = useState(loadLibrary);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => { saveTeams(teams, format, field); }, [teams, format, field]);
  useEffect(() => { saveLibrary(library); }, [library]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const n = activeCount(format);
  const slotFor = (side: 0 | 1) => Math.min(activeSlot[side], n - 1);

  function setBuild(side: 0 | 1, slot: number, b: PokemonBuild) {
    setTeams((prev) => {
      const next = [prev[0].slice(), prev[1].slice()] as Teams;
      next[side][slot] = b;
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

  const inPlay = teams.map((t) => t.slice(0, n));
  const canBattle = inPlay.every((t) => t.every((b) => validateBuild(b).length === 0));
  const start = () => setBattle(createBattle(teams, format, mathRng, field));

  if (battle) {
    return (
      <Shell notice={notice} format={battle.format}>
        <BattleView
          battle={battle}
          onRunTurn={(choices: TurnChoices) => setBattle(runTurn(battle, choices))}
          onRematch={start}
          onExit={() => setBattle(null)}
        />
      </Shell>
    );
  }

  return (
    <Shell notice={notice} format={format}>
      <div className="start-bar">
        <div className="segmented" role="radiogroup" aria-label="Battle format">
          {(['singles', 'doubles'] as Format[]).map((f) => (
            <button key={f} role="radio" aria-checked={format === f} className={format === f ? 'on' : ''} onClick={() => setFormat(f)}>
              {f === 'singles' ? 'Singles (1v1)' : 'Doubles (2v2)'}
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
        <button className="primary big" disabled={!canBattle} onClick={start}>Start battle</button>
        {!canBattle && <span className="muted">Fix the errors below to start.</span>}
        <button className="ghost" onClick={() => setTeams(([a, b]) => [b, a])}>Swap sides</button>
      </div>
      <div className="builders">
        {([0, 1] as const).map((side) => {
          const slot = slotFor(side);
          const tabs = n > 1 ? (
            <div className="slot-tabs" role="tablist" aria-label={`Player ${side + 1} team`}>
              {teams[side].slice(0, n).map((b, i) => {
                const invalid = validateBuild(b).length > 0;
                return (
                  <button
                    key={i} role="tab" aria-selected={slot === i} className={slot === i ? 'on' : ''}
                    onClick={() => setActiveSlot((prev) => (side === 0 ? [i, prev[1]] : [prev[0], i]))}
                  >
                    <span className="slot-letter">{'AB'[i]}</span> {b.name || 'Unnamed'}{invalid && <span className="tab-error" title="Has errors"> ⚠</span>}
                  </button>
                );
              })}
            </div>
          ) : null;
          return (
            <BuildEditor
              key={side}
              label={`Player ${side + 1}`}
              tabs={tabs}
              build={teams[side][slot]}
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
        onLoad={(b, side) => setBuild(side, slotFor(side), structuredClone(b))}
        loadLabel={(side) => `To P${side + 1}${n > 1 ? 'AB'[slotFor(side)] : ''}`}
        setNotice={setNotice}
      />
    </Shell>
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
  library, setLibrary, onLoad, loadLabel, setNotice,
}: {
  library: PokemonBuild[];
  setLibrary: (fn: (prev: PokemonBuild[]) => PokemonBuild[]) => void;
  onLoad: (b: PokemonBuild, side: 0 | 1) => void;
  loadLabel: (side: 0 | 1) => string;
  setNotice: (s: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const buildsFile = () => new File([JSON.stringify(library, null, 2)], 'battle-builds.json', { type: 'application/json' });
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
      await navigator.clipboard.writeText(JSON.stringify(library, null, 2));
      setNotice('Copied your builds as JSON. Paste them into a .json file to back them up.');
    } catch {
      setNotice('Copying is blocked here. Use Export JSON in the desktop version instead.');
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'battle-builds.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const list = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((b) => normalizeBuild(b) ?? []);
      if (!list.length) throw new Error('No builds found');
      setLibrary((prev) => {
        const byId = new Map(prev.map((b) => [b.id, b]));
        for (const b of list) byId.set(b.id, b);
        return [...byId.values()];
      });
      setNotice(`Imported ${list.length} build${list.length === 1 ? '' : 's'}.`);
    } catch {
      setNotice('Could not import that file. Use a JSON file exported from this app.');
    }
  }

  return (
    <section className="panel library">
      <header className="panel-head">
        <h2>My saved builds</h2>
        <div className="row">
          {!import.meta.env.VITE_ARTIFACT && (
            <button onClick={exportJson} disabled={!library.length}>Export JSON</button>
          )}
          {canShareFiles && <button onClick={shareJson} disabled={!library.length}>Share</button>}
          <button onClick={copyJson} disabled={!library.length}>Copy JSON</button>
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
                {pendingDelete === b.id ? (
                  <>
                    <button
                      className="small danger"
                      onClick={() => {
                        setLibrary((prev) => prev.filter((x) => x.id !== b.id));
                        setPendingDelete(null);
                        setNotice(`Deleted “${b.name}”.`);
                      }}
                    >
                      Confirm delete
                    </button>
                    <button className="small ghost" onClick={() => setPendingDelete(null)}>Cancel</button>
                  </>
                ) : (
                  <button className="small danger" onClick={() => setPendingDelete(b.id)}>Delete</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
