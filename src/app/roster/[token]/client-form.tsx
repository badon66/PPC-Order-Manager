'use client';

import { useRef, useState } from 'react';
import { PANT_SHELL_SIZES, PLAYER_JERSEY_SIZES, SIZING_CHART_URL, SOCK_SIZES, jerseySizesFor } from '@/lib/constants';
import type {
  ClientLinkSections, ExtraJersey, SubmittedContact, SubmittedInspiration, SubmittedLogo, SubmittedPlayer,
} from '@/lib/types';
import { submitClientForm } from './actions';

/**
 * The customer's form. Written for a team manager on their phone at 10pm the
 * night before the deadline — big targets, plain wording, one thing at a time.
 *
 * Only the sections Keenan ticked render. Sizes are the same controlled lists
 * as the admin side, because this form is where most of the "Goalie XL in the
 * size column" mess in the old app came from.
 */

export interface PreviousSubmission {
  revision: number;
  players: SubmittedPlayer[];
  extras?: ExtraJersey[];
  logos: SubmittedLogo[];
  inspiration: SubmittedInspiration[];
  contact?: SubmittedContact;
  submittedAt: string;
}

type Props = {
  token: string;
  teamName: string;
  sections: ClientLinkSections;
  existingRosterCount: number;
  includesSocks: boolean;
  includesPantShells: boolean;
  jerseyCount: number;
  extraJerseys: number;
  extraJerseyDetails: ExtraJersey[];
  /** Their last submission, pre-filled so a revisit is an edit. */
  previous: PreviousSubmission | null;
  /** Signed links for the files in that previous submission, so a revisit
   *  shows thumbnails rather than broken images. */
  previousPreviews: Record<string, string>;
};

const blankPlayer = (): SubmittedPlayer => ({
  playerNameAsPrinted: '', number: '', isGoalie: false, sockOnly: false,
  jerseySize: '', sockSize: '', pantShellSize: '', notes: '',
});
const blankLogo = (): SubmittedLogo => ({
  fileUrl: '', fileName: '', logoName: '', placementNotes: '', description: '',
});
const blankInspiration = (): SubmittedInspiration => ({ fileUrl: '', fileName: '', notes: '' });
const blankContact = (): SubmittedContact => ({
  firstName: '', lastName: '', email: '', phone: '',
  street: '', secondary: '', city: '', province: '', postal: '',
});

type Uploaded = { fileUrl: string; fileName: string; previewUrl: string };

/**
 * Upload straight to storage, not through the app.
 *
 * A customer photographing a crest on a phone produces a file well past
 * Vercel's ~4.5 MB request-body cap, which no setting raises — so posting it
 * through this app failed before our code ran. The server signs a URL for one
 * key, the browser PUTs to it, then asks for a preview link.
 *
 * 409 means local dev with no bucket to sign against; the old POST still works
 * there and has no such limit.
 */
