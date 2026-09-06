import type { RasterBitmap } from '@natech/print-bridge/raster';
import { storefrontQr } from './storefrontQr';

/** Integer-sized dots avoid blurred edges on 203 dpi thermal printers, including 58 mm paper. */
export function storefrontQrRaster(url: string | null | undefined): RasterBitmap | null {
  const qr = storefrontQr(url);
  if (qr === null) return null;
  const scale = Math.max(1, Math.floor(256 / qr.size));
  const heightDots = qr.size * scale;
  const widthDots = Math.ceil(heightDots / 8) * 8;
  const bytesPerRow = widthDots / 8;
  const packed = Buffer.alloc(bytesPerRow * heightDots);
  for (let y = 0; y < qr.modules.size; y += 1) {
    for (let x = 0; x < qr.modules.size; x += 1) {
      if (!qr.modules.get(y, x)) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const px = (x + qr.margin) * scale + dx;
          const py = (y + qr.margin) * scale + dy;
          const offset = py * bytesPerRow + Math.floor(px / 8);
          packed[offset] = (packed[offset] ?? 0) | (0x80 >> (px % 8));
        }
      }
    }
  }
  return { widthDots, heightDots, packed };
}
