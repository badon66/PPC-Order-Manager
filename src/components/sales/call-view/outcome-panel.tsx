'use client';

import type { CallOutcome, Contact } from '@/lib/types';
import type { CalendarDate } from '@/lib/dates';
import { addDays } from '@/lib/dates';
import {
  CALL_OUTCOME_META, CALL_OUTCOME_OPTIONS, MISSED_OUTCOMES, TALKED_OUTCOMES, OUTCOME_HOTKEYS,
  NOT_INTERESTED_REASONS, SALES_PICKLISTS,
} from '@/lib/constants';
import { defaultNotNowMonth } from '@/lib/data/sales-logic';
import { StarRating } from '../star-rating';
import type { CallDraft } from './use-draft';

function Field({ label, error, warning, children }: { label: string; error?: string; warning?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? <span className="mt-1 block text-xs text-red-300">{error}</span> : warning ? <span className="mt-1 block text-xs text-amber-300">{warning}</span> : null}
    </label>
  );
}

/** Choosing an outcome seeds the prompt's defaults (§6) without overwriting anything typed. */
export function seedForOutcome(draft: CallDraft, outcome: CallOutcome, contact: Contact, today: CalendarDate): Partial<CallDraft> {
  const p: Partial<CallDraft> = { outcome };
  const fu = { ...draft.followUp };
  if ((outcome === 'send_info' || outcome === 'interested') && !fu.date) fu.date = addDays(today, 7);
  if (outcome === 'not_now' && !fu.date) fu.date = `${defaultNotNowMonth(contact, today)}-01`;
  p.followUp = fu;
  if ((outcome === 'send_info' || outcome === 'interested') && !draft.email && contact.email) p.email = contact.email;
  return p;
}