async function upload(token: string, file: File): Promise<Uploaded> {
  const signed = await fetch(`/api/public-upload/${token}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, type: file.type }),
  });

  if (signed.status === 409) return uploadThroughServer(token, file);

  const info = await signed.json();
  if (!signed.ok) throw new Error(info.error ?? 'Upload failed');

  const put = await fetch(info.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status}). Check your connection and try again.`);

  const preview = await fetch(`/api/public-upload/${token}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileUrl: info.fileUrl }),
  });
  const { previewUrl } = preview.ok ? await preview.json() : { previewUrl: '' };

  return { fileUrl: info.fileUrl, fileName: info.fileName, previewUrl };
}

async function uploadThroughServer(token: string, file: File): Promise<Uploaded> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`/api/public-upload/${token}`, { method: 'POST', body });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Upload failed');
  return json as Uploaded;
}

/**
 * Options for a size dropdown, keeping a value the list doesn't contain.
 *
 * The size lists changed — the imported orders carry sizes like "YM" and
 * "Goalie XL" from the old free-text column. A <select> whose value isn't
 * among its options renders blank, and the next save writes that blank back:
 * a customer opening their form to fix a phone number would silently wipe
 * every size we already had. So an unrecognised value is offered as its own
 * option, marked, and survives untouched unless they deliberately change it.
 */
function sizeOptions(options: readonly string[], current: string) {
  const unknown = current !== '' && !options.includes(current);
  return (
    <>
      {options.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
      {unknown && <option value={current}>{current} (as previously entered)</option>}
    </>
  );
}

export function ClientForm({
  token, teamName, sections, existingRosterCount, includesSocks, includesPantShells,
  jerseyCount, extraJerseys, extraJerseyDetails, previous, previousPreviews,
}: Props) {
  /*
   * Spares are their own list, not extra roster rows.
   *
   * Nobody's name goes on a spare, so putting them in the roster would mean
   * fifteen rows with names and three without and no way to tell which is
   * which. They still need a number and a size, and the team is better placed
   * than we are to say what those should be.
   *
   * Seeded from whatever Keenan already filled in, so the customer is
   * correcting rather than starting blank.
   */
  const [extras, setExtras] = useState<ExtraJersey[]>(() => {
    const seed = previous?.extras?.length ? previous.extras : extraJerseyDetails;
    return Array.from({ length: extraJerseys }, (_, i) => seed[i] ?? { number: '', size: '', notes: '' });
  });
  /*
   * Open with one slot per PLAYER on the order.
   *
   * A single blank row and a plus button tells a team nothing about how many
   * names we need; fifteen rows tells them immediately, and the count of
   * empties left is then a visible to-do rather than something they have to
   * remember.
   *
   * Players, not jerseys — home/away means two shirts each, and summing the
   * sets asked a 20-player team for 40 names. Spares aren't counted either;
   * they're numbered in their own section, since nobody's name goes on one.
   *
   * A returning customer keeps exactly what they sent. Padding their nine
   * submitted players back up to fifteen would look like we lost some.
   */
  const [players, setPlayers] = useState<SubmittedPlayer[]>(() => {
    if (previous?.players.length) return previous.players;
    if (!sections.roster) return [];
    return Array.from({ length: Math.max(1, jerseyCount) }, blankPlayer);
  });

  /** Which row is awaiting a "yes, remove it" — null when nothing is. */
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  const filled = players.filter(
    (p) => p.playerNameAsPrinted.trim() !== '' || p.number.trim() !== '',
  ).length;
  const [logos, setLogos] = useState<SubmittedLogo[]>(previous?.logos ?? []);
  const [inspiration, setInspiration] = useState<SubmittedInspiration[]>(previous?.inspiration ?? []);
  const [contact, setContact] = useState<SubmittedContact>(previous?.contact ?? blankContact());
  const [previews, setPreviews] = useState<Record<string, string>>(previousPreviews);
  const addPreview = (fileUrl: string, url: string) =>
    setPreviews((p) => ({ ...p, [fileUrl]: url }));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const stepNums = (() => {
    let n = 0;
    return {
      logos: sections.logos ? ++n : 0,
      inspiration: sections.inspiration ? ++n : 0,
      roster: sections.roster ? ++n : 0,
      personalDetails: sections.personalDetails ? ++n : 0,
    };
  })();

  async function handleSubmit() {
    setError(null);
    setBusy(true);
    const res = await submitClientForm(token, {
      players, extras, logos, inspiration,
      contact: sections.personalDetails ? contact : undefined,
      confirmed,
    });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error);
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-6 text-center">
        <div className="text-2xl">✓</div>
        <h2 className="mt-2 text-lg font-bold">Got it — thanks!</h2>
        <p className="mt-1 text-sm text-muted">
          Powerplay Customs has your {previous ? 'update' : 'submission'} for {teamName}. Nothing
          else you need to do — if anything looks off we&apos;ll be in touch.
        </p>
        <p className="mt-3 text-xs text-muted">
          Need to change something later? Open this same link again — it&apos;ll have everything
          you entered, ready to edit.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {sections.logos && (
        <Step n={stepNums.logos} title="Logos" hint="Team logo, sponsor logos, crest files. The higher the resolution, the better it prints.">
          <FileList<SubmittedLogo>
            previews={previews}
            onPreview={addPreview}
            token={token}
            items={logos}
            blank={blankLogo}
            onChange={setLogos}
            addLabel="+ Add a logo"
            emptyHint="No logos yet."
            render={(item, patch) => (
              <div className="grid gap-2 sm:grid-cols-2">
                <input placeholder="What is this logo? (e.g. Main crest, Sponsor)"
                  value={item.logoName} onChange={(e) => patch({ logoName: e.target.value })} />
                <input placeholder="Where should it go? (e.g. Left shoulder)"
                  value={item.placementNotes} onChange={(e) => patch({ placementNotes: e.target.value })} />
                <input className="sm:col-span-2" placeholder="Anything else about it (optional)"
                  value={item.description} onChange={(e) => patch({ description: e.target.value })} />
              </div>
            )}
          />
        </Step>
      )}

      {sections.inspiration && (
        <Step n={stepNums.inspiration} title="Design Inspiration" hint="Pictures of looks you like — other jerseys, colour combos, anything. Tell us what you like about each one.">
          <FileList<SubmittedInspiration>
            previews={previews}
            onPreview={addPreview}
            token={token}
            items={inspiration}
            blank={blankInspiration}
            onChange={setInspiration}
            addLabel="+ Add an image"
            emptyHint="No images yet."
            render={(item, patch) => (
              <input placeholder="What do you like about this one?"
                value={item.notes} onChange={(e) => patch({ notes: e.target.value })} />
            )}
          />
        </Step>
      )}

      {sections.roster && (
        <Step
          n={stepNums.roster}
          title="Player Roster"
          hint={
            existingRosterCount > 0
              ? `We already have ${existingRosterCount} player${existingRosterCount === 1 ? '' : 's'} on file for this order. Add anyone who's missing — we'll sort out duplicates.`
              : "Names exactly as they should be printed on the jersey. Double-check spelling — it's what goes on the back."
          }
        >
          <p className="mb-3 text-sm">
            <span className="text-muted">Don&apos;t know what size you guys need? </span>
            <a
              href={SIZING_CHART_URL}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-ppc-gold hover:underline"
            >
              Check out the sizing chart for the in-depth guide →
            </a>
          </p>

          <div className="space-y-3">
            {players.map((p, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted">Player {i + 1}</span>
                  <div className="flex items-center gap-2">
                    <Chip active={p.isGoalie} label="Goalie"
                      onClick={() => setPlayers(players.map((x, j) => j === i ? { ...x, isGoalie: !x.isGoalie, sockOnly: false } : x))} />
                    <Chip active={p.sockOnly} label="Socks only"
                      onClick={() => setPlayers(players.map((x, j) => j === i ? { ...x, sockOnly: !x.sockOnly, isGoalie: false, jerseySize: '' } : x))} />
                    {players.length > 1 && (
                      /*
                       * Two taps to remove, never one.
                       *
                       * These rows are hand-typed on a phone by someone who
                       * may have collected the names off a group chat, and an
                       * accidental tap on the wrong row silently loses a
                       * player's name, number and sizes with no undo.
                       */
                      confirmRemove === i ? (
                        <span className="flex items-center gap-2 text-xs">
                          <span className="text-muted">Remove?</span>
                          <button
                            type="button"
                            className="font-bold text-red-300 hover:underline"
                            onClick={() => {
                              setPlayers(players.filter((_, j) => j !== i));
                              setConfirmRemove(null);
                            }}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className="font-bold text-muted hover:underline"
                            onClick={() => setConfirmRemove(null)}
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="text-xs text-muted hover:text-red-300"
                          onClick={() => setConfirmRemove(i)}
                        >
                          Remove
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input className="col-span-2" placeholder={p.sockOnly ? 'Name (optional for socks only)' : 'Name as printed on jersey'}
                    value={p.playerNameAsPrinted}
                    onChange={(e) => setPlayers(players.map((x, j) => j === i ? { ...x, playerNameAsPrinted: e.target.value } : x))} />
                  <input placeholder="Number" inputMode="numeric" disabled={p.sockOnly}
                    value={p.number}
                    onChange={(e) => setPlayers(players.map((x, j) => j === i ? { ...x, number: e.target.value } : x))} />
                  {!p.sockOnly && (
                    <select value={p.jerseySize}
                      onChange={(e) => setPlayers(players.map((x, j) => j === i ? { ...x, jerseySize: e.target.value } : x))}>
                      <option value="">{p.isGoalie ? 'Goalie jersey size' : 'Jersey size'}</option>
                      {sizeOptions(jerseySizesFor(p.isGoalie), p.jerseySize)}
                    </select>
                  )}
                  {includesSocks && (
                    <select value={p.sockSize}
                      onChange={(e) => setPlayers(players.map((x, j) => j === i ? { ...x, sockSize: e.target.value } : x))}>
                      <option value="">Sock size</option>
                      {sizeOptions(SOCK_SIZES, p.sockSize)}
                    </select>
                  )}
                  {includesPantShells && !p.sockOnly && (
                    <select value={p.pantShellSize}
                      onChange={(e) => setPlayers(players.map((x, j) => j === i ? { ...x, pantShellSize: e.target.value } : x))}>
                      <option value="">Pant shell size</option>
                      {sizeOptions(PANT_SHELL_SIZES, p.pantShellSize)}
                    </select>
                  )}
                  <input className="col-span-2" placeholder="Notes (optional)"
                    value={p.notes}
                    onChange={(e) => setPlayers(players.map((x, j) => j === i ? { ...x, notes: e.target.value } : x))} />
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setPlayers([...players, blankPlayer()])}
              className="w-full rounded-lg border border-dashed border-line py-3 text-sm font-semibold text-muted hover:border-ppc-gold/60 hover:text-ppc-gold">
              + Add another player
            </button>

            {/*
              * Says where they're up to, and never blocks sending.
              *
              * A team missing one player's size on a Sunday night should be
              * able to send us the other fourteen and finish later — the form
              * stays open until the order goes into production. Going over is
              * allowed too and simply flagged: it's a conversation about an
              * extra jersey, not an error, and refusing it would just move
              * that conversation to a text message.
              */}
            {extraJerseys > 0 && (
              <div className="mt-4 rounded-lg border border-ppc-gold/40 bg-ppc-gold/5 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-ppc-gold">
                  Extra Jersey Numbers
                </p>
                <p className="mt-1 text-xs text-muted">
                  Your order includes {extraJerseys} spare jersey
                  {extraJerseys === 1 ? '' : 's'} with no name on the back. Tell us what number and
                  size each one should be.
                </p>
                <div className="mt-3 space-y-2">
                  {extras.map((x, i) => (
                    <div key={i} className="grid grid-cols-3 gap-2">
                      <input
                        placeholder={`Spare ${i + 1} number`}
                        inputMode="numeric"
                        value={x.number}
                        onChange={(e) =>
                          setExtras(extras.map((y, j) => (j === i ? { ...y, number: e.target.value } : y)))
                        }
                      />
                      <select
                        value={x.size}
                        onChange={(e) =>
                          setExtras(extras.map((y, j) => (j === i ? { ...y, size: e.target.value } : y)))
                        }
                      >
                        <option value="">Size</option>
                        {sizeOptions(PLAYER_JERSEY_SIZES, x.size)}
                      </select>
                      <input
                        placeholder="Notes"
                        value={x.notes}
                        onChange={(e) =>
                          setExtras(extras.map((y, j) => (j === i ? { ...y, notes: e.target.value } : y)))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {jerseyCount > 0 && (
              <p className="text-xs text-muted">
                {filled < jerseyCount &&
                  `${filled} of ${jerseyCount} players filled in — send what you have and finish the rest later if you need to.`}
                {filled === jerseyCount && `All ${jerseyCount} players filled in.`}
                {filled > jerseyCount && (
                  <span className="text-amber-400">
                    That&apos;s {filled} players against the {jerseyCount} we have on your order. Send
                    it anyway and we&apos;ll be in touch about the extra
                    {filled - jerseyCount === 1 ? ' one' : ` ${filled - jerseyCount}`}.
                  </span>
                )}
              </p>
            )}
          </div>
        </Step>
      )}

      {sections.personalDetails && (
        <Step n={stepNums.personalDetails} title="Your Details" hint="Who we should contact, and where the order ships.">
          <div className="grid gap-2 sm:grid-cols-2">
            <input placeholder="First name" value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} />
            <input placeholder="Last name" value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} />
            <input placeholder="Email" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            <input placeholder="Phone" type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            <input className="sm:col-span-2" placeholder="Street address" value={contact.street} onChange={(e) => setContact({ ...contact, street: e.target.value })} />
            <input className="sm:col-span-2" placeholder="Unit / suite (optional)" value={contact.secondary} onChange={(e) => setContact({ ...contact, secondary: e.target.value })} />
            <input placeholder="City" value={contact.city} onChange={(e) => setContact({ ...contact, city: e.target.value })} />
            <input placeholder="Province / State" value={contact.province} onChange={(e) => setContact({ ...contact, province: e.target.value })} />
            <input placeholder="Postal code" value={contact.postal} onChange={(e) => setContact({ ...contact, postal: e.target.value })} />
          </div>
        </Step>
      )}

      <div className="rounded-xl border border-line bg-surface p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-0.5 shrink-0" checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)} />
          <span className="min-w-0 flex-1 text-sm leading-relaxed">
            {previous ? "I've checked everything above and it's correct." : "I've checked everything above and it's correct."}
            {sections.roster && ' Names, numbers, and sizes are what should go on the jerseys.'}
          </span>
        </label>
        {error && <p className="mt-3 text-sm font-semibold text-red-300">{error}</p>}
        <button type="button" disabled={!confirmed || busy} onClick={handleSubmit}
          className="mt-4 w-full rounded-lg bg-ppc-gold py-3 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-40">
          {busy ? 'Sending…' : previous ? 'Send updated details' : 'Submit to Powerplay Customs'}
        </button>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ppc-gold text-sm font-black text-black">{n}</span>
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          <p className="text-xs text-muted">{hint}</p>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded px-2 py-1 text-[0.7rem] font-bold uppercase tracking-wide ${active ? 'bg-ppc-gold text-black' : 'bg-surface text-muted'}`}>
      {label}
    </button>
  );
}

