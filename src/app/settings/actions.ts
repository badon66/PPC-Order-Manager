'use server';

import { revalidatePath } from 'next/cache';
import { repo } from '@/lib/data';
import { currentActor, requireRole } from '@/lib/auth';

export async function saveSettingsAction(formData: FormData): Promise<void> {
  await requireRole('staff');
  const actor = await currentActor();
  const str = (k: string) => String(formData.get(k) ?? '').trim();
  await repo.saveSettings(
    { howToPay: str('howToPay'), googleReviewUrl: str('googleReviewUrl'), referralLine: str('referralLine') },
    actor,
  );
  revalidatePath('/settings');
}
