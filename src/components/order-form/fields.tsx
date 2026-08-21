'use client';

import type { ReactNode } from 'react';

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
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        className="mt-1"
        type="number"
        min={min}
        data-testid={testId}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
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
  columns?: 2 | 3;
  allowClear?: boolean;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-muted">{label}</span>
      <div
        className={`mt-1.5 grid gap-2 ${columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}
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
export function SizeSelect({
  label,
  value,
  options,
  onChange,
  otherToken = 'Other',
}: {
  label?: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  otherToken?: string;
}) {
  const known = value === '' || options.includes(value);
  return (
    <div className="space-y-1">
      {label && <span className="text-xs font-medium text-muted">{label}</span>}
      <select
        value={known ? value : otherToken}
        onChange={(e) => onChange(e.target.value === otherToken ? ' ' : e.target.value)}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={otherToken}>{otherToken}…</option>
      </select>
      {!known && (
        <input
          autoFocus
          value={value.trim()}
          placeholder="Specify size"
          onChange={(e) => onChange(e.target.value || ' ')}
        />
      )}
    </div>
  );
}
