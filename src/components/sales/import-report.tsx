import type { ImportReport } from '@/lib/types';

export function ImportReportPanel({ report }: { report: ImportReport }) {
  const n = report.skipped.length + report.warnings.length;
  if (n === 0) return null;
  return (
    <details className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-200">
      <summary className="cursor-pointer font-semibold">
        {report.imported} imported · {report.skipped.length} skipped · {report.warnings.length} warning{report.warnings.length === 1 ? '' : 's'}
      </summary>
      <div className="mt-2 space-y-2 text-amber-100/90">
        {report.skipped.length > 0 && (
          <div>
            <p className="font-semibold">Skipped rows (fix the sheet and re-upload):</p>
            <ul className="ml-4 list-disc">
              {report.skipped.map((s, i) => <li key={i}>Line {s.line}: {s.reason}{s.raw ? <span className="text-amber-200/70"> — {s.raw}</span> : null}</li>)}
            </ul>
          </div>
        )}
        {report.warnings.length > 0 && (
          <div>
            <p className="font-semibold">Kept as typed, worth a look:</p>
            <ul className="ml-4 list-disc">
              {report.warnings.map((w, i) => <li key={i}>Line {w.line}: {w.reason}</li>)}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
