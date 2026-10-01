import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE } from '../i18n/config';

/**
 * The bare origin, `/`, redirects to the default locale.
 *
 * Without this page Next matches `/` against `[locale]` with `locale = ''`, the
 * layout rejects it, and the visitor gets a 404 instead of the application. The
 * default locale is used rather than the browser's language, because a Business
 * works in one language: the wrong-but-plausible guess would be worse than a
 * stated default.
 */
export default function Root(): never {
  redirect(`/${DEFAULT_LOCALE}`);
}
