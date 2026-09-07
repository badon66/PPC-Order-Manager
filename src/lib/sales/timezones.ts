/**
 * Canada spans five and a half hours. The caller should never do the math:
 * the contact panel shows the prospect's local time, derived from province
 * unless the sheet says otherwise (Lloydminster, the BC Peace region, …).
 */
const PROVINCE_ZONES: Record<string, string> = {
  AB: 'America/Edmonton', BC: 'America/Vancouver', MB: 'America/Winnipeg',
  NB: 'America/Moncton', NL: 'America/St_Johns', NS: 'America/Halifax',
  NT: 'America/Yellowknife', NU: 'America/Iqaluit', ON: 'America/Toronto',
  PE: 'America/Halifax', QC: 'America/Toronto', SK: 'America/Regina',
  YT: 'America/Whitehorse',
};

const OVERRIDE_ZONES: Record<string, string> = {
  'pacific': 'America/Vancouver', 'mountain': 'America/Edmonton',
  'central': 'America/Winnipeg', 'central (no dst)': 'America/Regina',
  'eastern': 'America/Toronto', 'atlantic': 'America/Halifax',
  'newfoundland': 'America/St_Johns',
};

export function zoneFor(c: { province: string; timezoneOverride: string }): string | null {
  const o = OVERRIDE_ZONES[(c.timezoneOverride ?? '').trim().toLowerCase()];
  if (o) return o;
  return PROVINCE_ZONES[(c.province ?? '').trim().toUpperCase()] ?? null;
}

/** "2:14 pm" in the contact's zone, or null when the zone is unknown. */
export function localTimeFor(
  c: { province: string; timezoneOverride: string },
  now: Date = new Date(),
): string | null {
  const zone = zoneFor(c);
  if (!zone) return null;
  // formatToParts, not format(): locale output varies ("p.m.", narrow spaces); the parts don't.
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`;
}
