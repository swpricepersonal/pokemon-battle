import { useEffect, useRef, useState } from 'react';
import { abilityName } from '../engine/abilities';
import {
  STRUGGLE_INDEX, activeWeather, allMons, allyOf, availableChoices, defaultTarget, effectiveMove, effectiveSpeed,
  fieldDamageOpts, foesOf, getChoiceMove, isAlive, monAt, moveNeedsTarget, validTargets,
} from '../engine/battle';
import type { Action, BattleState, LogEntry, MoveChoice, Side, TargetRef, TurnChoices } from '../engine/battle';
import { damageRange, typeEffectiveness, typesOf } from '../engine/damage';
import { BOOSTABLE_STATS, STATUS_LABELS, TERRAIN_LABELS, WEATHER_LABELS } from '../engine/types';
import type { BattlePokemon, Move } from '../engine/types';
import { StatusBadge, TYPE_COLORS, TypeBadge } from './common';

export function BattleView({
  battle, onRunTurn, onRematch, onExit,
}: {
  battle: BattleState;
  onRunTurn: (choices: TurnChoices) => void;
  onRematch: () => void;
  onExit: () => void;
}) {
  const [choices, setChoices] = useState<TurnChoices>({});
  useEffect(() => { setChoices({}); }, [battle.turn]);

  const over = battle.winner !== null;
  const actors = allMons(battle).filter(isAlive);
  const ready = actors.every((m) => choices[m.uid] !== undefined);
  const doubles = battle.format === 'doubles';

  const choose = (mon: BattlePokemon, move: MoveChoice, target?: TargetRef) => {
    const m = getChoiceMove(mon, move);
    const t = moveNeedsTarget(battle, m) ? target ?? choices[mon.uid]?.target ?? defaultTarget(battle, mon) : undefined;
    setChoices((prev) => ({ ...prev, [mon.uid]: { move, target: t } }));
  };
  const randomAction = (mon: BattlePokemon): Action => {
    const opts = availableChoices(mon);
    const move = opts[Math.floor(Math.random() * opts.length)];
    const targets = validTargets(battle, mon).filter((t) => t.side !== mon.side);
    const target = moveNeedsTarget(battle, getChoiceMove(mon, move)) ? targets[Math.floor(Math.random() * targets.length)] : undefined;
    return { move, target };
  };
  const randomAll = () => setChoices(Object.fromEntries(actors.map((m) => [m.uid, randomAction(m)])));

  const winnerText = battle.winner === 'draw'
    ? 'Draw!'
    : battle.winner !== null
      ? `${doubles ? `Player ${battle.winner + 1}` : battle.sides[battle.winner].mons[0].name} wins!`
      : '';

  return (
    <div className="battle">
      <FieldConditions battle={battle} />
      <div className={`field ${doubles ? 'doubles' : 'singles'}`}>
        {([0, 1] as Side[]).map((side) => (
          <div key={side} className={`side-col side-${side}`}>
            {doubles && <h2 className="side-title"><span className={`side-tag side-${side}`}>P{side + 1}</span> Player {side + 1}</h2>}
            {battle.sides[side].mons.map((mon) => (
              <div key={mon.uid} className={`combatant side-${side}`}>
                <MonCard battle={battle} mon={mon} />
                {!over && isAlive(mon) && (
                  <MovePicker
                    battle={battle}
                    mon={mon}
                    action={choices[mon.uid]}
                    onSelect={(c) => choose(mon, c)}
                    onTarget={(t) => choices[mon.uid] && choose(mon, choices[mon.uid].move, t)}
                    onRandom={() => setChoices((prev) => ({ ...prev, [mon.uid]: randomAction(mon) }))}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="battle-actions">
        {over ? (
          <>
            <strong className="result">{winnerText}</strong>
            <button className="primary" onClick={onRematch}>Rematch</button>
            <button onClick={onExit}>Back to builder</button>
          </>
        ) : (
          <>
            <button className="primary big" disabled={!ready} onClick={() => ready && onRunTurn(choices)}>
              {ready ? `Run turn ${battle.turn + 1}` : `Choose a move for each Pokémon (${Object.keys(choices).length}/${actors.length})`}
            </button>
            <button onClick={randomAll}>Random moves</button>
            <button className="ghost" onClick={onRematch}>Restart</button>
            <button className="ghost" onClick={onExit}>Back to builder</button>
          </>
        )}
      </div>

      <BattleLog log={battle.log} />
    </div>
  );
}

function FieldConditions({ battle }: { battle: BattleState }) {
  const chips: string[] = [];
  const turns = (n: number) => (n < 0 ? 'whole battle' : `${n} turn${n === 1 ? '' : 's'} left`);
  if (battle.weather) {
    const suppressed = !activeWeather(battle);
    chips.push(`${WEATHER_LABELS[battle.weather]} · ${turns(battle.weatherTurns)}${suppressed ? ' (no effect: Cloud Nine)' : ''}`);
  }
  if (battle.terrain) chips.push(`${TERRAIN_LABELS[battle.terrain]} · ${turns(battle.terrainTurns)}`);
  if (battle.trickRoom) chips.push(`Trick Room · ${battle.trickRoom} turn${battle.trickRoom === 1 ? '' : 's'} left`);
  battle.sides.forEach((side, i) => {
    const who = `P${i + 1}`;
    if (side.tailwind) chips.push(`${who} Tailwind · ${side.tailwind} left`);
    if (side.reflect) chips.push(`${who} Reflect · ${side.reflect} left`);
    if (side.lightScreen) chips.push(`${who} Light Screen · ${side.lightScreen} left`);
  });
  if (!chips.length) return null;
  return <div className="field-conditions">{chips.map((c) => <span key={c} className="chip field-chip">{c}</span>)}</div>;
}

function hpColor(frac: number) {
  return frac > 0.5 ? 'var(--hp-high)' : frac > 0.2 ? 'var(--hp-mid)' : 'var(--hp-low)';
}

const boostShort = (k: string) => (k === 'accuracy' ? 'Acc' : k === 'evasion' ? 'Eva' : k.toUpperCase());

function MonCard({ battle, mon }: { battle: BattleState; mon: BattlePokemon }) {
  const frac = mon.currentHp / mon.stats.hp;
  const boosts = BOOSTABLE_STATS.filter((k) => mon.boosts[k] !== 0);
  const speed = effectiveSpeed(battle, mon);
  const ability = mon.build.ability ? abilityName(mon) : '';
  const heldItem = mon.build.item;
  const lockedMove = mon.choiceLock !== null ? mon.build.moves[mon.choiceLock]?.name : null;
  return (
    <div className={`mon-card${mon.currentHp <= 0 ? ' fainted' : ''}`}>
      <div className="mon-title">
        <span className={`side-tag side-${mon.side}`}>{battle.format === 'doubles' ? mon.uid.toUpperCase() : `P${mon.side + 1}`}</span>
        <strong>{mon.name}</strong>
        <span className="muted">Lv {mon.build.level}</span>
        {mon.status && <StatusBadge status={mon.status} />}
        {mon.currentHp <= 0 && <span className="muted">Fainted</span>}
      </div>
      <div className="types-line">
        {typesOf(mon).map((t) => <TypeBadge key={t} type={t} small />)}
        {(ability || heldItem) && (
          <span className="mon-ability muted">
            {ability}
            {ability && heldItem && ' · '}
            {heldItem && (mon.item ? heldItem : <s title="Used up">{heldItem}</s>)}
          </span>
        )}
      </div>
      <div className="hp-bar" role="meter" aria-valuenow={mon.currentHp} aria-valuemin={0} aria-valuemax={mon.stats.hp} aria-label={`${mon.name} HP`}>
        <div className="hp-fill" style={{ width: `${frac * 100}%`, background: hpColor(frac) }} />
      </div>
      <div className="hp-text">
        <span>{mon.currentHp} / {mon.stats.hp} HP</span>
        <span className="muted">{Math.round(frac * 100)}%</span>
      </div>
      <div className="mon-stats muted">
        Atk {mon.stats.atk} · Def {mon.stats.def} · SpA {mon.stats.spa} · SpD {mon.stats.spd} · Spe {mon.stats.spe}
        {speed !== mon.stats.spe && <> (effective {speed})</>}
      </div>
      {(boosts.length > 0 || mon.status || lockedMove || mon.confusion > 0 || mon.substituteHp > 0 || mon.taunt > 0 || mon.encore || mon.leechSeed
        || mon.disable || mon.torment || mon.yawn > 0 || mon.perishCount > 0) && (
        <div className="chips">
          {mon.status && (
            <span className="chip">
              {STATUS_LABELS[mon.status]}
              {mon.status === 'slp' && ` (${mon.sleepTurns} turn${mon.sleepTurns === 1 ? '' : 's'} left)`}
              {mon.status === 'tox' && ` (next: ${Math.min(15, mon.toxicCounter + 1)}/16 HP)`}
            </span>
          )}
          {mon.confusion > 0 && <span className="chip">Confused</span>}
          {mon.substituteHp > 0 && <span className="chip">Substitute · {mon.substituteHp} HP</span>}
          {mon.taunt > 0 && <span className="chip">Taunted · {mon.taunt} turn{mon.taunt === 1 ? '' : 's'}</span>}
          {mon.encore && <span className="chip">Encore: {mon.build.moves[mon.encore.move]?.name} · {mon.encore.turns} turn{mon.encore.turns === 1 ? '' : 's'}</span>}
          {mon.leechSeed && <span className="chip">Seeded</span>}
          {mon.disable && <span className="chip">Disabled: {mon.build.moves[mon.disable.move]?.name} · {mon.disable.turns} turn{mon.disable.turns === 1 ? '' : 's'}</span>}
          {mon.torment && <span className="chip">Tormented</span>}
          {mon.yawn > 0 && <span className="chip">Drowsy · falls asleep at the end of {mon.yawn === 1 ? 'this turn' : 'next turn'}</span>}
          {mon.perishCount > 0 && <span className="chip down">Perish count {mon.perishCount}</span>}
          {lockedMove && <span className="chip">Locked into {lockedMove}</span>}
          {boosts.map((k) => (
            <span key={k} className={`chip ${mon.boosts[k] > 0 ? 'up' : 'down'}`}>
              {boostShort(k)} {mon.boosts[k] > 0 ? '+' : ''}{mon.boosts[k]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function pctOf(dmg: number, foe: BattlePokemon) {
  return Math.round((dmg / foe.stats.hp) * 1000) / 10;
}

/** Short damage preview text for a move against the relevant foe(s). */
function preview(battle: BattleState, mon: BattlePokemon, baseMove: Move, typeless: boolean, target?: TargetRef): string {
  const move = effectiveMove(battle, baseMove);
  if (move.category === 'Status' || move.power <= 0) return 'Status move';
  const fixed = move.effects.fixedDamage;
  const hits = move.special === 'beatUp'
    ? battle.sides[mon.side].mons.filter((m) => m === mon || (isAlive(m) && !m.status)).length
    : null;
  const [minHits, maxHits] = hits ? [hits, hits] : move.effects.multiHit ?? [1, 1];
  const foes = foesOf(battle, mon);
  const spreadTargets = move.target === 'adjacentFoes' || move.target === 'allAdjacent';
  let shown: BattlePokemon[] = foes;
  if (move.target === 'normal' && target) {
    const t = monAt(battle, target);
    if (isAlive(t)) shown = [t];
  }
  const ally = allyOf(battle, mon);
  const spreadCount = spreadTargets ? foes.length + (move.target === 'allAdjacent' && isAlive(ally) ? 1 : 0) : 1;
  const parts = shown.map((foe) => {
    const eff = typeEffectiveness(mon, foe, move, typeless);
    const side = battle.sides[foe.side];
    const prefix = shown.length > 1 || battle.format === 'doubles' ? `${foe.name}: ` : '';
    if (eff === 0) return `${prefix}no effect`;
    if (fixed !== undefined) {
      const amount = fixed === 'level' ? mon.build.level : fixed === 'halfHp' ? Math.max(1, Math.floor(foe.currentHp / 2)) : fixed;
      return `${prefix}${amount} HP (${pctOf(amount, foe)}%)`;
    }
    const perHit = hits ? { ...move, power: 5 + Math.floor(mon.build.baseStats.atk / 10) } : move;
    const range = damageRange(mon, foe, perHit, {
      ...fieldDamageOpts(battle),
      typeless, spread: spreadCount > 1,
      screen: move.category === 'Physical' ? side.reflect > 0 : side.lightScreen > 0,
      attackerAlly: ally, defenderAlly: allyOf(battle, foe),
    });
    if (!range) return `${prefix}no effect`;
    const tag = eff > 1 ? ' (SE)' : eff < 1 ? ' (resisted)' : '';
    const hitsTag = maxHits > 1 ? ` in ${minHits === maxHits ? minHits : `${minHits}–${maxHits}`} hits` : '';
    return `${prefix}${pctOf(range.min * minHits, foe)}–${pctOf(range.max * maxHits, foe)}%${tag}${hitsTag}`;
  });
  return parts.join(' · ');
}

function MovePicker({
  battle, mon, action, onSelect, onTarget, onRandom,
}: {
  battle: BattleState; mon: BattlePokemon; action: Action | undefined;
  onSelect: (c: MoveChoice) => void; onTarget: (t: TargetRef) => void; onRandom: () => void;
}) {
  const allowed = availableChoices(mon);
  const struggling = allowed[0] === STRUGGLE_INDEX;
  const slots: MoveChoice[] = struggling ? [STRUGGLE_INDEX] : mon.build.moves.map((_, i) => i);
  const selectedMove = action ? getChoiceMove(mon, action.move) : null;

  return (
    <div className="move-picker-wrap">
      <div className="move-picker">
        {slots.map((i) => {
          const base = i === STRUGGLE_INDEX ? getChoiceMove(mon, i) : mon.build.moves[i];
          if (!base) return <div key={i} className="move-btn empty">—</div>;
          const move = effectiveMove(battle, base);
          const disabled = !allowed.includes(i);
          const selected = action?.move === i;
          return (
            <button
              key={i}
              className={`move-btn${selected ? ' selected' : ''}`}
              disabled={disabled}
              onClick={() => onSelect(i)}
              style={{ ['--type-color' as string]: TYPE_COLORS[move.type] }}
              aria-pressed={selected}
            >
              <span className="move-name">{move.name}</span>
              <span className="move-meta">
                <TypeBadge type={move.type} small />
                <span>{move.category}</span>
                {i !== STRUGGLE_INDEX && <span>PP {mon.pp[i]}/{base.pp}</span>}
                {move.priority !== 0 && <span>{move.priority > 0 ? '+' : ''}{move.priority} priority</span>}
              </span>
              <span className="move-preview muted">{preview(battle, mon, base, i === STRUGGLE_INDEX, selected ? action?.target : undefined)}</span>
            </button>
          );
        })}
      </div>
      {selectedMove && moveNeedsTarget(battle, selectedMove) && (
        <div className="target-picker" role="radiogroup" aria-label={`${mon.name}'s target`}>
          <span className="muted">Target:</span>
          {validTargets(battle, mon).map((t) => {
            const m = monAt(battle, t)!;
            const on = action?.target?.side === t.side && action?.target?.slot === t.slot;
            return (
              <button key={`${t.side}${t.slot}`} role="radio" aria-checked={on} className={`small target-btn${on ? ' on' : ''}`} onClick={() => onTarget(t)}>
                {m.name}{m.side === mon.side ? ' (ally)' : ''}
              </button>
            );
          })}
        </div>
      )}
      <button className="ghost small random-btn" onClick={onRandom}>Random move</button>
    </div>
  );
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
          Level {bd.level} · Power {bd.power}{bd.powerNotes.length > 0 && ` (${bd.movePower}, ${bd.powerNotes.join(', ')})`}
          {' · '}{bd.attackLabel} {bd.attack}{bd.attackNotes.length > 0 && ` (${bd.attackNotes.join(', ')})`}
          {' · '}{bd.defenseLabel} {bd.defense}{bd.defenseNotes.length > 0 && ` (${bd.defenseNotes.join(', ')})`}
        </div>
        <div className="math-table">
          <table>
            <tbody>
              {bd.steps.map((s, i) => (
                <tr key={i}><td>{s.label}</td><td className="mult">{s.multiplier}</td><td className="res">{s.result}</td></tr>
              ))}
              <tr className="total"><td>Damage</td><td /><td className="res">{bd.damage}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
