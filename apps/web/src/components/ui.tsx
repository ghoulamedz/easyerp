/**
 * Presentational primitives. No state, no data fetching, no locale assumptions
 * beyond what is passed in — every one of these takes `className` so a caller can
 * adjust without forking it.
 */

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

/* -------------------------------------------------------------------------- */

type CardProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly as?: ElementType;
};

export function Card({ children, className, as: Tag = 'section' }: CardProps) {
  return (
    <Tag
      className={cx(
        'rounded-xl border border-line bg-surface-raised shadow-xs',
        'transition-colors duration-200',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('px-5 py-4', className)}>{children}</div>;
}

/* -------------------------------------------------------------------------- */

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  readonly size?: 'sm' | 'md';
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand text-brand-contrast hover:bg-brand-hover border-transparent',
  secondary: 'bg-surface text-ink hover:bg-surface-sunken border-line',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink border-transparent',
  danger: 'bg-danger text-white hover:opacity-90 border-transparent',
};

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'transition-colors duration-150',
        size === 'sm' ? 'px-2.5 py-1.5 text-sm' : 'px-3.5 py-2 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */

export type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'brand';

const TONES: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-surface-sunken text-ink-muted',
  brand: 'bg-brand-soft text-brand',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A dot plus a colour, for "is this up" without relying on colour alone. */
export function StatusDot({ tone }: { tone: Tone }) {
  const colour = {
    ok: 'bg-ok',
    warn: 'bg-warn',
    danger: 'bg-danger',
    neutral: 'bg-ink-subtle',
    brand: 'bg-brand',
  }[tone];
  return <span className={cx('size-2 rounded-full', colour)} aria-hidden="true" />;
}

/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-ink-muted">{children}</p>;
}
