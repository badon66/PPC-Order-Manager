'use client';

import { useState, type ReactNode } from 'react';

export function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ppc-gold">{title}</h2>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  hint,
  error,
  warning,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'date' | 'url' | 'email' | 'tel';
  hint?: string;
  /** Blocking: the value was not saved. */
  error?: string;
  /** Non-blocking: the value WAS saved, but is worth a look. */
  warning?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        className="mt-1"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
      />
      {error ? (
        <span className="mt-1 block text-xs font-semibold text-red-300">{error}</span>
      ) : warning ? (
        <span className="mt-1 block text-xs font-semibold text-amber-300">{warning}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <textarea
        className="mt-1"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  /** Stable hook for tests — repeated labels inside set cards aren't unique. */
  testId?: string;
}) {
  /*
   * The box holds its own text while it's being typed in (2026-11-12). It used
   * to turn an emptied box straight into `min`: backspacing "3" to type "4" in
   * Number of Sets committed 1 for an instant — and set 2 onward, their
   * quantities and their keepers were gone. Now an empty box commits nothing
   * until you type a number or leave it.
   */
  const shown = Number.isFinite(value) ? String(value) : '0';
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        className="mt-1"
        type="number"
        min={min}
        inputMode="numeric"
        data-testid={testId}
        value={editing ? text : shown}
        onFocus={() => {
          setText(shown);
          setEditing(true);
        }}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.trim() === '') return;
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.floor(n)));
        }}
        onBlur={() => {
          setEditing(false);
          if (text.trim() === '' && value !== min) onChange(min);
        }}
      />
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
        checked
          ? 'border-ppc-gold/70 bg-ppc-gold/10 text-ppc-gold'
          : 'border-line bg-surface-2 text-muted hover:border-line'
      }`}
    >
      <span>{label}</span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-ppc-gold' : 'bg-line'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-black transition-all ${
            checked ? 'left-[1.15rem]' : 'left-0.5 bg-[#6a6a70]'
          }`}
        />
      </span>
    </button>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  blurb?: string;
}

export function ChoiceGroup<T extends string>({
  label,
  choices,
  value,
  onChange,
  columns = 3,
  allowClear = false,
}: {
  label: string;
  choices: ReadonlyArray<Choice<T>>;
  value: T | null;
  onChange: (v: T | null) => void;
  columns?: 1 | 2 | 3;
  allowClear?: boolean;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-muted">{label}</span>
      <div
        className={`mt-1.5 grid gap-2 ${columns === 1 ? '' : columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}
      >
        {choices.map((c) => {
          const active = value === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange(active && allowClear ? null : c.value)}
              className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                active
                  ? 'border-ppc-gold bg-ppc-gold/10 text-ppc-gold'
                  : 'border-line bg-surface-2 hover:border-ppc-gold/50'
              }`}
            >
              <span className="font-semibold">{c.label}</span>
              {c.blurb && <span className="mt-0.5 block text-xs text-muted">{c.blurb}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Controlled size picker. Free text only behind an explicit "Other". */
import { sizeLabel } from '@/lib/constants';
export { sizeLabel };

export function SizeSelect({
  label,
  value,
  options,
  onChange,
  otherToken = 'Other',
  compact = false,
}: {
  label?: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  otherToken?: string;
  /**
   * The roster's narrow columns: the chosen size is drawn as text that wraps
   * ("Youth" over "S/M") instead of a native box that cuts it to "Senic",
   * with the real select laid invisibly over it so it still opens the same.
   */
  compact?: boolean;
}) {
  const known = value === '' || options.includes(value);
  const select = (
    <select
      value={known ? value : otherToken}
      onChange={(e) => onChange(e.target.value === otherToken ? ' ' : e.target.value)}
      className={compact ? 'absolute inset-0 h-full w-full cursor-pointer opacity-0' : undefined}
      aria-label={label}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {sizeLabel(o)}
        </option>
      ))}
      <option value={otherToken}>{otherToken}…</option>
    </select>
  );
  return (
    <div className="space-y-1">
      {label && <span className="text-xs font-medium text-muted">{label}</span>}
      {compact ? (
        <div className="relative flex min-h-10 items-center justify-between gap-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs font-semibold leading-tight focus-within:border-ppc-gold">
          <span className={value.trim() || !known ? '' : 'text-muted'}>
            {known ? (value ? sizeLabel(value) : '—') : `${otherToken}…`}
          </span>
          <span aria-hidden className="text-[10px] text-muted">▾</span>
          {select}
        </div>
      ) : (
        select
      )}
      {!known && (
        <input
          autoFocus
          // ' ' alone means "Other picked, nothing typed yet"; anything else is
          // shown as typed — trimming it ate the space in "Senior XL".
          value={value === ' ' ? '' : value}
          placeholder="Specify size"
          onChange={(e) => onChange(e.target.value || ' ')}
        />
      )}
    </div>
  );
}

/**
 * Dollars, cents allowed (2026-11-12). The old box kept digits only, so
 * typing or pasting "1850.50" stored 185050. One decimal point, two places,
 * and commas and $ are ignored.
 */
export function cleanMoneyText(raw: string): string {
  const s = raw.replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  return dot === -1 ? s : `${s.slice(0, dot)}.${s.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`;
}

export function MoneyInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const shown = value === null || value === undefined ? '' : String(value);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  return (
    <input
      className={className}
      inputMode="decimal"
      value={editing ? text : shown}
      placeholder={placeholder}
      onFocus={() => {
        setText(shown);
        setEditing(true);
      }}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        const t = cleanMoneyText(e.target.value);
        setText(t);
        if (t === '' || t === '.') onChange(null);
        else onChange(Math.round(Number(t) * 100) / 100);
      }}
    />
  );
}
