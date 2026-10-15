'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { acceptRosterImport } from '@/app/orders/actions';
import { uploadFile } from '@/components/order-form/assets';
import { rosterToCsv } from '@/lib/csv';
import { withHeaderRow } from '@/lib/roster-import/analyze';
import { buildImport, pickName, toRosterEntries, type ImportContext } from '@/lib/roster-import/build';
import { downloadText, readableCopy, requestRead } from '@/lib/roster-import/client';
import { sizeOptions, type SizeField } from '@/lib/roster-import/sizes';
import {
  CHOOSABLE_FIELDS, FIELD_LABELS, emptyDecisions, readByAi,
  type ImportAnalysis, type ImportDecisions, type ImportField, type ImportIssue, type ImportResult,
  type ImportedRow, type NameFormat, type PendingValue, type ResolvedColumn, type RowFields,
} from '@/lib/roster-import/types';

/**
 * Keenan's roster importer: a file in, a checked preview, Accept → Roster N.
 *
 * Every number on this screen comes from `buildImport` — the same function the
 * server runs again on Accept — so what the preview says is ready is exactly
 * what the server will accept. Nothing is written until Accept.
 *
 * Four kinds of thing on screen, in the order they need attention:
 *   Columns    which of their columns is which of ours (rules + AI must agree)
 *   Questions  must be answered before Accept: a garment, a size, a cell the
 *              two AI readings disagreed on
 *   Checks     probably fine, but someone has to say so: a tick each
 *   Done       what was translated automatically, for the record
 */

export interface ImporterFile {
  fileUrl: string;
  fileName: string;
  /** A link that loads, for a photo the browser should shrink before sending. */
  viewUrl?: string;
}

