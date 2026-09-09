'use client';

import { useState, useTransition } from 'react';
import type { CallList } from '@/lib/types';
import { updateListText } from '@/app/sales/actions';
import { PanelFrame, EDIT_INPUT } from './inline-edit';

/** Lead times, minimums, shipping, sizing link — the things asked mid-sentence. One text per list. */
export function QuickFacts({ listId, value, onSaved }: { listId: string; value: string; onSaved: (list: CallList) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const res = await updateListText(listId, { quickFacts: text });
      if (!res.ok) { setError(res.error); return; }
      onSaved(res.list);
      setEditing(false);
    });
  }

  const lines = value.split('\n');
  return (
    <PanelFrame
      title="Quick facts"
      editing={editing}
      onEdit={() => { setText(value); setEditing(true); }}
      onCancel={() => setEditing(false)}
      onSave={save}
      saving={saving}
      error={error}
      className="rounded-xl border border-line bg-surface p-4"
    >
      {editing ? (
        <textarea
          className={`${EDIT_INPUT} min-h-[10rem]`}
          rows={8}
          value={text}
          autoFocus
          placeholder={'- Lead time: 4–6 weeks sublimated\n- Full set = jersey + socks + pant shell\n- Minimum 12 per design\n- Free shipping in Canada\n- Sizing chart: powerplaycustoms.com/sizing'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }}
        />
      ) : value ? (
        <div data-testid="quick-facts" className="space-y-1 text-[15px] leading-snug">
          {lines.map((l, i) => l.startsWith('- ')
            ? <p key={i} className="flex gap-2"><span className="text-ppc-gold">•</span><span>{l.slice(2)}</span></p>
            : <p key={i} className={l.trim() ? '' : 'h-2'}>{l}</p>)}
        </div>
      ) : (
        <button type="button" onClick={() => { setText(''); setEditing(true); }} className="text-[15px] text-muted hover:text-ppc-gold">
          Add the facts you get asked for mid-call →
        </button>
      )}
    </PanelFrame>
  );
}
