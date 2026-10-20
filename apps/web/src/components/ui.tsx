/**
 * Presentational primitives. No state, no data fetching, no locale assumptions
 * beyond what is passed in — every one of these takes `className` so a caller can
 * adjust without forking it.
 */

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { BackButton } from './back-button';

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

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly className?: string;
}

export function Select({ value, onChange, options, className }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none',
        className,
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The heading every screen opens with.
 *
 * It carries the back control, so every screen has one from a single change rather
 * than fifty-eight. `hideBack` exists for the two screens where a back control is
 * meaningless — the dashboard, which is where back lands, and sign-in, which a
 * signed-out visitor has nowhere to go back from.
 */
export function PageHeader({
  title,
  description,
  action,
  hideBack = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  hideBack?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {hideBack ? null : <BackButton />}
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
/* -------------------------------------------------------------------------- */

/**
 * A placeholder with the shape of the thing that is coming.
 *
 * Perceived speed is not the same as speed: a screen that shows the layout of its
 * content immediately reads as working, while a bare "Loading…" line reads as stuck —
 * and on a free-tier database the wait is real and not ours to remove. These carry
 * `aria-hidden` and the container announces itself with `role="status"`, so a screen
 * reader hears "loading" once rather than a dozen empty boxes.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx('animate-pulse rounded-md bg-surface-sunken', className)}
    />
  );
}

/** A stack of rows shaped like a list, for a screen whose table is still loading. */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cx('space-y-3', className)}>
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 py-3">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

/** The header a screen is about to draw, so the page does not jump when it arrives. */
export function SkeletonPage() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading</span>
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <div className="rounded-xl border border-line bg-surface-raised p-5">
        <SkeletonRows rows={5} />
      </div>
    </div>
  );
}