const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xlsm,.docx,.pdf,.htm,.html,.xls,image/*';
const BTN = 'rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-semibold hover:border-ppc-gold/60 disabled:opacity-40';
const PRIMARY = 'rounded-lg bg-ppc-gold px-4 py-2 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-40';
const CHIP = 'rounded-md border px-2.5 py-1 text-xs font-semibold';

const isImageName = (n: string) => /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(n);

export function RosterImporter({
  orderId, ctx, nextNumber, initialFile, signedOff = false, beforeAccept, onAccepted, onClose,
}: {
  orderId: string;
  ctx: ImportContext;
  /** The number the new roster will get, for the Accept button. */
  nextNumber: number;
  /** The customer has signed off: a new roster changes what they approved. */
  signedOff?: boolean;
  /** A file that's already stored (the team's upload): read straight away. */
  initialFile?: ImporterFile;
  /** Save anything pending on the current roster before a new one goes in use. */
  beforeAccept?: () => Promise<void>;
  onAccepted: (label: string) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<'pick' | 'working' | 'preview'>(initialFile ? 'working' : 'pick');
  const [working, setWorking] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [decisions, setDecisions] = useState<ImportDecisions>(emptyDecisions);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const read = useCallback(async (copy: Blob | null, fileName: string, fileUrl: string) => {
    setPhase('working');
    setError(null);
    setWorking(
      /\.(pdf|jpe?g|png|gif|webp|heic|docx)$/i.test(fileName)
        ? 'Reading it — a PDF or a photo is read twice by AI and the two readings compared, cell by cell. About 20–40 seconds.'
        : 'Reading it — a few seconds.',
    );
    const res = await requestRead(`/api/orders/${orderId}/roster-read`, { copy, fileName, fileUrl });
    if (!res.ok) {
      setError(res.error);
      setPhase('pick');
      return;
    }
    setAnalysis(res.analysis);
    setDecisions(emptyDecisions());
    setPhase('preview');
  }, [orderId]);

  async function pick(file: File) {
    setPhase('working');
    setError(null);
    setWorking('Uploading the file…');
    let stored: { fileUrl: string; fileName: string };
    try {
      stored = await uploadFile(file, 'roster');
    } catch (e) {
      setError((e as Error).message);
      setPhase('pick');
      return;
    }
    await read(await readableCopy(file, file.name), file.name, stored.fileUrl);
  }

  // A stored file (the team's): a photo is fetched and shrunk here first, since
  // the server can't shrink it; anything else the server reads from storage.
  const started = useRef(false);
  useEffect(() => {
    if (!initialFile || started.current) return;
    started.current = true;
    (async () => {
      let copy: Blob | null = null;
      if (initialFile.viewUrl && isImageName(initialFile.fileName)) {
        try {
          const blob = await (await fetch(initialFile.viewUrl)).blob();
          copy = await readableCopy(blob, initialFile.fileName);
        } catch {
          copy = null;
        }
      }
      await read(copy, initialFile.fileName, initialFile.fileUrl);
    })();
  }, [initialFile, read]);

  const result = useMemo(
    () => (analysis ? buildImport(analysis, decisions, ctx) : null),
    [analysis, decisions, ctx],
  );

  // Escape closes — except over a preview with answers in it, which closes
  // only by Cancel or ✕, so a stray key doesn't throw the work away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving && phase !== 'preview') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving, phase]);

  async function accept() {
    if (!analysis || !result?.ready) return;
    setSaving(true);
    setError(null);
    try {
      await beforeAccept?.();
      const res = await acceptRosterImport(orderId, analysis, decisions);
      if (res.ok) onAccepted(res.label);
      else setError(res.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function downloadCsv() {
    if (!analysis || !result) return;
    const entries = toRosterEntries(result, ctx, orderId, '');
    const base = (analysis.fileName || 'roster').replace(/\.[a-z0-9]+$/i, '');
    downloadText(rosterToCsv(entries, ctx.nameStyle), `${base} - Powerplay roster.csv`);
  }

  const patch = (p: Partial<ImportDecisions>) => setDecisions((d) => ({ ...d, ...p }));

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving && phase !== 'preview') onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Import a roster file" className="w-full max-w-6xl rounded-xl border border-line bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Import a roster file</h2>
            <p className="text-sm text-muted">
              A spreadsheet, CSV, Word table, PDF or photo of the list. It becomes Roster {nextNumber} and goes in use; the
              roster you have now is kept.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close"
            className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:border-ppc-gold/60 hover:text-ppc-gold disabled:opacity-40">✕</button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {signedOff && (
            <p className="rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              This order has been signed off. A new roster changes what the customer approved — tell them, and have them check it.
            </p>
          )}
          <input ref={fileRef} type="file" hidden accept={ACCEPT}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />

          {phase === 'pick' && (
            <div className="rounded-lg border border-dashed border-line p-6 text-center">
              <button type="button" className={PRIMARY} onClick={() => fileRef.current?.click()}>Choose the file</button>
              <p className="mt-2 text-xs text-muted">
                Spreadsheets and CSVs are read cell for cell. A PDF or photo is read twice by AI and the readings compared —
                anything they disagree on is asked, never guessed.
              </p>
            </div>
          )}

          {phase === 'working' && (
            <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-4 text-sm">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-ppc-gold border-t-transparent" aria-hidden />
              <span>{working}</span>
            </div>
          )}

          {error && <p className="rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300">{error}</p>}

          {phase === 'preview' && analysis && result && (
            <Preview
              analysis={analysis}
              result={result}
              decisions={decisions}
              ctx={ctx}
              patch={patch}
              setDecisions={setDecisions}
              onHeaderRow={(n) => {
                setAnalysis(withHeaderRow(analysis, n));
                // What each column is depends on its heading: start those answers again.
                setDecisions((d) => ({ ...emptyDecisions(), nameFormat: d.nameFormat }));
              }}
              onAnotherFile={() => fileRef.current?.click()}
            />
          )}
        </div>

        {phase === 'preview' && result && (
          <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-b-xl border-t border-line bg-surface px-5 py-3">
            <span className="mr-auto text-sm">
              <span className="font-semibold">{result.rows.length} player{result.rows.length === 1 ? '' : 's'}</span>
              {result.counts.block > 0 && <span className="text-amber-300"> · {result.counts.block} question{result.counts.block === 1 ? '' : 's'} to answer</span>}
              {unticked(result, decisions) > 0 && <span className="text-amber-300"> · {unticked(result, decisions)} to check</span>}
              {result.ready && <span className="text-emerald-300"> · ready</span>}
            </span>
            <button type="button" className={BTN} onClick={downloadCsv} disabled={result.rows.length === 0}
              title={result.ready ? 'Our roster CSV of this preview' : 'Anything still unanswered is blank in the file'}>
              Download as CSV
            </button>
            <button type="button" className={BTN} onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className={PRIMARY} onClick={accept} disabled={!result.ready || saving}>
              {saving ? 'Saving…' : `Accept — make it Roster ${nextNumber}`}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function unticked(result: ImportResult, d: ImportDecisions): number {
  const ack = new Set(d.acknowledged);
  return result.issues.filter((i) => i.level === 'confirm' && !ack.has(i.id)).length;
}

/* ------------------------------------------------------------------ *
 * The preview
 * ------------------------------------------------------------------ */

function Preview({
  analysis: a, result: r, decisions: d, ctx, patch, setDecisions, onHeaderRow, onAnotherFile,
}: {
  analysis: ImportAnalysis;
  result: ImportResult;
  decisions: ImportDecisions;
  ctx: ImportContext;
  patch: (p: Partial<ImportDecisions>) => void;
  setDecisions: React.Dispatch<React.SetStateAction<ImportDecisions>>;
  onHeaderRow: (n: number) => void;
  onAnotherFile: () => void;
}) {
  const blocks = r.issues.filter((i) => i.level === 'block');
  const checks = r.issues.filter((i) => i.level === 'confirm');
  const infos = r.issues.filter((i) => i.level === 'info');
  const ack = new Set(d.acknowledged);
  const setAck = (id: string, on: boolean) =>
    setDecisions((x) => ({ ...x, acknowledged: on ? [...new Set([...x.acknowledged, id])] : x.acknowledged.filter((y) => y !== id) }));
  const setColumn = (c: number, f: ImportField | null) =>
    setDecisions((x) => {
      const columns = { ...x.columns };
      if (f === null) delete columns[c];
      else columns[c] = f;
      return { ...x, columns };
    });
  const leaveOut = (row: number) =>
    setDecisions((x) => ({ ...x, excluded: [...new Set([...x.excluded, row])], included: x.included.filter((y) => y !== row) }));
  const putBack = (row: number) =>
    setDecisions((x) => ({
      ...x,
      excluded: x.excluded.filter((y) => y !== row),
      included: a.notPlayerRows.includes(row) ? [...new Set([...x.included, row])] : x.included,
    }));
  const setEdit = (row: number, p: Partial<RowFields>) =>
    setDecisions((x) => ({ ...x, edits: { ...x.edits, [row]: { ...(x.edits[row] ?? {}), ...p } } }));

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold">{a.fileName || 'The file'}</span>
          <span className="text-muted">{a.how}</span>
          <button type="button" className="ml-auto text-xs font-semibold text-ppc-gold hover:underline" onClick={onAnotherFile}>Use a different file</button>
        </div>
        {a.aiNote && <p className="mt-1 text-xs font-semibold text-amber-300">{a.aiNote}</p>}
        {readByAi(a.kind) && (
          <p className="mt-1 text-xs text-muted">Read from a {a.kind === 'image' ? 'photo' : a.kind === 'pdf' ? 'PDF' : 'document'} — check the names against the file before you accept.</p>
        )}
      </div>

      <Columns a={a} r={r} d={d} onHeaderRow={onHeaderRow} setColumn={setColumn} />

      {blocks.length > 0 && (
        <Group title={`Questions (${blocks.length})`} hint="Each needs an answer before the roster can be accepted. Nothing here is guessed.">
          {blocks.map((i) => (
            <Question key={i.id} issue={i} a={a} r={r} d={d} patch={patch} setDecisions={setDecisions} setColumn={setColumn} />
          ))}
        </Group>
      )}

      {checks.length > 0 && (
        <Group title={`Check these (${checks.filter((i) => !ack.has(i.id)).length} left)`} hint="Probably right — tick each once you've looked.">
          {checks.map((i) => (
            <Check key={i.id} issue={i} ticked={ack.has(i.id)} onTick={(on) => setAck(i.id, on)}
              onLeaveOut={i.id.startsWith('blank:') && i.row !== undefined ? () => leaveOut(i.row!) : undefined}
              onPutBack={i.id.startsWith('notplayer:') && i.row !== undefined ? () => putBack(i.row!) : undefined} />
          ))}
        </Group>
      )}

      <Rows r={r} d={d} ctx={ctx} setEdit={setEdit} leaveOut={leaveOut} />

      {r.leftOut.length > 0 && (
        <Group title={`Left out (${r.leftOut.length})`} hint="Not added to the roster.">
          {r.leftOut.map((x) => (
            <div key={x.row} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Row {x.row + 1}:</span>
              <span className="min-w-0 flex-1 truncate">{x.text || '(blank)'}</span>
              <span className="text-xs text-muted">{x.reason}</span>
              {!x.reason.startsWith('The header row') && (
                <button type="button" className="text-xs font-semibold text-ppc-gold hover:underline" onClick={() => putBack(x.row)}>Put it back</button>
              )}
            </div>
          ))}
        </Group>
      )}

      {infos.length > 0 && (
        <details className="rounded-lg border border-line bg-surface-2 px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-muted">Done automatically ({infos.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {infos.map((i) => <li key={i.id}>{i.message}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line">
      <div className="border-b border-line px-3 py-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ppc-gold">{title}</h3>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  );
}

/* ---------------- columns ---------------- */

const STATUS_TEXT: Record<ResolvedColumn['status'], { text: string; cls: string }> = {
  agreed: { text: 'Rules and AI agree', cls: 'text-emerald-300' },
  rules: { text: 'By its heading', cls: 'text-emerald-300' },
  chosen: { text: 'Set by you', cls: 'text-ppc-gold' },
  open: { text: 'Pick one', cls: 'font-bold text-amber-300' },
  ignored: { text: 'Not used', cls: 'text-muted' },
};

function Columns({ a, r, d, onHeaderRow, setColumn }: {
  a: ImportAnalysis; r: ImportResult; d: ImportDecisions;
  onHeaderRow: (n: number) => void; setColumn: (c: number, f: ImportField | null) => void;
}) {
  const choices = Math.min(a.rows.length, 8);
  return (
    <Group title="Their columns → ours" hint="A column is only used when two things agree on it (its heading and the AI), or you set it.">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Headings are on</span>
        <select className="max-w-md" value={a.headerRow} onChange={(e) => onHeaderRow(Number(e.target.value))}>
          <option value={-1}>No headings row</option>
          {Array.from({ length: choices }, (_, i) => (
            <option key={i} value={i}>Row {i + 1}: {a.rows[i].filter(Boolean).slice(0, 4).join(' · ').slice(0, 60)}</option>
          ))}
        </select>
      </label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-3">Their column</th>
              <th className="py-1.5 pr-3">What&apos;s in it</th>
              <th className="py-1.5 pr-3">Goes to</th>
              <th className="py-1.5">Why</th>
            </tr>
          </thead>
          <tbody>
            {r.columns.map((col) => {
              const st = STATUS_TEXT[col.status];
              const chosen = col.index in d.columns;
              return (
                <tr key={col.index} className={`border-b border-line/50 align-top ${col.status === 'open' ? 'bg-amber-500/5' : ''}`}>
                  <td className="py-2 pr-3 font-semibold">{col.header || <span className="text-muted">Column {col.index + 1}</span>}</td>
                  <td className="max-w-[16rem] truncate py-2 pr-3 text-muted">{col.sample.join(', ') || '—'}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`What "${col.header || `column ${col.index + 1}`}" is`}
                        value={col.status === 'open' ? '' : col.field}
                        onChange={(e) => setColumn(col.index, (e.target.value || 'ignore') as ImportField)}
                        className={col.status === 'open' ? 'border-amber-400' : ''}
                      >
                        {col.status === 'open' && <option value="">— pick —</option>}
                        {CHOOSABLE_FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                        {!(CHOOSABLE_FIELDS as readonly string[]).includes(col.field) && col.status !== 'open' && (
                          <option value={col.field}>{FIELD_LABELS[col.field]}</option>
                        )}
                      </select>
                      {chosen && (
                        <button type="button" className="text-xs text-muted hover:text-ppc-gold" title="Back to what was read" onClick={() => setColumn(col.index, null)}>↺</button>
                      )}
                    </div>
                    <span className={`mt-0.5 block text-xs ${st.cls}`}>{st.text}</span>
                  </td>
                  <td className="py-2 text-xs text-muted">
                    <span className="block">Rules: {FIELD_LABELS[col.rules.field]} — {col.rules.why}</span>
                    {col.ai && <span className="block">AI: {FIELD_LABELS[col.ai.field]}{col.ai.why ? ` — ${col.ai.why}` : ''}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Group>
  );
}

/* ---------------- questions ---------------- */

function Question({ issue: i, a, r, d, patch, setDecisions, setColumn }: {
  issue: ImportIssue; a: ImportAnalysis; r: ImportResult; d: ImportDecisions;
  patch: (p: Partial<ImportDecisions>) => void;
  setDecisions: React.Dispatch<React.SetStateAction<ImportDecisions>>;
  setColumn: (c: number, f: ImportField | null) => void;
}) {
  const box = 'rounded-md border border-amber-400/40 bg-amber-500/5 p-2.5 text-sm';

  if (i.id === 'nameformat') {
    const sample = r.rows.find((x) => /\s|,/.test(x.name))?.name ?? '';
    const opts: Array<[NameFormat, string]> = [['last', 'Last name'], ['full', 'Full name'], ['first', 'First name']];
    return (
      <div className={box}>
        <p>{i.message}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {opts.map(([f, label]) => (
            <button key={f} type="button" className={`${CHIP} ${d.nameFormat === f ? 'border-ppc-gold text-ppc-gold' : 'border-line'}`} onClick={() => patch({ nameFormat: f })}>
              {label}{sample ? ` — "${pickName(sample, f).value}"` : ''}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (i.id.startsWith('bare:') && i.col !== undefined) {
    const c = i.col;
    return (
      <div className={box}>
        <p>{i.message}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={`${CHIP} border-line`} onClick={() => setDecisions((x) => ({ ...x, bare: { ...x.bare, [c]: 'senior' } }))}>Adult sizes (S → Senior Small)</button>
          <button type="button" className={`${CHIP} border-line`} onClick={() => setDecisions((x) => ({ ...x, bare: { ...x.bare, [c]: 'youth' } }))}>Youth sizes (S → Youth S/M)</button>
        </div>
      </div>
    );
  }

  if (i.id.startsWith('value:') && i.valueKey) {
    const p = r.needs.values.find((v) => v.key === i.valueKey);
    if (!p) return <p className={box}>{i.message}</p>;
    return <ValueQuestion p={p} message={i.message} onPick={(v) => setDecisions((x) => ({ ...x, values: { ...x.values, [p.key]: v } }))} />;
  }

  if (i.id.startsWith('dispute:') && i.row !== undefined && i.col !== undefined) {
    const k = `${i.row}:${i.col}`;
    const readings = a.disputes.find((x) => x.row === i.row && x.col === i.col)?.readings ?? [];
    return <DisputeQuestion message={i.message} readings={readings} onPick={(v) => setDecisions((x) => ({ ...x, disputes: { ...x.disputes, [k]: v } }))} />;
  }

  if (i.id.startsWith('col:') && i.col !== undefined) {
    const c = i.col;
    return (
      <div className={box}>
        <p>{i.message}</p>
        <select className="mt-2" value="" onChange={(e) => e.target.value && setColumn(c, e.target.value as ImportField)}>
          <option value="">— pick —</option>
          {CHOOSABLE_FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div className={box}>
      <p>{i.message}</p>
      {i.row !== undefined && (
        <a href={`#import-row-${i.row}`} className="mt-1 inline-block text-xs font-semibold text-ppc-gold hover:underline">Fix it in row {i.row + 1} below ↓</a>
      )}
    </div>
  );
}

function ValueQuestion({ p, message, onPick }: { p: PendingValue; message: string; onPick: (v: string) => void }) {
  const options = sizeOptions(p.field as SizeField, p.goalie);
  return (
    <div className="rounded-md border border-amber-400/40 bg-amber-500/5 p-2.5 text-sm">
      <p>{message}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {p.suggestion && (
          <button type="button" className={`${CHIP} border-ppc-gold text-ppc-gold`} onClick={() => onPick(p.suggestion!)}>
            {p.suggestion}{p.suggestedBy === 'ai' ? ' (AI suggests)' : ' (likely)'}
          </button>
        )}
        <select value="" onChange={(e) => e.target.value && onPick(e.target.value)} aria-label={`Size for "${p.raw}"`}>
          <option value="">Pick a size…</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <button type="button" className={`${CHIP} border-line`} onClick={() => onPick('')}>Leave blank</button>
        <button type="button" className={`${CHIP} border-line`} onClick={() => onPick('=raw')} title="Keep it exactly as they wrote it">Keep &quot;{p.raw}&quot;</button>
      </div>
    </div>
  );
}

function DisputeQuestion({ message, readings, onPick }: { message: string; readings: string[]; onPick: (v: string) => void }) {
  const [other, setOther] = useState('');
  return (
    <div className="rounded-md border border-amber-400/40 bg-amber-500/5 p-2.5 text-sm">
      <p>{message}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {readings.map((x) => (
          <button key={x} type="button" className={`${CHIP} border-line`} onClick={() => onPick(x)}>{x === '' ? 'Blank' : `"${x}"`}</button>
        ))}
        <input className="w-40" placeholder="Something else" value={other} onChange={(e) => setOther(e.target.value)} />
        <button type="button" className={`${CHIP} border-line`} disabled={!other.trim()} onClick={() => onPick(other.trim())}>Use it</button>
      </div>
    </div>
  );
}

function Check({ issue: i, ticked, onTick, onLeaveOut, onPutBack }: {
  issue: ImportIssue; ticked: boolean; onTick: (on: boolean) => void;
  onLeaveOut?: () => void; onPutBack?: () => void;
}) {
  return (
    <div className={`flex flex-wrap items-start gap-2 rounded-md border p-2.5 text-sm ${ticked ? 'border-line opacity-70' : 'border-amber-400/30'}`}>
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
        <input type="checkbox" className="mt-0.5 shrink-0" checked={ticked} onChange={(e) => onTick(e.target.checked)} />
        <span>{i.message}</span>
      </label>
      {onPutBack && <button type="button" className="text-xs font-semibold text-ppc-gold hover:underline" onClick={onPutBack}>Put it back in</button>}
      {onLeaveOut && <button type="button" className="text-xs font-semibold text-ppc-gold hover:underline" onClick={onLeaveOut}>Leave it out</button>}
      {i.row !== undefined && !onPutBack && (
        <a href={`#import-row-${i.row}`} className="text-xs text-muted hover:text-ppc-gold">row {i.row + 1} ↓</a>
      )}
    </div>
  );
}

/* ---------------- rows ---------------- */

function Rows({ r, d, ctx, setEdit, leaveOut }: {
  r: ImportResult; d: ImportDecisions; ctx: ImportContext;
  setEdit: (row: number, p: Partial<RowFields>) => void; leaveOut: (row: number) => void;
}) {
  const rowLevel = new Map<number, 'block' | 'confirm'>();
  const ack = new Set(d.acknowledged);
  for (const i of r.issues) {
    if (i.row === undefined || i.level === 'info') continue;
    if (i.level === 'confirm' && ack.has(i.id)) continue;
    if (i.level === 'block' || !rowLevel.has(i.row)) rowLevel.set(i.row, i.level);
  }
  return (
    <Group title={`The roster (${r.rows.length})`} hint="As it will be saved. Type over anything; what the file said is shown underneath where it was translated.">
      {r.rows.length === 0 ? (
        <p className="text-sm text-muted">No players yet — set which column is which above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-2">Row</th>
                <th className="py-1.5 pr-2">Name on back</th>
                <th className="w-20 py-1.5 pr-2">#</th>
                <th className="py-1.5 pr-2">Goalie</th>
                <th className="py-1.5 pr-2">Letter</th>
                <th className="py-1.5 pr-2">Jersey</th>
                {ctx.includesSocks && <th className="py-1.5 pr-2">Socks</th>}
                {ctx.includesPantShells && <th className="py-1.5 pr-2">Pant shell</th>}
                <th className="py-1.5 pr-2">Notes</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x) => (
                <Row key={x.sourceRow} x={x} level={rowLevel.get(x.sourceRow)} ctx={ctx}
                  set={(p) => setEdit(x.sourceRow, p)} onLeaveOut={() => leaveOut(x.sourceRow)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Group>
  );
}

function Was({ v }: { v?: string }) {
  return v ? <span className="mt-0.5 block truncate text-[11px] text-muted" title={`The file said "${v}"`}>was “{v}”</span> : null;
}

function SizeCell({ field, goalie, value, onChange, was }: { field: SizeField; goalie: boolean; value: string; onChange: (v: string) => void; was?: string }) {
  const options = sizeOptions(field, goalie);
  return (
    <td className="py-1.5 pr-2 align-top">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={!value && was ? 'border-amber-400' : ''}>
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        {value && !options.includes(value) && <option value={value}>{value} (as written)</option>}
      </select>
      <Was v={was} />
    </td>
  );
}

function Row({ x, level, ctx, set, onLeaveOut }: {
  x: ImportedRow; level?: 'block' | 'confirm'; ctx: ImportContext;
  set: (p: Partial<RowFields>) => void; onLeaveOut: () => void;
}) {
  const edge = level === 'block' ? 'border-l-2 border-l-red-400' : level === 'confirm' ? 'border-l-2 border-l-amber-400' : '';
  return (
    <tr id={`import-row-${x.sourceRow}`} className={`border-b border-line/50 align-top ${edge}`}>
      <td className="py-1.5 pl-1 pr-2 text-xs text-muted">{x.sourceRow + 1}</td>
      <td className="py-1.5 pr-2">
        <input value={x.name} onChange={(e) => set({ name: e.target.value })} placeholder={x.noName ? 'No name' : ''} aria-label="Name on back" />
        <Was v={x.was.name} />
      </td>
      <td className="py-1.5 pr-2">
        <input value={x.number} onChange={(e) => set({ number: e.target.value })} inputMode="numeric" aria-label="Number" />
        <Was v={x.was.number} />
      </td>
      <td className="py-1.5 pr-2">
        <button type="button" onClick={() => set({ isGoalie: !x.isGoalie })}
          className={`${CHIP} ${x.isGoalie ? 'border-ppc-gold text-ppc-gold' : 'border-line text-muted'}`}>{x.isGoalie ? 'Goalie' : 'Player'}</button>
        <Was v={x.was.goalie} />
      </td>
      <td className="py-1.5 pr-2">
        <select value={x.captaincy} onChange={(e) => set({ captaincy: e.target.value as RowFields['captaincy'] })} aria-label="Captain letter" disabled={x.sockOnly}>
          <option value="">—</option>
          <option value="C">Captain</option>
          <option value="A">Alternate</option>
        </select>
      </td>
      {x.sockOnly ? (
        <td className="py-1.5 pr-2 text-xs text-muted">Socks only<Was v={x.was.jerseySize} /></td>
      ) : (
        <SizeCell field="jerseySize" goalie={x.isGoalie} value={x.jerseySize} onChange={(v) => set({ jerseySize: v })} was={x.was.jerseySize} />
      )}
      {ctx.includesSocks && <SizeCell field="sockSize" goalie={false} value={x.sockSize} onChange={(v) => set({ sockSize: v })} was={x.was.sockSize} />}
      {ctx.includesPantShells && <SizeCell field="pantSize" goalie={x.isGoalie} value={x.pantShellSize} onChange={(v) => set({ pantShellSize: v })} was={x.was.pantShellSize} />}
      <td className="py-1.5 pr-2">
        <input value={x.notes} onChange={(e) => set({ notes: e.target.value })} aria-label="Notes" />
      </td>
      <td className="py-1.5">
        <button type="button" className="text-xs text-muted hover:text-red-300" onClick={onLeaveOut}>Leave out</button>
      </td>
    </tr>
  );
}
