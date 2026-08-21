'use server';

import { repo } from '@/lib/data';
import type {
  ClientLinkSections, SubmittedContact, SubmittedInspiration, SubmittedLogo, SubmittedPlayer,
} from '@/lib/types';

/**
 * The customer's submit. No session — the roster token is what authorises it,
 * and it has to resolve to a live order with the link switched on.
 *
 * Server-side we also strip anything the customer wasn't asked for. The form
 * only shows the ticked sections, but a stale tab from before Keenan changed
 * the config could still post them; the server is where the rule holds.
 */

export interface SubmitPayload {
  players: SubmittedPlayer[];
  logos: SubmittedLogo[];
  inspiration: SubmittedInspiration[];
  contact?: SubmittedContact;
  confirmed: boolean;
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '');

export async function submitClientForm(token: string, payload: SubmitPayload): Promise<SubmitResult> {
  const link = await repo.getByRosterToken(token);
  if (!link || !link.enabled) return { ok: false, error: 'This link is no longer active.' };
  if (!payload.confirmed) return { ok: false, error: 'Please confirm the details are correct.' };

  const sec: ClientLinkSections = link.sections;

  const players: SubmittedPlayer[] = sec.roster
    ? (payload.players ?? [])
        .map((p) => ({
          playerNameAsPrinted: clean(p.playerNameAsPrinted),
          number: clean(p.number),
          isGoalie: Boolean(p.isGoalie),
          sockOnly: Boolean(p.sockOnly),
          jerseySize: clean(p.jerseySize),
          sockSize: clean(p.sockSize),
          notes: clean(p.notes),
        }))
        // A row with nothing typed in it is noise, not a player.
        .filter((p) => p.playerNameAsPrinted || p.number || p.sockOnly)
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

  const contactHasAnything = contact && Object.values(contact).some(Boolean);

  if (!players.length && !logos.length && !inspiration.length && !contactHasAnything) {
    return { ok: false, error: 'Add at least one thing before submitting.' };
  }

  await repo.submitClientRoster(token, {
    sections: sec,
    players,
    logos,
    inspiration,
    contact: contactHasAnything ? contact : undefined,
    confirmed: true,
  });

  return { ok: true };
}
