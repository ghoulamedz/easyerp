import { SkeletonPage } from '@/components/ui';

/**
 * What the application frame shows while a screen's server component is still
 * resolving.
 *
 * The frame's layout awaits two API calls before it can render anything — the setup
 * status and the session — so without this file a navigation shows the *previous*
 * screen, unchanged, until both answer. On a free-tier database that pause is long
 * enough to read as "the click did nothing".
 *
 * One file here covers every screen inside the group: Next renders it for the segment
 * while its page streams in, and the real page replaces it in place. The skeleton
 * mirrors the shape of the pages it stands in for, so the layout does not jump when the
 * content arrives.
 */
export default function AppLoading() {
  return <SkeletonPage />;
}
