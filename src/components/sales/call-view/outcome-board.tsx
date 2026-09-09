'use client';

import type { CallLog, CallOutcome, Contact } from '@/lib/types';
import type { CalendarDate } from '@/lib/dates';
import { formatTimestamp } from '@/lib/dates';
import {
  BUSINESS_TIMEZONE, CALL_OUTCOME_META, CALL_OUTCOME_OPTIONS, MISSED_OUTCOMES, TALKED_OUTCOMES, OUTCOME_HOTKEYS,
  NOT_INTERESTED_REASONS, SALES_PICKLISTS,
} from '@/lib/constants';
import { OutcomeBadge } from '../outcome-badge';
import { StarRating } from '../star-rating';
import type { CallDraft } from './use-draft';

/** No answer and Voicemail have nothing to add: one click logs and advances. Everything else opens its strip. */
export function isImmediate(o: CallOutcome): boolean {
  return o === 'no_answer' || o === 'voicemail';
}

function Field({ label, error, warning, children }: { label: string; error?: string; warning?: string; children: React.ReactNode }) {
  return (
    <label className="block text-[15px]">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? <span className="mt-1 block text-[13px] text-red-300">{error}</span> : warning ? <span className="mt-1 block text-[13px] text-amber-300">{warning}</span> : null}
    </label>
  );
}

/**
 * "How did the call go?" — a permanent board, never a dialog. Two labelled
 * rows of big buttons; picking an outcome that needs a commitment opens a
 * strip with only that outcome's fields and a Log button. Enter in a strip
 * field logs; Esc clears. Hotkeys 1–9, 0, - press the same buttons.
 */
