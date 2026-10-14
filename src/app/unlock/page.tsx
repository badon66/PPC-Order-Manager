import Image from 'next/image';
import { UnlockForm } from './unlock-form';

export const dynamic = 'force-dynamic';

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="mx-auto max-w-sm py-16">
      <div className="rounded-xl border border-line bg-surface p-6">
        <Image src="/brand/shield.png" alt="" width={512} height={512} className="mx-auto mb-4 h-24 w-24" priority />
        <h1 className="text-xl font-bold">Access Code</h1>
        <p className="mt-1 text-sm text-muted">
          Enter the code to open order management.
        </p>
        <UnlockForm next={next ?? '/orders'} />
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        Customer share links and roster forms don&apos;t need a code — they open straight from
        the link you send.
      </p>
    </div>
  );
}
