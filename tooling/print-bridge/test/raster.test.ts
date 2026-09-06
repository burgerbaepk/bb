import { describe, expect, it } from 'vitest';
import { buildEscPosBuffer } from '../src/escpos.js';
import { rasterCacheKey, rasterizeLogoImage, rasterizeUrduLine } from '../src/raster.js';

/**
 * §15.3 — the rasterisation core, run for real: `mehr`'s font file, `satori`,
 * and `@resvg/resvg-js` are all local dependencies, so there is nothing here
 * that needs a network call or a printer. What is *not* covered — a
 * byte-for-byte comparison against a real thermal printer's output, and the
 * Redis cache (no `UPSTASH_REDIS_REST_URL` in a test run, so `raster.ts`'s
 * own `redis === null` branch is exactly what runs here) — is the same
 * disclosed-gap shape as every DB/network-touching path since M10.
 */

/** A well-known minimal 1×1 black PNG — enough for `resvg` to decode for real. */
const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('rasterCacheKey', () => {
  it('is deterministic and content-sensitive', () => {
    const a = rasterCacheKey(['urdu-line', 'چائے', '384', '32']);
    const b = rasterCacheKey(['urdu-line', 'چائے', '384', '32']);
    const c = rasterCacheKey(['urdu-line', 'قہوہ', '384', '32']);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('rasterizeUrduLine', () => {
  it('renders at the 384-dot receipt width with a byte-aligned height', async () => {
    const bitmap = await rasterizeUrduLine('چائے');
    expect(bitmap.widthDots).toBe(384);
    expect(bitmap.heightDots % 8).toBe(0);
    expect(bitmap.packed.length).toBe((bitmap.widthDots / 8) * bitmap.heightDots);
  }, 15_000);

  it('actually draws something — not an all-white bitmap', async () => {
    const bitmap = await rasterizeUrduLine('قہوہ');
    expect(bitmap.packed.some((byte) => byte !== 0)).toBe(true);
  });
});

describe('rasterizeLogoImage', () => {
  it('decodes a real PNG into a raster bitmap sized to its aspect ratio', async () => {
    const bitmap = await rasterizeLogoImage(ONE_BY_ONE_PNG);
    expect(bitmap).not.toBeNull();
    // 1:1 source aspect — width and height round to the same multiple of 8.
    expect(bitmap?.widthDots).toBe(bitmap?.heightDots);
    expect(bitmap?.packed.length).toBe(((bitmap?.widthDots ?? 0) / 8) * (bitmap?.heightDots ?? 0));
  });

  it('returns null rather than throwing on non-PNG bytes — a receipt must still print', async () => {
    const bitmap = await rasterizeLogoImage(Buffer.from('not a png'));
    expect(bitmap).toBeNull();
  });
});

describe('buildEscPosBuffer with a raster line', () => {
  it('emits a correctly addressed GS v 0 header', async () => {
    const bitmap = await rasterizeUrduLine('چائے');
    const buffer = buildEscPosBuffer({ lines: [{ raster: bitmap }] });

    const gsV0 = buffer.indexOf(Buffer.from([0x1d, 0x76, 0x30, 0x00]));
    expect(gsV0).toBeGreaterThanOrEqual(0);

    const bytesPerRow = bitmap.widthDots / 8;
    const header = buffer.subarray(gsV0, gsV0 + 8);
    expect(header[4]).toBe(bytesPerRow & 0xff);
    expect(header[5]).toBe((bytesPerRow >> 8) & 0xff);
    expect(header[6]).toBe(bitmap.heightDots & 0xff);
    expect(header[7]).toBe((bitmap.heightDots >> 8) & 0xff);

    const dataStart = gsV0 + 8;
    expect(buffer.subarray(dataStart, dataStart + bitmap.packed.length)).toEqual(bitmap.packed);
  });
});
