'use client';

import type { Contact, Discovery, JerseyManagerAnswer, LeadRating, ScriptItem, SupplierPriority } from '@/lib/types';
import { LAST_REDONE_OPTIONS, LOOKING_AT_OPTIONS, SUPPLIER_PRIORITIES } from '@/lib/types';
import { LAST_REDONE_LABELS, LOOKING_AT_LABELS, SUPPLIER_PRIORITY_LABELS } from '@/lib/constants';
import { StarRating } from '../star-rating';
import { JerseyManagerQuestion } from './jersey-manager-question';

const CHOICE = 'rounded-lg border px-3 py-2.5 text-left text-[15px] transition-colors';
const ACTIVE = 'border-ppc-gold bg-ppc-gold/10 text-ppc-gold';
const INACTIVE = 'border-line bg-surface-2 hover:border-ppc-gold/50';

function Q({ n, text, children }: { n: number; text: string; children: React.ReactNode }) {
  return (
    <div data-testid={`discovery-q${n}`}>
      <p className="text-[16px] font-medium"><span className="mr-2 text-ppc-gold">{n}</span>{text}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** Q2 — six named stops on a track. One tap sets it, the same tap clears it, arrow keys walk it. */
function LastRedoneTrack({ value, onChange, disabled }: { value: Discovery['lastRedone']; onChange: (v: Discovery['lastRedone']) => void; disabled: boolean }) {
  const idx = value ? LAST_REDONE_OPTIONS.indexOf(value) : -1;
  return (
    <div
      role="radiogroup"
      aria-label="When were the jerseys last redone"
      className={`relative grid grid-cols-6 gap-1 ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const next = Math.min(LAST_REDONE_OPTIONS.length - 1, Math.max(0, idx + (e.key === 'ArrowRight' ? 1 : -1)));
        onChange(LAST_REDONE_OPTIONS[next]);
      }}
    >
      <div aria-hidden className="absolute left-[8%] right-[8%] top-[13px] h-0.5 bg-line" />
      {idx >= 0 && <div aria-hidden className="absolute left-[8%] top-[13px] h-0.5 bg-ppc-gold" style={{ width: `${(idx / (LAST_REDONE_OPTIONS.length - 1)) * 84}%` }} />}
      {LAST_REDONE_OPTIONS.map((o, i) => {
        const on = i === idx;
        const passed = i < idx;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? '' : o)}
            className="group relative flex flex-col items-center gap-1.5 pt-1 text-[13px] focus:outline-none"
          >
            <span className={`relative z-10 h-5 w-5 rounded-full border-2 transition-colors ${on ? 'border-ppc-gold bg-ppc-gold' : passed ? 'border-ppc-gold bg-surface' : 'border-line bg-surface group-hover:border-ppc-gold/60'}`} />
            <span className={on ? 'font-semibold text-ppc-gold' : 'text-muted group-hover:text-foreground'}>{LAST_REDONE_LABELS[o]}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * ② Discovery: exactly five questions. Q1 is the jersey-manager answer
 * (its wording comes from the sheet's jersey_manager line when there is
 * one), Q2–Q5 live on `discovery`. Nothing else renders here — the sheet's
 * other discovery rows are ignored on screen. Every answer is one tap.
 */
export function DiscoveryPanel({
  items, linked, jerseyManager, onJerseyManager, discovery, onDiscovery, onAnswer, disabled,
}: {
  /** Discovery rows that apply to this contact, placeholders filled — only the jersey_manager line is read. */
  items: ScriptItem[];
  linked: Contact[];
  jerseyManager: JerseyManagerAnswer;
  onJerseyManager: (p: Partial<JerseyManagerAnswer>) => void;
  discovery: Discovery;
  /** A patch, or a function of the latest answers — so two taps in one tick can't overwrite each other. */
  onDiscovery: (p: Partial<Discovery> | ((d: Discovery) => Partial<Discovery>)) => void;
  onAnswer: (id: string, value: string) => void;
  disabled: boolean;
}) {
  const managerItem = items.find((i) => i.kind === 'jersey_manager');
  const d = discovery;
  const dim = disabled ? 'pointer-events-none opacity-60' : '';

  const tapPriority = (p: SupplierPriority) => onDiscovery((cur) => {
    if (cur.primaryPriority === p) return { primaryPriority: '', alsoPriorities: [] };
    if (!cur.primaryPriority) return { primaryPriority: p };
    return { alsoPriorities: cur.alsoPriorities.includes(p) ? cur.alsoPriorities.filter((x) => x !== p) : [...cur.alsoPriorities, p] };
  });

  return (
    <div className="space-y-5">
      <h3 className="text-[13px] font-bold uppercase tracking-wide text-ppc-gold">② Discovery</h3>

      <Q n={1} text={managerItem?.text ?? 'Who looks after the jerseys?'}>
        <JerseyManagerQuestion
          text=""
          linked={linked}
          value={jerseyManager}
          onChange={onJerseyManager}
          onAnswer={(label) => { if (managerItem) onAnswer(managerItem.id, label); }}
          disabled={disabled}
        />
      </Q>

      <Q n={2} text="When were the jerseys last redone?">
        <LastRedoneTrack value={d.lastRedone} onChange={(v) => onDiscovery({ lastRedone: v })} disabled={disabled} />
      </Q>

      <Q n={3} text="Happy with the last set?">
        <div className={`flex flex-wrap items-center gap-4 ${dim}`}>
          <StarRating value={d.satisfaction} onChange={(v) => onDiscovery({ satisfaction: v as LeadRating | null })} size="lg" label="Happy with the last set" />
          <input
            className="min-w-[16rem] flex-1 text-[15px]"
            value={d.changeOneThing}
            onChange={(e) => onDiscovery({ changeOneThing: e.target.value })}
            placeholder="If you could change one thing…"
            aria-label="If you could change one thing"
          />
        </div>
      </Q>

      <Q n={4} text="What would they be looking at?">
        <div className={dim}>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {LOOKING_AT_OPTIONS.map((o) => (
              <button key={o} type="button" aria-pressed={d.lookingAt === o} onClick={() => onDiscovery({ lookingAt: d.lookingAt === o ? '' : o })} className={`${CHOICE} ${d.lookingAt === o ? ACTIVE : INACTIVE}`}>
                {LOOKING_AT_LABELS[o]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            {(['home', 'away'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={d[k]} onClick={() => onDiscovery((cur) => ({ [k]: !cur[k] }))} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${d[k] ? ACTIVE : INACTIVE}`}>
                {d[k] ? '✓ ' : ''}{k === 'home' ? 'Home' : 'Away'}
              </button>
            ))}
          </div>
        </div>
      </Q>

      <Q n={5} text="What matters most in a supplier?">
        <div className={`flex flex-wrap gap-2 ${dim}`}>
          {SUPPLIER_PRIORITIES.map((p) => {
            const primary = d.primaryPriority === p;
            const also = d.alsoPriorities.includes(p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={primary || also}
                onClick={() => tapPriority(p)}
                className={`rounded-full border px-4 py-2 text-[15px] transition-colors ${primary ? 'border-ppc-gold bg-ppc-gold text-black font-bold' : also ? ACTIVE : INACTIVE}`}
              >
                {primary && <span className="mr-1.5 text-[11px] uppercase tracking-wide">1st</span>}
                {SUPPLIER_PRIORITY_LABELS[p]}
                {also && <span className="ml-1.5 text-[11px] uppercase tracking-wide text-muted">also</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[13px] text-muted">First tap = what matters most. More taps = also mentioned.</p>
      </Q>
    </div>
  );
}
