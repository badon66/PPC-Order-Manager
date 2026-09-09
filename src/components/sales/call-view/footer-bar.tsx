'use client';

export type SaveState = 'idle' | 'saving' | 'error';

/** The bottom row of the calling screen: move through the queue, see the session's tally. Logging lives on the outcome board. */
export function FooterBar({
  canPrevious, onPrevious, canSkip, onSkip, tally, onHelp,
}: {
  canPrevious: boolean; onPrevious: () => void;
  canSkip: boolean; onSkip: () => void;
  tally: { calls: number; reached: number; voicemails: number; callbacks: number; infoSent: number };
  onHelp: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2.5">
      <div className="flex gap-2">
        <button type="button" disabled={!canPrevious} onClick={onPrevious} title="Ctrl+←" className="rounded-lg border border-line bg-surface-2 px-4 py-2 text-[15px] font-semibold hover:border-ppc-gold/60 disabled:opacity-30">← Previous</button>
        <button type="button" disabled={!canSkip} onClick={onSkip} title="Ctrl+→" className="rounded-lg border border-line bg-surface-2 px-4 py-2 text-[15px] font-semibold hover:border-ppc-gold/60 disabled:opacity-30">Skip →</button>
      </div>
      <div className="flex items-center gap-4 text-[13px] tabular-nums text-muted">
        <span>Calls <b className="text-foreground">{tally.calls}</b></span>
        <span>Reached <b className="text-foreground">{tally.reached}</b></span>
        <span>Voicemails <b className="text-foreground">{tally.voicemails}</b></span>
        <span>Callbacks <b className="text-foreground">{tally.callbacks}</b></span>
        <span>Info sent <b className="text-foreground">{tally.infoSent}</b></span>
        <button type="button" onClick={onHelp} className="rounded border border-line px-1.5 text-[0.7rem] hover:text-ppc-gold" title="Keyboard shortcuts">?</button>
      </div>
    </div>
  );
}
