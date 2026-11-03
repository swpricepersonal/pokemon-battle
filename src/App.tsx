import { useEffect, useRef, useState } from 'react';
import { BattleView } from './components/BattleView';
import { BuildEditor } from './components/BuildEditor';
import { TypeBadge } from './components/common';
import { PRESET_BUILDS, newId } from './data/presets';
import { createBattle, runTurn } from './engine/battle';
import type { BattleState, MoveChoice } from './engine/battle';
import { validateBuild } from './engine/stats';
import type { PokemonBuild } from './engine/types';
import { loadLibrary, loadSides, normalizeBuild, saveLibrary, saveSides } from './storage';

function initialSides(): [PokemonBuild, PokemonBuild] {
  return loadSides() ?? [
    { ...structuredClone(PRESET_BUILDS[0]), id: newId() },
    { ...structuredClone(PRESET_BUILDS[3]), id: newId() },
  ];
}

export default function App() {
  const [sides, setSides] = useState(initialSides);
  const [library, setLibrary] = useState(loadLibrary);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => { saveSides(sides); }, [sides]);
  useEffect(() => { saveLibrary(library); }, [library]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const setSide = (i: 0 | 1) => (b: PokemonBuild) => setSides((prev) => (i === 0 ? [b, prev[1]] : [prev[0], b]));

  function saveToLibrary(b: PokemonBuild) {
    setLibrary((prev) => {
      const exists = prev.some((x) => x.id === b.id);
      return exists ? prev.map((x) => (x.id === b.id ? structuredClone(b) : x)) : [...prev, structuredClone(b)];
    });
    setNotice(`Saved “${b.name}” to your library.`);
  }

  const canBattle = sides.every((b) => validateBuild(b).length === 0);

  if (battle) {
    return (
      <Shell notice={notice}>
        <BattleView
          battle={battle}
          onRunTurn={(choices: [MoveChoice, MoveChoice]) => setBattle(runTurn(battle, choices))}
          onRematch={() => setBattle(createBattle(sides[0], sides[1]))}
          onExit={() => setBattle(null)}
        />
      </Shell>
    );
  }

  return (
    <Shell notice={notice}>
      <div className="start-bar">
        <button className="primary big" disabled={!canBattle} onClick={() => setBattle(createBattle(sides[0], sides[1]))}>
          Start battle
        </button>
        {!canBattle && <span className="muted">Fix the errors below to start.</span>}
        <button className="ghost" onClick={() => setSides(([a, b]) => [b, a])}>Swap sides</button>
      </div>
      <div className="builders">
        <BuildEditor label="Player 1" build={sides[0]} onChange={setSide(0)} library={library} onSave={saveToLibrary} />
        <BuildEditor label="Player 2" build={sides[1]} onChange={setSide(1)} library={library} onSave={saveToLibrary} />
      </div>
      <LibraryPanel library={library} setLibrary={setLibrary} onLoad={(b, side) => setSide(side)(structuredClone(b))} setNotice={setNotice} />
    </Shell>
  );
}

function Shell({ children, notice }: { children: React.ReactNode; notice: string }) {
  return (
    <div className="app">
      <header className="app-head">
        <h1>Battle Simulator</h1>
        <span className="muted">Singles · Gen 5+ damage formula</span>
      </header>
      {children}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

function LibraryPanel({
  library, setLibrary, onLoad, setNotice,
}: {
  library: PokemonBuild[];
  setLibrary: (fn: (prev: PokemonBuild[]) => PokemonBuild[]) => void;
  onLoad: (b: PokemonBuild, side: 0 | 1) => void;
  setNotice: (s: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

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
              <span className="lib-name"><strong>{b.name}</strong> <span className="muted">Lv {b.level}</span></span>
              <span className="types-line">
                <TypeBadge type={b.type1} small />
                {b.type2 && <TypeBadge type={b.type2} small />}
              </span>
              <span className="muted lib-moves">{b.moves.filter(Boolean).map((m) => m!.name).join(' · ')}</span>
              <span className="row">
                <button className="small" onClick={() => onLoad(b, 0)}>To P1</button>
                <button className="small" onClick={() => onLoad(b, 1)}>To P2</button>
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
