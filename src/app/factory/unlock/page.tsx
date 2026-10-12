import { FactoryUnlockForm } from './unlock-form';

export const dynamic = 'force-dynamic';

/**
 * The factory's door. Reached by following a factory link without the
 * factory cookie; `next` is the sheet that was asked for, and the unlock
 * action only ever bounces back into /factory/.
 */
export default async function FactoryUnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ok?: string }>;
}) {
  const { next, ok } = await searchParams;

  return (
    <div className="mx-auto max-w-sm py-16">
      <div className="rounded-xl border border-line bg-surface p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ppc-gold">Powerplay Customs</p>
        <h1 className="mt-1 text-xl font-bold">Production sheet</h1>
        {ok ? (
          <p className="mt-2 text-sm text-muted">
            You&apos;re in. Open the link Powerplay sent you to see the job.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              Enter the factory code to open this order&apos;s production sheet.
            </p>
            <FactoryUnlockForm next={next ?? ''} />
          </>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        This code stays on this device for 30 days. Don&apos;t have it? Ask Keenan.
      </p>
    </div>
  );
}
