import { useEffect, useState } from 'react';
import type { MajorStatus, TypeName } from '../engine/types';

export const TYPE_COLORS: Record<TypeName, string> = {
  Normal: '#9fa19f', Fire: '#e62829', Water: '#2980ef', Electric: '#fac000', Grass: '#3fa129', Ice: '#3dcef3',
  Fighting: '#ff8000', Poison: '#9141cb', Ground: '#915121', Flying: '#81b9ef', Psychic: '#ef4179', Bug: '#91a119',
  Rock: '#afa981', Ghost: '#704170', Dragon: '#5060e1', Dark: '#624d4e', Steel: '#60a1b8', Fairy: '#ef70ef',
};

const DARK_TEXT = new Set<TypeName>(['Electric', 'Ice', 'Flying', 'Rock', 'Normal']);

export function TypeBadge({ type, small }: { type: TypeName; small?: boolean }) {
  return (
    <span
      className={`type-badge${small ? ' small' : ''}`}
      style={{ background: TYPE_COLORS[type], color: DARK_TEXT.has(type) ? '#1a1a1a' : '#fff' }}
    >
      {type}
    </span>
  );
}

export const STATUS_SHORT: Record<MajorStatus, string> = {
  brn: 'BRN', par: 'PAR', psn: 'PSN', tox: 'TOX', slp: 'SLP', frz: 'FRZ',
};

export function StatusBadge({ status }: { status: MajorStatus }) {
  return <span className={`status-badge status-${status}`}>{STATUS_SHORT[status]}</span>;
}

/**
 * Number input that lets you clear the field while typing; it commits clamped
 * integers as you type and snaps back to a valid value on blur.
 */
export function NumField({
  value, onChange, min, max, className, disabled, title,
}: {
  value: number; onChange: (n: number) => void; min: number; max: number;
  className?: string; disabled?: boolean; title?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <input
      type="number"
      inputMode="numeric"
      className={`num ${className ?? ''}`}
      value={text}
      min={min}
      max={max}
      disabled={disabled}
      title={title}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseInt(e.target.value, 10);
        if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

/**
 * Picker for small signed numbers (stat stages, priority). A select instead of a number field, because
 * phone number pads have no minus key, which made negative values impossible to type.
 */
export function StageSelect({
  value, onChange, min = -6, max = 6, label, className,
}: { value: number; onChange: (n: number) => void; min?: number; max?: number; label?: string; className?: string }) {
  const options: number[] = [];
  for (let n = max; n >= min; n--) options.push(n);
  return (
    <select className={`stage ${className ?? ''}`} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((n) => <option key={n} value={n}>{n > 0 ? `+${n}` : n}</option>)}
    </select>
  );
}