function FileList<T extends { fileUrl: string; fileName: string }>({
  token, items, blank, onChange, addLabel, emptyHint, render, previews, onPreview,
}: {
  token: string;
  items: T[];
  blank: () => T;
  onChange: (next: T[]) => void;
  addLabel: string;
  emptyHint: string;
  render: (item: T, patch: (p: Partial<T>) => void) => React.ReactNode;
  /**
   * Stored fileUrl → a link that loads. What gets submitted is the stored
   * value; uploads live in a private bucket, so the thumbnail needs the signed
   * one the upload endpoint hands back.
   */
  previews: Record<string, string>;
  onPreview: (fileUrl: string, url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFiles(files: FileList) {
    setErr(null); setBusy(true);
    try {
      const added: T[] = [];
      for (const f of Array.from(files)) {
        const stored = await upload(token, f);
        onPreview(stored.fileUrl, stored.previewUrl);
        added.push({ ...blank(), fileUrl: stored.fileUrl, fileName: stored.fileName });
      }
      onChange([...items, ...added]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-muted">{emptyHint}</p>}
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="flex items-center gap-3">
            <Thumb url={previews[item.fileUrl] ?? item.fileUrl} name={item.fileName} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.fileName}</span>
            <button type="button" className="text-xs text-muted hover:text-red-300"
              onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button>
          </div>
          <div className="mt-2">
            {render(item, (p) => onChange(items.map((x, j) => j === i ? { ...x, ...p } : x)))}
          </div>
        </div>
      ))}
      <input ref={inputRef} type="file" multiple hidden accept="image/*,.pdf,.svg"
        onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }} />
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
        className="w-full rounded-lg border border-dashed border-line py-3 text-sm font-semibold text-muted hover:border-ppc-gold/60 hover:text-ppc-gold disabled:opacity-40">
        {busy ? 'Uploading…' : addLabel}
      </button>
      {err && <p className="text-xs font-semibold text-red-300">{err}</p>}
    </div>
  );
}

function Thumb({ url, name }: { url: string; name: string }) {
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(name)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />;
  }
  return <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-surface text-[0.6rem] font-bold text-muted">FILE</span>;
}
