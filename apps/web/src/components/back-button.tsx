'use client';

/**
 * The back control every screen carries.
 *
 * A client component only because it reads the pathname and calls the router. The
 * destination is `parentOf`, which derives the parent from the app's structure rather
 * than from history: from a search result, a bookmark or a shared link, "back" lands on
 * the same list either way.
 *
 * It is a `button`, not a `Link`, so that a form with unsaved edits could later
 * intercept it; today it navigates immediately, which is what a back control is
 * expected to do.
 */

import { usePathname, useRouter } from 'next/navigation';
import { parentOf, backLabel } from '../lib/navigation';
import { IconChevronLeft } from './icons';

export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();

  const target = parentOf(pathname);
  // The locale is the first segment of the path this component already has.
  const locale = pathname.split('/')[1] ?? 'fr';
  const label = backLabel(locale);

  return (
    <button
      type="button"
      onClick={() => router.push(target)}
      // Named, so the accessible name says where it goes rather than just "Back".
      aria-label={label}
      className="mb-2 inline-flex items-center gap-1 rounded-lg py-1 pe-2 ps-0.5 text-sm font-medium text-ink-muted transition-colors hover:text-brand"
    >
      <IconChevronLeft className="size-4" />
      {label}
    </button>
  );
}
