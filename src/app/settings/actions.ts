'use server';

import { revalidatePath } from 'next/cache';
import { repo } from '@/lib/data';
import { currentActor, requireRole } from '@/lib/auth';
import { DEFAULT_APP_SETTINGS, type FactoryRates } from '@/lib/types';

export async function saveSettingsAction(formData: FormData): Promise<void> {
  await requireRole('staff');
  const actor = await currentActor();
  const str = (k: string) => String(formData.get(k) ?? '').trim();
  const googleReviewUrl = str('googleReviewUrl');
  // A blank box is "no rate" (null), never zero; anything that isn't a plain amount is blank too.
  const num = (k: string): number | null => {
    const v = str(k).replace(/[$,\s]/g, '');
    return /^\d{1,6}(\.\d{1,4})?$/.test(v) ? Number(v) : null;
  };
  const factoryRates = { ...DEFAULT_APP_SETTINGS.factoryRates };
  for (const k of Object.keys(factoryRates) as Array<keyof FactoryRates>) factoryRates[k] = num(`rate_${k}`);
  await repo.saveSettings(
    {
      howToPay: str('howToPay'),
      googleReviewUrl: googleReviewUrl && !/^https?:\/\//i.test(googleReviewUrl)
        ? `https://${googleReviewUrl}`
        : googleReviewUrl,
      referralLine: str('referralLine'),
      factoryRates,
      factoryFlagAt: num('factoryFlagAt') ?? DEFAULT_APP_SETTINGS.factoryFlagAt,
      usdToCad: num('usdToCad'),
    },
    actor,
  );
  revalidatePath('/settings');
  revalidatePath('/balance');
}
