import { randomUUID } from 'node:crypto';
import type { PrintSink } from './sink.js';

/**
 * The print queue — BUILD-PLAN.md §12 ("owns the queue, paper-out handling,
 * and retry"); docs/runfiles/M10-check-and-payment.md §3.
 *
 * `# ponytail: in-memory, single process — a bridge restart drops whatever
 * was mid-queue. Durable/offline queueing across a restart is the M16
 * offline milestone's territory, not this one's; the shape here (one job,
 * one retry loop, a paper-out flag) is what M16 would persist, not replace.`
 */
export type PrintJobStatus = 'PENDING' | 'PRINTING' | 'DONE' | 'FAILED';

export interface PrintJob {
  readonly id: string;
  readonly enqueuedAt: Date;
  status: PrintJobStatus;
  attempts: number;
  error: string | null;
}

interface InternalJob extends PrintJob {
  readonly buffer: Buffer;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PrintQueue {
  private readonly jobs = new Map<string, InternalJob>();
  private paperOut = false;

  constructor(
    private readonly sink: PrintSink,
    private readonly maxAttempts = MAX_ATTEMPTS,
  ) {}

  get isPaperOut(): boolean {
    return this.paperOut;
  }

  /** A paper-out condition blocks the queue until cleared — a job stays PENDING rather than failing outright. */
  setPaperOut(value: boolean): void {
    this.paperOut = value;
    if (!value) {
      for (const job of this.jobs.values()) {
        if (job.status === 'PENDING') void this.attempt(job);
      }
    }
  }

  list(): readonly PrintJob[] {
    return [...this.jobs.values()].map(({ buffer: _buffer, ...job }) => job);
  }

  enqueue(buffer: Buffer): PrintJob {
    const job: InternalJob = {
      id: randomUUID(),
      enqueuedAt: new Date(),
      status: 'PENDING',
      attempts: 0,
      error: null,
      buffer,
    };
    this.jobs.set(job.id, job);
    void this.attempt(job);
    return job;
  }

  private async attempt(job: InternalJob): Promise<void> {
    while (job.attempts < this.maxAttempts) {
      if (this.paperOut) {
        job.status = 'PENDING';
        job.error = 'Paper out';
        return;
      }

      job.status = 'PRINTING';
      job.attempts += 1;
      try {
        await this.sink.write(job.buffer);
        job.status = 'DONE';
        job.error = null;
        return;
      } catch (error) {
        job.error = error instanceof Error ? error.message : String(error);
        if (job.attempts >= this.maxAttempts) {
          job.status = 'FAILED';
          return;
        }
        await delay(RETRY_DELAY_MS);
      }
    }
  }
}
