import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The printer itself — BUILD-PLAN.md §12; docs/runfiles/M10-check-and-payment.md §3.
 *
 * Injectable so the HTTP server and its queue can be tested without hardware,
 * and so a real deployment can swap in a raw-device writer (`node:net`
 * against a network printer, or a serial/USB device) without touching the
 * queue, retry, or wire protocol above it.
 *
 * `createFileSink` is the default in this environment: there is no physical
 * ESC/POS printer to prove a real write against here, and claiming otherwise
 * would be a claim this session cannot back up. It writes the raw buffer to
 * a file under the OS temp directory, which is enough to prove the buffer a
 * real print job would have received without pretending a device answered it.
 */
export interface PrintSink {
  write(buffer: Buffer): Promise<void>;
}

export function createFileSink(dir: string = join(tmpdir(), 'print-bridge')): PrintSink {
  return {
    async write(buffer: Buffer): Promise<void> {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${Date.now()}-${randomUUID()}.escpos`), buffer);
    },
  };
}
