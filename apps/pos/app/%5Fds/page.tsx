import type { Metadata } from 'next';
import { DesignSystem } from './DesignSystem';

/**
 * `/_ds` — the design system reference. BUILD-PLAN.md §18 (M01 gate).
 *
 * The folder is named %5Fds, not _ds. Next treats a leading underscore as a
 * private folder and excludes it from routing entirely, so `app/_ds` shipped
 * in M01 as a page with no URL. %5F is the documented escape for a URL segment
 * that has to start with an underscore, and the route is `/_ds` as §18 asks.
 *
 * Not a product surface: it exists so every primitive can be reviewed in every
 * state, in both themes and both text directions, before Phase 1 starts
 * assembling screens out of them.
 */
export const metadata: Metadata = {
  title: 'Design system',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DesignSystem />;
}
