import type { QueuedOrder } from '@natech/contracts';

/**
 * The offline queue's storage — BUILD-PLAN.md §8; docs/runfiles/M16-offline.md §2.
 *
 * Native `indexedDB`, not a library: two object stores is not enough surface
 * to justify a dependency (ponytail rung 4 — a native platform feature covers
 * it), and `packages/domain`'s own doc comment already promises the tax
 * engine "runs identically ... inside the POS service worker" — no framework,
 * no wrapper library, just this and `@natech/contracts`' wire schemas.
 *
 * Untested directly, the same split `packages/db/src/orderNo.ts` makes from
 * `orderNoLogic.ts`: this needs a real browser; `queueLogic.ts`/
 * `buildQueuedOrder.ts` do not and carry the actual test coverage.
 */
const DB_NAME = 'natech-pos-offline';
const DB_VERSION = 1;
const QUEUE_STORE = 'queue';
const META_STORE = 'meta';
const LAST_SYNC_KEY = 'lastSyncAt';

export interface QueuedOrderRecord extends QueuedOrder {
  readonly queuedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'clientOrderUuid' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('could not open the offline database'));
  });
}

async function runTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = fn(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error(`offline ${storeName} operation failed`));
  });
}

export async function enqueueOrder(order: QueuedOrder, queuedAt: Date): Promise<void> {
  const record: QueuedOrderRecord = { ...order, queuedAt: queuedAt.toISOString() };
  await runTx(QUEUE_STORE, 'readwrite', (store) => store.put(record));
}

export async function listQueuedOrders(): Promise<readonly QueuedOrderRecord[]> {
  return runTx(QUEUE_STORE, 'readonly', (store) => store.getAll());
}

export async function removeQueuedOrder(clientOrderUuid: string): Promise<void> {
  await runTx(QUEUE_STORE, 'readwrite', (store) => store.delete(clientOrderUuid));
}

export async function readLastSyncAt(): Promise<Date | null> {
  const value = await runTx<string | undefined>(META_STORE, 'readonly', (store) =>
    store.get(LAST_SYNC_KEY),
  );
  return value === undefined ? null : new Date(value);
}

export async function writeLastSyncAt(at: Date): Promise<void> {
  await runTx(META_STORE, 'readwrite', (store) => store.put(at.toISOString(), LAST_SYNC_KEY));
}
