import { describe, expect, it, vi } from 'vitest';
import { buildEscPosBuffer } from '../src/escpos.js';
import { PrintQueue } from '../src/queue.js';
import { createPrintBridgeServer } from '../src/server.js';
import type { PrintSink } from '../src/sink.js';

describe('buildEscPosBuffer', () => {
  it('opens with an initialize sequence and ends with a full cut', () => {
    const buffer = buildEscPosBuffer({
      lines: [{ text: 'NOT A TAX INVOICE', align: 'center', bold: true }],
    });
    expect(buffer.subarray(0, 2)).toEqual(Buffer.from([0x1b, 0x40]));
    expect(buffer.subarray(-3)).toEqual(Buffer.from([0x1d, 0x56, 0x00]));
    expect(buffer.toString('ascii')).toContain('NOT A TAX INVOICE');
  });
});

describe('PrintQueue', () => {
  it('retries a failing sink up to the limit, then marks the job FAILED', async () => {
    const write = vi.fn().mockRejectedValue(new Error('device offline'));
    const sink: PrintSink = { write };
    const queue = new PrintQueue(sink, 2);

    const job = queue.enqueue(Buffer.from('x'));
    await vi.waitFor(() =>
      expect(queue.list().find((j) => j.id === job.id)?.status).toBe('FAILED'),
    );
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('holds a job PENDING while paper is out, then prints it once cleared', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const sink: PrintSink = { write };
    const queue = new PrintQueue(sink);

    queue.setPaperOut(true);
    const job = queue.enqueue(Buffer.from('x'));
    expect(queue.list().find((j) => j.id === job.id)?.status).toBe('PENDING');
    expect(write).not.toHaveBeenCalled();

    queue.setPaperOut(false);
    await vi.waitFor(() => expect(queue.list().find((j) => j.id === job.id)?.status).toBe('DONE'));
  });
});

describe('createPrintBridgeServer', () => {
  it('accepts a print job over HTTP and queues it', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const bridge = createPrintBridgeServer({ write }, 0);
    const address = bridge.server.address();
    if (address === null || typeof address === 'string')
      throw new Error('server did not bind a port');

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/print`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bufferBase64: Buffer.from('hello').toString('base64') }),
      });
      expect(response.status).toBe(202);
      const body = (await response.json()) as { jobId: string };
      expect(body.jobId).toBeTruthy();

      await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
      expect(write.mock.calls[0]?.[0].toString('utf8')).toBe('hello');
    } finally {
      await bridge.close();
    }
  });
});
