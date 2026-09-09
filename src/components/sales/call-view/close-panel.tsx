'use client';

import type { ScriptItem } from '@/lib/types';
import { Toggle } from '@/components/order-form/fields';

/** The close: the sheet's closing lines and reminders, small, at the bottom of the script column. */
export function ClosePanel({ items, checklist, onTick, disabled }: { items: ScriptItem[]; checklist: string[]; onTick: (id: string, on: boolean) => void; disabled: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-ppc-gold">Close</h3>
      <div className="space-y-2">
        {items.map((r) => r.kind === 'reminder' ? (
          <div key={r.id} className={`text-[15px] ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
            <Toggle label={r.text} checked={checklist.includes(r.id)} onChange={(on) => onTick(r.id, on)} />
          </div>
        ) : (
          <p key={r.id} className="max-w-[75ch] rounded-lg border-l-2 border-ppc-gold/50 bg-surface-2 px-3 py-2 text-[16px] leading-relaxed">{r.text}</p>
        ))}
      </div>
    </div>
  );
}
