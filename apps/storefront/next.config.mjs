import { config } from 'dotenv';
import createNextIntlPlugin from 'next-intl/plugin';

/**
 * BUILD-PLAN.md §4 keeps one `.env` at the repository root, and Next reads env
 * files from the app directory only — the same reason `apps/pos/next.config.mjs`
 * reaches up two levels.
 *
 * `.env.local` first, so a developer machine overrides a committed `.env`.
 * On Vercel the platform supplies the environment and both calls find nothing.
 */
config({ path: '../../.env.local', quiet: true });
config({ path: '../../.env', quiet: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@natech/ui',
    '@natech/domain',
    '@natech/contracts',
    '@natech/branding',
    '@natech/config',
    '@natech/auth',
    '@natech/db',
    '@natech/realtime',
  ],
  typedRoutes: true,
  // The Neon driver and its WebSocket shim are Node modules — bundling them
  // into a server chunk breaks the pooled client every write needs (the
  // identical reason `apps/pos/next.config.mjs` excludes them).
  serverExternalPackages: ['@neondatabase/serverless', 'ws'],
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
