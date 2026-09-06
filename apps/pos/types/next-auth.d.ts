import type { DefaultSession } from 'next-auth';

/**
 * §14.2 — the session carries the terminal binding and nothing else about
 * access. Permissions are resolved per request from the database, so a role
 * removed at 14:00 is removed at 14:00.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      terminalId: string;
      terminalLabel: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    terminalId?: string;
    terminalLabel?: string;
  }
}
