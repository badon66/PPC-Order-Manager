'use client';

import { useState } from 'react';
import type { Contact, JerseyManagerAnswer, ScriptItem, ScriptSection } from '@/lib/types';
import { SCRIPT_SECTIONS } from '@/lib/types';
import { SALES_PICKLISTS } from '@/lib/constants';
import { ChoiceGroup, Toggle } from '@/components/order-form/fields';

const SECTION_LABEL: Record<ScriptSection, string> = {
  opening: 'Opening', discovery: 'Discovery', objections: 'Objections', close: 'Close',
};

const CHOICE = 'rounded-lg border px-3 py-2.5 text-left text-sm transition-colors';
const ACTIVE = 'border-ppc-gold bg-ppc-gold/10 text-ppc-gold';
const INACTIVE = 'border-line bg-surface-2 hover:border-ppc-gold/50';

const NEW_PERSON = '__new__';

/**
 * "Who handles the jerseys?" — This person, or someone else. Someone else is
 * either a contact already known at this team (they stay separate rows; this
 * only flags who manages the jerseys) or someone new, who becomes a new
 * linked row on save.
 */
function JerseyManagerQuestion({
  item, linked, value, onChange, onAnswer, disabled,
}: {
  item: ScriptItem;
  linked: Contact[];
  value: JerseyManagerAnswer;
  onChange: (p: Partial<JerseyManagerAnswer>) => void;
  onAnswer: (label: string) => void;
  disabled: boolean;
}) {
  const hasPersonText = !!(value.person.name || value.person.phone || value.person.email);
  const [pickedNew, setPickedNew] = useState(hasPersonText);
  const who = value.existingContactId || (pickedNew || hasPersonText ? NEW_PERSON : '');
  const showFields = value.answer === 'other' && (linked.length === 0 || who === NEW_PERSON);
  const person = (p: Partial<JerseyManagerAnswer['person']>) => onChange({ person: { ...value.person, ...p } });

  const pick = (answer: 'self' | 'other') => {
    if (value.answer === answer) { onChange({ answer: '', existingContactId: '' }); onAnswer(''); return; }
    onChange({ answer, existingContactId: '' });
    onAnswer(answer === 'self' ? 'This person' : 'Someone else');
  };

  return (
    <div className={disabled ? 'pointer-events-none opacity-60' : ''}>
      <p className="text-sm font-medium">{item.text}</p>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        <button type="button" aria-pressed={value.answer === 'self'} onClick={() => pick('self')} className={`${CHOICE} ${value.answer === 'self' ? ACTIVE : INACTIVE}`}>This person</button>
        <button type="button" aria-pressed={value.answer === 'other'} onClick={() => pick('other')} className={`${CHOICE} ${value.answer === 'other' ? ACTIVE : INACTIVE}`}>Someone else</button>
      </div>
      {value.answer === 'other' && linked.length > 0 && (
        <label className="mt-3 block text-sm">
          <span className="text-xs font-medium text-muted">Who?</span>
          <select
            className="mt-1"
            value={who}
            onChange={(e) => {
              const v = e.target.value;
              if (v === NEW_PERSON) { setPickedNew(true); onChange({ existingContactId: '' }); }
              else { setPickedNew(false); onChange({ existingContactId: v }); }
            }}
          >
            <option value="">— choose —</option>
            {linked.map((c) => (
              <option key={c.id} value={c.id}>{c.contactName || c.orgName}{c.role ? ` — ${c.role}` : ''}</option>
            ))}
            <option value={NEW_PERSON}>Someone new…</option>
          </select>
        </label>
      )}
      {showFields && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm"><span className="text-xs font-medium text-muted">Name</span><input className="mt-1" value={value.person.name} onChange={(e) => person({ name: e.target.value })} /></label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted">Role</span>
            <select className="mt-1" value={value.person.role} onChange={(e) => person({ role: e.target.value })}>
              <option value="">—</option>
              {SALES_PICKLISTS.role.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="block text-sm"><span className="text-xs font-medium text-muted">Phone</span><input className="mt-1" type="tel" value={value.person.phone} onChange={(e) => person({ phone: e.target.value })} /></label>
          <label className="block text-sm"><span className="text-xs font-medium text-muted">Email</span><input className="mt-1" type="email" value={value.person.email} onChange={(e) => person({ email: e.target.value })} /></label>
          <label className="block text-sm sm:col-span-2"><span className="text-xs font-medium text-muted">Note</span><input className="mt-1" value={value.person.note} onChange={(e) => person({ note: e.target.value })} placeholder="best time, what they said…" /></label>
          <p className="text-xs text-muted sm:col-span-2">Saving adds them to this list as a linked contact, marked as the jersey manager, right after this one.</p>
        </div>
      )}
    </div>
  );
}

/**
 * The script for THIS contact: items already filtered by Show When and with
 * placeholders filled (index.tsx does that). Reminders tick, questions answer,
 * objections stay folded until needed.
 */
export function ScriptPanel({
  items, answers, checklist, onAnswer, onTick, disabled, linked, jerseyManager, onJerseyManager,
}: {
  items: ScriptItem[];
  answers: Record<string, string>;
  checklist: string[];
  onAnswer: (id: string, value: string) => void;
  onTick: (id: string, on: boolean) => void;
  disabled: boolean;
  linked: Contact[];
  jerseyManager: JerseyManagerAnswer;
  onJerseyManager: (p: Partial<JerseyManagerAnswer>) => void;
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
                case 'jersey_manager':
                  return (
                    <JerseyManagerQuestion
                      key={r.id}
                      item={r}
                      linked={linked}
                      value={jerseyManager}
                      onChange={onJerseyManager}
                      onAnswer={(label) => onAnswer(r.id, label)}
                      disabled={disabled}
                    />
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
