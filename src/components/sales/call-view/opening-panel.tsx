'use client';

import { useState, useTransition } from 'react';
import type { ScriptItem } from '@/lib/types';
import { SCRIPT_SECTIONS } from '@/lib/types';
import { saveListScript } from '@/app/sales/actions';
import { Toggle } from '@/components/order-form/fields';
import { PanelFrame, EDIT_INPUT } from './inline-edit';

const KINDS = [['read', 'Say'], ['reminder', 'Remind me']] as const;

/**
 * ① Opening: the reminders and the lines read aloud. Expanded for each new
 * contact, collapsible once done (the header keeps a gold tick). Editable in
 * place: kind + text per line, add, remove, reorder; Save rewrites the
 * opening section of the list's script and leaves the other sections alone.
 */
export function OpeningPanel({
  listId, items, rawScript, checklist, onTick, open, onToggle, onScriptSaved, disabled,
}: {
  listId: string;
  /** The opening rows that apply to this contact, placeholders filled. */
  items: ScriptItem[];
  /** The whole script as stored, for editing. */
  rawScript: ScriptItem[];
  checklist: string[];
  onTick: (id: string, on: boolean) => void;
  open: boolean;
  onToggle: () => void;
  onScriptSaved: (script: ScriptItem[]) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<ScriptItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const firstLine = items.find((i) => i.kind === 'read')?.text ?? items[0]?.text ?? '';
  const done = !open && items.length > 0;

  function startEdit() {
    setRows(rawScript.filter((r) => r.section === 'opening').map((r) => ({ ...r })));
    setEditing(true);
    if (!open) onToggle();
  }
  const setRow = (i: number, p: Partial<ScriptItem>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const move = (i: number, dir: -1 | 1) => setRows((rs) => {
    const j = i + dir;
    if (j < 0 || j >= rs.length) return rs;
    const next = [...rs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  function save() {
    setError(null);
    const next = SCRIPT_SECTIONS.flatMap((sec) => (sec === 'opening' ? rows : rawScript.filter((r) => r.section === sec)));
    start(async () => {
      const res = await saveListScript(listId, next);
      if (!res.ok) { setError(res.error); return; }
      onScriptSaved(res.script);
      setEditing(false);
    });
  }

  return (
    <PanelFrame
      title={<span data-testid="opening-title">① Opening</span>}
      badge={done ? <span className="text-ppc-gold" aria-label="Opening done">✓</span> : null}
      editing={editing}
      onEdit={startEdit}
      onCancel={() => setEditing(false)}
      onSave={save}
      saving={saving}
      error={error}
      extra={!editing && (
        <button type="button" onClick={onToggle} aria-expanded={open} data-testid="opening-toggle" className="rounded border border-line px-2 py-0.5 text-[13px] text-muted hover:text-ppc-gold">
          {open ? 'Collapse ⌃' : 'Expand ⌄'}
        </button>
      )}
    >
      {!open && !editing && (
        <button type="button" onClick={onToggle} className="w-full truncate text-left text-[15px] text-muted hover:text-ppc-gold" title="Expand">
          {firstLine ? `“${firstLine.slice(0, 90)}${firstLine.length > 90 ? '…' : ''}”` : 'No opening lines yet'}
        </button>
      )}

      {open && !editing && (
        <div data-testid="opening-body" className="space-y-3">
          {items.length === 0 && <p className="text-[15px] text-muted">No opening lines yet — click ✎ to write them here, or upload a sheet with a Script tab.</p>}
          {items.map((r) => r.kind === 'reminder' ? (
            <div key={r.id} className={`text-[16px] ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
              <Toggle label={r.text} checked={checklist.includes(r.id)} onChange={(on) => onTick(r.id, on)} />
            </div>
          ) : (
            <p key={r.id} className="max-w-[75ch] rounded-lg border-l-4 border-ppc-gold/70 bg-surface-2 px-4 py-3 text-[20px] leading-relaxed">{r.text}</p>
          ))}
        </div>
      )}

      {editing && (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <select className="w-32 shrink-0" value={r.kind === 'reminder' ? 'reminder' : 'read'} onChange={(e) => setRow(i, { kind: e.target.value as ScriptItem['kind'] })}>
                {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <textarea className={`${EDIT_INPUT} min-h-[3.25rem]`} rows={2} value={r.text} onChange={(e) => setRow(i, { text: e.target.value })} placeholder="What you say — [Name], [Org], [Rep] get filled in" />
              <div className="flex shrink-0 flex-col gap-1">
                <button type="button" onClick={() => move(i, -1)} aria-label="Move up" className="rounded border border-line px-1.5 text-[13px] hover:text-ppc-gold">↑</button>
                <button type="button" onClick={() => move(i, 1)} aria-label="Move down" className="rounded border border-line px-1.5 text-[13px] hover:text-ppc-gold">↓</button>
                <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove line" className="rounded border border-line px-1.5 text-[13px] text-red-300 hover:border-red-500/60">✕</button>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setRows((rs) => [...rs, { id: '', section: 'opening', kind: 'read', text: '', response: '', options: [], showWhen: '' }])} className="rounded-lg border border-dashed border-line px-3 py-1.5 text-[13px] text-muted hover:border-ppc-gold/60 hover:text-ppc-gold">
            + Add line
          </button>
          <p className="text-[13px] text-muted">Show-When rules from the sheet stay on the lines they were on.</p>
        </div>
      )}
    </PanelFrame>
  );
}
