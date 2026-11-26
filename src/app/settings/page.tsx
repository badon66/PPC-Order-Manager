import { repo } from '@/lib/data';
import { Button, Section } from '@/components/ui';
import { saveSettingsAction } from './actions';
import { RATE_LABEL } from '@/lib/factory/money';
import type { FactoryRates } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** The customer emails' wording, and the factory's standard rates. Written once, edited here. */
export default async function SettingsPage() {
  const s = await repo.getSettings();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted">What the customer emails say. Save once; every send uses it.</p>
      </div>
      <form action={saveSettingsAction}>
        <Section title="Customer emails">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="howToPay">How to pay</label>
              <textarea id="howToPay" name="howToPay" rows={3} className="mt-1 w-full" defaultValue={s.howToPay} />
              <p className="mt-1 text-xs text-muted">Prefilled into the three deposit and payment emails. You can edit it before each send.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="googleReviewUrl">Google review link</label>
              <input id="googleReviewUrl" name="googleReviewUrl" type="text" className="mt-1 w-full" defaultValue={s.googleReviewUrl} placeholder="https://g.page/r/…/review" />
              <p className="mt-1 text-xs text-muted">The button in the Review and referral email. Leave empty to hide it.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="referralLine">Referral line</label>
              <textarea id="referralLine" name="referralLine" rows={2} className="mt-1 w-full" defaultValue={s.referralLine} />
              <p className="mt-1 text-xs text-muted">One sentence in the Review and referral email. Leave empty to hide it.</p>
            </div>
            <Button type="submit" variant="primary">Save settings</Button>
          </div>
        </Section>

        <div className="mt-5">
          <Section title="Factory costs">
            <p className="text-sm text-muted">
              What the factory normally charges you, in US dollars each. Each job&apos;s cost is checked against these on the{' '}
              <a href="/balance" className="font-semibold text-ppc-gold hover:underline">Factory balance</a> page. Only you see this.
              Leave a box empty if there&apos;s no standard rate yet — that item is left out of the check.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(Object.keys(RATE_LABEL) as Array<keyof FactoryRates>).map((k) => (
                <div key={k}>
                  <label className="text-xs font-medium text-muted" htmlFor={`rate_${k}`}>{RATE_LABEL[k]} · USD</label>
                  <input id={`rate_${k}`} name={`rate_${k}`} type="text" inputMode="decimal" className="mt-1 w-full" defaultValue={s.factoryRates[k] ?? ''} placeholder="not set" />
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted" htmlFor="factoryFlagAt">Flag a cost that is off by · USD</label>
                <input id="factoryFlagAt" name="factoryFlagAt" type="text" inputMode="decimal" className="mt-1 w-full" defaultValue={s.factoryFlagAt} />
                <p className="mt-1 text-xs text-muted">A job total this far above or below the standard rates gets a flag.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted" htmlFor="usdToCad">1 US dollar in Canadian dollars</label>
                <input id="usdToCad" name="usdToCad" type="text" inputMode="decimal" className="mt-1 w-full" defaultValue={s.usdToCad ?? ''} placeholder="e.g. 1.40" />
                <p className="mt-1 text-xs text-muted">For the USD / CAD switch and the profit column. Empty = US dollars only.</p>
              </div>
            </div>
            <div className="mt-4"><Button type="submit" variant="primary">Save settings</Button></div>
          </Section>
        </div>
      </form>
    </div>
  );
}
