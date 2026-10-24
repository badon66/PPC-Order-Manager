'use client';

import { formatLong } from '@/lib/dates';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  BRANDING_ADDONS, CAPTAIN_PATCH_STYLE_META, JERSEY_TYPE_LABELS, MAX_DESIGN_REFERENCE_FILES, NAME_STYLE_LABELS, ORDER_MODE_META, PANT_SHELL_TYPE_LABELS, PANT_TOGGLES, SHOULDER_CUT_LABELS, SOCK_TYPE_LABELS, STATUS_META, STATUS_OPTIONS, addonHint, buildAddonsForJerseyType, type AddonKey, TERMS_URL, PLAYER_JERSEY_SIZES, SOCK_SIZES,
} from '@/lib/constants';
import { buildsDiffer, jerseyTypesInUse, orderBuildAddons, perSetShellTypes, perSetSockTypes, setAddons } from '@/lib/order-utils';
import { buildPartOf } from '@/lib/constants';
import { tierById, tierPatch, tiersForJerseyType } from '@/lib/constants';
import { describeSet, extraRowCount, spareCount, newId, offersGoaliePantOption, orderIncludesSocks, rosterSlotCount, setsForMode, syncExtraJerseyDetails } from '@/lib/order-utils';
import { MAX_KEEPERS_PER_SET, commonJerseySize, goodFreeNumber, keepersOfSet, numberBlankSpares, pruneKeepers, setKeeperCount, takenNumbers } from '@/lib/keepers';
import { formatCad, listPrice } from '@/lib/pricing';
import { StatusBadge } from '@/components/ui';
import { COMMENT_SECTIONS, type CommentSection } from '@/lib/types';
import type {
  CaptainPatchStyle, ExtraJersey, JerseyTier, JerseyType, KeeperJersey, NameStyle, Order, OrderAsset, OrderMode, PantShellType, RosterEntry, ShoulderCut, SockType, ViewableAsset,
} from '@/lib/types';
import { attachAsset, detachAsset, renameAssetGroup, saveOrder, saveRoster } from '@/app/orders/actions';
import { ChoiceGroup, NumberField, SizeSelect, TextArea, TextField, Toggle } from './fields';
import { RosterTable } from './roster-table';
import { RosterImporter } from '@/components/roster-import/importer';
import { RosterVersions } from '@/components/roster-import/versions';
import { importContextOf } from '@/lib/roster-import/analyze';
import { activeRosterIdOf, nextRosterNumber, type RosterVersionSummary } from '@/lib/roster-versions';
import { AssetGroup } from './assets';
import { AdditionalLogos } from './additional-logos';
import { ClientLinkConfig } from './client-link-config';
import { TierPresets } from './tier-presets';
import { LacesPicker } from './laces-picker';
import {
  ModeSwitch, SectionCard, SectionNav, StartChooser, WizardFrame,
  useScrollSpy, type CommentControl, type SectionDef, type ViewMode,
} from './shell';

/**
 * The order form. Same ten sections as the Base44 app, same principles,
 * redesigned presentation:
 *
 *  - Editing: all sections on one page with a sticky side nav (scroll-spy,
 *    completeness ticks). Phone gets a sticky jump menu instead.
 *  - New order: a chooser offers the setup wizard — one section per screen,
 *    Back/Next, progress bar — or the full form.
 *  - A switch at the top flips modes any time. One draft, one autosave.
 *
 * Carried over from the first build: autosave ~1s after typing, refresh-safe
 * URLs (the draft row exists before the form opens), two-tier validation.
 */

const AUTOSAVE_MS = 1000;

type Draft = Order;

