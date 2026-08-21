'use client';

import { useState } from 'react';
import { CLIENT_LINK_SECTION_META, type ClientLinkSections } from '@/lib/types';
import { Toggle } from './fields';

/**
 * The client link panel.
 *
 * One master switch, and when it's on, a small config area: tick what the link
 * should ask the customer for. Only the ticked sections render on their form.
 * The link itself sits right here so you can copy it the moment you've set it up.
 */
export function ClientLinkConfig({
  enabled,
  sections,
  rosterToken,
  onEnabledChange,
  onSectionsChange,
}: {
  enabled: boolean;
  sections: ClientLinkSections;
  rosterToken: string;
  onEnabledChange: (v: boolean) => void;
  onSectionsChange: (v: ClientLinkSections) => void;
}) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/roster/${rosterToken}`
      : `/roster/${rosterToken}`;

  const keys = Object.keys(CLIENT_LINK_SECTION_META) as Array<keyof ClientLinkSections>;
  const anyOn = keys.some((k) => sections[k]);

  return (
    <div className="space-y-3">
      <Toggle
        label="Send the client a link to fill in details themselves"
        checked={enabled}
        onChange={onEnabledChange}
      />

      {enabled && (
        <div className="space-y-4 rounded-lg border border-ppc-gold/40 bg-ppc-gold/[0.04] p-4">
          <div>
            <div className="text-sm font-bold text-ppc-gold">Client link setup</div>
            <p className="mt-0.5 text-xs text-muted">
              Choose what the link asks for. The customer only sees the sections you tick.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {keys.map((k) => {
              const on = sections[k];
              const meta = CLIENT_LINK_SECTION_META[k];
              return (
                <button
                  key={k}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => onSectionsChange({ ...sections, [k]: !on })}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    on
                      ? 'border-ppc-gold bg-ppc-gold/10'
                      : 'border-line bg-surface-2 hover:border-ppc-gold/50'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[0.6rem] font-black ${
                      on ? 'border-ppc-gold bg-ppc-gold text-black' : 'border-line'
                    }`}
                  >
                    {on ? '✓' : ''}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${on ? 'text-ppc-gold' : ''}`}>
                      {meta.label}
                    </span>
                    <span className="block text-xs text-muted">{meta.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {!anyOn && (
            <p className="text-xs font-semibold text-amber-300">
              Nothing ticked — the link will open to an empty form. Tick at least one section.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2.5 py-1.5 text-xs text-muted">
              {url}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                } catch {
                  /* clipboard blocked */
                }
              }}
              className="rounded-lg bg-ppc-gold px-3 py-1.5 text-xs font-bold text-black hover:bg-ppc-gold-dim"
            >
              {copied ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
