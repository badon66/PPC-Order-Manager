import Image from 'next/image';
import { FactoryUnlockForm } from './unlock-form';

export const dynamic = 'force-dynamic';

/**
 * The factory's door. `next` is the page that was asked for; the unlock
 * action only ever bounces back into /factory. Passcode, name, and a lockout
 * after five wrong tries (lib/factory/gate.ts).
 */
export default async function FactoryUnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="mx-auto max-w-sm py-16">
      <div className="rounded-xl border border-line bg-surface p-6">
        <Image src="/brand/shield.png" alt="Powerplay Customs" width={512} height={512} className="mx-auto mb-4 h-24 w-24" priority />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ppc-gold">Powerplay Customs</p>
        <h1 className="mt-1 text-xl font-bold">Factory dashboard</h1>
        <p className="mt-1 text-sm text-muted">Enter the passcode and your name to see your jobs.</p>
        <FactoryUnlockForm next={next ?? ''} />
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        You stay signed in on this device for 30 days. Five wrong tries locks this device for 15 minutes.
        Don&apos;t have the passcode? Ask Keenan.
      </p>
    </div>
  );
}
