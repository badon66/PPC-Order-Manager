import Link from 'next/link';
import type { AlsoIn } from '@/lib/sales/match';

/** "Also in: Beer league" — the same phone or email in another list. Server-safe. */
export function AlsoInLine({ items }: { items: AlsoIn[] }) {
  if (items.length === 0) return null;
  return (
    <p className="text-xs text-muted">
      Also in:{' '}
      {items.map((a, i) => (
        <span key={a.listId}>
          {i > 0 && ', '}
          <Link href={`/sales/${a.listId}/contacts/${a.contactId}`} className="font-semibold text-ppc-gold hover:underline">{a.listName}</Link>
        </span>
      ))}
    </p>
  );
}
