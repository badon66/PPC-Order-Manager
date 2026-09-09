'use client';

import { useState } from 'react';
import type { Contact, JerseyManagerAnswer } from '@/lib/types';
import { SALES_PICKLISTS } from '@/lib/constants';

const CHOICE = 'rounded-lg border px-3 py-2.5 text-left text-[15px] transition-colors';
const ACTIVE = 'border-ppc-gold bg-ppc-gold/10 text-ppc-gold';
const INACTIVE = 'border-line bg-surface-2 hover:border-ppc-gold/50';

const NEW_PERSON = '__new__';

/**
 * "Who looks after the jerseys?" — Them, or someone else. Someone else is
 * either a contact already known at this team (they stay separate rows; this
 * only flags who manages the jerseys) or someone new, who becomes a new
 * linked row on save. Inline, never a modal.
 */
export function JerseyManagerQuestion({
  text, linked, value, onChange, onAnswer, disabled,
}: {
  text: string;
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
      <p className="text-[16px] font-medium">{text}</p>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        <button type="button" aria-pressed={value.answer === 'self'} onClick={() => pick('self')} className={`${CHOICE} ${value.answer === 'self' ? ACTIVE : INACTIVE}`}>Them</button>
        <button type="button" aria-pressed={value.answer === 'other'} onClick={() => pick('other')} className={`${CHOICE} ${value.answer === 'other' ? ACTIVE : INACTIVE}`}>Someone else</button>
      </div>
      {value.answer === 'other' && linked.length > 0 && (
        <label className="mt-3 block text-[15px]">
          <span className="text-[13px] font-medium text-muted">Who?</span>
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
          <label className="block text-[15px]">
            <span className="text-[13px] font-medium text-muted">Role</span>
            <select className="mt-1" value={value.person.role} onChange={(e) => person({ role: e.target.value })}>
              <option value="">—</option>
              {SALES_PICKLISTS.role.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="block text-[15px]"><span className="text-[13px] font-medium text-muted">Name</span><input className="mt-1" value={value.person.name} onChange={(e) => person({ name: e.target.value })} /></label>
          <label className="block text-[15px]"><span className="text-[13px] font-medium text-muted">Phone</span><input className="mt-1" type="tel" value={value.person.phone} onChange={(e) => person({ phone: e.target.value })} /></label>
          <label className="block text-[15px]"><span className="text-[13px] font-medium text-muted">Email</span><input className="mt-1" type="email" value={value.person.email} onChange={(e) => person({ email: e.target.value })} /></label>
          <label className="block text-[15px] sm:col-span-2"><span className="text-[13px] font-medium text-muted">Note</span><input className="mt-1" value={value.person.note} onChange={(e) => person({ note: e.target.value })} placeholder="best time, what they said…" /></label>
          <p className="text-[13px] text-muted sm:col-span-2">Logging the call adds them to this list as a linked contact, marked as the jersey manager, right after this one.</p>
        </div>
      )}
    </div>
  );
}
