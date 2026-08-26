import type { AssetRole, ViewableAsset } from '@/lib/types';

/**
 * Artwork, shown as pictures rather than a list of filenames.
 *
 * The old Base44 app had one labelled display per file, and that turned out to
 * be the thing people actually used: you check a crest by looking at it, not by
 * reading `IMG_2847.png`. The flat list this replaced made every file look
 * identical and forced a click to tell them apart.
 *
 * Grouped by role, in the order the jersey is designed rather than the order
 * the rows happen to sit in the database. `additional_logo` entries are grouped
 * again by `groupId`, because a sponsor block is one logical item with its own
 * name and notes even when it holds two files.
 *
 * Shared between the admin order page and the customer share page. The two
 * differ only in what they're handed: the share view already has the font file
 * filtered out upstream in `publicViewOf`, since a licensed typeface is not
 * something the customer ordered.
 *
 * Deliberately sparse. A tile carries a picture, a title, and a note if there
 * is one — nothing else. Keenan's standing preference is that these screens
 * stay uncluttered, so anything that isn't the artwork or its name doesn't
 * belong on the tile. A "still hosted on Base44" badge used to live here and
 * was removed for exactly that reason: the imported orders are historical and
 * he does not need reminding on every thumbnail.
 */

const ROLE_LABELS: Record<AssetRole, string> = {
  design_reference: 'Design Reference',
  collar_reference: 'Collar Reference',
  main_crest: 'Main Crest',
  number_reference: 'Number Reference',
  number_reference_home: 'Number Reference — Home',
  number_reference_away: 'Number Reference — Away',
  shoulder_logo_both: 'Shoulder Logo — Both',
  shoulder_logo_left: 'Shoulder Logo — Left',
  shoulder_logo_right: 'Shoulder Logo — Right',
  captain_c: "Captain's C",
  captain_a: "Captain's A",
  captain_extra: 'Captain Patch — Extra',
  additional_logo: 'Additional Logos',
  pant_design: 'Pant Design',
  pant_logo: 'Pant Logo',
  pant_number: 'Pant Number',
  font: 'Font',
  design_svg: 'Design File',
};

// Design intent order, not database order or alphabetical: the crest and the
// references you look at first come first, licensed and production files last.
const ROLE_ORDER: AssetRole[] = [
  'main_crest',
  'design_reference',
  'collar_reference',
  'number_reference',
  'number_reference_home',
  'number_reference_away',
  'shoulder_logo_both',
  'shoulder_logo_left',
  'shoulder_logo_right',
  'captain_c',
  'captain_a',
  'captain_extra',
  'additional_logo',
  'pant_design',
  'pant_logo',
  'pant_number',
  'design_svg',
  'font',
];

