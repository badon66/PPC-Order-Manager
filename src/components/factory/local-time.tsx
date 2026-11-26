'use client';

import { useSyncExternalStore } from 'react';

const none = () => () => {};

/**
 * A moment, in the VIEWER'S own timezone. The factory is half a world from
 * Calgary; "Nov 24, 2:18 a.m." in Powerplay's time would be the wrong day
 * for them. The server renders the plain date (the same for everybody) and
 * the browser swaps in the local date and time once it's running.
 */
export function LocalTime({ iso }: { iso: string }) {
  const local = useSyncExternalStore(
    none,
    () => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime())
        ? iso
        : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    },
    () => iso.slice(0, 10),
  );
  return <time dateTime={iso}>{local}</time>;
}