export function OutcomePanel({
  draft, onChange, contact, today, disabled, errors, warnings,
}: {
  draft: CallDraft;
  onChange: (p: Partial<CallDraft>) => void;
  contact: Contact;
  today: CalendarDate;
  disabled: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
}) {
  const pick = (o: CallOutcome) => onChange(seedForOutcome(draft, o, contact, today));
  const fu = (p: Partial<CallDraft['followUp']>) => onChange({ followUp: { ...draft.followUp, ...p } });
  const ref = (p: Partial<CallDraft['referral']>) => onChange({ referral: { ...draft.referral, ...p } });
  const key = (o: CallOutcome) => OUTCOME_HOTKEYS[CALL_OUTCOME_OPTIONS.indexOf(o)];

  // A plain render function, not a nested component — a component defined inside
  // render is a new type every render and React remounts its subtree each time.
  const renderRow = (title: string, outcomes: CallOutcome[]) => (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted">{title}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {outcomes.map((o) => {
          const m = CALL_OUTCOME_META[o];
          const active = draft.outcome === o;
          return (
            <button
              key={o}
              type="button"
              disabled={disabled}
              onClick={() => pick(o)}
              aria-pressed={active}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-40 ${active ? 'border-ppc-gold bg-ppc-gold/10 text-ppc-gold' : 'border-line bg-surface-2 hover:border-ppc-gold/50'}`}
            >
              <span><span aria-hidden className="mr-1.5">{m.emoji}</span>{m.label}</span>
              <kbd className="rounded border border-line px-1 text-[0.65rem] text-muted">{key(o)}</kbd>
            </button>
          );
        })}
      </div>
    </div>
  );

  const month = draft.followUp.date ? draft.followUp.date.slice(0, 7) : '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted">Lead rating <span className="text-muted/70">(Shift+1…5)</span></span>
        <StarRating value={draft.leadRating} onChange={(v) => onChange({ leadRating: v })} size="lg" />
      </div>
      {errors.leadRating && <p className="text-xs text-red-300">{errors.leadRating}</p>}

      {renderRow("Didn't reach them", MISSED_OUTCOMES)}
      {renderRow('Talked to them', TALKED_OUTCOMES)}
      {errors.outcome && <p className="text-sm text-red-300">{errors.outcome}</p>}

      {draft.outcome && (
        <div className="rounded-lg border border-ppc-gold/40 bg-ppc-gold/5 p-3">
          {draft.outcome === 'callback' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Call back on" error={errors['followUp.date']}><input type="date" value={draft.followUp.date ?? ''} onChange={(e) => fu({ date: e.target.value || null })} /></Field>
              <Field label="At (their time)" error={errors['followUp.time']}><input type="time" value={draft.followUp.time} onChange={(e) => fu({ time: e.target.value })} /></Field>
              <Field label="Note"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} placeholder="e.g. after their board meeting" /></Field>
            </div>
          )}
          {(draft.outcome === 'send_info' || draft.outcome === 'interested') && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Email" error={errors.email} warning={warnings.email}><input type="email" value={draft.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="them@example.ca" /></Field>
              <Field label="Follow up on" error={errors['followUp.date']}><input type="date" value={draft.followUp.date ?? ''} onChange={(e) => fu({ date: e.target.value || null })} /></Field>
              <Field label="Follow-up note"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} placeholder={draft.outcome === 'interested' ? 'what they want to see' : 'send the catalogue'} /></Field>
            </div>
          )}
          {draft.outcome === 'meeting_booked' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Meeting date" error={errors['followUp.date']}><input type="date" value={draft.followUp.date ?? ''} onChange={(e) => fu({ date: e.target.value || null })} /></Field>
              <Field label="Time" error={errors['followUp.time']}><input type="time" value={draft.followUp.time} onChange={(e) => fu({ time: e.target.value })} /></Field>
              <Field label="Where / how"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} placeholder="call, rink visit…" /></Field>
            </div>
          )}
          {draft.outcome === 'not_now' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Try again in" error={errors['followUp.date']}><input type="month" value={month} onChange={(e) => fu({ date: e.target.value ? `${e.target.value}-01` : null })} /></Field>
              <Field label="Why"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} placeholder="after tryouts, budget in spring…" /></Field>
            </div>
          )}
          {draft.outcome === 'not_interested' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Reason">
                <select value={draft.reason} onChange={(e) => onChange({ reason: e.target.value })}>
                  <option value="">—</option>
                  {NOT_INTERESTED_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Detail"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} /></Field>
            </div>
          )}
          {draft.outcome === 'referred' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Referred to (name)" error={errors.referral}><input value={draft.referral.name} onChange={(e) => ref({ name: e.target.value })} /></Field>
              <Field label="Their role">
                <select value={draft.referral.role} onChange={(e) => ref({ role: e.target.value })}>
                  <option value="">—</option>
                  {SALES_PICKLISTS.role.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Phone" warning={warnings['referral.phone']}><input type="tel" value={draft.referral.phone} onChange={(e) => ref({ phone: e.target.value })} /></Field>
              <Field label="Email"><input type="email" value={draft.referral.email} onChange={(e) => ref({ email: e.target.value })} /></Field>
              <p className="text-xs text-muted sm:col-span-2">Saving adds them to this list right after this contact.</p>
            </div>
          )}
          {draft.outcome === 'bad_number' && (
            <Field label="New number, if they gave one" warning={warnings.newPhone}><input type="tel" value={draft.newPhone} onChange={(e) => onChange({ newPhone: e.target.value })} placeholder="leave blank to close the contact" /></Field>
          )}
          {draft.outcome === 'do_not_call' && (
            <p className="text-sm text-red-300">Saving marks this contact Do Not Call: removed from every queue, number hidden. It can&apos;t be undone from here.</p>
          )}
          {(draft.outcome === 'no_answer' || draft.outcome === 'voicemail') && (
            <p className="text-xs text-muted">Back in the queue in {draft.outcome === 'no_answer' ? 'two' : 'four'} days.</p>
          )}
        </div>
      )}
    </div>
  );
}