/*
 * Decided by extension, not by fetching the file.
 *
 * `.ai`, `.eps` and `.pdf` are the common vector deliverables and no browser
 * renders them in an <img>. Showing a broken image icon for those reads as "the
 * file is missing" when it is perfectly fine — so they get a labelled card
 * instead. Base44 URLs frequently carry no extension at all; those are treated
 * as images, which is what they almost always are, and a failed load falls back
 * to the same card via `onError` — except this is a server component, so the
 * fallback is CSS-only: the card sits behind the image and shows through if the
 * image never paints.
 */
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)(\?|#|$)/i;
const KNOWN_NON_IMAGE = /\.(ai|eps|pdf|psd|indd|zip|otf|ttf|woff2?|dxf)(\?|#|$)/i;

function looksLikeImage(url: string, fileName: string): boolean {
  const subject = `${fileName} ${url}`;
  if (KNOWN_NON_IMAGE.test(subject)) return false;
  if (IMAGE_EXTENSIONS.test(subject)) return true;
  return true; // no extension — Base44's URLs mostly look like this
}

function extensionOf(fileName: string, url: string): string {
  const m = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(fileName) ?? /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(url);
  return m ? m[1].toUpperCase() : 'FILE';
}

/*
 * Never fall back to the filename.
 *
 * 81 of the 135 imported assets have no display name, and the filename behind
 * them is a Base44 hash plus whatever the file was called on someone's desktop
 * — `dcaadcd01_Screenshot2026-08-18033820.png`. Printing that under a crest is
 * worse than printing nothing: it's noise that looks like information.
 *
 * So an unnamed file gets its position in the group instead, muted to read as
 * a placeholder rather than a name someone chose. The heading already says
 * which role it is; the number is only there to tell two of them apart, and is
 * dropped when there is only one. The real filename stays on hover, for the
 * rare moment it's needed.
 */
function derivedLabel(role: AssetRole, index: number, groupSize: number): string {
  const base = ROLE_LABELS[role] ?? role;
  return groupSize > 1 ? `${base} ${index + 1}` : base;
}

function Tile({
  asset,
  index,
  groupSize,
  hero = false,
}: {
  asset: ViewableAsset;
  index: number;
  groupSize: number;
  /** The design reference: shown at a size you can actually judge a jersey by. */
  hero?: boolean;
}) {
  const named = asset.displayName.trim();
  const title = named || derivedLabel(asset.role, index, groupSize);

  /*
   * Show the placement photo, not the artwork file.
   *
   * A logo's stored file is the print-ready vector — frequently a .ai or .eps
   * that renders as nothing at all. The close-up of where it sits on the
   * jersey is both viewable and the more useful picture: it answers "is this
   * in the right spot", which the flat artwork can't.
   *
   * Falls back to the artwork when no placement photo was uploaded, so
   * everything imported before this existed still looks the same.
   */
  const shownUrl = asset.placementViewUrl || asset.viewUrl;
  const shownName = asset.placementViewUrl ? asset.placementFileName ?? '' : asset.fileName;
  const image = looksLikeImage(shownUrl, shownName);
  const hasPrintFile = Boolean(asset.placementViewUrl) && Boolean(asset.viewUrl);

  return (
    <div className="group overflow-hidden rounded-lg border border-line bg-black/20 transition hover:border-ppc-gold">
      <a
        href={shownUrl}
        target="_blank"
        rel="noreferrer"
        title={`${title}${shownName ? ` (${shownName})` : ''} — open full size`}
        className="block"
      >
      {/*
       * Fixed height, not an aspect ratio.
       *
       * The tracks stretch to fill the row (see Grid), so a group holding one
       * file gets one very wide tile — and a square one would then be a metre
       * tall. A fixed height keeps every tile the same size down the page
       * whether its group has one file or nine, and `object-contain` centres
       * the artwork inside it at whatever shape it really is.
       */}
      <div
        className={`relative flex items-center justify-center overflow-hidden bg-[repeating-conic-gradient(#ffffff0d_0_25%,transparent_0_50%)] bg-[length:16px_16px] ${
          hero ? 'h-80 sm:h-[28rem] xl:h-[34rem]' : 'h-44 sm:h-52 xl:h-60'
        }`}
      >
        {/* Behind the image, so a file that never paints shows this instead. */}
        <span className="absolute text-sm font-bold tracking-wide text-muted">
          {extensionOf(asset.fileName, asset.viewUrl)}
        </span>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shownUrl}
            alt={title}
            loading="lazy"
            className="relative max-h-full max-w-full object-contain p-2 transition group-hover:scale-[1.03]"
          />
        )}
        </div>
      </a>

      <div className="border-t border-line/60 px-3 py-2">
        <p
          className={`truncate text-sm ${named ? 'font-semibold' : 'text-muted'}`}
          title={title}
        >
          {title}
        </p>
        {asset.notes && (
          <p className="mt-0.5 truncate text-xs text-muted" title={asset.notes}>
            {asset.notes}
          </p>
        )}

        {/*
          * Only where there are genuinely two files. One upload doesn't need
          * two buttons pointing at it — that reads as a choice when it isn't.
          */}
        {hasPrintFile && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <a
              href={asset.viewUrl}
              download={asset.fileName || undefined}
              className="font-semibold text-ppc-gold hover:underline"
            >
              ↓ Print-ready file
            </a>
            <a
              href={asset.viewUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-muted hover:text-ppc-gold hover:underline"
            >
              Preview
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/*
 * `auto-fit`, not a fixed column count.
 *
 * A fixed six-column grid sizes its tracks for six files and leaves the rest of
 * the row empty — a group of two then sits in the left third of a wide screen,
 * tiles small, most of the section unused. `auto-fit` drops the empty tracks so
 * the files present expand into the whole width.
 *
 * `min(100%, 17rem)` rather than a bare `17rem`: on a narrow phone a 17rem
 * minimum would overflow the viewport instead of falling back to one column.
 */
function Grid({ assets, hero = false }: { assets: ViewableAsset[]; hero?: boolean }) {
  return (
    <div
      className="grid gap-4"
      style={{
        // A hero group is one image across the full width; everything else
        // packs as many ~17rem tiles into the row as fit.
        gridTemplateColumns: hero
          ? '1fr'
          : 'repeat(auto-fit, minmax(min(100%, 17rem), 1fr))',
      }}
    >
      {assets.map((a, i) => (
        <Tile key={a.id} asset={a} index={i} groupSize={assets.length} hero={hero} />
      ))}
    </div>
  );
}

export function ArtworkGallery({
  assets,
  hideRoles = [],
}: {
  assets: ViewableAsset[];
  /** Roles shown elsewhere on the page — the font moved up to Order Information. */
  hideRoles?: AssetRole[];
}) {
  assets = hideRoles.length ? assets.filter((a) => !hideRoles.includes(a.role)) : assets;
  if (assets.length === 0) {
    return <p className="text-sm text-muted">No artwork uploaded yet.</p>;
  }

  const byRole = new Map<AssetRole, ViewableAsset[]>();
  for (const a of assets) {
    const list = byRole.get(a.role);
    if (list) list.push(a);
    else byRole.set(a.role, [a]);
  }
  for (const list of byRole.values()) list.sort((x, y) => x.slot - y.slot);

  // Anything with a role not in ROLE_ORDER still renders — a role added to the
  // enum without being listed here would otherwise vanish silently.
  const roles = [
    ...ROLE_ORDER.filter((r) => byRole.has(r)),
    ...[...byRole.keys()].filter((r) => !ROLE_ORDER.includes(r)),
  ];

  return (
    <div className="space-y-6">
      {roles.map((role) => {
        const group = byRole.get(role)!;

        // A sponsor block is one item even when it holds two files, so
        // additional logos are sub-grouped by the id that ties them together.
        if (role === 'additional_logo') {
          const blocks = new Map<string, ViewableAsset[]>();
          for (const a of group) {
            const key = a.groupId || a.id;
            const list = blocks.get(key);
            if (list) list.push(a);
            else blocks.set(key, [a]);
          }
          return (
            <div key={role} className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
                {ROLE_LABELS[role]} ({group.length})
              </h3>
              {[...blocks.values()].map((block, blockIndex) => (
                <div key={block[0].id} className="space-y-2 border-l-2 border-line pl-3">
                  <p
                    className={`text-sm ${block[0].displayName.trim() ? 'font-semibold' : 'text-muted'}`}
                  >
                    {block[0].displayName.trim() || `Logo ${blockIndex + 1}`}
                  </p>
                  {block[0].notes && <p className="text-xs text-muted">{block[0].notes}</p>}
                  <Grid assets={block} />
                </div>
              ))}
            </div>
          );
        }

        // The design reference is what the jersey is actually judged against,
        // so it gets the space rather than sharing a row with reference shots.
        const hero = role === 'design_reference';

        return (
          <div key={role} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
              {ROLE_LABELS[role] ?? role}
              {group.length > 1 && ` (${group.length})`}
            </h3>
            <Grid assets={group} hero={hero} />
          </div>
        );
      })}
    </div>
  );
}
