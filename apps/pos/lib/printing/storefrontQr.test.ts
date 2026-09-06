import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { storefrontQr } from './storefrontQr';
import { storefrontQrRaster } from './storefrontQrRaster';

describe('invoice storefront QR', () => {
  it.each([undefined, null, '', '   ', 'javascript:alert(1)', 'not a URL'])(
    'omits an unset or invalid URL: %s',
    (url) => {
      expect(storefrontQr(url)).toBeNull();
      expect(storefrontQrRaster(url)).toBeNull();
    },
  );

  it('encodes the configured storefront address with a four-module quiet zone', () => {
    const url = 'https://orders.example.org';
    const qr = storefrontQr(`  ${url}  `)!;
    expect(qr.url).toBe(url);
    expect(qr.modules.data).toEqual(QRCode.create(url, { errorCorrectionLevel: 'M' }).modules.data);
    expect(qr.size).toBe(qr.modules.size + 8);
  });

  it('packs every thermal dot faithfully without scaling artifacts or clipping the quiet zone', () => {
    const url = 'https://orders.example.org';
    const qr = storefrontQr(url)!;
    const raster = storefrontQrRaster(url)!;
    const scale = raster.heightDots / qr.size;
    expect(Number.isInteger(scale)).toBe(true);
    expect(raster.widthDots % 8).toBe(0);
    expect(raster.widthDots).toBeLessThanOrEqual(256);
    const expected = Buffer.alloc(raster.packed.length);
    for (let y = 0; y < raster.heightDots; y += 1) {
      for (let x = 0; x < raster.widthDots; x += 1) {
        const mx = Math.floor(x / scale) - 4;
        const my = Math.floor(y / scale) - 4;
        if (
          mx >= 0 &&
          my >= 0 &&
          mx < qr.modules.size &&
          my < qr.modules.size &&
          qr.modules.get(my, mx)
        ) {
          const offset = y * (raster.widthDots / 8) + Math.floor(x / 8);
          expected[offset] = (expected[offset] ?? 0) | (128 >> (x % 8));
        }
      }
    }
    expect(raster.packed).toEqual(expected);
  });
});
