'use client';

import type { Contact } from '@/lib/types';
import { fillPlaceholders } from '@/lib/sales/script';

/** The one sentence said when they answer. Biggest text on the screen. Edited in Settings, not here. */
export function PickupLine({
  value, contact, callerName, onOpenSettings,
}: { value: string; contact: Contact; callerName: string; onOpenSettings: () => void }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-ppc-gold">Pickup line</h3>
        <button type="button" onClick={onOpenSettings} className="rounded px-1.5 text-[13px] text-muted hover:text-ppc-gold" title="Call settings">⚙ Settings</button>
      </div>
      {value ? (
        <p data-testid="pickup-line" className="text-[28px] font-semibold leading-snug">{fillPlaceholders(value, contact, callerName)}</p>
      ) : (
        <button type="button" onClick={onOpenSettings} className="text-left text-[20px] text-muted hover:text-ppc-gold">
          No pickup line yet — write it in Settings →
        </button>
      )}
    </div>
  );
}
