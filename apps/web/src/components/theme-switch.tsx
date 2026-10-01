'use client';

import { IconMonitor, IconMoon, IconSun } from './icons';
import { cx } from './ui';
import { useTheme } from '../lib/theme-provider';
import type { MessageKey, Translator } from '../i18n/config';
import type { ThemePreference } from '../lib/theme';

const OPTIONS: { value: ThemePreference; icon: typeof IconSun; labelKey: MessageKey }[] = [
  { value: 'light', icon: IconSun, labelKey: 'themeLight' },
  { value: 'dark', icon: IconMoon, labelKey: 'themeDark' },
  { value: 'system', icon: IconMonitor, labelKey: 'themeSystem' },
];

/**
 * Three-state switch: light, dark, or follow the system.
 *
 * A radiogroup rather than a button, because the state is a setting and the user
 * should be able to see and return to "system" — a two-state toggle would strand
 * anyone who wants their device's behaviour back.
 *
 * `label` exists because this switch appears in two places at once: in the
 * topbar, and again on the settings page. Two groups carrying the same
 * accessible name read as two unrelated controls to a screen reader, and there
 * is no way to tell which one you are about to change. Callers rendering it
 * outside the topbar should pass a name that says which one it is.
 */
export function ThemeSwitch({
  t,
  compact = false,
  label,
}: {
  t: Translator;
  compact?: boolean;
  label?: string;
}) {
  const { preference, setPreference, theme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label={label ?? t('themeLabel')}
      className={cx(
        'inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-sunken p-0.5',
        compact && 'text-sm',
      )}
    >
      {OPTIONS.map(({ value, icon: Icon, labelKey }) => {
        const selected = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(labelKey)}
            title={t(labelKey)}
            onClick={() => setPreference(value)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium',
              'transition-colors duration-150',
              selected ? 'bg-surface-raised text-ink shadow-xs' : 'text-ink-subtle hover:text-ink',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {compact ? null : <span className="hidden sm:inline">{t(labelKey)}</span>}
          </button>
        );
      })}
      <span className="sr-only" aria-live="polite">
        {t('themeCurrent', {
          theme: t(`theme${theme === 'dark' ? 'Dark' : 'Light'}` as MessageKey),
        })}
      </span>
    </div>
  );
}
