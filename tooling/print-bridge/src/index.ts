/**
 * print-bridge — local ESC/POS agent. BUILD-PLAN.md §12, §15.3.
 *
 * A signed Node binary on the till, listening on http://localhost:9110 and
 * accepting an ESC/POS byte buffer. It owns the printer queue, paper-out
 * handling, retry, and offline ticket buffering, and it hosts the Urdu raster
 * pipeline — ESC/POS text mode cannot render Nastaliq, so Urdu lines arrive as
 * 1-bit rasters and are interleaved into the same buffer (§15.3).
 *
 * This is the primary print path. Two fallbacks exist: WebUSB/WebSerial
 * (Chrome, gesture-gated) and an 80mm HTML browser print dialog. The active
 * path is selectable per terminal in Settings.
 *
 * Scaffolded in M00. Implemented in M10 (this server, the ESC/POS builder,
 * the queue) and M15 (`raster.ts` — Urdu and the receipt logo, both rasterised
 * and cached the same way). The signed, installable binary distributed to a
 * till is still not — see docs/runfiles/M10-check-and-payment.md §3 for what
 * a coding session can and cannot produce here.
 */
export { PRINT_BRIDGE_PORT, createPrintBridgeServer, type PrintBridgeServer } from './server.js';
export {
  buildEscPosBuffer,
  type EscPosAlign,
  type EscPosDocument,
  type EscPosLine,
  type EscPosRasterLine,
  type EscPosTextLine,
} from './escpos.js';
export { PrintQueue, type PrintJob, type PrintJobStatus } from './queue.js';
export { createFileSink, type PrintSink } from './sink.js';
export {
  RECEIPT_RASTER_WIDTH_DOTS,
  rasterCacheKey,
  rasterizeLogoImage,
  rasterizeUrduLine,
  type RasterBitmap,
} from './raster.js';
