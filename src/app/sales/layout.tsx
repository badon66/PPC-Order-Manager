/**
 * Sales is used on an ultra-wide monitor. This wrapper is the hook that lets
 * the root layout's header and main column widen for these routes only —
 * globals.css: `body:has(.sales-wide) :is(header > div, main) { max-width: 120rem }`.
 * Orders and Production keep the app's usual 72rem.
 */
export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return <div className="sales-wide">{children}</div>;
}
