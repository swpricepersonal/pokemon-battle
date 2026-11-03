import { useEffect, useRef, useState } from 'react';
import { abilityName } from '../engine/abilities';
import {
  STRUGGLE_INDEX, SWITCH_INDEX, activeWeather, allMons, allyOf, availableChoices, benchOptions, defaultTarget, effectiveMove,
  effectiveSpeed, fieldDamageOpts, foesOf, getChoiceMove, isAlive, lockedReason, monAt, moveNeedsTarget, oneOnOne, replacementKey,
  validTargets,
} from '../engine/battle';
import type { Action, BattleState, LogEntry, MoveChoice, Side, TargetRef, TurnChoices } from '../engine/battle';
import { damageRange, typeEffectiveness, typesOf } from '../engine/damage';
import { BOOSTABLE_STATS, CUSTOM_ABILITY, HAZARDS, HIDDEN_LABELS, HAZARD_LABELS, HAZARD_MAX, STATUS_LABELS, TERRAIN_LABELS, WEATHER_LABELS } from '../engine/types';
import type { BattlePokemon, Move } from '../engine/types';
import { NumField, StatusBadge, TYPE_COLORS, TypeBadge } from './common';

export function BattleView({
  battle, onRunTurn, onReplace, onSetHp, onEnd, onRematch, onExit,
}: {
  battle: BattleState;
  onRunTurn: (choices: TurnChoices) => void;
  onReplace: (picks: Record<string, number>) => void;
  onSetHp: (uid: string, hp: number) => void;
  onEnd: () => void;
  onRematch: () => void;
  onExit: () => void;
}) {
  const [choices, setChoices] = useState<TurnChoices>({});
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [confirmEnd, setConfirmEnd] = useState(false);
  const pendingKey = battle.pendingReplacements.map(replacementKey).join(',');
  useEffect(() => { setChoices({}); }, [battle.turn, pendingKey]);
  useEffect(() => {
    // Pre-pick a different healthy bench Pokémon for each position that needs one.
    const next: Record<string, number> = {};
    for (const ref of battle.pendingReplacements) {
      const taken = Object.entries(next).filter(([k]) => k.startsWith(`${ref.side}:`)).map(([, v]) => v);
      const free = benchOptions(battle, ref.side).find((i) => !taken.includes(i));
      if (free !== undefined) next[replacementKey(ref)] = free;
    }
    setPicks(next);
  }, [pendingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const over = battle.winner !== null;
  const pending = !over && battle.pendingReplacements.length > 0;
  // Pokémon finishing a two-turn move or recharging have no choice to make.
  const actors = allMons(battle).filter((m) => isAlive(m) && !lockedReason(m));
  const ready = actors.every((m) => choices[m.uid] !== undefined);
  const doubles = battle.format === 'doubles';
  const titled = !oneOnOne(battle);

  const choose = (mon: BattlePokemon, move: MoveChoice, target?: TargetRef) => {
    const m = getChoiceMove(mon, move);
    const prev = choices[mon.uid];
    const t = moveNeedsTarget(battle, m) ? target ?? prev?.target ?? defaultTarget(battle, mon) : undefined;
    setChoices((p) => ({ ...p, [mon.uid]: { move, target: t, ...(prev?.pivotTo !== undefined ? { pivotTo: prev.pivotTo } : {}) } }));
  };
  const randomAction = (mon: BattlePokemon): Action => {
    const opts = availableChoices(mon);
    const move = opts[Math.floor(Math.random() * opts.length)];
    const targets = validTargets(battle, mon).filter((t) => t.side !== mon.side);
    const target = moveNeedsTarget(battle, getChoiceMove(mon, move)) ? targets[Math.floor(Math.random() * targets.length)] : undefined;
    return { move, target };
  };
  const randomAll = () => setChoices(Object.fromEntries(actors.map((m) => [m.uid, randomAction(m)])));
  /** Bench Pokémon another active Pokémon on the same side has already chosen to switch to. */
  const claimedBy = (mon: BattlePokemon) => actors
    .filter((m) => m !== mon && m.side === mon.side)
    .flatMap((m) => (choices[m.uid]?.switchTo !== undefined ? [choices[m.uid].switchTo!] : []));

  const winnerText = battle.winner === 'stopped'
    ? 'Battle stopped.'
    : battle.winner === 'draw'
      ? 'Draw!'
      : battle.winner !== null
        ? `${titled ? `Player ${battle.winner + 1}` : battle.sides[battle.winner].team[0].name} wins!`
        : '';

  return (
    <div className="battle">
      <FieldConditions battle={battle} />
      <div className={`field ${doubles ? 'doubles' : 'singles'}`}>
        {([0, 1] as Side[]).map((side) => (
          <div key={side} className={`side-col side-${side}`}>
            {titled && <h2 className="side-title"><span className={`side-tag side-${side}`}>P{side + 1}</span> Player {side + 1}</h2>}
            {battle.sides[side].mons.map((mon, slot) => {
              const ref = { side, slot };
              const needs = pending && battle.pendingReplacements.some((r) => r.side === side && r.slot === slot);
              return (
                <div key={`${slot}-${mon.uid}`} className={`combatant side-${side}`}>
                  <MonCard battle={battle} mon={mon} slot={slot} onSetHp={over ? undefined : (hp) => onSetHp(mon.uid, hp)} />
                  {needs && (
                    <ReplacementPicker
                      battle={battle} at={ref} picks={picks}
                      onPick={(i) => setPicks((p) => ({ ...p, [replacementKey(ref)]: i }))}
                    />
                  )}
                  {!over && !pending && isAlive(mon) && lockedReason(mon) && <div className="locked-note">{lockedReason(mon)}</div>}
                  {!over && !pending && isAlive(mon) && !lockedReason(mon) && (
                    <MovePicker
                      battle={battle}
                      mon={mon}
                      action={choices[mon.uid]}
                      claimed={claimedBy(mon)}
                      onSelect={(c) => choose(mon, c)}
                      onTarget={(t) => choices[mon.uid] && choose(mon, choices[mon.uid].move, t)}
                      onSwitch={(i) => setChoices((p) => ({ ...p, [mon.uid]: { move: SWITCH_INDEX, switchTo: i } }))}
                      onPivot={(i) => setChoices((p) => (p[mon.uid] ? { ...p, [mon.uid]: { ...p[mon.uid], pivotTo: i } } : p))}
                      onRandom={() => setChoices((prev) => ({ ...prev, [mon.uid]: randomAction(mon) }))}
                    />
                  )}
                </div>
              );
            })}
            <Bench battle={battle} side={side} onSetHp={over ? undefined : onSetHp} />
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
            {pending ? (
              <button className="primary big" onClick={() => onReplace(picks)}>Send in</button>
            ) : (
              <>
                <button className="primary big" disabled={!ready} onClick={() => ready && onRunTurn(choices)}>
                  {ready ? `Run turn ${battle.turn + 1}` : `Choose an action for each Pokémon (${actors.filter((m) => choices[m.uid]).length}/${actors.length})`}
                </button>
                <button onClick={randomAll}>Random moves</button>
              </>
            )}
            <button className="ghost" onClick={onRematch}>Restart</button>
            {confirmEnd ? (
              <>
                <button className="danger" onClick={() => { setConfirmEnd(false); onEnd(); }}>Confirm: end battle</button>
                <button className="ghost" onClick={() => setConfirmEnd(false)}>Keep playing</button>
              </>
            ) : (
              <button className="ghost" onClick={() => setConfirmEnd(true)} title="Stop the battle here; the log stays on screen">End battle</button>
            )}
            <button className="ghost" onClick={onExit} title="The battle is kept; resume it from the builder">Back to builder</button>
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
  if (battle.trickRoom) chips.push(`Trick Room · ${turns(battle.trickRoom)}`);
  if (battle.wonderRoom) chips.push(`Wonder Room · ${turns(battle.wonderRoom)}`);
  if (battle.magicRoom) chips.push(`Magic Room · ${turns(battle.magicRoom)}`);
  battle.sides.forEach((side, i) => {
    const who = `P${i + 1}`;
    if (side.tailwind) chips.push(`${who} Tailwind · ${side.tailwind} left`);
    if (side.reflect) chips.push(`${who} Reflect · ${side.reflect} left`);
    if (side.lightScreen) chips.push(`${who} Light Screen · ${side.lightScreen} left`);
    for (const h of HAZARDS) {
      const n = side.hazards[h];
      if (n) chips.push(`${who} side: ${HAZARD_LABELS[h]}${HAZARD_MAX[h] > 1 ? ` ×${n}` : ''}`);
    }
  });
  if (!chips.length) return null;
  return <div className="field-conditions">{chips.map((c) => <span key={c} className="chip field-chip">{c}</span>)}</div>;
}

/** Inline editor for a Pokémon's HP as a percentage of its max HP. */
function HpEditor({ mon, onSet }: { mon: BattlePokemon; onSet: (hp: number) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => Math.round((mon.currentHp / mon.stats.hp) * 100));
  if (!open) {
    return (
      <button className="small ghost hp-edit-btn" onClick={() => { setValue(Math.round((mon.currentHp / mon.stats.hp) * 100)); setOpen(true); }}>
        Set HP
      </button>
    );
  }
  const hp = value <= 0 ? 0 : Math.max(1, Math.round((mon.stats.hp * value) / 100));
  return (
    <span className="hp-editor">
      <NumField value={value} min={0} max={100} onChange={setValue} title="Percent of max HP" />%
      <span className="muted">= {hp} HP{hp === 0 ? ' (faints)' : ''}</span>
      <button className="small primary" onClick={() => { onSet(hp); setOpen(false); }}>Set</button>
      <button className="small ghost" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}

function hpColor(frac: number) {
  return frac > 0.5 ? 'var(--hp-high)' : frac > 0.2 ? 'var(--hp-mid)' : 'var(--hp-low)';
}

const boostShort = (k: string) => (k === 'accuracy' ? 'Acc' : k === 'evasion' ? 'Eva' : k.toUpperCase());

function MonCard({ battle, mon, slot, onSetHp }: { battle: BattleState; mon: BattlePokemon; slot: number; onSetHp?: (hp: number) => void }) {
  const frac = mon.currentHp / mon.stats.hp;
  const boosts = BOOSTABLE_STATS.filter((k) => mon.boosts[k] !== 0);
  const speed = effectiveSpeed(battle, mon);
  const ability = mon.ability ? abilityName(mon) : '';
  const abilityChanged = mon.ability !== mon.build.ability || (mon.ability === CUSTOM_ABILITY && mon.customAbility !== mon.build.customAbility && JSON.stringify(mon.customAbility) !== JSON.stringify(mon.build.customAbility));
  const heldItem = mon.build.item;
  const lockedMove = mon.choiceLock !== null ? mon.build.moves[mon.choiceLock]?.name : null;
  const tag = battle.format === 'doubles' ? `P${mon.side + 1}${'AB'[slot]}` : `P${mon.side + 1}`;
  return (
    <div className={`mon-card${mon.currentHp <= 0 ? ' fainted' : ''}`}>
      <div className="mon-title">
        <span className={`side-tag side-${mon.side}`}>{tag}</span>
        <strong>{mon.name}</strong>
        <span className="muted">Lv {mon.build.level}</span>
        {mon.status && <StatusBadge status={mon.status} />}
        {mon.currentHp <= 0 && <span className="muted">Fainted</span>}
      </div>
      <div className="types-line">
        {typesOf(mon).map((t) => <TypeBadge key={t} type={t} small />)}
        {(ability || heldItem || mon.item || abilityChanged) && (
          <span className="mon-ability muted">
            {ability || (abilityChanged ? 'No ability' : '')}{abilityChanged && <em title={`Originally ${mon.build.ability === CUSTOM_ABILITY ? mon.build.customAbility?.name : mon.build.ability || 'none'}`}> (changed)</em>}
            {(ability || abilityChanged) && (heldItem || mon.item) && ' · '}
            {mon.item
              ? mon.itemsSuppressed ? <s title="No effect in Magic Room">{mon.item}</s> : <>{mon.item}{mon.item !== heldItem && <em> (new)</em>}</>
              : heldItem && <s title="Used up or lost">{heldItem}</s>}
          </span>
        )}
      </div>
      <div className="hp-bar" role="meter" aria-valuenow={mon.currentHp} aria-valuemin={0} aria-valuemax={mon.stats.hp} aria-label={`${mon.name} HP`}>
        <div className="hp-fill" style={{ width: `${frac * 100}%`, background: hpColor(frac) }} />
      </div>
      <div className="hp-text">
        <span>{mon.currentHp} / {mon.stats.hp} HP</span>
        <span className="hp-right">
          {onSetHp && <HpEditor key={mon.uid} mon={mon} onSet={onSetHp} />}
          <span className="muted">{Math.round(frac * 100)}%</span>
        </span>
      </div>
      <div className="mon-stats muted">
        Atk {mon.stats.atk} · Def {mon.stats.def} · SpA {mon.stats.spa} · SpD {mon.stats.spd} · Spe {mon.stats.spe}
        {speed !== mon.stats.spe && <> (effective {speed})</>}
      </div>
      {(boosts.length > 0 || mon.status || lockedMove || mon.confusion > 0 || mon.substituteHp > 0 || mon.taunt > 0 || mon.encore || mon.leechSeed
        || mon.disable || mon.torment || mon.yawn > 0 || mon.perishCount > 0 || mon.healBlock > 0 || mon.charging || mon.mustRecharge) && (
        <div className="chips">
          {mon.status && (
            <span className="chip">
              {STATUS_LABELS[mon.status]}
              {mon.status === 'slp' && ` (${mon.sleepTurns} turn${mon.sleepTurns === 1 ? '' : 's'} left)`}
              {mon.status === 'tox' && ` (next: ${Math.min(15, mon.toxicCounter + 1)}/16 HP)`}
            </span>
          )}
          {mon.confusion > 0 && <span className="chip">Confused</span>}
          {mon.charging && (
            <span className="chip">
              Charging {mon.build.moves[mon.charging.move]?.name}{mon.charging.hide ? ` · ${HIDDEN_LABELS[mon.charging.hide].split(' (')[0]}` : ''}
            </span>
          )}
          {mon.mustRecharge && <span className="chip down">Must recharge</span>}
          {mon.substituteHp > 0 && <span className="chip">Substitute · {mon.substituteHp} HP</span>}
          {mon.taunt > 0 && <span className="chip">Taunted · {mon.taunt} turn{mon.taunt === 1 ? '' : 's'}</span>}
          {mon.healBlock > 0 && <span className="chip down">Heal Block · {mon.healBlock} turn{mon.healBlock === 1 ? '' : 's'}</span>}
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

/** The team members waiting off the field. */
function Bench({ battle, side, onSetHp }: { battle: BattleState; side: Side; onSetHp?: (uid: string, hp: number) => void }) {
  const s = battle.sides[side];
  const benched = s.team.filter((m) => !s.mons.includes(m));
  if (!benched.length) return null;
  return (
    <div className="bench">
      <span className="muted bench-title">Bench</span>
      <ul>
        {benched.map((m) => {
          const frac = m.currentHp / m.stats.hp;
          return (
            <li key={m.uid} className={m.currentHp <= 0 ? 'fainted' : ''}>
              <span className="bench-name"><strong>{m.name}</strong>{m.status && <StatusBadge status={m.status} />}</span>
              <span className="types-line">{typesOf(m).map((t) => <TypeBadge key={t} type={t} small />)}</span>
              <span className="bench-hp">
                <span className="hp-bar small"><span className="hp-fill" style={{ width: `${frac * 100}%`, background: hpColor(frac) }} /></span>
                <span className="muted">{m.currentHp <= 0 ? 'Fainted' : `${Math.round(frac * 100)}%`}</span>
              </span>
              {onSetHp && <HpEditor key={m.uid} mon={m} onSet={(hp) => onSetHp(m.uid, hp)} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReplacementPicker({
  battle, at, picks, onPick,
}: { battle: BattleState; at: TargetRef; picks: Record<string, number>; onPick: (i: number) => void }) {
  const key = replacementKey(at);
  const taken = Object.entries(picks).filter(([k]) => k !== key && k.startsWith(`${at.side}:`)).map(([, v]) => v);
  return (
    <div className="replacement">
      <strong>Player {at.side + 1}: choose a Pokémon to send in</strong>
      <div className="target-picker" role="radiogroup">
        {benchOptions(battle, at.side).map((i) => {
          const m = battle.sides[at.side].team[i];
          const on = picks[key] === i;
          return (
            <button key={i} role="radio" aria-checked={on} disabled={taken.includes(i)} className={`small target-btn${on ? ' on' : ''}`} onClick={() => onPick(i)}>
              {m.name} <span className="pct">{Math.round((m.currentHp / m.stats.hp) * 100)}%</span>
            </button>
          );
        })}
      </div>
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
    ? battle.sides[mon.side].team.filter((m) => m === mon || (isAlive(m) && !m.status)).length
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
  battle, mon, action, claimed, onSelect, onTarget, onSwitch, onPivot, onRandom,
}: {
  battle: BattleState; mon: BattlePokemon; action: Action | undefined; claimed: number[];
  onSelect: (c: MoveChoice) => void; onTarget: (t: TargetRef) => void; onSwitch: (i: number) => void; onPivot: (i: number) => void;
  onRandom: () => void;
}) {
  const allowed = availableChoices(mon);
  const struggling = allowed[0] === STRUGGLE_INDEX;
  const slots: MoveChoice[] = struggling ? [STRUGGLE_INDEX] : mon.build.moves.map((_, i) => i);
  const switching = action?.switchTo !== undefined;
  const selectedMove = action && !switching ? getChoiceMove(mon, action.move) : null;
  const team = battle.sides[mon.side].team;
  const bench = benchOptions(battle, mon.side);
  const pivotOptions = bench.filter((i) => !claimed.includes(i));
  const pivots = !!selectedMove?.effects.selfSwitch && pivotOptions.length > 0;
  const pivotTo = action?.pivotTo !== undefined && pivotOptions.includes(action.pivotTo) ? action.pivotTo : pivotOptions[0];
  const pctOfMax = (m: BattlePokemon) => Math.round((m.currentHp / m.stats.hp) * 100);

  return (
    <div className="move-picker-wrap">
      <div className="move-picker">
        {slots.map((i) => {
          const base = i === STRUGGLE_INDEX ? getChoiceMove(mon, i) : mon.build.moves[i];
          if (!base) return <div key={i} className="move-btn empty">—</div>;
          const move = effectiveMove(battle, base);
          const disabled = !allowed.includes(i);
          const selected = !switching && action?.move === i;
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
      {pivots && (
        <div className="target-picker" role="radiogroup" aria-label={`Who comes in after ${selectedMove!.name}`}>
          <span className="muted">Then send in:</span>
          {pivotOptions.map((i) => (
            <button key={i} role="radio" aria-checked={pivotTo === i} className={`small target-btn${pivotTo === i ? ' on' : ''}`} onClick={() => onPivot(i)}>
              {team[i].name} <span className="pct">{pctOfMax(team[i])}%</span>
            </button>
          ))}
        </div>
      )}
      {bench.length > 0 && (
        <div className="target-picker switch-picker" role="radiogroup" aria-label={`Switch ${mon.name} out`}>
          <span className="muted">Switch to:</span>
          {bench.map((i) => {
            const on = action?.switchTo === i;
            return (
              <button
                key={i} role="radio" aria-checked={on} disabled={claimed.includes(i)}
                title={claimed.includes(i) ? 'Your other Pokémon is already switching to it' : undefined}
                className={`small target-btn${on ? ' on' : ''}`} onClick={() => onSwitch(i)}
              >
                {team[i].name} <span className="pct">{pctOfMax(team[i])}%</span>
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
