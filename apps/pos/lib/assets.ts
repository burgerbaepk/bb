import 'server-only';

/**
 * Resolve version-controlled assets from the app's public/images directory.
 * Remote/user-uploaded media remains disabled; only safe local filenames and
 * already-rooted /images paths are accepted.
 *
 * The extension allow-list is what makes this safe, so it stays an allow-list:
 * `.svg` is absent on purpose (an inline `<script>` in an uploaded SVG is a
 * stored XSS), and so is any extension the browser would sniff.
 */
export function resolveAssetUrl(key: string | null): string | null {
  if (key === null || key === '') return null;
  if (key.startsWith('/images/') && !key.includes('..')) return key;
  return /^[a-z0-9][a-z0-9-]*\.(webp|jpg|png)$/.test(key) ? `/images/${key}` : null;
}
