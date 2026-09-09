'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { CallList } from '@/lib/types';
import { updateListText } from '@/app/sales/actions';

const AREA = 'mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[18px] leading-relaxed';

/**
 * Call settings for one list: the pickup line and the voicemail message.
 * Opened from the gear in the calling screen's top bar; a side sheet, so it
 * is deliberate, never something that pops up mid-call. Mounted fresh each
 * time it opens, so its fields start from the list as it is now.
 */
export function CallSettings({ list, onClose, onSaved }: { list: CallList; onClose: () => void; onSaved: (list: CallList) => void }) {
  const [pickupLine, setPickupLine] = useState(list.pickupLine);
  const [voicemailScript, setVoicemailScript] = useState(list.voicemailScript);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const first = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { first.current?.focus(); }, []);

  function save() {
    setError(null);
    start(async () => {
      const res = await updateListText(list.id, { pickupLine, voicemailScript });
      if (!res.ok) { setError(res.error); return; }
      onSaved(res.list);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="call-settings-title"
        data-testid="call-settings"
        className="flex h-full w-full max-w-2xl flex-col gap-5 overflow-y-auto border-l border-line bg-surface p-6 shadow-2xl"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="call-settings-title" className="text-lg font-bold">Call settings</h2>
            <p className="text-[13px] text-muted">{list.name} — what you say, in your words. [Name], [Org] and [Rep] fill in for each contact.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:border-ppc-gold/60 hover:text-ppc-gold">✕</button>
        </div>

        <label className="block">
          <span className="text-[13px] font-bold uppercase tracking-wide text-ppc-gold">Pickup line</span>
          <span className="block text-[13px] text-muted">The first sentence when they answer. It is the biggest text on the screen.</span>
          <textarea ref={first} className={AREA} rows={3} value={pickupLine} onChange={(e) => setPickupLine(e.target.value)} placeholder="Hi [Name], it's [Rep] from Powerplay Customs — got thirty seconds?" />
        </label>

        <label className="block">
          <span className="text-[13px] font-bold uppercase tracking-wide text-ppc-gold">Voicemail</span>
          <span className="block text-[13px] text-muted">What you say when it goes to voicemail. &ldquo;Went to voicemail&rdquo; in the Opening shows it.</span>
          <textarea className={AREA} rows={7} value={voicemailScript} onChange={(e) => setVoicemailScript(e.target.value)} placeholder={"Hi [Name], it's [Rep] from Powerplay Customs. We make custom jerseys for teams like [Org] — I'll try you again later this week, or call me back at …"} />
        </label>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className={`text-[13px] ${error ? 'text-red-300' : 'text-muted'}`}>{saving ? 'Saving…' : error ?? 'Opening lines, objections and quick facts are edited in place on the screen.'}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-[15px] font-semibold hover:border-ppc-gold/60 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-ppc-gold px-5 py-2.5 text-[15px] font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50">Save</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
