'use client';

export type SaveState = 'idle' | 'saving' | 'error';

export function FooterBar({
  canPrevious, onPrevious, canSkip, onSkip, canFinish, onFinish, finishLabel, tally, onHelp,
}: {
  canPrevious: boolean; onPrevious: () => void;
  canSkip: boolean; onSkip: () => void;
  canFinish: boolean; onFinish: () => void; finishLabel: string;
  tally: { calls: number; reached: number; voicemails: number; callbacks: number; infoSent: number };
  onHelp: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-[120rem] flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex gap-2">
          <button type="button" disabled={!canPrevious} onClick={onPrevious} title="Ctrl+←" className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold hover:border-ppc-gold/60 disabled:opacity-30">← Previous</button>
          <button type="button" disabled={!canSkip} onClick={onSkip} title="Ctrl+→" className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold hover:border-ppc-gold/60 disabled:opacity-30">Skip →</button>
        </div>
        <div className="hidden items-center gap-3 text-xs tabular-nums text-muted sm:flex">
          <span>Calls <b className="text-foreground">{tally.calls}</b></span>
          <span>Reached <b className="text-foreground">{tally.reached}</b></span>
          <span>Voicemails <b className="text-foreground">{tally.voicemails}</b></span>
          <span>Callbacks <b className="text-foreground">{tally.callbacks}</b></span>
          <span>Info sent <b className="text-foreground">{tally.infoSent}</b></span>
          <button type="button" onClick={onHelp} className="rounded border border-line px-1.5 text-[0.7rem] hover:text-ppc-gold" title="Keyboard shortcuts">?</button>
        </div>
        <button
          type="button"
          disabled={!canFinish}
          onClick={onFinish}
          title="Ctrl+Enter"
          className="rounded-lg bg-ppc-gold px-5 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-40"
        >
          {finishLabel}
        </button>
      </div>
    </div>
  );
}
