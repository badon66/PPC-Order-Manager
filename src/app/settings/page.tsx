import { repo } from '@/lib/data';
import { Button, Section } from '@/components/ui';
import { saveSettingsAction } from './actions';

export const dynamic = 'force-dynamic';

/** Three strings the customer emails use. Written once, edited here. */
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
              <input id="googleReviewUrl" name="googleReviewUrl" type="url" className="mt-1 w-full" defaultValue={s.googleReviewUrl} placeholder="https://g.page/r/…/review" />
              <p className="mt-1 text-xs text-muted">The button in the Thanks email. Leave empty to hide it.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="referralLine">Referral line</label>
              <textarea id="referralLine" name="referralLine" rows={2} className="mt-1 w-full" defaultValue={s.referralLine} />
              <p className="mt-1 text-xs text-muted">One sentence in the Thanks email. Leave empty to hide it.</p>
            </div>
            <Button type="submit" variant="primary">Save settings</Button>
          </div>
        </Section>
      </form>
    </div>
  );
}
