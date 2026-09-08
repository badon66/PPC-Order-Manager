import Link from 'next/link';
import { notFound } from 'next/navigation';
import { repo } from '@/lib/data';
import { linkedContacts } from '@/lib/data/sales-logic';
import { Button, Card } from '@/components/ui';
import { ContactPanel } from '@/components/sales/call-view/contact-panel';

export const dynamic = 'force-dynamic';

/**
 * One contact, read-only: everything gathered on them, their linked contacts
 * at the same team, and every call. Opening this page starts nothing — no
 * session, no draft, no queue change. "Start call" is the only way out that
 * does, and it goes through the calling view.
 */
export default async function ContactPage({ params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params;
  const bundle = await repo.getCallList(id);
  if (!bundle) notFound();
  const contact = bundle.contacts.find((c) => c.id === contactId);
  if (!contact) notFound();

  const linked = linkedContacts(contact, bundle.contacts);
  const logs = bundle.logs.filter((g) => g.contactId === contact.id);
  const sessionsById = Object.fromEntries(bundle.sessions.map((s) => [s.id, s]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/sales/${id}`} className="text-sm text-muted hover:text-ppc-gold">← {bundle.list.name}</Link>
          <h1 className="truncate text-2xl font-bold">{contact.contactName || contact.orgName || 'Contact'}</h1>
          <p className="text-sm text-muted">Viewing only — nothing here starts a session or changes the queue.</p>
        </div>
        <div className="flex items-center gap-2">
          {contact.doNotCall
            ? <span className="text-sm font-semibold text-red-300">Do Not Call</span>
            : <Button href={`/sales/${id}/call?c=${contact.id}`} variant="primary">Start call</Button>}
        </div>
      </div>

      <Card className="max-w-4xl p-4">
        <ContactPanel contact={contact} logs={logs} script={bundle.list.script} linked={linked} listId={id} sessionsById={sessionsById} />
      </Card>
    </div>
  );
}
