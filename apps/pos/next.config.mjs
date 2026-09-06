import { config } from 'dotenv';

/**
 * BUILD-PLAN.md §4 keeps one `.env` at the repository root, and Next reads env
 * files from the app directory only. Without this, `AUTH_SECRET` is undefined
 * at the till and Auth.js refuses to start — the same reason `packages/db`
 * reaches up two levels for its connection strings.
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
  ],
  typedRoutes: true,
  // The Neon driver and its WebSocket shim are Node modules; bundling them into
  // a server chunk breaks the pooled client that R2 requires for every write.
  // `@resvg/resvg-js` loads a native `.node` binary (§15.3's raster pipeline)
  // — Turbopack can't statically bundle that and errors on the attempt
  // ("non-ecmascript placeable asset"); external, it resolves at runtime
  // through plain `require`, same as the Neon driver below.
  // Satori loads HarfBuzz's sibling `hb.wasm` from its package directory at
  // runtime. Bundling either package rewrites that directory to Turbopack's
  // virtual `/ROOT` path without emitting the WASM file.
  serverExternalPackages: [
    '@neondatabase/serverless',
    'ws',
    '@resvg/resvg-js',
    'satori',
    'harfbuzzjs',
  ],
};

export default nextConfig;
