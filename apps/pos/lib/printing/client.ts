'use client';

/**
 * The two non-HTML print paths, from the browser — BUILD-PLAN.md §12;
 * docs/runfiles/M10-check-and-payment.md §2/§3.
 *
 * The third path (80mm HTML + browser print dialog) needs none of this: it
 * renders `TaxInvoiceReceipt` into a `PrintPortal` and calls `window.print()`
 * directly.
 */
export interface PrintResult {
  readonly ok: boolean;
  readonly error: string | null;
}

const PRINT_BRIDGE_URL = 'http://localhost:9110/print';

/** §12 path 1 — the print bridge agent, on the same till. */
export async function printBufferViaBridge(bufferBase64: string): Promise<PrintResult> {
  try {
    const response = await fetch(PRINT_BRIDGE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bufferBase64 }),
    });
    if (!response.ok)
      return { ok: false, error: `The print bridge agent returned an error (${response.status}).` };
    return { ok: true, error: null };
  } catch {
    return {
      ok: false,
      error: 'Could not reach the print bridge agent on this till. Is it running?',
    };
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** §12 path 2 — WebUSB, Chrome-only, gesture-gated: the caller must invoke this from a click handler. */
export async function printBufferViaWebUsb(bufferBase64: string): Promise<PrintResult> {
  if (typeof navigator === 'undefined' || navigator.usb === undefined) {
    return { ok: false, error: 'WebUSB is not supported in this browser.' };
  }

  try {
    const device = await navigator.usb.requestDevice({ filters: [] });
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);

    const iface = device.configuration?.interfaces[0];
    if (iface === undefined)
      return { ok: false, error: 'The selected device has no usable interface.' };
    await device.claimInterface(iface.interfaceNumber);

    const endpoint = iface.alternate.endpoints.find((candidate) => candidate.direction === 'out');
    if (endpoint === undefined)
      return { ok: false, error: 'The selected device has no output endpoint.' };

    const result = await device.transferOut(endpoint.endpointNumber, base64ToBytes(bufferBase64));
    if (result.status !== 'ok')
      return { ok: false, error: `The printer reported "${result.status}".` };
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'WebUSB print failed.' };
  }
}
