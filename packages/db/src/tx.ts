import type { dbWrite } from './client';

/**
 * A transaction handle from `dbWrite`.
 *
 * Extracted so the helpers can accept either the client or a transaction
 * without importing the client and creating a cycle.
 */
export type Tx = Parameters<Parameters<ReturnType<typeof dbWrite>['transaction']>[0]>[0];
