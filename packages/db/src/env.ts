import { config } from 'dotenv';

/**
 * Database configuration — BUILD-PLAN.md §2 R2, §4.
 *
 * Two connection strings that are not interchangeable. Loaded through the real
 * dotenv parser rather than a hand-rolled one: `.env.example` carries inline
 * comments after the value (`NEON_DATABASE_URL=... # WebSocket pooled — all
 * writes`), and a naive `split('=')` drags the comment into the URL, where the
 * em dash then fails to encode as a header byte.
 */

let loaded = false;

function loadOnce(): void {
  if (loaded) return;
  // `.env.local` first so a developer machine overrides a committed `.env`.
  config({ path: '.env.local', quiet: true });
  config({ path: '../../.env.local', quiet: true });
  config({ path: '.env', quiet: true });
  config({ path: '../../.env', quiet: true });
  loaded = true;
}

function require_(name: string): string {
  loadOnce();
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in — see docs/runfiles/M00-provisioning.md.`,
    );
  }
  return value.trim();
}

export interface DatabaseUrls {
  /** WebSocket pooled. Every write. Honours transactions. */
  readonly write: string;
  /** HTTP driver. RSC reads only. Silently no-ops a multi-statement transaction. */
  readonly read: string;
}

export function databaseUrls(): DatabaseUrls {
  const write = require_('NEON_DATABASE_URL');
  const read = require_('NEON_DATABASE_URL_HTTP');

  // The failure this guards against is silent and expensive: with the HTTP URL
  // in both slots, every write appears to succeed and every multi-statement
  // transaction is discarded. Better to refuse at boot.
  if (write === read) {
    throw new Error(
      'NEON_DATABASE_URL and NEON_DATABASE_URL_HTTP are identical. The pooled and ' +
        'direct endpoints are different hosts; using the HTTP driver for writes ' +
        'silently discards multi-statement transactions (R2).',
    );
  }

  return { write, read };
}
