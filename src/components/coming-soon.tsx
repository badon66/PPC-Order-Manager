import Link from 'next/link';

export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-14 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{note}</p>
      <Link href="/orders" className="mt-5 inline-block text-sm font-semibold text-ppc-gold hover:underline">
        ← Back to Orders
      </Link>
    </div>
  );
}
