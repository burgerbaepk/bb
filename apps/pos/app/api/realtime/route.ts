import { getRealtime, handle } from '@natech/realtime';

export function GET(request: Request) {
  return handle({ realtime: getRealtime() })(request);
}
