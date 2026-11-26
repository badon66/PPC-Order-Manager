'use client';

import { useEffect, useRef } from 'react';
import { markFactorySeen } from '@/app/factory/actions';

/**
 * Opening a job reads Powerplay's changes on it. The changes stay highlighted
 * on THIS view (the page rendered before this ran); the dashboard's badge is
 * cleared for next time. Fires once, and only when there was something new.
 */
export function MarkSeen({ orderId, hasNew }: { orderId: string; hasNew: boolean }) {
  const done = useRef(false);
  useEffect(() => {
    if (!hasNew || done.current) return;
    done.current = true;
    void markFactorySeen(orderId).catch(() => {
      done.current = false;
    });
  }, [orderId, hasNew]);
  return null;
}
