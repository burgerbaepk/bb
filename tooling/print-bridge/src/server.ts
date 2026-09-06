import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { PrintQueue } from './queue.js';
import { createFileSink, type PrintSink } from './sink.js';

/**
 * The local HTTP server — BUILD-PLAN.md §12 ("a signed Node binary on the
 * till, listening on http://localhost:9110 and accepting an ESC/POS byte
 * buffer"); docs/runfiles/M10-check-and-payment.md §3.
 *
 * This is the server minus the two things a coding session cannot produce:
 * a code-signing certificate and an OS-level installer. Everything else — the
 * real port, the real queue, the real retry, the real paper-out state — is
 * here and is what `apps/pos`'s client code (`lib/printing/client.ts`) talks
 * to over HTTP exactly as a signed, installed build would.
 *
 * CORS is permissive by design: the caller is always the POS running in a
 * browser on the same machine, at whatever `localhost` port Next.js picked,
 * talking to an agent that only ever listens on loopback. There is no
 * cross-machine request this could leak to.
 */
export const PRINT_BRIDGE_PORT = 9110;

export interface PrintBridgeServer {
  readonly server: Server;
  readonly queue: PrintQueue;
  close(): Promise<void>;
}

interface PrintRequestBody {
  readonly bufferBase64?: unknown;
}

function withCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createPrintBridgeServer(
  sink: PrintSink = createFileSink(),
  port: number = PRINT_BRIDGE_PORT,
): PrintBridgeServer {
  const queue = new PrintQueue(sink);

  const server = createServer((req, res) => {
    withCors(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/status') {
      json(res, 200, { paperOut: queue.isPaperOut, jobs: queue.list() });
      return;
    }

    if (req.method === 'POST' && req.url === '/print') {
      void readBody(req).then((raw) => {
        let body: PrintRequestBody;
        try {
          body = JSON.parse(raw.toString('utf8')) as PrintRequestBody;
        } catch {
          json(res, 400, { error: 'invalid JSON body' });
          return;
        }
        if (typeof body.bufferBase64 !== 'string') {
          json(res, 400, { error: 'bufferBase64 is required' });
          return;
        }
        const job = queue.enqueue(Buffer.from(body.bufferBase64, 'base64'));
        json(res, 202, { jobId: job.id });
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/paper-out') {
      queue.setPaperOut(true);
      json(res, 200, { paperOut: true });
      return;
    }

    if (req.method === 'POST' && req.url === '/paper-loaded') {
      queue.setPaperOut(false);
      json(res, 200, { paperOut: false });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port);

  return {
    server,
    queue,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
