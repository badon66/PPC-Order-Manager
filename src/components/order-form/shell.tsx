'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The form's three faces, per Keenan's spec:
 *
 *  - "sections"  — everything on one page with a sticky side nav (desktop) or
 *                  jump menu (phone). The editing view.
 *  - "wizard"    — one section per screen, Back/Next, progress. Offered when
 *                  an order is brand new, for building one by answering
 *                  questions step by step.
 *  - A switch at the top flips between them at any time. Same draft state and
 *    autosave underneath — these are lenses, not separate forms.
 */

export type ViewMode = 'sections' | 'wizard';

export interface SectionDef {
  id: string;
  title: string;
  icon: string;
  /** One line shown under the title in the wizard. */
  blurb: string;
  /** Drives the tick in the side nav / wizard list. */
  complete: boolean;
}

/* ------------------------------------------------------------------ *
 * Mode switch
 * ------------------------------------------------------------------ */

export function ModeSwitch({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex rounded-lg border border-line bg-surface-2 p-0.5 text-xs font-semibold">
      {(
        [
          ['sections', 'All sections'],
          ['wizard', 'Step-by-step'],
        ] as const
      ).map(([m, label]) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded-md px-3 py-1.5 transition-colors ${
            mode === m ? 'bg-ppc-gold text-black' : 'text-muted hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * New-order chooser
 * ------------------------------------------------------------------ */

export function StartChooser({ onPick }: { onPick: (m: ViewMode) => void }) {
  return (
    <div className="rounded-xl border border-ppc-gold/50 bg-ppc-gold/[0.05] p-5">
      <h2 className="text-lg font-bold">How do you want to build this order?</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onPick('wizard')}
          className="rounded-xl border border-ppc-gold bg-ppc-gold/10 p-4 text-left transition-colors hover:bg-ppc-gold/20"
        >
          <div className="text-2xl">🧭</div>
          <div className="mt-2 font-bold text-ppc-gold">Setup wizard</div>
          <p className="mt-1 text-sm text-muted">
            Answer questions one step at a time. Good for building a new team order without
            missing anything.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onPick('sections')}
          className="rounded-xl border border-line bg-surface-2 p-4 text-left transition-colors hover:border-ppc-gold/50"
        >
          <div className="text-2xl">📋</div>
          <div className="mt-2 font-bold">Full form</div>
          <p className="mt-1 text-sm text-muted">
            Everything on one page. Fastest when you already know what you&apos;re entering.
          </p>
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">You can switch between them any time — nothing is lost.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sections mode: sticky side nav with scroll-spy
 * ------------------------------------------------------------------ */

export function SectionNav({
  sections,
  activeId,
  onJump,
}: {
  sections: SectionDef[];
  activeId: string;
  onJump: (id: string) => void;
}) {
  return (
    <>
      {/* Desktop sidebar */}
      <nav aria-label="Form sections" className="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-52 shrink-0 space-y-0.5 overflow-y-auto lg:block">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onJump(s.id)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              activeId === s.id
                ? 'bg-ppc-gold/10 font-bold text-ppc-gold'
                : 'text-muted hover:bg-surface-2 hover:text-foreground'
            }`}
          >
            <span className="text-base leading-none">{s.icon}</span>
            <span className="min-w-0 flex-1 truncate">{s.title}</span>
            {s.complete && <span className="text-xs text-emerald-400">✓</span>}
          </button>
        ))}
      </nav>

      {/* Phone: sticky jump menu */}
      <div className="sticky top-[3.4rem] z-20 -mx-4 border-b border-line bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
        <select
          value={activeId}
          onChange={(e) => onJump(e.target.value)}
          className="w-full"
          aria-label="Jump to section"
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.icon} {s.title} {s.complete ? '✓' : ''}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

/** Watches the section blocks and reports which one is on screen. */
export function useScrollSpy(ids: string[]): [string, (id: string) => void] {
  const [active, setActive] = useState(ids[0] ?? '');
  const suppress = useRef(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < suppress.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace(/^sec-/, ''));
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    for (const id of ids) {
      const el = document.getElementById(`sec-${id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);

  const jump = (id: string) => {
    setActive(id);
    // Hold the spy briefly so the smooth scroll doesn't fight the click.
    suppress.current = Date.now() + 800;
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return [active, jump];
}

/* ------------------------------------------------------------------ *
 * Section card (both modes render content inside this)
 * ------------------------------------------------------------------ */

export function SectionCard({
  def,
  children,
  anchored = false,
}: {
  def: SectionDef;
  children: ReactNode;
  anchored?: boolean;
}) {
  return (
    <section
      id={anchored ? `sec-${def.id}` : undefined}
      className="scroll-mt-24 rounded-xl border border-line bg-surface"
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-base">
          {def.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ppc-gold">{def.title}</h2>
        </div>
        {def.complete && (
          <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-300">
            ✓
          </span>
        )}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Wizard chrome
 * ------------------------------------------------------------------ */

export function WizardFrame({
  sections,
  stepIndex,
  onStep,
  onFinish,
  children,
}: {
  sections: SectionDef[];
  stepIndex: number;
  onStep: (i: number) => void;
  onFinish: () => void;
  children: ReactNode;
}) {
  const def = sections[stepIndex];
  const last = stepIndex === sections.length - 1;
  const doneCount = sections.filter((s) => s.complete).length;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div>
        <div className="flex items-baseline justify-between text-xs font-semibold text-muted">
          <span>
            Step {stepIndex + 1} of {sections.length}
          </span>
          <span>{doneCount} section{doneCount === 1 ? '' : 's'} filled in</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-ppc-gold transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / sections.length) * 100}%` }}
          />
        </div>
        {/* Step dots — clickable, so it's a guide rather than a cage */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sections.map((s, i) => (
            <button
              key={s.id}
              type="button"
              title={s.title}
              onClick={() => onStep(i)}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                i === stepIndex
                  ? 'bg-ppc-gold'
                  : s.complete
                    ? 'bg-emerald-400/70'
                    : 'bg-line hover:bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-ppc-gold/30 bg-surface">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ppc-gold/10 text-xl">
            {def.icon}
          </span>
          <div>
            <h2 className="text-lg font-bold">{def.title}</h2>
            <p className="text-xs text-muted">{def.blurb}</p>
          </div>
        </div>
        <div className="space-y-4 p-5">{children}</div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={stepIndex === 0}
          onClick={() => onStep(stepIndex - 1)}
          className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold hover:border-ppc-gold/60 disabled:opacity-30"
        >
          ← Back
        </button>
        {last ? (
          <button
            type="button"
            onClick={onFinish}
            className="rounded-lg bg-ppc-gold px-5 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim"
          >
            Finish → view order
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onStep(stepIndex + 1)}
            className="rounded-lg bg-ppc-gold px-5 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim"
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
