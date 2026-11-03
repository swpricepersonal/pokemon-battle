import { useEffect, useRef, useState } from 'react';
import { STRUGGLE_INDEX, availableChoices, effectiveSpeed, getChoiceMove } from '../engine/battle';
import type { BattleState, LogEntry, MoveChoice, Side } from '../engine/battle';
import { damageRange, typesOf } from '../engine/damage';
import { effectiveness } from '../engine/typeChart';
import { BOOSTABLE_STATS, STATUS_LABELS } from '../engine/types';
import type { BattlePokemon } from '../engine/types';
import { StatusBadge, TYPE_COLORS, TypeBadge } from './common';

export function BattleView({
  battle, onRunTurn, onRematch, onExit,
}: {
  battle: BattleState;
  onRunTurn: (choices: [MoveChoice, MoveChoice]) => void;
  onRematch: () => void;
  onExit: () => void;
}) {
  const [choices, setChoices] = useState<[MoveChoice | null, MoveChoice | null]>([null, null]);
  useEffect(() => { setChoices([null, null]); }, [battle.turn]);

  const over = battle.winner !== null;
  const ready = choices[0] !== null && choices[1] !== null;
  const choose = (side: Side, c: MoveChoice) => setChoices((prev) => (side === 0 ? [c, prev[1]] : [prev[0], c]));
  const randomFor = (side: Side) => {
    const opts = availableChoices(battle.mons[side]);
    choose(side, opts[Math.floor(Math.random() * opts.length)]);
  };

  return (
    <div className="battle">
      <div className="field">
        {([0, 1] as Side[]).map((side) => (
          <div key={side} className={`combatant side-${side}`}>
            <MonCard mon={battle.mons[side]} name={battle.names[side]} side={side} />
            {!over && (
              <MovePicker
                mon={battle.mons[side]}
                foe={battle.mons[side === 0 ? 1 : 0]}
                selected={choices[side]}
                onSelect={(c) => choose(side, c)}
                onRandom={() => randomFor(side)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="battle-actions">
        {over ? (
          <>
            <strong className="result">
              {battle.winner === 'draw' ? 'Draw!' : `${battle.names[battle.winner as Side]} wins!`}
            </strong>
            <button className="primary" onClick={onRematch}>Rematch</button>
            <button onClick={onExit}>Back to builder</button>
          </>
        ) : (
          <>
            <button className="primary big" disabled={!ready} onClick={() => ready && onRunTurn(choices as [MoveChoice, MoveChoice])}>
              {ready ? `Run turn ${battle.turn + 1}` : 'Choose a move for each Pokémon'}
            </button>
            <button className="ghost" onClick={onRematch}>Restart</button>
            <button className="ghost" onClick={onExit}>Back to builder</button>
          </>
        )}
      </div>

      <BattleLog log={battle.log} />
    </div>
  );
}

function hpColor(frac: number) {
  return frac > 0.5 ? 'var(--hp-high)' : frac > 0.2 ? 'var(--hp-mid)' : 'var(--hp-low)';
}

function MonCard({ mon, name, side }: { mon: BattlePokemon; name: string; side: Side }) {
  const frac = mon.currentHp / mon.stats.hp;
  const boosts = BOOSTABLE_STATS.filter((k) => mon.boosts[k] !== 0);
  return (
    <div className={`mon-card${mon.currentHp <= 0 ? ' fainted' : ''}`}>
      <div className="mon-title">
        <span className={`side-tag side-${side}`}>P{side + 1}</span>
        <strong>{name}</strong>
        <span className="muted">Lv {mon.build.level}</span>
        {mon.status && <StatusBadge status={mon.status} />}
      </div>
      <div className="types-line">
        {typesOf(mon).map((t) => <TypeBadge key={t} type={t} small />)}
      </div>
      <div className="hp-bar" role="meter" aria-valuenow={mon.currentHp} aria-valuemin={0} aria-valuemax={mon.stats.hp} aria-label={`${name} HP`}>
        <div className="hp-fill" style={{ width: `${frac * 100}%`, background: hpColor(frac) }} />
      </div>
      <div className="hp-text">
        <span>{mon.currentHp} / {mon.stats.hp} HP</span>
        <span className="muted">{Math.round(frac * 100)}%</span>
      </div>
      <div className="mon-stats muted">
        Atk {mon.stats.atk} · Def {mon.stats.def} · SpA {mon.stats.spa} · SpD {mon.stats.spd} · Spe {mon.stats.spe}
        {effectiveSpeed(mon) !== mon.stats.spe && <> (effective {effectiveSpeed(mon)})</>}
      </div>
      {(boosts.length > 0 || mon.status) && (
        <div className="chips">
          {mon.status && (
            <span className="chip">
              {STATUS_LABELS[mon.status]}
              {mon.status === 'slp' && ` (${mon.sleepTurns} turn${mon.sleepTurns === 1 ? '' : 's'} left)`}
              {mon.status === 'tox' && ` (next: ${Math.min(15, mon.toxicCounter + 1)}/16 HP)`}
            </span>
          )}
          {boosts.map((k) => (
            <span key={k} className={`chip ${mon.boosts[k] > 0 ? 'up' : 'down'}`}>
              {k === 'accuracy' ? 'Acc' : k === 'evasion' ? 'Eva' : k.toUpperCase()} {mon.boosts[k] > 0 ? '+' : ''}{mon.boosts[k]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MovePicker({
  mon, foe, selected, onSelect, onRandom,
}: {
  mon: BattlePokemon; foe: BattlePokemon; selected: MoveChoice | null;
  onSelect: (c: MoveChoice) => void; onRandom: () => void;
}) {
  const choices = availableChoices(mon);
  const struggling = choices[0] === STRUGGLE_INDEX;
  const slots: MoveChoice[] = struggling ? [STRUGGLE_INDEX] : mon.build.moves.map((_, i) => i);

  return (
    <div className="move-picker">
      {slots.map((i) => {
        const move = i === STRUGGLE_INDEX ? getChoiceMove(mon, i) : mon.build.moves[i];
        if (!move) return <div key={i} className="move-btn empty">—</div>;
        const disabled = i !== STRUGGLE_INDEX && mon.pp[i] <= 0;
        const range = damageRange(mon, foe, move, i === STRUGGLE_INDEX);
        const eff = move.category === 'Status' ? 1 : effectiveness(move.type, typesOf(foe));
        return (
          <button
            key={i}
            className={`move-btn${selected === i ? ' selected' : ''}`}
            disabled={disabled}
            onClick={() => onSelect(i)}
            style={{ ['--type-color' as string]: TYPE_COLORS[move.type] }}
          >
            <span className="move-name">{move.name}</span>
            <span className="move-meta">
              <TypeBadge type={move.type} small />
              <span>{move.category}</span>
              {i !== STRUGGLE_INDEX && <span>PP {mon.pp[i]}/{move.pp}</span>}
            </span>
            <span className="move-preview muted">
              {range
                ? eff === 0
                  ? 'No effect'
                  : `${pctOf(range.min, foe)}–${pctOf(range.max, foe)}%${eff > 1 ? ' · super effective' : eff < 1 ? ' · resisted' : ''}`
                : move.power > 0 ? '' : 'Status move'}
              {move.priority !== 0 && ` · priority ${move.priority > 0 ? '+' : ''}${move.priority}`}
            </span>
          </button>
        );
      })}
      <button className="ghost small" onClick={onRandom}>Random move</button>
    </div>
  );
}

function pctOf(dmg: number, foe: BattlePokemon) {
  return Math.round((dmg / foe.stats.hp) * 1000) / 10;
}

function BattleLog({ log }: { log: LogEntry[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [log.length]);
  return (
    <section className="panel log">
      <h2>Battle log</h2>
      <div className="log-body">
        {log.map((entry, i) => <LogLine key={i} entry={entry} />)}
        <div ref={end} />
      </div>
    </section>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const cls = `log-line kind-${entry.kind}${entry.side !== undefined ? ` side-${entry.side}` : ''}`;
  if (entry.kind === 'turn') return <div className={cls}>{entry.text}</div>;
  const bd = entry.breakdown;
  if (!bd) return <div className={cls}>{entry.text}</div>;
  return (
    <details className={cls}>
      <summary>{entry.text} <span className="math-toggle">show math</span></summary>
      <div className="math">
        <div className="formula">
          floor(floor(floor(2 × {bd.level} / 5 + 2) × {bd.power} × {bd.attack} / {bd.defense}) / 50) + 2 = <strong>{bd.baseDamage}</strong>
        </div>
        <div className="muted">
          Level {bd.level} · Power {bd.power} · {bd.attackLabel} {bd.attack} · {bd.defenseLabel} {bd.defense}
        </div>
        <table>
          <tbody>
            {bd.steps.map((s, i) => (
              <tr key={i}><td>{s.label}</td><td className="mult">{s.multiplier}</td><td className="res">{s.result}</td></tr>
            ))}
            <tr className="total"><td>Damage</td><td /><td className="res">{bd.damage}</td></tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}
