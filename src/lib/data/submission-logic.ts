import type {
  Captaincy, ClientLinkSections, ExtraJersey, RosterAnswer, SubmittedContact, SubmittedInspiration, SubmittedLogo,
  SubmittedPlayer, SubmittedRosterFile,
} from '@/lib/types';

/**
 * What the customer's form posts, and what the server keeps of it.
 *
 * Pure: the action in `src/app/roster/[token]/actions.ts` looks the link up
 * and hands it here, so the rules can be tested without a store.
 */

export interface SubmitPayload {
  extras?: Array<{
    number?: string;
    size?: string;
    sockSize?: string;
    sockOnly?: boolean;
    notes?: string;
  }>;
  players: SubmittedPlayer[];
  /** Their answer to "Is your roster ready?" — only sent when the roster section is shown. */
  rosterAnswer?: RosterAnswer | null;
  rosterFiles?: SubmittedRosterFile[];
  logos: SubmittedLogo[];
  inspiration: SubmittedInspiration[];
  /** "Your colours", typed on the design page. */
  colours?: string;
  contact?: SubmittedContact;
  confirmed: boolean;
}

/** The parts of the link the rules depend on. */
export interface SubmitLink {
  sections: ClientLinkSections;
  includesSocks: boolean;
  includesPantShells: boolean;
  extraJerseys: number;
}

export interface CleanSubmission {
  sections: ClientLinkSections;
  players: SubmittedPlayer[];
  rosterAnswer?: RosterAnswer;
  rosterFiles: SubmittedRosterFile[];
  extras: ExtraJersey[];
  logos: SubmittedLogo[];
  inspiration: SubmittedInspiration[];
  /** "Your colours", typed on the design page. */
  colours: string;
  contact?: SubmittedContact;
  confirmed: true;
}

const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '');

const ANSWERS: readonly RosterAnswer[] = ['typed', 'file', 'later'];

/**
 * Keep what was asked for, drop the rest.
 *
 * The form only shows the ticked sections, but a stale tab from before Keenan
 * changed the config could still post them; this is where the rule holds.
 *
 * The roster answer decides which roster shape survives: typed rows for
 * "typed", the uploaded list for "file", neither for "not yet". A submission
 * from before the question existed has no answer and keeps its rows, as it
 * always did.
 */
export function cleanSubmission(
  link: SubmitLink,
  payload: SubmitPayload,
): { ok: true; value: CleanSubmission } | { ok: false; error: string } {
  if (!payload.confirmed) return { ok: false, error: 'Please confirm the details are correct.' };

  const sec = link.sections;

  const rosterAnswer: RosterAnswer | undefined =
    sec.roster && ANSWERS.includes(payload.rosterAnswer as RosterAnswer)
      ? (payload.rosterAnswer as RosterAnswer)
      : undefined;

  const keepRows = sec.roster && rosterAnswer !== 'file' && rosterAnswer !== 'later';

  const players: SubmittedPlayer[] = keepRows
    ? (payload.players ?? [])
        .map((p) => ({
          playerNameAsPrinted: clean(p.playerNameAsPrinted),
          number: clean(p.number),
          isGoalie: Boolean(p.isGoalie),
          // Only the two letters, and never on a row with no jersey. Anything
          // else arriving here didn't come from the form.
          captaincy: (p.sockOnly ? '' : p.captaincy === 'C' || p.captaincy === 'A' ? p.captaincy : '') as Captaincy,
          sockOnly: Boolean(p.sockOnly),
          jerseySize: clean(p.jerseySize),
          // Blanked rather than trusted when the order has no shells — the
          // form doesn't show the field, so anything arriving here is stale.
          sockSize: link.includesSocks ? clean(p.sockSize) : '',
          pantShellSize: link.includesPantShells ? clean(p.pantShellSize) : '',
          notes: clean(p.notes),
        }))
        // A row with nothing typed in it is noise, not a player.
        .filter((p) => p.playerNameAsPrinted || p.number || p.sockOnly)
    : [];

  const rosterFiles: SubmittedRosterFile[] =
    sec.roster && rosterAnswer === 'file'
      ? (payload.rosterFiles ?? [])
          .filter((f) => f && typeof f.fileUrl === 'string' && f.fileUrl)
          .map((f) => ({ fileUrl: f.fileUrl, fileName: clean(f.fileName), notes: clean(f.notes) }))
      : [];

  const logos: SubmittedLogo[] = sec.logos
    ? (payload.logos ?? [])
        .filter((l) => l.fileUrl)
        .map((l) => ({
          fileUrl: l.fileUrl,
          fileName: clean(l.fileName),
          logoName: clean(l.logoName),
          placementNotes: clean(l.placementNotes),
          description: clean(l.description),
        }))
    : [];

  const inspiration: SubmittedInspiration[] = sec.inspiration
    ? (payload.inspiration ?? [])
        .filter((i) => i.fileUrl)
        .map((i) => ({ fileUrl: i.fileUrl, fileName: clean(i.fileName), notes: clean(i.notes) }))
    : [];

  const contact: SubmittedContact | undefined =
    sec.personalDetails && payload.contact
      ? {
          firstName: clean(payload.contact.firstName),
          lastName: clean(payload.contact.lastName),
          email: clean(payload.contact.email),
          phone: clean(payload.contact.phone),
          street: clean(payload.contact.street),
          secondary: clean(payload.contact.secondary),
          city: clean(payload.contact.city),
          province: clean(payload.contact.province),
          postal: clean(payload.contact.postal),
        }
      : undefined;

  const contactHasAnything = Boolean(contact && Object.values(contact).some(Boolean));

  // Only kept when there's a logos or inspiration section to hang it off of —
  // a details-only submission has nowhere for "your colours" to go.
  const colours = sec.logos || sec.inspiration ? clean(payload.colours).slice(0, 500) : '';

  // "Not ready yet" on its own is worth sending: it tells Keenan where the
  // team is at, and the history line says so. So is a colours note on its
  // own — a team with no logo yet ("no logo yet is fine, tell us the idea")
  // is exactly who this field is for.
  if (
    !players.length && !rosterFiles.length && !logos.length && !inspiration.length &&
    !contactHasAnything && !colours && rosterAnswer !== 'later'
  ) {
    return { ok: false, error: 'Add at least one thing before submitting.' };
  }

  return {
    ok: true,
    value: {
      sections: sec,
      players,
      rosterAnswer,
      rosterFiles,
      // Trimmed to what the order actually has spares for, so a stale tab can't
      // submit numbers for jerseys that no longer exist.
      extras: keepRows
        ? (payload.extras ?? []).slice(0, link.extraJerseys).map((x) => ({
            number: clean(x.number ?? ''),
            // A socks-only spare has no jersey, so it can't carry a jersey size.
            size: x.sockOnly ? '' : clean(x.size ?? ''),
            sockSize: clean(x.sockSize ?? ''),
            sockOnly: Boolean(x.sockOnly),
            notes: clean(x.notes ?? ''),
          }))
        : [],
      logos,
      inspiration,
      colours,
      contact: contactHasAnything ? contact : undefined,
      confirmed: true,
    },
  };
}
