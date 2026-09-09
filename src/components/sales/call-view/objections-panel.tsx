'use client';

import { useState, useTransition } from 'react';
import type { ScriptItem } from '@/lib/types';
import { SCRIPT_SECTIONS } from '@/lib/types';
import { MAX_OBJECTIONS } from '@/lib/data/sales-logic';
import { saveListScript } from '@/app/sales/actions';
import { PanelFrame, EDIT_INPUT } from './inline-edit';

/**
 * ③ Objections: every objection as a chip, all visible at once (max 8). Tap
 * one and its response fills the column at read-aloud size; tap the heading
 * or Back to return. Editable in place; Save rewrites the objections section.
 */
export function ObjectionsPanel({
  listId, items, rawScript, onScriptSaved,
}: {
  /** Objection rows that apply to this contact, placeholders filled. */
  items: ScriptItem[];
  listId: string;
  rawScript: ScriptItem[];
  onScriptSaved: (script: ScriptItem[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<ScriptItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const open = openId ? items.find((i) => i.id === openId) ?? null : null;
  const setRow = (i: number, p: Partial<ScriptItem>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  function startEdit() {
    setRows(rawScript.filter((r) => r.section === 'objections').map((r) => ({ ...r })));
    setOpenId(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    const next = SCRIPT_SECTIONS.flatMap((sec) => (sec === 'objections' ? rows : rawScript.filter((r) => r.section === sec)));
    start(async () => {
      const res = await saveListScript(listId, next);
      if (!res.ok) { setError(res.error); return; }
      onScriptSaved(res.script);
      setEditing(false);
    });
  }

  return (
    <PanelFrame
      title="③ Objections"
      badge={<span className="font-normal normal-case tracking-normal text-muted">{editing ? rows.length : items.length} / {MAX_OBJECTIONS}</span>}
      editing={editing}
      onEdit={startEdit}
      onCancel={() => setEditing(false)}
      onSave={save}
      saving={saving}
      error={error}
    >
      {editing ? (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border border-line p-2">
              <div className="flex items-start gap-2">
                <input className={`${EDIT_INPUT} font-semibold`} value={r.text} onChange={(e) => setRow(i, { text: e.target.value })} placeholder="What they say" />
                <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove objection" className="shrink-0 rounded border border-line px-2 py-1 text-[13px] text-red-300 hover:border-red-500/60">✕</button>
              </div>
              <textarea className={`${EDIT_INPUT} mt-2 min-h-[4.5rem]`} rows={3} value={r.response} onChange={(e) => setRow(i, { response: e.target.value })} placeholder="What you say back" />
            </div>
          ))}
          <button
            type="button"
            disabled={rows.length >= MAX_OBJECTIONS}
            onClick={() => setRows((rs) => [...rs, { id: '', section: 'objections', kind: 'objection', text: '', response: '', options: [], showWhen: '' }])}
            className="rounded-lg border border-dashed border-line px-3 py-1.5 text-[13px] text-muted hover:border-ppc-gold/60 hover:text-ppc-gold disabled:opacity-40"
          >
            {rows.length >= MAX_OBJECTIONS ? `That's the cap — ${MAX_OBJECTIONS} keeps them all on screen` : '+ Add objection'}
          </button>
        </div>
      ) : open ? (
        <div data-testid="objection-open" className="space-y-3">
          <button type="button" onClick={() => setOpenId(null)} className="text-left text-[16px] font-medium text-muted hover:text-ppc-gold" title="Back to objections">
            “{open.text}”
          </button>
          <p className="max-w-[70ch] rounded-lg border-l-4 border-ppc-gold/70 bg-surface-2 px-4 py-3 text-[20px] leading-relaxed">{open.response || '— no response written yet —'}</p>
          <button type="button" onClick={() => setOpenId(null)} className="rounded-lg border border-line px-3 py-1.5 text-[13px] hover:border-ppc-gold/60 hover:text-ppc-gold">← Back to objections</button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-[15px] text-muted">No objections yet — click ✎ to add the ones you hear.</p>
      ) : (
        <div data-testid="objection-chips" className="grid grid-cols-2 gap-2">
          {items.map((i) => (
            <button key={i.id} type="button" onClick={() => setOpenId(i.id)} className="rounded-lg border border-line bg-surface-2 px-3 py-3 text-left text-[15px] leading-snug transition-colors hover:border-ppc-gold/60 hover:text-ppc-gold">
              {i.text}
            </button>
          ))}
        </div>
      )}
    </PanelFrame>
  );
}