export function OutcomeBoard({
  draft, onChange, onPick, contact, today, disabled, errors, warnings, missing, saving, error, logged, editing, onLog, onClear, onEdit,
}: {
  draft: CallDraft;
  onChange: (p: Partial<CallDraft>) => void;
  onPick: (o: CallOutcome) => void;
  contact: Contact;
  today: CalendarDate;
  disabled: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
  missing: string | null;
  saving: boolean;
  error: string | null;
  /** The call logged for this contact this session, when not editing it. */
  logged: CallLog | null;
  editing: boolean;
  onLog: () => void;
  onClear: () => void;
  onEdit: () => void;
}) {
  void today;
  const fu = (p: Partial<CallDraft['followUp']>) => onChange({ followUp: { ...draft.followUp, ...p } });
  const ref = (p: Partial<CallDraft['referral']>) => onChange({ referral: { ...draft.referral, ...p } });
  const key = (o: CallOutcome) => OUTCOME_HOTKEYS[CALL_OUTCOME_OPTIONS.indexOf(o)];
  const month = draft.followUp.date ? draft.followUp.date.slice(0, 7) : '';
  const stripOpen = !!draft.outcome && !isImmediate(draft.outcome);

  const renderRow = (title: string, outcomes: CallOutcome[]) => (
    <div>
      <p className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-muted">{title}</p>
      <div className="grid grid-cols-4 gap-2">
        {outcomes.map((o) => {
          const m = CALL_OUTCOME_META[o];
          const active = draft.outcome === o;
          const off = disabled || (contact.doNotCall && o !== 'do_not_call');
          return (
            <button
              key={o}
              type="button"
              disabled={off}
              onClick={() => onPick(o)}
              aria-pressed={active}
              data-outcome={o}
              className={`flex min-h-[3.5rem] items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[15px] font-semibold transition-colors disabled:opacity-35 ${active ? 'border-ppc-gold bg-ppc-gold/15 text-ppc-gold' : 'border-line bg-surface-2 hover:border-ppc-gold/60'}`}
            >
              <span><span aria-hidden className="mr-1.5">{m.emoji}</span>{m.label}</span>
              <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">{key(o)}</kbd>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (logged) {
    return (
      <div data-testid="outcome-board" className="space-y-3">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-ppc-gold">How did the call go?</h3>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ppc-gold/40 bg-ppc-gold/5 p-3 text-[15px]">
          <span className="flex flex-wrap items-center gap-2">
            Logged as <OutcomeBadge outcome={logged.outcome} size="lg" />
            <span className="text-muted">{formatTimestamp(logged.endedAt, BUSINESS_TIMEZONE)}</span>
            {logged.leadRating && <StarRating value={logged.leadRating} />}
          </span>
          <button type="button" onClick={onEdit} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold hover:border-ppc-gold/60 hover:text-ppc-gold">Edit</button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="outcome-board" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-ppc-gold">How did the call go?{editing && <span className="ml-2 font-normal normal-case tracking-normal text-muted">editing the logged call</span>}</h3>
        <span className="flex items-center gap-2 text-[13px] text-muted">
          Lead <span className="text-muted/70">(Shift+1…5)</span>
          <StarRating value={draft.leadRating} onChange={(v) => onChange({ leadRating: v })} size="lg" />
        </span>
      </div>
      {errors.leadRating && <p className="text-[13px] text-red-300">{errors.leadRating}</p>}
      {contact.doNotCall && <p className="text-[13px] text-red-300">Do Not Call — only that outcome can be logged for this contact.</p>}

      {renderRow("Didn't reach them", MISSED_OUTCOMES)}
      {renderRow('Talked to them', TALKED_OUTCOMES)}
      {errors.outcome && <p className="text-[13px] text-red-300">{errors.outcome}</p>}

      {stripOpen && draft.outcome && (
        <div
          data-testid="outcome-strip"
          className="rounded-lg border border-ppc-gold/40 bg-ppc-gold/5 p-3"
          onKeyDown={(e) => {
            const t = e.target as HTMLElement;
            if (e.key === 'Enter' && t.tagName === 'INPUT') { e.preventDefault(); onLog(); }
            if (e.key === 'Escape') { e.stopPropagation(); onClear(); }
          }}
        >
          {draft.outcome === 'callback' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Call back on" error={errors['followUp.date']}><input type="date" value={draft.followUp.date ?? ''} onChange={(e) => fu({ date: e.target.value || null })} autoFocus /></Field>
              <Field label="At (their time)" error={errors['followUp.time']}><input type="time" value={draft.followUp.time} onChange={(e) => fu({ time: e.target.value })} /></Field>
              <Field label="What I promised"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} placeholder="e.g. after their board meeting" /></Field>
            </div>
          )}
          {(draft.outcome === 'send_info' || draft.outcome === 'interested') && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Email" error={errors.email} warning={warnings.email}><input type="email" value={draft.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="them@example.ca" autoFocus /></Field>
              <Field label="Follow up on" error={errors['followUp.date']}><input type="date" value={draft.followUp.date ?? ''} onChange={(e) => fu({ date: e.target.value || null })} /></Field>
              <Field label="What I promised"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} placeholder={draft.outcome === 'interested' ? 'what they want to see' : 'send the catalogue'} /></Field>
            </div>
          )}
          {draft.outcome === 'meeting_booked' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Meeting date" error={errors['followUp.date']}><input type="date" value={draft.followUp.date ?? ''} onChange={(e) => fu({ date: e.target.value || null })} autoFocus /></Field>
              <Field label="Time" error={errors['followUp.time']}><input type="time" value={draft.followUp.time} onChange={(e) => fu({ time: e.target.value })} /></Field>
              <Field label="Where / how"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} placeholder="call, rink visit…" /></Field>
            </div>
          )}
          {draft.outcome === 'not_now' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Try again in" error={errors['followUp.date']}><input type="month" value={month} onChange={(e) => fu({ date: e.target.value ? `${e.target.value}-01` : null })} autoFocus /></Field>
              <Field label="Why"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} placeholder="after tryouts, budget in spring…" /></Field>
            </div>
          )}
          {draft.outcome === 'not_interested' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Reason">
                <select value={draft.reason} onChange={(e) => onChange({ reason: e.target.value })} autoFocus>
                  <option value="">—</option>
                  {NOT_INTERESTED_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Detail"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} /></Field>
            </div>
          )}
          {draft.outcome === 'referred' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Referred to (name)" error={errors.referral}><input value={draft.referral.name} onChange={(e) => ref({ name: e.target.value })} autoFocus /></Field>
              <Field label="Their role">
                <select value={draft.referral.role} onChange={(e) => ref({ role: e.target.value })}>
                  <option value="">—</option>
                  {SALES_PICKLISTS.role.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Phone" warning={warnings['referral.phone']}><input type="tel" value={draft.referral.phone} onChange={(e) => ref({ phone: e.target.value })} /></Field>
              <Field label="Email"><input type="email" value={draft.referral.email} onChange={(e) => ref({ email: e.target.value })} /></Field>
              <p className="text-[13px] text-muted sm:col-span-2">Logging adds them to this list right after this contact.</p>
            </div>
          )}
          {draft.outcome === 'bad_number' && (
            <Field label="New number, if they gave one" warning={warnings.newPhone}><input type="tel" value={draft.newPhone} onChange={(e) => onChange({ newPhone: e.target.value })} placeholder="leave blank to close the contact" autoFocus /></Field>
          )}
          {draft.outcome === 'do_not_call' && (
            <p className="text-[15px] text-red-300">Logging marks this contact Do Not Call: removed from every queue, number hidden. It can&apos;t be undone from here.</p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-ppc-gold/20 pt-3">
            <span className={`text-[13px] ${error ? 'text-red-300' : 'text-muted'}`}>{saving ? 'Saving…' : error ?? missing ?? 'Enter or Ctrl+Enter logs'}</span>
            <div className="flex gap-2">
              <button type="button" onClick={onClear} className="rounded-lg border border-line px-3 py-2 text-[13px] hover:border-ppc-gold/60">Clear</button>
              <button type="button" data-testid="log-button" disabled={!!missing || saving} onClick={onLog} className="rounded-lg bg-ppc-gold px-5 py-2 text-[15px] font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-40">
                {editing ? 'Update' : 'Log & next →'}
              </button>
            </div>
          </div>
        </div>
      )}
      {!stripOpen && !editing && (
        <p className="text-[13px] text-muted">No answer and Voicemail log on the click and move on. The others ask for the one thing they need first.</p>
      )}
      {error && !stripOpen && <p className="text-[13px] text-red-300">{error}</p>}
    </div>
  );
}
