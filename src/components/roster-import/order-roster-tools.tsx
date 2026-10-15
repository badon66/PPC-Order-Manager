'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatShort, timestampDay } from '@/lib/dates';
import type { ImportContext } from '@/lib/roster-import/build';
import { nextRosterNumber, type RosterVersionSummary } from '@/lib/roster-versions';
import { RosterImporter, type ImporterFile } from './importer';
import { RosterVersions } from './versions';

export interface TeamRosterFile {
  fileUrl: string;
  fileName: string;
  notes: string;
  submittedAt: string;
  /** Signed link that loads. */
  viewUrl: string;
}

/**
 * The roster tools on the order page: the rosters on the order, the files the
 * team sent (each with an Import button), and Import for any other file.
 * The page is server-rendered, so after a change it simply refreshes.
 */
export function OrderRosterTools({
  orderId, ctx, versions, numbersUsed, fileLinks, teamFiles, signedOff,
}: {
  orderId: string;
  ctx: ImportContext;
  versions: RosterVersionSummary[];
  /** The highest roster number ever given: deleted numbers aren't reused. */
  numbersUsed: number;
  fileLinks: Record<string, string>;
  teamFiles: TeamRosterFile[];
  signedOff: boolean;
}) {
  const router = useRouter();
  const [importing, setImporting] = useState<ImporterFile | 'pick' | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  return (
    <div className="mb-4 space-y-3">
      <RosterVersions orderId={orderId} versions={versions} fileLinks={fileLinks} afterChange={() => router.refresh()} />

      {teamFiles.length > 0 && (
        <div className="rounded-lg border border-ppc-gold/40 bg-ppc-gold/5 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ppc-gold">Roster files from the team</p>
          <ul className="mt-1 space-y-1.5 text-sm">
            {teamFiles.map((f) => (
              <li key={f.fileUrl} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <a href={f.viewUrl || f.fileUrl} target="_blank" rel="noreferrer" className="font-semibold text-ppc-gold hover:underline">
                  {f.fileName || 'Roster file'}
                </a>
                {f.notes && <span className="text-muted">— {f.notes}</span>}
                <span className="text-muted">· sent {formatShort(timestampDay(f.submittedAt))}</span>
                <button type="button"
                  onClick={() => setImporting({ fileUrl: f.fileUrl, fileName: f.fileName, viewUrl: f.viewUrl })}
                  className="ml-auto rounded-md border border-ppc-gold/60 px-2.5 py-1 text-xs font-bold text-ppc-gold hover:bg-ppc-gold/10">
                  Import it
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">
            Import reads the file, shows you what it found and anything it isn&apos;t sure of, and makes it a new roster when you accept.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setImporting('pick')}
          className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-semibold hover:border-ppc-gold/60">
          Import a roster file
        </button>
        {added && <span className="text-sm text-emerald-300">{added} added and in use.</span>}
      </div>

      {importing && (
        <RosterImporter
          orderId={orderId}
          ctx={ctx}
          nextNumber={nextRosterNumber(versions, numbersUsed)}
          initialFile={importing === 'pick' ? undefined : importing}
          signedOff={signedOff}
          onAccepted={(label) => {
            setImporting(null);
            setAdded(label);
            router.refresh();
          }}
          onClose={() => setImporting(null)}
        />
      )}
    </div>
  );
}
