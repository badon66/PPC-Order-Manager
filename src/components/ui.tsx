import Link from 'next/link';
import type { ReactNode } from 'react';
import { STATUS_META } from '@/lib/constants';
import type { OrderStatus } from '@/lib/types';

export function StatusBadge({ status, size = 'sm' }: { status: OrderStatus; size?: 'sm' | 'lg' }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap ${m.className} ${
        size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <span aria-hidden>{m.emoji}</span>
      {m.label}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-bold tracking-wide text-ppc-gold uppercase">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-sm font-semibold break-words">{children || <span className="text-muted font-normal">—</span>}</div>
    </div>
  );
}

export function Stat({ label, value, accent = false }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-3 text-center">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${accent ? 'text-ppc-gold' : ''}`}>{value}</div>
    </div>
  );
}

export function YesNo({ value }: { value: boolean }) {
  return (
    <span className={value ? 'text-ppc-gold font-semibold' : 'text-muted'}>{value ? 'Yes' : 'No'}</span>
  );
}

export function Button({
  href,
  children,
  variant = 'ghost',
  className = '',
  type = 'button',
  ...rest
}: {
  href?: string;
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'danger';
  className?: string;
  type?: 'button' | 'submit';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors';
  const styles = {
    primary: 'bg-ppc-gold text-black hover:bg-ppc-gold-dim',
    ghost: 'border border-line bg-surface-2 hover:border-ppc-gold/60 hover:text-ppc-gold',
    danger: 'border border-red-500/50 text-red-300 hover:bg-red-500/10',
  }[variant];
  const cls = `${base} ${styles} ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function Warning({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-200">
      {children}
    </div>
  );
}
