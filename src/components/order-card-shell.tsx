'use client';

import { useState, type ReactNode } from 'react';
import { OrderQuickEdit, type QuickEditOrder } from './order-quick-edit';

/**
 * Wraps a board card so a double-click opens quick edit.
 *
 * The card itself stays a server component (it does the roster maths); this
 * is the thinnest possible client shell around it. Double-click rather than
 * click because the card already has two links on it, and a single click that
 * opened a dialog would fight them.
 */
export function OrderCardShell({ order, children }: { order: QuickEditOrder; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div onDoubleClick={() => setOpen(true)} title="Double-click for quick edit" className="h-full select-none">
        {children}
      </div>
      {open && <OrderQuickEdit order={order} onClose={() => setOpen(false)} />}
    </>
  );
}
