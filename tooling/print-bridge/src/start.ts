import { createPrintBridgeServer, PRINT_BRIDGE_PORT } from './server.js';

/**
 * CLI entry point. `pnpm --filter @natech/print-bridge start` (or the built
 * `dist/start.js` directly) runs the agent in the foreground on a till.
 *
 * Packaging this as the "signed Node binary" §12 describes — code-signing,
 * an installer, OS service registration so it survives a reboot — is
 * infrastructure a coding session cannot produce or verify; see
 * docs/runfiles/M10-check-and-payment.md §3.
 */
createPrintBridgeServer();
console.log(`print-bridge listening on http://localhost:${PRINT_BRIDGE_PORT}`);
