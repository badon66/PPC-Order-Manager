import { startNewOrder } from '@/app/orders/actions';

/**
 * New Order is a POST, not a link.
 *
 * It used to be `<Button href="/orders/new">`, which Next renders as a Link and
 * then *prefetches* — and the target was a GET route handler that created a
 * draft row. So merely loading the orders list quietly spawned blank orders.
 * Keenan had several in his data before anyone worked out where they came from.
 *
 * Creating a record is not a safe GET. Submitting a form makes that explicit
 * and makes prefetching harmless.
 */
export function NewOrderButton({ label = 'New Order' }: { label?: string }) {
  return (
    <form action={startNewOrder}>
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-ppc-gold px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:bg-ppc-gold-dim"
      >
        {label}
      </button>
    </form>
  );
}