export function OrderForm({
  initialOrder,
  initialRoster,
  initialAssets,
  initialRosters = [],
  rosterFileLinks = {},
  isNew = false,
}: {
  initialOrder: Order;
  /** The rows of the roster in use. */
  initialRoster: RosterEntry[];
  initialAssets: ViewableAsset[];
  /** Every roster on the order (Roster 1, 2…), for the list above the table. */
  initialRosters?: RosterVersionSummary[];
  /** Roster id → signed link to the file it was imported from. */
  rosterFileLinks?: Record<string, string>;
  /** True when arriving from + New Order — offers the wizard first. */
  isNew?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initialOrder);
  const [roster, setRoster] = useState<RosterEntry[]>(initialRoster);
  const [assets, setAssets] = useState<ViewableAsset[]>(initialAssets);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  /** Why the roster table didn't save, when it didn't (another roster put in use elsewhere). */
  const [rosterError, setRosterError] = useState<string | null>(null);
  /** The import screen: closed, open to pick a file. */
  const [importing, setImporting] = useState(false);

  // The chooser shows only for a genuinely fresh order. Once a mode is picked
  // (or anything has been typed) a refresh must land back in the form —
  // ?start=1 lingering in the URL was re-showing the chooser after reload.
  const [viewMode, setViewMode] = useState<ViewMode | null>(
    isNew && !initialOrder.teamName ? null : 'sections',
  );

  const pickMode = useCallback(
    (m: ViewMode) => {
      setViewMode(m);
      router.replace(`/orders/${initialOrder.id}/edit`, { scroll: false });
    },
    [router, initialOrder.id],
  );
  const [step, setStep] = useState(0);

  const dirty = useRef(false);
  const rosterDirty = useRef(false);
  /** The roster this page loaded — the only one its table may save into. */
  const loadedRosterId = activeRosterIdOf(initialOrder);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * An approved order is locked until you say otherwise.
   *
   * Approval is the moment a customer signed off on exactly what was on the
   * page, and this form autosaves about a second after a keystroke — so
   * without a gate, brushing a field while looking something up silently
   * changes what they agreed to, with no prompt and nothing to undo.
   *
   * The gate is per-session and asked once: the first edit to a signed order
   * opens a confirmation, and after that the form behaves normally. Asking on
   * every field would be unusable, and being unusable is how a prompt gets
   * clicked through without being read.
   *
   * It doesn't prevent anything — Keenan can always proceed. It just makes
   * changing a signed order a decision rather than an accident. The change log
   * records it either way.
   */
  const isApproved = Boolean(draft.approvedDate || draft.approvalRecord);
  const [editUnlocked, setEditUnlocked] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<null | (() => void)>(null);

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    const apply = () => {
      dirty.current = true;
      setDraft((d) => ({ ...d, [key]: value }));
    };

    if (isApproved && !editUnlocked) {
      // Hold the edit rather than dropping it — confirming applies exactly
      // what was typed, so nothing has to be retyped.
      setPendingEdit(() => apply);
      return;
    }
    apply();
  }, [isApproved, editUnlocked]);

  const flush = useCallback(async () => {
    if (!dirty.current && !rosterDirty.current) return;
    setSaveState('saving');

    let ok = true;
    if (dirty.current) {
      const res = await saveOrder(draft.id, draft);
      dirty.current = false;
      setWarnings(res.warnings ?? {});
      if (res.ok) setErrors({});
      else {
        setErrors(res.errors ?? {});
        ok = false;
      }
    }
    if (rosterDirty.current) {
      // Saved into the roster this page loaded, and only that one: if another
      // roster went in use meanwhile, the save is refused, not misfiled.
      const res = await saveRoster(draft.id, roster, loadedRosterId);
      rosterDirty.current = false;
      if (res.ok) setRosterError(null);
      else {
        setRosterError(res.error);
        ok = false;
      }
    }

    setSaveState(ok ? 'saved' : 'error');
    if (ok) setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1800);
  }, [draft, roster, loadedRosterId]);

  useEffect(() => {
    if (!dirty.current && !rosterDirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, AUTOSAVE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draft, roster, flush]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current || rosterDirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  /*
   * The spares list follows the spares count.
   *
   * Typing "3" into Extra Jerseys should produce three rows to number, not a
   * separate step to remember. Grows and shrinks from the end so a number
   * already typed stays on its own row.
   */
  const extraRows = extraRowCount(draft);
  useEffect(() => {
    const next = syncExtraJerseyDetails(draft.extraJerseyDetails ?? [], extraRows);
    if (next !== (draft.extraJerseyDetails ?? [])) set('extraJerseyDetails', next);
  }, [extraRows, draft.extraJerseyDetails, set]);

  const patchExtra = (i: number, patch: Partial<ExtraJersey>) => {
    const next = [...(draft.extraJerseyDetails ?? [])];
    next[i] = { ...next[i], ...patch };
    set('extraJerseyDetails', next);
  };

  /** Spares that actually get a jersey — the rest are socks only. */
  const extraJerseyRows = (draft.extraJerseyDetails ?? []).filter((x) => !x.sockOnly).length;
  /** Spares as people: on home/away, 2 extra home + 2 extra away is 2 spares, not 4. */
  const spareJerseys = spareCount(draft, 'extraJerseys');
  const spareSocks = spareCount(draft, 'extraSockPairs');

  /*
   * Keepers — "make an extra of this jersey for us to keep". Powerplay's, not
   * the team's: never in the totals, the tally, the price or the customer's
   * sheet. Rules in lib/keepers.ts; this is just the wiring.
   */
  const keepers = draft.keeperJerseys ?? [];
  const takenForKeepers = (exceptId?: string) =>
    takenNumbers(roster, draft.extraJerseyDetails ?? [], keepers.filter((k) => k.id !== exceptId));
  function setKeepers(setIndex: number, wanted: number) {
    dirty.current = true;
    setDraft((d) => ({
      ...d,
      keeperJerseys: setKeeperCount(d.keeperJerseys ?? [], setIndex, wanted, {
        taken: takenNumbers(roster, d.extraJerseyDetails ?? [], d.keeperJerseys ?? []),
        size: commonJerseySize(roster),
        newId,
      }),
    }));
  }
  function patchKeeper(id: string, patch: Partial<KeeperJersey>) {
    dirty.current = true;
    setDraft((d) => ({
      ...d,
      keeperJerseys: (d.keeperJerseys ?? []).map((k) => (k.id === id ? { ...k, ...patch } : k)),
    }));
  }

  const totalAcrossSets = useMemo(
    () =>
      draft.sets.reduce(
        (acc, s) => ({
          player: acc.player + s.playerJerseys,
          goalie: acc.goalie + s.goalieJerseys,
          socks: acc.socks + s.sockPairs,
          shells: acc.shells + s.pantShells,
          extraJerseys: acc.extraJerseys + (s.extraJerseys || 0),
          extraSocks: acc.extraSocks + (s.extraSockPairs || 0),
          extraShells: acc.extraShells + (s.extraPantShells || 0),
        }),
        { player: 0, goalie: 0, socks: 0, shells: 0, extraJerseys: 0, extraSocks: 0, extraShells: 0 },
      ),
    [draft.sets],
  );

  // A keeper copies one set; when that set goes, so does the keeper (lib/keepers.ts).
  function changeMode(mode: OrderMode) {
    dirty.current = true;
    setDraft((d) => {
      const sets = setsForMode(mode, d.numberOfSets, d.sets);
      return { ...d, orderMode: mode, sets, keeperJerseys: pruneKeepers(d.keeperJerseys ?? [], sets.length) };
    });
  }

  function changeSetCount(n: number) {
    dirty.current = true;
    setDraft((d) => {
      const sets = setsForMode('multiple_sets', n, d.sets);
      return { ...d, numberOfSets: n, sets, keeperJerseys: pruneKeepers(d.keeperJerseys ?? [], sets.length) };
    });
  }

  function patchSet(i: number, p: Partial<Draft['sets'][number]>) {
    dirty.current = true;
    setDraft((d) => ({ ...d, sets: d.sets.map((s, idx) => (idx === i ? { ...s, ...p } : s)) }));
  }

  /** One state update so autosave sends the tier and its toggles together. */
  function applyTier(tier: JerseyTier, patch: Record<AddonKey, boolean>) {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch, jerseyTier: tier }));
  }

  const addAsset = async (a: Omit<OrderAsset, 'id'>) => {
    const created = await attachAsset(a);
    setAssets((prev) => [...prev, created]);
  };
  const removeAsset = async (assetId: string) => {
    await detachAsset(assetId, draft.id);
    setAssets((prev) => prev.filter((a) => a.id !== assetId));
  };

  const approved = Boolean(draft.approvedDate);

  /* ---------------- section definitions ---------------- */

  const hasArtwork = assets.some((a) =>
    ['design_reference', 'collar_reference', 'main_crest', 'shoulder_logo_both',
     'shoulder_logo_left', 'shoulder_logo_right', 'additional_logo', 'font'].includes(a.role),
  );
  const anyQty =
    draft.sets.some((s) => s.playerJerseys + s.goalieJerseys + s.sockPairs + s.pantShells > 0);
  /** The Pants section only exists when the order actually has shells in it. */
  const hasPantShells =
    draft.sets.some((s) => (s.pantShells || 0) + (s.extraPantShells || 0) > 0) ||
    draft.pantShellType !== null;

  const anyContact = Boolean(
    draft.contactFirstName || draft.contactLastName || draft.contactEmail ||
    draft.contactPhone || draft.shippingStreet || draft.shippingCity,
  );

  const sections: SectionDef[] = [
    { id: 'team', title: 'Team & Payment', icon: '🏒', blurb: 'Who the order is for and the paperwork basics.', complete: Boolean(draft.teamName) },
    { id: 'contact', title: 'Shipping & Contact', icon: '📦', blurb: 'Who to reach, and where it ships — or send them a link to fill it in.', complete: anyContact },
    { id: 'mode', title: 'Order Mode', icon: '🔀', blurb: 'One set, home and away, or several sets.', complete: true },
    { id: 'totals', title: 'Order Totals', icon: '🔢', blurb: 'How many of everything, per set.', complete: anyQty },
    { id: 'build', title: 'Build Type', icon: '👕', blurb: 'Sublimated, reversible, or embroidered — per item.', complete: draft.jerseyType !== null },
    { id: 'numbers', title: 'Numbers & Names', icon: '🔟', wide: true, blurb: 'Name style, number styling, and reference images.', complete: Boolean(draft.numberDetails) || assets.some((a) => a.role.startsWith('number_reference')) },
    { id: 'addons', title: 'Add-Ons & Customization', icon: '✨', blurb: 'Construction features, laces, patches, name style.', complete: buildAddonsForJerseyType(jerseyTypesInUse(draft)).some(({ key }) => Boolean(draft[key as keyof Order])) || draft.lacesStyle !== 'none' || draft.hasCaptainPatches },
    { id: 'branding', title: 'Powerplay Branding', icon: '🏷️', blurb: 'Back label, rubberized crest, size tag, any changes to them — and custom branding like a sponsor logo.', complete: BRANDING_ADDONS.some(({ key }) => Boolean(draft[key as keyof Order])) || Boolean(draft.brandingNotes) || draft.customBranding },
    { id: 'artwork', title: 'Logos & Artwork', icon: '🎨', wide: true, blurb: 'Design references, crest, shoulder logos, sponsor logos, fonts.', complete: hasArtwork },
    ...(hasPantShells
      ? [{
          id: 'pants',
          title: 'Pants & Pant Shells',
          icon: '🩳',
          wide: true, // carries artwork groups
          blurb: 'Shell build, plus pant logo and number with their artwork.',
          complete: Boolean(draft.pantShellType),
        } as SectionDef]
      : []),
    { id: 'roster', title: `Player Roster (${roster.length})`, icon: '👥', wide: true, blurb: 'Names, numbers, sizes — or import a roster file.', complete: roster.length > 0 },
    { id: 'notes', title: 'Notes & Approval', icon: '✅', blurb: 'Notes for the customer sheet, notes for the factory only, and customer sign-off.', complete: Boolean(draft.approvedBy || draft.approvedDate || draft.specialNotes || draft.factoryNotes) },
  ];

  const [activeId, jump] = useScrollSpy(sections.map((s) => s.id));

  /** "Add comment" on a section: one comment each, saved with the order. */
  const commentControl = (id: string): CommentControl | undefined => {
    if (!(id in COMMENT_SECTIONS)) return undefined;
    const key = id as CommentSection;
    return {
      value: draft.sectionComments?.[key],
      onChange: (c) => {
        const next = { ...(draft.sectionComments ?? {}) };
        if (c) next[key] = c;
        else delete next[key];
        set('sectionComments', next);
      },
    };
  };

  /* ---------------- section content ---------------- */

  const content: Record<string, ReactNode> = {
    team: (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Team Name" value={draft.teamName} onChange={(v) => set('teamName', v)} placeholder="Enter team name" />
          <TextField label="Invoice Number" value={draft.invoiceNumber} onChange={(v) => set('invoiceNumber', v)} placeholder="e.g. PPC1801" error={errors.invoiceNumber} warning={warnings.invoiceNumber} />
          <TextField label="Date Paid" type="date" value={draft.datePaid ?? ''} onChange={(v) => set('datePaid', v || null)} error={errors.datePaid} />
          {/*
            * KEENAN ONLY. Priced automatically from the tier and quantities
            * (lib/pricing.ts). The field is an override: type a number and
            * that's the deal; clear it and the list price is back.
            */}
          <div>
            <span className="text-xs font-medium text-muted">
              Order Value (CAD, before tax){draft.orderValue === null ? ' — list price' : ' — set by hand'}
            </span>
            {(() => {
              const lp = listPrice(draft);
              return (
                <>
                  <input
                    className="mt-1"
                    inputMode="numeric"
                    value={draft.orderValue ?? ''}
                    placeholder={lp ? formatCad(lp.total) : 'Pick a jersey tier to price'}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      set('orderValue', v === '' ? null : Number(v));
                    }}
                  />
                  {lp && (
                    <details className="mt-1.5 text-xs text-muted">
                      <summary className="cursor-pointer select-none">
                        List price {formatCad(lp.total)}
                        {draft.orderValue !== null && (
                          <>
                            {' '}·{' '}
                            <button type="button" onClick={() => set('orderValue', null)} className="font-semibold text-ppc-gold hover:underline">
                              use list price
                            </button>
                          </>
                        )}
                      </summary>
                      <ul className="mt-1.5 space-y-0.5 border-l-2 border-line pl-3">
                        {lp.lines.map((l) => (
                          <li key={l.label} className="flex justify-between gap-3 tabular-nums">
                            <span>{l.qty} × {l.label} @ {formatCad(l.unit)}</span>
                            <span className={l.amount < 0 ? 'text-emerald-300' : ''}>{formatCad(l.amount)}</span>
                          </li>
                        ))}
                      </ul>
                      {lp.caveats.map((c) => (
                        <p key={c} className="mt-1">{c}</p>
                      ))}
                    </details>
                  )}
                </>
              );
            })()}
          </div>
          <div>
            <span className="text-xs font-medium text-muted">Order Status</span>
            <select className="mt-1" value={draft.status} onChange={(e) => set('status', e.target.value as Order['status'])}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].emoji} {STATUS_META[s].label}</option>
              ))}
            </select>
          </div>
          <TextField label="Google Drive Link (optional)" type="url" value={draft.googleDriveLink} onChange={(v) => set('googleDriveLink', v)} placeholder="https://drive.google.com/..." hint="Extra design files or references" error={errors.googleDriveLink} warning={warnings.googleDriveLink} />
          <TextField label="Estimated Finish Date" type="date" value={draft.estimatedFinishDate ?? ''} onChange={(v) => set('estimatedFinishDate', v || null)} error={errors.estimatedFinishDate} />
        </div>
        <Toggle label="Sample order" checked={draft.isSample} onChange={(v) => set('isSample', v)} />
      </>
    ),

    contact: (
      <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label="First Name" value={draft.contactFirstName} onChange={(v) => set('contactFirstName', v)} />
          <TextField label="Last Name" value={draft.contactLastName} onChange={(v) => set('contactLastName', v)} />
          <TextField label="Email" type="email" value={draft.contactEmail} onChange={(v) => set('contactEmail', v)} />
          <TextField label="Phone" type="tel" value={draft.contactPhone} onChange={(v) => set('contactPhone', v)} />
          <TextField label="Street Address" value={draft.shippingStreet} onChange={(v) => set('shippingStreet', v)} />
          <TextField label="Unit / Secondary" value={draft.shippingSecondary} onChange={(v) => set('shippingSecondary', v)} />
          <TextField label="City" value={draft.shippingCity} onChange={(v) => set('shippingCity', v)} />
          <TextField label="Province / State" value={draft.shippingProvince} onChange={(v) => set('shippingProvince', v)} />
          <TextField label="Postal Code" value={draft.shippingPostal} onChange={(v) => set('shippingPostal', v)} />
        </div>
        <ClientLinkConfig
          enabled={draft.requestClientDetails}
          sections={draft.clientLinkSections}
          rosterToken={draft.rosterToken}
          onEnabledChange={(v) => set('requestClientDetails', v)}
          onSectionsChange={(v) => set('clientLinkSections', v)}
        />
      </>
    ),

    mode: (
      <>
        <ChoiceGroup<OrderMode>
          label="How many uniform sets?"
          value={draft.orderMode}
          onChange={(v) => v && changeMode(v)}
          choices={(Object.keys(ORDER_MODE_META) as OrderMode[]).map((m) => ({
            value: m, label: ORDER_MODE_META[m].label, blurb: ORDER_MODE_META[m].blurb,
          }))}
        />
        {draft.orderMode === 'multiple_sets' && (
          <div className="max-w-[12rem]">
            <NumberField label="Number of sets" value={draft.numberOfSets} onChange={changeSetCount} min={1} />
          </div>
        )}
      </>
    ),

    totals: (
      <>
        <div className="max-w-[14rem]">
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {draft.sets.map((s, i) => {
            const summary = describeSet(s);
            return (
              <div key={i} data-set-index={i} className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="text-sm font-bold text-ppc-gold">{s.label}</div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <NumberField label="Player Jerseys" value={s.playerJerseys} onChange={(v) => patchSet(i, { playerJerseys: v })} />
                  <NumberField label="Goalie Jerseys" value={s.goalieJerseys} onChange={(v) => patchSet(i, { goalieJerseys: v })} />
                  <NumberField label="Socks (Pairs)" value={s.sockPairs} onChange={(v) => patchSet(i, { sockPairs: v })} />
                  <NumberField label="Pant Shells" value={s.pantShells} onChange={(v) => patchSet(i, { pantShells: v })} />
                </div>

                {/* Extras — produced on top of the roster. */}
                <div className="mt-3 rounded-lg border border-line bg-surface p-2.5">
                  <div className="text-xs font-bold uppercase tracking-wide text-muted">
                    Extras <span className="font-normal normal-case">(spares, coaches, anyone not on the roster)</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <NumberField label="Jerseys" testId={`extra-jerseys-${i}`} value={s.extraJerseys} onChange={(v) => patchSet(i, { extraJerseys: v })} />
                    <NumberField label="Sock Pairs" testId={`extra-socks-${i}`} value={s.extraSockPairs} onChange={(v) => patchSet(i, { extraSockPairs: v })} />
                    <NumberField label="Pant Shells" testId={`extra-shells-${i}`} value={s.extraPantShells} onChange={(v) => patchSet(i, { extraPantShells: v })} />
                  </div>
                  {(s.extraJerseys > 0 || s.extraSockPairs > 0 || s.extraPantShells > 0) && (
                    <input
                      className="mt-2"
                      placeholder="Who are they for, and what sizes?"
                      value={s.extrasNotes}
                      onChange={(e) => patchSet(i, { extrasNotes: e.target.value })}
                    />
                  )}
                </div>

                {/*
                  * Keepers — ours, not theirs. Deliberately NOT in the Extras
                  * box above: extras are the team's (they pay, they get them),
                  * keepers are Powerplay's (held at the factory, off the sheet
                  * and the invoice). Two boxes so the two never get confused.
                  */}
                {(() => {
                  const mine = keepersOfSet(keepers, i);
                  return (
                    <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-400/5 p-2.5" data-testid={`keepers-${i}`}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={mine.length > 0}
                          onChange={(e) => setKeepers(i, e.target.checked ? 1 : 0)}
                        />
                        Make an extra of this jersey for us to keep
                      </label>
                      {mine.length > 0 && (
                        <>
                          <div className="mt-2 max-w-[9rem]">
                            <NumberField
                              label="How many"
                              testId={`keeper-count-${i}`}
                              value={mine.length}
                              onChange={(v) => setKeepers(i, Math.min(Math.max(v, 1), MAX_KEEPERS_PER_SET))}
                              min={1}
                            />
                          </div>
                          <div className="mt-2 space-y-2">
                            {mine.map((k, n) => (
                              <div key={k.id} className="rounded-md border border-amber-400/30 bg-surface p-2">
                                <div className="flex items-center gap-2">
                                  <span className="w-16 shrink-0 text-xs font-semibold text-amber-300">Keeper {n + 1}</span>
                                  <input
                                    className="min-w-0 flex-1"
                                    placeholder="Number"
                                    inputMode="numeric"
                                    aria-label={`Keeper ${n + 1} number`}
                                    value={k.number}
                                    onChange={(e) => patchKeeper(k.id, { number: e.target.value })}
                                  />
                                  <button
                                    type="button"
                                    title="Pick a number nobody on this order has"
                                    className="shrink-0 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-xs font-semibold hover:border-ppc-gold/60 hover:text-ppc-gold"
                                    onClick={() => patchKeeper(k.id, { number: goodFreeNumber(takenForKeepers(k.id)) })}
                                  >
                                    Random
                                  </button>
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                  <input
                                    className="min-w-0 flex-1"
                                    placeholder="Name (optional)"
                                    aria-label={`Keeper ${n + 1} name`}
                                    value={k.name}
                                    onChange={(e) => patchKeeper(k.id, { name: e.target.value })}
                                  />
                                  <div className="w-24 shrink-0">
                                    <SizeSelect
                                      value={k.size}
                                      options={PLAYER_JERSEY_SIZES}
                                      onChange={(v) => patchKeeper(k.id, { size: v })}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="mt-2 text-xs text-amber-200/90">
                            Kept by Powerplay. The factory makes {mine.length === 1 ? 'it' : 'these'} with the run and holds{' '}
                            {mine.length === 1 ? 'it' : 'them'} at the facility, off to the side. Not on the team&apos;s sheet,
                            not on their invoice, not in the totals above.
                          </p>
                        </>
                      )}
                    </div>
                  );
                })()}

                {summary && (
                  <p className="mt-2 text-xs font-semibold text-ppc-gold">{summary}</p>
                )}

                {draft.orderMode === 'multiple_sets' && (
                  <textarea className="mt-2" rows={2} placeholder={`Notes for ${s.label}`} value={s.notes ?? ''} onChange={(e) => patchSet(i, { notes: e.target.value })} />
                )}
              </div>
            );
          })}
        </div>
        {draft.sets.length > 1 && (
          <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
            <span className="font-bold text-ppc-gold">Total across all sets — </span>
            {totalAcrossSets.player} player jerseys · {totalAcrossSets.goalie} goalie jerseys ·{' '}
            {totalAcrossSets.socks} sock pairs · {totalAcrossSets.shells} pant shells
            {totalAcrossSets.extraJerseys + totalAcrossSets.extraSocks + totalAcrossSets.extraShells > 0 && (
              <>
                {' · '}
                <span className="font-bold text-ppc-gold">plus extras — </span>
                {[
                  totalAcrossSets.extraJerseys && `${totalAcrossSets.extraJerseys} jerseys`,
                  totalAcrossSets.extraSocks && `${totalAcrossSets.extraSocks} sock pairs`,
                  totalAcrossSets.extraShells && `${totalAcrossSets.extraShells} pant shells`,
                ].filter(Boolean).join(' · ')}
              </>
            )}
          </div>
        )}

        {/*
          * Spares live here, in Order Totals, beside the counts that create
          * them — not down in Notes & Approval where they'd be found only by
          * someone already looking for them.
          *
          * One row per spare GARMENT SET, which is max(extra jerseys, extra
          * sock pairs) rather than either on its own. Two spare jerseys and
          * three spare socks is three rows: two get a jersey and socks, one is
          * socks only. Sizing the list to the jerseys alone would leave the
          * third pair of socks with nowhere to be described.
          */}
        {extraRows > 0 && (
          <div className="mt-4 rounded-lg border border-ppc-gold/40 bg-ppc-gold/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-ppc-gold">
                Extra Jersey Numbers
              </span>
              {/* Fills only the blank ones, around every number already on the order. */}
              {(draft.extraJerseyDetails ?? []).some((x) => !x.sockOnly && !x.number.trim()) && (
                <button
                  type="button"
                  title="A good hockey number for each spare without one, none already on this order"
                  className="rounded-lg border border-ppc-gold/60 bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-ppc-gold hover:bg-ppc-gold/10"
                  onClick={() =>
                    set('extraJerseyDetails', numberBlankSpares(draft.extraJerseyDetails ?? [], takenNumbers(roster, [], keepers)))
                  }
                >
                  Pick numbers
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">
              {spareJerseys > 0 &&
                `${spareJerseys} spare jersey${spareJerseys === 1 ? '' : 's'}`}
              {spareJerseys > 0 && spareSocks > 0 && ' and '}
              {spareSocks > 0 &&
                `${spareSocks} spare sock pair${spareSocks === 1 ? '' : 's'}`}
              {draft.orderMode === 'home_away_set' && ', each in home and away'}
              . Give each a number and size, or leave them for the customer to fill in.
            </p>

            <div className="mt-3 space-y-2">
              {(draft.extraJerseyDetails ?? []).map((x, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <span className="self-center text-xs font-semibold text-muted">
                    Spare {i + 1}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      className="min-w-0 flex-1"
                      placeholder="Number"
                      inputMode="numeric"
                      value={x.number}
                      onChange={(e) => patchExtra(i, { number: e.target.value })}
                    />
                    {!x.sockOnly && (
                      <button
                        type="button"
                        title="A good hockey number nobody on this order has"
                        aria-label={`Pick a number for spare ${i + 1}`}
                        className="shrink-0 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-xs font-semibold hover:border-ppc-gold/60 hover:text-ppc-gold"
                        onClick={() =>
                          patchExtra(i, {
                            number: goodFreeNumber(
                              takenNumbers(roster, (draft.extraJerseyDetails ?? []).filter((_, j) => j !== i), keepers),
                            ),
                          })
                        }
                      >
                        Random
                      </button>
                    )}
                  </div>
                  {x.sockOnly ? (
                    <span className="self-center text-xs text-muted">No jersey</span>
                  ) : (
                    <SizeSelect
                      value={x.size}
                      options={PLAYER_JERSEY_SIZES}
                      onChange={(v) => patchExtra(i, { size: v })}
                    />
                  )}
                  {totalAcrossSets.extraSocks > 0 ? (
                    <SizeSelect
                      value={x.sockSize}
                      options={SOCK_SIZES}
                      onChange={(v) => patchExtra(i, { sockSize: v })}
                    />
                  ) : (
                    <span />
                  )}
                  <label className="flex items-center gap-2 self-center text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={x.sockOnly}
                      onChange={(e) =>
                        patchExtra(i, { sockOnly: e.target.checked, size: e.target.checked ? '' : x.size })
                      }
                    />
                    Socks only
                  </label>
                </div>
              ))}
            </div>

            {/*
              * Says so when the rows and the counts disagree, rather than
              * forcing them to agree. Ticking "socks only" is how you resolve
              * it, and being told which way it's out is more use than a
              * blocked field.
              */}
            {extraJerseyRows !== spareJerseys && (
              <p className="mt-2 text-xs text-amber-400">
                {extraJerseyRows} of these have a jersey, but the order has{' '}
                {spareJerseys}. Tick &quot;socks only&quot; on the ones that
                don&apos;t get a jersey.
              </p>
            )}
          </div>
        )}
      </>
    ),

    build: (
      <>
        {/*
          * Home and away aren't always the same build — home embroidered,
          * away sublimated, or the other way round. Asked first; answer No and
          * the build splits into a column per set, side by side, each with its
          * own jersey type and tier. The first set's is the order's own
          * jerseyType/jerseyTier (its tier applies the add-on preset, as in
          * Add-Ons); a later set carries its own. Priced set by set.
          */}
        {draft.sets.length > 1 && (
          <ChoiceGroup<'same' | 'different'>
            label={draft.orderMode === 'home_away_set' ? 'Are home and away the same build?' : 'Are all the sets the same build?'}
            value={buildsDiffer(draft) ? 'different' : 'same'} columns={2}
            onChange={(v) => {
              const on = v === 'different';
              set('sets', draft.sets.map((s, i) => {
                if (i === 0) return s;
                if (on) {
                  return {
                    ...s,
                    jerseyType: s.jerseyType ?? draft.jerseyType ?? 'sublimated',
                    jerseyTier: s.jerseyTier ?? null,
                    // Starts as a copy of the first set's build, then goes its own way.
                    addons: s.addons ?? orderBuildAddons(draft),
                  };
                }
                const { jerseyType: _t, jerseyTier: _r, sockType: _s, pantShellType: _p, addons: _a, ...rest } = s;
                void _t; void _r; void _s; void _p; void _a;
                return rest;
              }));
            }}
            choices={[
              { value: 'same', label: 'Yes — one build' },
              { value: 'different', label: 'No — different builds', blurb: 'e.g. one embroidered, one sublimated' },
            ]}
          />
        )}
        {buildsDiffer(draft) ? (
          <div className="grid gap-3 md:grid-cols-2">
            {draft.sets.map((s, i) => {
              const first = i === 0;
              const type = first ? draft.jerseyType : s.jerseyType ?? draft.jerseyType;
              const tierId = first ? draft.jerseyTier : s.jerseyTier ?? null;
              const tiers = tiersForJerseyType(type ?? null);
              const patchSet = (p: Partial<typeof s>) =>
                set('sets', draft.sets.map((x, j) => (j === i ? { ...x, ...p } : x)));
              return (
                <div key={i} className="space-y-3 rounded-lg border border-ppc-gold/40 bg-ppc-gold/[0.04] p-3">
                  <div className="text-sm font-bold text-ppc-gold">{s.label}</div>
                  <ChoiceGroup<JerseyType>
                    label="Jersey Type" value={type ?? null} columns={1}
                    onChange={(v) => {
                      if (!v) return;
                      const keepTier = tiersForJerseyType(v).some((t) => t.id === tierId);
                      if (first) {
                        set('jerseyType', v);
                        if (!keepTier && draft.jerseyTier) set('jerseyTier', null);
                      } else {
                        // A tier from the other build can't stay.
                        patchSet({ jerseyType: v, jerseyTier: keepTier ? tierId : null });
                      }
                    }}
                    choices={(Object.keys(JERSEY_TYPE_LABELS) as JerseyType[]).map((v) => ({ value: v, label: JERSEY_TYPE_LABELS[v] }))}
                  />
                  {tiers.length > 0 && (
                    <ChoiceGroup<JerseyTier>
                      label="Build Tier" value={tierId} columns={1}
                      onChange={(v) => {
                        if (!v) return;
                        if (first) {
                          // Same as picking it in Add-Ons: the preset's add-ons come with it.
                          const tier = tierById(v);
                          if (tier) applyTier(v, tierPatch(tier));
                        } else {
                          const tier = tierById(v);
                          patchSet({ jerseyTier: v, addons: { ...setAddons(draft, i), ...(tier ? buildPartOf(tierPatch(tier)) : {}) } });
                        }
                      }}
                      choices={tiers.map((t) => ({ value: t.id, label: t.label, blurb: t.blurb }))}
                    />
                  )}
                  {/* Socks on more than one set: each set's own sock type. On one set, it's one type, below. */}
                  {perSetSockTypes(draft) && (s.sockPairs || 0) + (s.extraSockPairs || 0) > 0 && (
                    <ChoiceGroup<SockType>
                      label="Sock Type" columns={1}
                      value={first ? draft.sockType : s.sockType ?? draft.sockType}
                      onChange={(v) => {
                        if (!v) return;
                        if (first) set('sockType', v);
                        else patchSet({ sockType: v });
                      }}
                      choices={(Object.keys(SOCK_TYPE_LABELS) as SockType[]).map((v) => ({ value: v, label: SOCK_TYPE_LABELS[v] }))}
                    />
                  )}
                  {hasPantShells && perSetShellTypes(draft) && (s.pantShells || 0) + (s.extraPantShells || 0) > 0 && (
                    <ChoiceGroup<PantShellType>
                      label="Pant Shell Type" columns={1}
                      value={first ? draft.pantShellType : s.pantShellType ?? draft.pantShellType}
                      onChange={(v) => {
                        if (!v) return;
                        if (first) set('pantShellType', v);
                        else patchSet({ pantShellType: v });
                      }}
                      choices={(Object.keys(PANT_SHELL_TYPE_LABELS) as PantShellType[]).map((v) => ({ value: v, label: PANT_SHELL_TYPE_LABELS[v] }))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <ChoiceGroup<JerseyType>
            label="Jersey Type"
            value={draft.jerseyType} allowClear
            onChange={(v) => set('jerseyType', v)}
            choices={(Object.keys(JERSEY_TYPE_LABELS) as JerseyType[]).map((v) => ({ value: v, label: JERSEY_TYPE_LABELS[v] }))}
          />
        )}
        {buildsDiffer(draft) && (
          <p className="text-xs text-muted">
            The add-ons in <span className="font-semibold text-ppc-gold">Add-Ons &amp; Customization</span> apply to
            every set they fit.
          </p>
        )}
        {!perSetSockTypes(draft) && (
          <ChoiceGroup<SockType>
            label="Sock Type" value={draft.sockType} allowClear
            onChange={(v) => set('sockType', v)}
            choices={(Object.keys(SOCK_TYPE_LABELS) as SockType[]).map((v) => ({ value: v, label: SOCK_TYPE_LABELS[v] }))}
          />
        )}
        {orderIncludesSocks(draft) && (
          <p className="text-xs text-muted">
            Pro cut multi-panel socks are ticked beside the build tier in{' '}
            <span className="font-semibold text-ppc-gold">Add-Ons &amp; Customization</span>.
          </p>
        )}
        {/* Right here with the jersey and sock builds, whenever shells are on the order. */}
        {hasPantShells && !perSetShellTypes(draft) && (
          <ChoiceGroup<PantShellType>
            label="Pant Shell Type" value={draft.pantShellType} allowClear columns={2}
            onChange={(v) => set('pantShellType', v)}
            choices={(Object.keys(PANT_SHELL_TYPE_LABELS) as PantShellType[]).map((v) => ({ value: v, label: PANT_SHELL_TYPE_LABELS[v] }))}
          />
        )}
      </>
    ),

    numbers: (
      <>
        {/* Name style sits here, not in Add-Ons: it's the same decision as the
            numbers — how the lettering on the back is built. */}
        <ChoiceGroup<NameStyle>
          label="Name Style" value={draft.nameStyle} columns={3}
          onChange={(v) => v && set('nameStyle', v)}
          choices={(Object.keys(NAME_STYLE_LABELS) as NameStyle[]).map((v) => ({ value: v, label: NAME_STYLE_LABELS[v] }))}
        />
        <TextArea
          label="Number Description / Notes" value={draft.numberDetails}
          onChange={(v) => set('numberDetails', v)}
          placeholder="Describe number styling, colors, fonts, etc..."
        />
        {draft.orderMode === 'home_away_set' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <AssetGroup orderId={draft.id} role="number_reference_home" title="Home Reference" max={2} assets={assets} onAdd={addAsset} onRemove={removeAsset} />
            <AssetGroup orderId={draft.id} role="number_reference_away" title="Away Reference" max={2} assets={assets} onAdd={addAsset} onRemove={removeAsset} />
          </div>
        ) : (
          <AssetGroup orderId={draft.id} role="number_reference" title="Reference Image" max={2} assets={assets} onAdd={addAsset} onRemove={removeAsset} />
        )}
      </>
    ),

    addons: (
      <>
        {/*
          * Sets built differently are built out separately: a column per set,
          * each with its own tier and its own build add-ons (Keenan,
          * 2026-10-21). The first set's are the order's own; a later set's are
          * on the set. Branding, laces, shoulders, patches stay order-wide.
          */}
        {buildsDiffer(draft) ? (
          <div className="grid gap-3 md:grid-cols-2">
            {draft.sets.map((s, i) => {
              const first = i === 0;
              const type = first ? draft.jerseyType : s.jerseyType ?? draft.jerseyType;
              const mine = setAddons(draft, i);
              const putAddons = (next: Record<string, boolean>) =>
                set('sets', draft.sets.map((x, j) => (j === i ? { ...x, addons: next } : x)));
              return (
                <div key={i} className="space-y-3 rounded-lg border border-ppc-gold/40 bg-ppc-gold/[0.04] p-3">
                  <div className="text-sm font-bold text-ppc-gold">{s.label}</div>
                  <TierPresets
                    jerseyType={type ?? null}
                    appliedTier={first ? draft.jerseyTier : s.jerseyTier ?? null}
                    order={{ ...draft, ...mine } as Order}
                    onApply={(tier, patch) => {
                      if (first) applyTier(tier, patch);
                      else set('sets', draft.sets.map((x, j) => (j === i ? { ...x, jerseyTier: tier, addons: { ...mine, ...buildPartOf(patch) } } : x)));
                    }}
                  />
                  <div className="grid gap-2">
                    {buildAddonsForJerseyType(type ?? null).map((a) => (
                      <div key={a.key}>
                        <Toggle
                          label={a.label}
                          checked={Boolean(mine[a.key])}
                          onChange={(v) => (first ? set(a.key as keyof Order, v as never) : putAddons({ ...mine, [a.key]: v }))}
                        />
                        {addonHint(a) && <p className="mt-1 px-1 text-xs text-muted">{addonHint(a)}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
        <TierPresets
          jerseyType={draft.jerseyType}
          appliedTier={draft.jerseyTier}
          order={draft}
          onApply={applyTier}
        />
        )}
        {/* Sock construction sits with the tier because it's the same kind of
            decision: the grade of the build. It isn't tied to a tier, though.
            Pro cut socks come sublimated or embroidered, so any build can have
            them. Only offered when the order actually has socks. */}
        {orderIncludesSocks(draft) && (
          <div className="rounded-lg border border-ppc-gold/40 bg-ppc-gold/[0.04] p-4">
            <Toggle
              label="Pro Cut Multi-Panel Socks"
              checked={draft.multiPanelSocks}
              onChange={(v) => set('multiPanelSocks', v)}
            />
            <p className="mt-2 text-xs text-muted">
              Pro cut, multi-panel construction for the socks on this order. Works with any tier:
              the socks come sublimated or embroidered either way.
            </p>
          </div>
        )}
        {/* Build add-ons only. The three Powerplay branding ones have their own section below. */}
        {!buildsDiffer(draft) && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {buildAddonsForJerseyType(jerseyTypesInUse(draft)).map((a) => (
              <div key={a.key}>
                <Toggle label={a.label} checked={Boolean(draft[a.key as keyof Order])} onChange={(v) => set(a.key as keyof Order, v as never)} />
                {addonHint(a) && <p className="mt-1 px-1 text-xs text-muted">{addonHint(a)}</p>}
              </div>
            ))}
          </div>
        )}
        <LacesPicker value={draft.lacesStyle} onChange={(v) => set('lacesStyle', v)} />
        <ChoiceGroup<ShoulderCut>
          label="Shoulder Cut" value={draft.shoulderCut} columns={2}
          onChange={(v) => v && set('shoulderCut', v)}
          choices={(Object.keys(SHOULDER_CUT_LABELS) as ShoulderCut[]).map((v) => ({ value: v, label: SHOULDER_CUT_LABELS[v] }))}
        />
        <Toggle label="Stitch-on shoulder trim" checked={draft.stitchedShoulderTrim} onChange={(v) => set('stitchedShoulderTrim', v)} />
        <Toggle label="Captain Patches (C's / A's)" checked={draft.hasCaptainPatches} onChange={(v) => set('hasCaptainPatches', v)} />
        {draft.hasCaptainPatches && (
          <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-3">
            <ChoiceGroup<CaptainPatchStyle>
              label="Captain Patch Style" value={draft.captainPatchStyle} columns={2}
              onChange={(v) => set('captainPatchStyle', v)}
              choices={(Object.keys(CAPTAIN_PATCH_STYLE_META) as CaptainPatchStyle[]).map((v) => ({
                value: v, label: CAPTAIN_PATCH_STYLE_META[v].label, blurb: CAPTAIN_PATCH_STYLE_META[v].blurb,
              }))}
            />
            {/* Home and away are different designs, so each set has its own count. */}
            {draft.orderMode === 'home_away_set' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField label="Home set — C's (Captain)" value={draft.captainCQuantity} onChange={(v) => set('captainCQuantity', v)} />
                <NumberField label="Home set — A's (Alternate)" value={draft.captainAQuantity} onChange={(v) => set('captainAQuantity', v)} />
                <NumberField label="Away set — C's (Captain)" value={draft.captainAwayCQuantity ?? 0} onChange={(v) => set('captainAwayCQuantity', v)} />
                <NumberField label="Away set — A's (Alternate)" value={draft.captainAwayAQuantity ?? 0} onChange={(v) => set('captainAwayAQuantity', v)} />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField label="Quantity of C's (Captain)" value={draft.captainCQuantity} onChange={(v) => set('captainCQuantity', v)} />
                <NumberField label="Quantity of A's (Alternate)" value={draft.captainAQuantity} onChange={(v) => set('captainAQuantity', v)} />
              </div>
            )}
            {draft.captainPatchStyle === 'custom_design' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <AssetGroup orderId={draft.id} role="captain_c" title="C Design" max={2} slotLabels={draft.orderMode === 'home_away_set' ? ['Home C', 'Away C'] : undefined} assets={assets} onAdd={addAsset} onRemove={removeAsset} />
                <AssetGroup orderId={draft.id} role="captain_a" title="A Design" max={2} slotLabels={draft.orderMode === 'home_away_set' ? ['Home A', 'Away A'] : undefined} assets={assets} onAdd={addAsset} onRemove={removeAsset} />
              </div>
            )}
            <TextArea label="Notes" value={draft.captainPatchNotes} onChange={(v) => set('captainPatchNotes', v)} />
          </div>
        )}
      </>
    ),

    branding: (
      <>
        {/*
          * Powerplay's own marks on the jersey, apart from the build options:
          * the tier presets tick them, but whether THIS team gets them is a
          * separate decision from vents and elbows, and so are the changes to
          * them ("no back label", "crest in gold"), which go in the notes.
          */}
        <div className="grid gap-2 sm:grid-cols-3">
          {BRANDING_ADDONS.map((a) => (
            <Toggle key={a.key} label={a.label} checked={Boolean(draft[a.key as keyof Order])} onChange={(v) => set(a.key as keyof Order, v as never)} />
          ))}
        </div>
        <TextArea
          label="Branding notes — any changes to the above"
          value={draft.brandingNotes}
          onChange={(v) => set('brandingNotes', v)}
          placeholder="e.g. crest in gold instead of white; no back label on the goalie cuts; size tag printed in French..."
        />
        <p className="-mt-1 text-xs text-muted">
          Shown with the branding on the customer&apos;s sheet and the factory sheet.
        </p>

        {/*
          * Branding that isn't Powerplay's — a sponsor's logo, say. Two
          * pictures as standard: the logo, and where it goes on the jersey.
          */}
        <Toggle
          label="Custom branding — extra logos (sponsors or similar)"
          checked={draft.customBranding}
          onChange={(v) => {
            set('customBranding', v);
            // Switching it on starts the first logo, ready to fill in.
            if (v && !(draft.customBrandingItems ?? []).length) {
              set('customBrandingItems', [{ id: newId(), name: '', notes: '' }]);
            }
          }}
        />
        {draft.customBranding && (
          <div className="space-y-3">
            {(draft.customBrandingItems ?? []).map((item, n, items) => {
              const patchItem = (p: Partial<typeof item>) =>
                set('customBrandingItems', items.map((x) => (x.id === item.id ? { ...x, ...p } : x)));
              const group = { id: item.id, includeUngrouped: n === 0 };
              return (
                <div key={item.id} className="space-y-3 rounded-lg border border-ppc-gold/40 bg-ppc-gold/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-ppc-gold">Logo {n + 1}</span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={async () => {
                          // Its files go with it.
                          for (const a of assets.filter((x) =>
                            (x.role === 'custom_branding_logo' || x.role === 'custom_branding_placement') &&
                            (x.groupId === item.id || (n === 0 && !x.groupId)))) {
                            await removeAsset(a.id);
                          }
                          set('customBrandingItems', items.filter((x) => x.id !== item.id));
                        }}
                        className="text-xs font-semibold text-muted hover:text-red-300"
                      >
                        Remove this logo
                      </button>
                    )}
                  </div>
                  <TextField label="Whose logo" value={item.name} onChange={(v) => patchItem({ name: v })} placeholder="e.g. Smith Plumbing" />
                  <TextArea
                    label="What it is and where it goes"
                    value={item.notes}
                    onChange={(v) => patchItem({ notes: v })}
                    placeholder="e.g. 3 inches wide, centred above the back label, white on all jerseys"
                  />
                  <div className="grid gap-3 lg:grid-cols-2">
                    <AssetGroup
                      orderId={draft.id} role="custom_branding_logo" title="The Logo" max={1} group={group}
                      hint="The logo file itself — vector if you have it."
                      assets={assets} onAdd={addAsset} onRemove={removeAsset}
                    />
                    <AssetGroup
                      orderId={draft.id} role="custom_branding_placement" title="Location on the Jersey" max={1} group={group}
                      hint="A mockup or marked-up picture showing where it goes."
                      assets={assets} onAdd={addAsset} onRemove={removeAsset}
                    />
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => set('customBrandingItems', [...(draft.customBrandingItems ?? []), { id: newId(), name: '', notes: '' }])}
              className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-semibold hover:border-ppc-gold/60"
            >
              + Add another logo
            </button>
            <p className="text-xs text-muted">
              Shown with the branding on the customer&apos;s sheet and the factory sheet.
            </p>
          </div>
        )}
      </>
    ),

    artwork: (
      <>
        {/*
          * One design reference per set, not one per order.
          *
          * A home/away order is two different jerseys, so capping this at a
          * single image left the away design with nowhere to go. The limit
          * follows the sets: one for a single set, two for home/away, N for
          * multiple sets — and each upload is named after the set it belongs
          * to, so nobody has to remember which of two images is the away one.
          */}
        <AssetGroup
          orderId={draft.id} role="design_reference"
          title={
            draft.sets.length > 1
              ? `Design References (${draft.sets.length} — one per set)`
              : 'Design Reference'
          }
          hint={
            draft.sets.length > 1
              ? `The images the manufacturer builds from — one for each set (${draft.sets
                  .map((s) => s.label)
                  .join(', ')}). Upload at full resolution; they're shown large on the order and on the customer's link.`
              : "The one image the manufacturer builds from. Upload it at full resolution — it's shown large on the order and on the customer's link."
          }
          max={Math.max(MAX_DESIGN_REFERENCE_FILES, draft.sets.length)}
          slotLabels={draft.sets.map((s) => s.label)}
          assets={assets} notes={draft.designReferenceNotes}
          onNotesChange={(v) => set('designReferenceNotes', v)}
          onAdd={addAsset} onRemove={removeAsset}
        />
        <AssetGroup
          orderId={draft.id} role="collar_reference" title="Collar / Neck Reference"
          assets={assets} notes={draft.collarReferenceNotes}
          onNotesChange={(v) => set('collarReferenceNotes', v)}
          onAdd={addAsset} onRemove={removeAsset}
        />
        <AssetGroup
          orderId={draft.id} role="main_crest" title="Main Crest Logo"
          assets={assets} notes={draft.mainCrestNotes}
          onNotesChange={(v) => set('mainCrestNotes', v)}
          onAdd={addAsset} onRemove={removeAsset}
        />
        {/* Rendered once. The old form showed this control twice, in two sections. */}
        <Toggle label="Shoulder Logos" checked={draft.hasShoulderLogos} onChange={(v) => set('hasShoulderLogos', v)} />
        {draft.hasShoulderLogos && (
          <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-3">
            <Toggle label="Same logo on both shoulders" checked={draft.shoulderLogosSame} onChange={(v) => set('shoulderLogosSame', v)} />
            {draft.shoulderLogosSame ? (
              <AssetGroup orderId={draft.id} role="shoulder_logo_both" title="Both Shoulders" assets={assets} onAdd={addAsset} onRemove={removeAsset} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <AssetGroup orderId={draft.id} role="shoulder_logo_left" title="Left Shoulder" assets={assets} onAdd={addAsset} onRemove={removeAsset} />
                <AssetGroup orderId={draft.id} role="shoulder_logo_right" title="Right Shoulder" assets={assets} onAdd={addAsset} onRemove={removeAsset} />
              </div>
            )}
          </div>
        )}
        <AdditionalLogos
          orderId={draft.id} assets={assets} onAdd={addAsset} onRemove={removeAsset}
          onRenameGroup={(groupId, patch) => {
            setAssets((prev) => prev.map((a) => (a.groupId === groupId ? { ...a, ...patch } : a)));
            void renameAssetGroup(draft.id, groupId, patch);
          }}
        />
        <AssetGroup
          orderId={draft.id} role="font" title="Custom Font File" max={2}
          hint=".ttf, .otf, .woff, .woff2"
          assets={assets} onAdd={addAsset} onRemove={removeAsset}
        />
      </>
    ),

    pants: (
      <>
        {perSetShellTypes(draft) ? (
          <p className="text-xs text-muted">
            Each set&apos;s pant shell type is picked in its column in{' '}
            <span className="font-semibold text-ppc-gold">Build Type</span>.
          </p>
        ) : (
          <ChoiceGroup<PantShellType>
            label="Pant Shell Type" value={draft.pantShellType} allowClear columns={2}
            onChange={(v) => set('pantShellType', v)}
            choices={(Object.keys(PANT_SHELL_TYPE_LABELS) as PantShellType[]).map((v) => ({ value: v, label: PANT_SHELL_TYPE_LABELS[v] }))}
          />
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {PANT_TOGGLES.map(({ key, label }) => (
            <Toggle key={key} label={label} checked={Boolean(draft[key as keyof Order])} onChange={(v) => set(key as keyof Order, v as never)} />
          ))}
        </div>
        {/*
          * Goalie shells only: with the pads on, anything on the front of the
          * legs disappears. Offered when there's a goalie to dress and shells
          * on the order (offersGoaliePantOption), and nowhere else.
          */}
        {offersGoaliePantOption(draft) && (
          <div className="rounded-lg border border-ppc-gold/40 bg-ppc-gold/[0.04] p-3">
            <Toggle
              label="Reversed logos on the goalie pant shells"
              checked={draft.goaliePantReversedLogos}
              onChange={(v) => set('goaliePantReversedLogos', v)}
            />
            <p className="mt-2 text-xs text-muted">
              Logos and numbers go on the back of the legs instead of the front, so they still show
              once the goalie&apos;s pads are on. Skaters&apos; shells stay as normal.
            </p>
          </div>
        )}
        <AssetGroup
          orderId={draft.id} role="pant_design" title="Pant Design" max={2}
          hint="How the shells should look. Upload a new one to replace what's here."
          assets={assets} onAdd={addAsset} onRemove={removeAsset}
        />
        {draft.pantLogo && (
          <AssetGroup
            orderId={draft.id} role="pant_logo" title="Pant Logo Artwork" max={2}
            hint="The logo that goes on the pant shells."
            assets={assets} onAdd={addAsset} onRemove={removeAsset}
          />
        )}
        {draft.pantNumber && (
          <AssetGroup
            orderId={draft.id} role="pant_number" title="Pant Number Reference" max={2}
            hint="How the number should look on the shells."
            assets={assets} onAdd={addAsset} onRemove={removeAsset}
          />
        )}
      </>
    ),

    roster: (
      <>
        {rosterError && (
          <p className="rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300">
            The roster wasn&apos;t saved: {rosterError}
          </p>
        )}
        <RosterVersions
          orderId={draft.id}
          versions={initialRosters}
          fileLinks={rosterFileLinks}
          beforeChange={flush}
          // The table holds its rows in this page's state: reload to pick up the roster now in use.
          afterChange={() => window.location.reload()}
        />
        <RosterTable
          orderId={draft.id}
          entries={roster}
          orderMode={draft.orderMode}
          sets={draft.sets}
          sockType={draft.sockType}
          pantShellType={draft.pantShellType}
          nameStyle={draft.nameStyle}
          spares={draft.extraJerseyDetails ?? []}
          onImport={() => setImporting(true)}
          onChange={(next) => {
            rosterDirty.current = true;
            setRoster(next);
          }}
        />
        {importing && (
          <RosterImporter
            orderId={draft.id}
            ctx={importContextOf(draft)}
            nextNumber={nextRosterNumber(initialRosters.length ? initialRosters : roster.length ? [{ number: 1 }] : [], initialOrder.rosterNumbersUsed ?? 0)}
            signedOff={isApproved}
            beforeAccept={flush}
            onAccepted={() => window.location.reload()}
            onClose={() => setImporting(false)}
          />
        )}
      </>
    ),

    notes: (
      <>
        {/*
          * Two note boxes, two readers. Order notes go on the customer's
          * share sheet (no code) and on the factory sheet; factory notes go on
          * the factory sheet only (behind the factory code). The boxes say so
          * on their faces because the difference is who gets to read them.
          */}
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <TextArea
            label="Order notes — customer sheet AND factory sheet" value={draft.specialNotes}
            onChange={(v) => set('specialNotes', v)}
            placeholder="Instructions about what to make that the team should see too: crest size, colour calls, anything they're signing off on..."
          />
          <p className="-mt-1 text-xs text-muted">
            Shown on the customer&apos;s share link (no code needed) and on the factory sheet.
          </p>
        </div>
        <div className="rounded-lg border border-ppc-gold/50 bg-ppc-gold/5 p-3">
          <TextArea
            label="Factory-only notes — Michael's sheet, never the customer" value={draft.factoryNotes}
            onChange={(v) => set('factoryNotes', v)}
            placeholder="The in-depth build notes only the factory needs: construction details, what to watch on this job, how to handle the keepers..."
          />
          <p className="-mt-1 text-xs text-muted">
            Only on the factory sheet, behind the factory code. The customer never sees this box.
            Jerseys you&apos;re keeping (Order Totals) are listed on that sheet automatically.
          </p>
        </div>
        <Toggle
          label="Ask the customer to approve on their share link"
          checked={draft.requestApproval}
          onChange={(v) => set('requestApproval', v)}
        />
        <p className="-mt-1 text-xs text-muted">
          Adds a sign-off block to the bottom of the customer&apos;s page: they accept the{' '}
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noreferrer"
            className="text-ppc-gold hover:underline"
          >
            terms and conditions
          </a>
          , type their name, and the order is locked. Leave it off until the proof is ready to be
          signed.
        </p>

        {/*
          * These two stay editable for approvals taken off-app — a team that
          * replies "yep, go ahead" by email still needs recording. A signature
          * captured through the share page fills them in itself and also
          * leaves an approvalRecord, which typing here does not.
          */}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Approved By" value={draft.approvedBy} onChange={(v) => set('approvedBy', v)} placeholder="Name" />
          <TextField label="Approval Date" type="date" value={draft.approvedDate ?? ''} onChange={(v) => set('approvedDate', v || null)} error={errors.approvedDate} />
        </div>
      </>
    ),
  };

  const modificationGate = pendingEdit && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-bold">Are you sure you want to make a modification?</h2>
        <p className="mt-2 text-sm text-muted">
          {draft.approvedBy
            ? `${draft.approvedBy} approved this order`
            : 'This order was approved'}
          {draft.approvedDate ? ` on ${formatLong(draft.approvedDate)}` : ''}. Changing it now means
          what they signed off no longer matches what gets made.
        </p>
        <p className="mt-2 text-sm text-muted">
          If you go ahead, tell them what changed — and remember the order can&apos;t be changed at
          all once it&apos;s in production.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setPendingEdit(null)}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-muted hover:text-fg"
          >
            Leave it as approved
          </button>
          <button
            type="button"
            onClick={() => {
              setEditUnlocked(true);
              pendingEdit();
              setPendingEdit(null);
            }}
            className="rounded-lg bg-ppc-gold px-4 py-2 text-sm font-bold text-black hover:brightness-110"
          >
            Yes, modify it
          </button>
        </div>
      </div>
    </div>
  );

  /* ---------------- layout ---------------- */

  const finish = async () => {
    await flush();
    router.push(`/orders/${draft.id}`);
  };

  // New order: choose how to build it before anything renders.
  if (viewMode === null) {
    return (
      <div className="mx-auto max-w-2xl py-6">
        <h1 className="mb-4 text-2xl font-bold">New Order</h1>
        <StartChooser onPick={pickMode} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {modificationGate}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {initialOrder.teamName ? `Edit — ${initialOrder.teamName}` : draft.teamName ? `New — ${draft.teamName}` : 'New Order'}
        </h1>
        <div className="flex items-center gap-3">
          <ModeSwitch mode={viewMode} onChange={setViewMode} />
          <button type="button" onClick={finish} className="rounded-lg bg-ppc-gold px-4 py-2 text-sm font-semibold text-black hover:bg-ppc-gold-dim">
            Done
          </button>
        </div>
      </div>

      {approved && (
        <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <strong>This order was signed off on {formatLong(draft.approvedDate)}.</strong> Your policy is that
          approval locks the order. Anything you change now is recorded in the order history as a
          post-approval change.
        </div>
      )}

      {viewMode === 'wizard' ? (
        <WizardFrame
          sections={sections}
          stepIndex={Math.min(step, sections.length - 1)}
          onStep={setStep}
          onFinish={finish}
          comment={commentControl(sections[Math.min(step, sections.length - 1)].id)}
        >
          {content[sections[Math.min(step, sections.length - 1)].id]}
        </WizardFrame>
      ) : (
        <div className="flex gap-6">
          <SectionNav
            sections={sections}
            activeId={activeId}
            onJump={jump}
            blurb={{
              teamName: draft.teamName,
              status: <StatusBadge status={draft.status} />,
              invoiceNumber: draft.invoiceNumber,
              line: [
                ORDER_MODE_META[draft.orderMode].label,
                `${rosterSlotCount(draft)} player${rosterSlotCount(draft) === 1 ? '' : 's'}`,
                draft.estimatedFinishDate ? `due ${formatLong(draft.estimatedFinishDate)}` : null,
              ].filter(Boolean).join(' \u00b7 '),
            }}
          />
          <div className="min-w-0 flex-1 space-y-4">
            {sections.map((def) => (
              <SectionCard key={def.id} def={def} anchored comment={commentControl(def.id)}>
                {content[def.id]}
              </SectionCard>
            ))}
          </div>
        </div>
      )}

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <SaveIndicator state={saveState} />
          <div className="flex gap-2">
            <button type="button" onClick={flush} className="rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm font-semibold hover:border-ppc-gold/60">
              Save now
            </button>
            <button type="button" onClick={finish} className="rounded-lg bg-ppc-gold px-4 py-2 text-sm font-semibold text-black hover:bg-ppc-gold-dim">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  const text = {
    idle: 'All changes saved automatically',
    saving: 'Saving…',
    saved: '✓ Saved',
    error: 'Some fields need fixing',
  }[state];
  const cls = {
    idle: 'text-muted',
    saving: 'text-muted',
    saved: 'text-emerald-300',
    error: 'text-red-300',
  }[state];
  return <span className={`text-xs font-semibold ${cls}`}>{text}</span>;
}
