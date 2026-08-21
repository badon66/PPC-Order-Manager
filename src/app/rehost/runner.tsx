'use client';

import { useRef, useState } from 'react';

interface Asset {
  id: string;
  url: string;
  team: string;
  role: string;
}

type Status = 'idle' | 'running' | 'stopped' | 'done';

/**
 * Fetches each Base44 file in the browser and PUTs it back to this app.
 *
 * One at a time on purpose: these are big files on someone else's server, and
 * a stampede of parallel requests is how you get rate-limited halfway through
 * a migration you can't repeat.
 *
 * Failures are collected, not fatal — the run finishes and offers a retry of
 * just what failed.
 */
export function RehostRunner({ assets }: { assets: Asset[] }) {
  const [status, setStatus] = useState<Status>('idle');
  const [done, setDone] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [current, setCurrent] = useState('');
  const [failed, setFailed] = useState<Array<{ asset: Asset; error: string }>>([]);
  const stop = useRef(false);

  const run = async (queue: Asset[]) => {
    stop.current = false;
    setStatus('running');
    setDone(0);
    setBytes(0);
    setFailed([]);
    const errors: Array<{ asset: Asset; error: string }> = [];

    for (const a of queue) {
      if (stop.current) {
        setStatus('stopped');
        setFailed(errors);
        return;
      }
      setCurrent(`${a.team} — ${a.role.replace(/_/g, ' ')}`);
      try {
        const res = await fetch(a.url);
        if (!res.ok) throw new Error(`Base44 returned ${res.status}`);
        const blob = await res.blob();

        const name = decodeURIComponent(new URL(a.url).pathname.split('/').pop() || 'file');
        const form = new FormData();
        form.append('assetId', a.id);
        form.append('file', new File([blob], name, { type: blob.type || 'application/octet-stream' }));

        const put = await fetch('/api/import/base44', { method: 'PUT', body: form });
        if (!put.ok) throw new Error(`Save failed (${put.status})`);

        setBytes((b) => b + blob.size);
      } catch (e) {
        errors.push({ asset: a, error: e instanceof Error ? e.message : String(e) });
      }
      setDone((d) => d + 1);
    }

    setCurrent('');
    setFailed(errors);
    setStatus('done');
  };

  const pct = assets.length ? Math.round((done / assets.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {status !== 'running' ? (
          <button
            type="button"
            onClick={() => run(assets)}
            className="rounded-lg bg-ppc-gold px-4 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim"
          >
            {status === 'idle' ? `Copy ${assets.length} files` : 'Run again'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { stop.current = true; }}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-ppc-gold/60"
          >
            Stop
          </button>
        )}

        {failed.length > 0 && status !== 'running' && (
          <button
            type="button"
            onClick={() => run(failed.map((f) => f.asset))}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-ppc-gold/60"
          >
            Retry {failed.length} failed
          </button>
        )}

        {status === 'done' && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-ppc-gold/60"
          >
            Refresh the count
          </button>
        )}
      </div>

      {status !== 'idle' && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-ppc-gold transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
            <span className="font-semibold">
              {done} / {assets.length} files · {(bytes / 1048576).toFixed(1)} MB
            </span>
            <span className="text-muted">{current || (status === 'done' ? 'Finished' : '')}</span>
          </div>
        </div>
      )}

      {failed.length > 0 && status !== 'running' && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/[0.06] p-4">
          <p className="text-sm font-bold text-red-300">{failed.length} file(s) didn&apos;t come across</p>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {failed.slice(0, 20).map((f) => (
              <li key={f.asset.id}>
                {f.asset.team} — {f.asset.role.replace(/_/g, ' ')}: {f.error}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Those orders still point at Base44. Retry above, or leave it and run this page again
            later — nothing already copied gets re-fetched.
          </p>
        </div>
      )}
    </div>
  );
}
