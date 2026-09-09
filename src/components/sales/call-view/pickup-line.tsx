'use client';

import { useState, useTransition } from 'react';
import type { CallList, Contact } from '@/lib/types';
import { updateListText } from '@/app/sales/actions';
import { fillPlaceholders } from '@/lib/sales/script';
import { PanelFrame, EDIT_INPUT } from './inline-edit';

/** The one sentence said when they answer. Biggest text on the screen; per list; edited in place. */
export function PickupLine({
  listId, value, contact, callerName, onSaved,
}: { listId: string; value: string; contact: Contact; callerName: string; onSaved: (list: CallList) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const res = await updateListText(listId, { pickupLine: text });
      if (!res.ok) { setError(res.error); return; }
      onSaved(res.list);
      setEditing(false);
    });
  }

  return (
    <PanelFrame
      title="Pickup line"
      editing={editing}
      onEdit={() => { setText(value); setEditing(true); }}
      onCancel={() => setEditing(false)}
      onSave={save}
      saving={saving}
      error={error}
    >
      {editing ? (
        <textarea
          className={`${EDIT_INPUT} text-[20px]`}
          rows={2}
          value={text}
          autoFocus
          placeholder="Hi [Name], it's [Rep] from Powerplay Customs — got thirty seconds?"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
            if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); }
          }}
        />
      ) : value ? (
        <p data-testid="pickup-line" className="text-[28px] font-semibold leading-snug">{fillPlaceholders(value, contact, callerName)}</p>
      ) : (
        <button type="button" onClick={() => { setText(''); setEditing(true); }} className="text-[20px] text-muted hover:text-ppc-gold">
          Add the line you say when they pick up →
        </button>
      )}
    </PanelFrame>
  );
}
