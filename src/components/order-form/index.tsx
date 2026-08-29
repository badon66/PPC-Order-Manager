'use client';

import { formatLong } from '@/lib/dates';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  CAPTAIN_PATCH_STYLE_META, JERSEY_TYPE_LABELS, MAX_DESIGN_REFERENCE_FILES, NAME_STYLE_LABELS, ORDER_MODE_META, PANT_SHELL_TYPE_LABELS, PANT_TOGGLES, SHOULDER_CUT_LABELS, SOCK_TYPE_LABELS, STATUS_META, STATUS_OPTIONS, addonsForJerseyType, type AddonKey, TERMS_URL, PLAYER_JERSEY_SIZES, SOCK_SIZES,
} from '@/lib/constants';
import { describeSet, extraRowCount, setsForMode, syncExtraJerseyDetails } from '@/lib/order-utils';
import type {
  CaptainPatchStyle, ExtraJersey, JerseyTier, JerseyType, NameStyle, Order, OrderAsset, OrderMode, PantShellType, RosterEntry, ShoulderCut, SockType, ViewableAsset,
} from '@/lib/types';
import { attachAsset, detachAsset, renameAssetGroup, saveOrder, saveRoster } from '@/app/orders/actions';
import { ChoiceGroup, NumberField, SizeSelect, TextArea, TextField, Toggle } from './fields';
import { RosterTable } from './roster-table';
import { AssetGroup } from './assets';
import { AdditionalLogos } from './additional-logos';
import { ClientLinkConfig } from './client-link-config';
import { TierPresets } from './tier-presets';
import { LacesPicker } from './laces-picker';
import {
  ModeSwitch, SectionCard, SectionNav, StartChooser, WizardFrame,
  useScrollSpy, type SectionDef, type ViewMode,
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
  isNew = false,
}: {
  initialOrder: Order;
  initialRoster: RosterEntry[];
  initialAssets: ViewableAsset[];
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
      await saveRoster(draft.id, roster);
      rosterDirty.current = false;
    }

    setSaveState(ok ? 'saved' : 'error');
    if (ok) setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1800);
  }, [draft, roster]);

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

  function changeMode(mode: OrderMode) {
    dirty.current = true;
    setDraft((d) => ({ ...d, orderMode: mode, sets: setsForMode(mode, d.numberOfSets, d.sets) }));
  }

  function changeSetCount(n: number) {
    dirty.current = true;
    setDraft((d) => ({ ...d, numberOfSets: n, sets: setsForMode('multiple_sets', n, d.sets) }));
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
    draft.playersTotal > 0 ||
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
    { id: 'numbers', title: 'Numbers & Names', icon: '🔟', blurb: 'Name style, number styling, and reference images.', complete: Boolean(draft.numberDetails) || assets.some((a) => a.role.startsWith('number_reference')) },
    { id: 'addons', title: 'Add-Ons & Customization', icon: '✨', blurb: 'Construction features, laces, patches, name style.', complete: addonsForJerseyType(draft.jerseyType).some(({ key }) => Boolean(draft[key as keyof Order])) || draft.lacesStyle !== 'none' || draft.hasCaptainPatches },
    { id: 'artwork', title: 'Logos & Artwork', icon: '🎨', blurb: 'Design references, crest, shoulder logos, sponsor logos, fonts.', complete: hasArtwork },
    ...(hasPantShells
      ? [{
          id: 'pants',
          title: 'Pants & Pant Shells',
          icon: '🩳',
          blurb: 'Shell build, plus pant logo and number with their artwork.',
          complete: Boolean(draft.pantShellType),
        } as SectionDef]
      : []),
    { id: 'roster', title: `Player Roster (${roster.length})`, icon: '👥', blurb: 'Names, numbers, sizes — or import a CSV.', complete: roster.length > 0 },
    { id: 'notes', title: 'Notes & Approval', icon: '✅', blurb: 'Special instructions and customer sign-off.', complete: Boolean(draft.approvedBy || draft.approvedDate || draft.specialNotes) },
  ];

  const [activeId, jump] = useScrollSpy(sections.map((s) => s.id));

  /* ---------------- section content ---------------- */

  const content: Record<string, ReactNode> = {
    team: (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Team Name" value={draft.teamName} onChange={(v) => set('teamName', v)} placeholder="Enter team name" />
          <TextField label="Invoice Number" value={draft.invoiceNumber} onChange={(v) => set('invoiceNumber', v)} placeholder="e.g. PPC1801" error={errors.invoiceNumber} warning={warnings.invoiceNumber} />
          <TextField label="Date Paid" type="date" value={draft.datePaid ?? ''} onChange={(v) => set('datePaid', v || null)} error={errors.datePaid} />
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
          <NumberField label="Total Number of Players" value={draft.playersTotal} onChange={(v) => set('playersTotal', v)} />
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
            <div className="text-xs font-bold uppercase tracking-wide text-ppc-gold">
              Extra Jersey Numbers
            </div>
            <p className="mt-1 text-xs text-muted">
              {totalAcrossSets.extraJerseys > 0 &&
                `${totalAcrossSets.extraJerseys} spare jersey${totalAcrossSets.extraJerseys === 1 ? '' : 's'}`}
              {totalAcrossSets.extraJerseys > 0 && totalAcrossSets.extraSocks > 0 && ' and '}
              {totalAcrossSets.extraSocks > 0 &&
                `${totalAcrossSets.extraSocks} spare sock pair${totalAcrossSets.extraSocks === 1 ? '' : 's'}`}
              . Give each a number and size, or leave them for the customer to fill in.
            </p>

            <div className="mt-3 space-y-2">
              {(draft.extraJerseyDetails ?? []).map((x, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <span className="self-center text-xs font-semibold text-muted">
                    Spare {i + 1}
                  </span>
                  <input
                    placeholder="Number"
                    inputMode="numeric"
                    value={x.number}
                    onChange={(e) => patchExtra(i, { number: e.target.value })}
                  />
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
            {extraJerseyRows !== totalAcrossSets.extraJerseys && (
              <p className="mt-2 text-xs text-amber-400">
                {extraJerseyRows} of these have a jersey, but the order has{' '}
                {totalAcrossSets.extraJerseys}. Tick &quot;socks only&quot; on the ones that
                don&apos;t get a jersey.
              </p>
            )}
          </div>
        )}
      </>
    ),

    build: (
      <>
        <ChoiceGroup<JerseyType>
          label="Jersey Type" value={draft.jerseyType} allowClear
          onChange={(v) => set('jerseyType', v)}
          choices={(Object.keys(JERSEY_TYPE_LABELS) as JerseyType[]).map((v) => ({ value: v, label: JERSEY_TYPE_LABELS[v] }))}
        />
        <ChoiceGroup<SockType>
          label="Sock Type" value={draft.sockType} allowClear
          onChange={(v) => set('sockType', v)}
          choices={(Object.keys(SOCK_TYPE_LABELS) as SockType[]).map((v) => ({ value: v, label: SOCK_TYPE_LABELS[v] }))}
        />
        {hasPantShells && (
          <p className="text-xs text-muted">
            Pant shell build is set in the <span className="font-semibold text-ppc-gold">Pants &amp; Pant Shells</span> section.
          </p>
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
        <TierPresets
          jerseyType={draft.jerseyType}
          appliedTier={draft.jerseyTier}
          order={draft}
          onApply={applyTier}
        />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {addonsForJerseyType(draft.jerseyType).map(({ key, label }) => (
            <Toggle key={key} label={label} checked={Boolean(draft[key as keyof Order])} onChange={(v) => set(key as keyof Order, v as never)} />
          ))}
        </div>
        <LacesPicker value={draft.lacesStyle} onChange={(v) => set('lacesStyle', v)} />
        <ChoiceGroup<ShoulderCut>
          label="Shoulder Cut" value={draft.shoulderCut} columns={2}
          onChange={(v) => v && set('shoulderCut', v)}
          choices={(Object.keys(SHOULDER_CUT_LABELS) as ShoulderCut[]).map((v) => ({ value: v, label: SHOULDER_CUT_LABELS[v] }))}
        />
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
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="Quantity of C's (Captain)" value={draft.captainCQuantity} onChange={(v) => set('captainCQuantity', v)} />
              <NumberField label="Quantity of A's (Alternate)" value={draft.captainAQuantity} onChange={(v) => set('captainAQuantity', v)} />
            </div>
            {draft.captainPatchStyle === 'custom_design' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <AssetGroup orderId={draft.id} role="captain_c" title="C Design" max={2} assets={assets} onAdd={addAsset} onRemove={removeAsset} />
                <AssetGroup orderId={draft.id} role="captain_a" title="A Design" max={2} assets={assets} onAdd={addAsset} onRemove={removeAsset} />
              </div>
            )}
            <TextArea label="Notes" value={draft.captainPatchNotes} onChange={(v) => set('captainPatchNotes', v)} />
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
        <ChoiceGroup<PantShellType>
          label="Pant Shell Type" value={draft.pantShellType} allowClear columns={2}
          onChange={(v) => set('pantShellType', v)}
          choices={(Object.keys(PANT_SHELL_TYPE_LABELS) as PantShellType[]).map((v) => ({ value: v, label: PANT_SHELL_TYPE_LABELS[v] }))}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {PANT_TOGGLES.map(({ key, label }) => (
            <Toggle key={key} label={label} checked={Boolean(draft[key as keyof Order])} onChange={(v) => set(key as keyof Order, v as never)} />
          ))}
        </div>
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
      <RosterTable
        orderId={draft.id}
        entries={roster}
        orderMode={draft.orderMode}
        sets={draft.sets}
        sockType={draft.sockType}
        pantShellType={draft.pantShellType}
        onChange={(next) => {
          rosterDirty.current = true;
          setRoster(next);
        }}
      />
    ),

    notes: (
      <>
        <TextArea
          label="Special Notes" value={draft.specialNotes}
          onChange={(v) => set('specialNotes', v)}
          placeholder="Any special instructions or notes for this order..."
        />
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
        >
          {content[sections[Math.min(step, sections.length - 1)].id]}
        </WizardFrame>
      ) : (
        <div className="flex gap-6">
          <SectionNav sections={sections} activeId={activeId} onJump={jump} />
          <div className="min-w-0 flex-1 space-y-4">
            {sections.map((def) => (
              <SectionCard key={def.id} def={def} anchored>
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
