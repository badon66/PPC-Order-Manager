'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { Contact } from '@/lib/types';
import type { CalendarDate } from '@/lib/dates';
import { SALES_PICKLISTS } from '@/lib/constants';
import { validateCallLog, QUICK_EDIT_FIELDS, type QuickEditPatch } from '@/lib/data/sales-logic';
import { deleteContact, quickEditContact, quickStatus } from '@/app/sales/actions';
import { OutcomePanel } from './call-view/outcome-panel';
import { blankDraft, inputFromDraft, type CallDraft } from './call-view/use-draft';
import { useCallerName } from './use-caller-name';

type Mode = null | 'menu' | 'status' | 'edit' | 'delete';

const MENU_W = 200;

/**
 * Double-click a contacts-table row: a small menu with Change status, Quick
 * edit and Delete. Each opens its own dialog. The row itself stays a server-
 * rendered <tr>; the menu and dialogs render through a portal so nothing
 * that isn't a table cell ends up inside the table.
 */
export function RowActions({
  listId, contact, callCount, today, callerDefault, children,
}: {
  listId: string;
  contact: Contact;
  callCount: number;
  today: CalendarDate;
  callerDefault: string;
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [at, setAt] = useState({ x: 0, y: 0 });
  const close = () => setMode(null);
  const name = contact.contactName || contact.orgName || 'this contact';

  return (
    <>
      <tr
        className="border-b border-line/60 hover:bg-surface-2"
        title="Double-click for status, edit and delete"
        onDoubleClick={(e) => {
          e.preventDefault();
          window.getSelection()?.removeAllRanges();
          setAt({ x: Math.min(e.clientX, window.innerWidth - MENU_W - 8), y: e.clientY });
          setMode('menu');
        }}
      >
        {children}
      </tr>
      {mode === 'menu' && (
        <Portal>
          <div className="fixed inset-0 z-40" onMouseDown={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
          <Menu at={at} name={name} onClose={close} onPick={(m) => setMode(m)} />
        </Portal>
      )}
      {mode === 'status' && <StatusDialog listId={listId} contact={contact} today={today} callerDefault={callerDefault} onClose={close} />}
      {mode === 'edit' && <EditDialog listId={listId} contact={contact} onClose={close} />}
      {mode === 'delete' && <DeleteDialog listId={listId} contact={contact} callCount={callCount} onClose={close} />}
    </>
  );
}

function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

function Menu({ at, name, onClose, onPick }: { at: { x: number; y: number }; name: string; onClose: () => void; onPick: (m: Mode) => void }) {
  useEscape(onClose);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const item = 'block w-full px-3 py-2 text-left text-sm hover:bg-surface-2 focus:bg-surface-2 focus:outline-none';
  return (
    <div role="menu" aria-label={`Actions for ${name}`} style={{ left: at.x, top: at.y, width: MENU_W }} className="fixed z-50 overflow-hidden rounded-lg border border-line bg-surface shadow-2xl">
      <p className="truncate border-b border-line px-3 py-1.5 text-xs text-muted">{name}</p>
      <button ref={first} type="button" role="menuitem" className={item} onClick={() => onPick('status')}>Change status…</button>
      <button type="button" role="menuitem" className={item} onClick={() => onPick('edit')}>Quick edit…</button>
      <button type="button" role="menuitem" className={`${item} text-red-300`} onClick={() => onPick('delete')}>Delete…</button>
    </div>
  );
}

/** The same shell as the calling view's Call finished dialog. */
function Dialog({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEscape(onClose);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { panel.current?.focus(); }, []);
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} rounded-xl border border-line bg-surface p-5 shadow-2xl outline-none`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{title}</h2>
              {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:border-ppc-gold/60 hover:text-ppc-gold">✕</button>
          </div>
          {children}
        </div>
      </div>
    </Portal>
  );
}

const BTN = 'rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold hover:border-ppc-gold/60';
const PRIMARY = 'rounded-lg bg-ppc-gold px-5 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-40';

function StatusDialog({ listId, contact, today, callerDefault, onClose }: { listId: string; contact: Contact; today: CalendarDate; callerDefault: string; onClose: () => void }) {
  const router = useRouter();
  const [callerName] = useCallerName(callerDefault);
  const [draft, setDraft] = useState<CallDraft>(() => blankDraft(new Date().toISOString()));
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const patch = (p: Partial<CallDraft>) => setDraft((d) => ({ ...d, ...p }));

  const validation = useMemo(
    () => (draft.outcome ? validateCallLog(inputFromDraft(draft, callerName, new Date().toISOString(), null), contact, { replacing: false }) : null),
    [draft, callerName, contact],
  );
  const missing = contact.doNotCall && draft.outcome !== 'do_not_call'
    ? 'Do Not Call — only that outcome can be logged for this contact'
    : !draft.outcome ? 'Pick an outcome' : (validation && Object.values(validation.blocking)[0]) || null;

  function save() {
    setError(null);
    start(async () => {
      const res = await quickStatus(listId, contact.id, inputFromDraft(draft, callerName, new Date().toISOString(), null), callerName);
      if (!res.ok) { setError(res.error); setErrors(res.errors ?? {}); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog title="Change status" subtitle={`${contact.contactName || '—'} · ${contact.orgName || '—'} — logged as a call with no time on the line`} onClose={onClose} wide>
      <OutcomePanel draft={draft} onChange={patch} contact={contact} today={today} disabled={false} errors={errors} warnings={{}} />
      <label className="mt-4 block text-sm">
        <span className="text-xs font-medium text-muted">Note</span>
        <input className="mt-1" value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="one line, optional" />
      </label>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className={`text-sm ${error ? 'text-red-300' : 'text-muted'}`}>{pending ? 'Saving…' : error ?? missing ?? ''}</span>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={BTN}>Cancel</button>
          <button type="button" disabled={!!missing || pending} onClick={save} className={PRIMARY}>Save status</button>
        </div>
      </div>
    </Dialog>
  );
}

const LABELS: Record<keyof QuickEditPatch, string> = {
  contactName: 'Contact name', role: 'Role', phone: 'Phone', altPhone: 'Alt phone', email: 'Email',
  bestTimeToCall: 'Best time to call', priority: 'Priority', notes: 'Notes',
};

function EditDialog({ listId, contact, onClose }: { listId: string; contact: Contact; onClose: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<QuickEditPatch>(() => Object.fromEntries(QUICK_EDIT_FIELDS.map((k) => [k, contact[k]])) as QuickEditPatch);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof QuickEditPatch, v: string) => setValues((x) => ({ ...x, [k]: v }));
  const field = 'block text-sm';
  const label = 'text-xs font-medium text-muted';

  function save() {
    setError(null);
    start(async () => {
      const res = await quickEditContact(listId, contact.id, values);
      if (!res.ok) { setError(res.error); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog title="Quick edit" subtitle={`${contact.orgName || '—'} — team details stay as uploaded`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="grid gap-3 sm:grid-cols-2">
        <label className={field}><span className={label}>{LABELS.contactName}</span><input className="mt-1" value={values.contactName} onChange={(e) => set('contactName', e.target.value)} autoFocus /></label>
        <label className={field}>
          <span className={label}>{LABELS.role}</span>
          <select className="mt-1" value={values.role} onChange={(e) => set('role', e.target.value)}>
            <option value="">—</option>
            {!SALES_PICKLISTS.role.includes(values.role) && values.role && <option value={values.role}>{values.role}</option>}
            {SALES_PICKLISTS.role.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className={field}><span className={label}>{LABELS.phone}</span><input className="mt-1" type="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <label className={field}><span className={label}>{LABELS.altPhone}</span><input className="mt-1" type="tel" value={values.altPhone} onChange={(e) => set('altPhone', e.target.value)} /></label>
        <label className={`${field} sm:col-span-2`}><span className={label}>{LABELS.email}</span><input className="mt-1" type="email" value={values.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label className={field}>
          <span className={label}>{LABELS.bestTimeToCall}</span>
          <select className="mt-1" value={values.bestTimeToCall} onChange={(e) => set('bestTimeToCall', e.target.value)}>
            <option value="">—</option>
            {!SALES_PICKLISTS.bestTimeToCall.includes(values.bestTimeToCall) && values.bestTimeToCall && <option value={values.bestTimeToCall}>{values.bestTimeToCall}</option>}
            {SALES_PICKLISTS.bestTimeToCall.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className={field}>
          <span className={label}>{LABELS.priority}</span>
          <select className="mt-1" value={values.priority} onChange={(e) => set('priority', e.target.value)}>
            <option value="">—</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </select>
        </label>
        <label className={`${field} sm:col-span-2`}><span className={label}>{LABELS.notes}</span><textarea className="mt-1" rows={3} value={values.notes} onChange={(e) => set('notes', e.target.value)} /></label>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 sm:col-span-2">
          <span className={`text-sm ${error ? 'text-red-300' : 'text-muted'}`}>{pending ? 'Saving…' : error ?? ''}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={BTN}>Cancel</button>
            <button type="submit" disabled={pending} className={PRIMARY}>Save</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ listId, contact, callCount, onClose }: { listId: string; contact: Contact; callCount: number; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const name = contact.contactName || '—';

  function confirm() {
    setError(null);
    start(async () => {
      const res = await deleteContact(listId, contact.id);
      if (!res.ok) { setError(res.error); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog title="Delete this contact?" onClose={onClose}>
      <p className="text-sm">
        <span className="font-semibold">{name}</span> · {contact.orgName || '—'}
        {callCount > 0 ? <> — and the {callCount} logged call{callCount === 1 ? '' : 's'} with them.</> : ' — no calls logged.'}
      </p>
      <p className="mt-1 text-xs text-muted">This can&apos;t be undone. Uploading the sheet again would add them back as a new contact.</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-sm text-red-300">{pending ? 'Deleting…' : error ?? ''}</span>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={BTN} autoFocus>Cancel</button>
          <button type="button" disabled={pending} onClick={confirm} className="rounded-lg border border-red-500/60 bg-red-500/10 px-5 py-2.5 text-sm font-bold text-red-200 hover:bg-red-500/20 disabled:opacity-40">Delete</button>
        </div>
      </div>
    </Dialog>
  );
}
