'use client';

import { useState } from 'react';
import type { ScriptItem, ScriptSection } from '@/lib/types';
import { SCRIPT_SECTIONS } from '@/lib/types';
import { ChoiceGroup, Toggle } from '@/components/order-form/fields';

const SECTION_LABEL: Record<ScriptSection, string> = {
  opening: 'Opening', discovery: 'Discovery', objections: 'Objections', close: 'Close',
};

/**
 * The script for THIS contact: items already filtered by Show When and with
 * placeholders filled (index.tsx does that). Reminders tick, questions answer,
 * objections stay folded until needed.
 */
export function ScriptPanel({
  items, answers, checklist, onAnswer, onTick, disabled,
}: {
  items: ScriptItem[];
  answers: Record<string, string>;
  checklist: string[];
  onAnswer: (id: string, value: string) => void;
  onTick: (id: string, on: boolean) => void;
  disabled: boolean;
}) {
  const [objectionsOpen, setObjectionsOpen] = useState(false);
  if (items.length === 0) return <p className="text-sm text-muted">This list has no script. Add a Script tab to the sheet and re-upload.</p>;

  return (
    <div className="space-y-5">
      {SCRIPT_SECTIONS.map((section) => {
        const rows = items.filter((i) => i.section === section);
        if (rows.length === 0) return null;
        if (section === 'objections') {
          return (
            <div key={section}>
              <button
                type="button"
                onClick={() => setObjectionsOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2 text-left text-sm font-bold uppercase tracking-wide text-ppc-gold hover:border-ppc-gold/60"
                aria-expanded={objectionsOpen}
              >
                <span>Objections <span className="ml-1 text-muted">{rows.length}</span></span>
                <span aria-hidden>{objectionsOpen ? '▾' : '▸'}</span>
              </button>
              {objectionsOpen && (
                <dl className="mt-2 space-y-3">
                  {rows.map((r) => (
                    <div key={r.id} className="rounded-lg border border-line p-3 text-sm">
                      <dt className="font-semibold">“{r.text}”</dt>
                      <dd className="mt-1 text-muted">{r.response || '—'}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          );
        }
        return (
          <div key={section} className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-ppc-gold">{SECTION_LABEL[section]}</h3>
            {rows.map((r) => {
              switch (r.kind) {
                case 'read':
                  return <p key={r.id} className="rounded-lg border-l-2 border-ppc-gold/60 bg-surface-2 px-3 py-2 text-[0.95rem] leading-relaxed">{r.text}</p>;
                case 'reminder':
                  return (
                    <div key={r.id} className={disabled ? 'pointer-events-none opacity-60' : ''}>
                      <Toggle label={r.text} checked={checklist.includes(r.id)} onChange={(on) => onTick(r.id, on)} />
                    </div>
                  );
                case 'question':
                  return r.options.length > 0 ? (
                    <div key={r.id} className={disabled ? 'pointer-events-none opacity-60' : ''}>
                      <ChoiceGroup
                        label={r.text}
                        choices={r.options.map((o) => ({ value: o, label: o }))}
                        value={answers[r.id] ?? null}
                        onChange={(v) => onAnswer(r.id, v ?? '')}
                        columns={3}
                        allowClear
                      />
                    </div>
                  ) : (
                    <label key={r.id} className="block text-sm">
                      <span className="font-medium">{r.text}</span>
                      <input className="mt-1" value={answers[r.id] ?? ''} disabled={disabled} placeholder="Answer" onChange={(e) => onAnswer(r.id, e.target.value)} />
                    </label>
                  );
                default:
                  return null;
              }
            })}
          </div>
        );
      })}
    </div>
  );
}
