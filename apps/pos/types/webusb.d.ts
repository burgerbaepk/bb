/**
 * WebUSB — the minimal surface `lib/printing/client.ts` uses.
 *
 * Not part of TypeScript's bundled DOM lib (still a working-draft W3C spec).
 * Declared narrowly, for exactly the calls §12's WebUSB fallback needs —
 * request a device, open it, claim its bulk-out endpoint, write to it —
 * rather than pulling in a third-party `@types` package for a handful of
 * calls this one small file makes.
 */
interface USBEndpoint {
  readonly endpointNumber: number;
  readonly direction: 'in' | 'out';
}

interface USBAlternateInterface {
  readonly endpoints: readonly USBEndpoint[];
}

interface USBInterface {
  readonly interfaceNumber: number;
  readonly alternate: USBAlternateInterface;
}

interface USBConfiguration {
  readonly interfaces: readonly USBInterface[];
}

interface USBOutTransferResult {
  readonly status: 'ok' | 'stall' | 'babble';
}

interface USBDevice {
  readonly configuration: USBConfiguration | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<USBOutTransferResult>;
}

interface USBDeviceRequestOptions {
  readonly filters: readonly Record<string, never>[];
}

interface USB {
  requestDevice(options: USBDeviceRequestOptions): Promise<USBDevice>;
}

interface Navigator {
  readonly usb?: USB;
}
