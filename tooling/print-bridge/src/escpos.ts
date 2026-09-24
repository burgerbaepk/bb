import type { RasterBitmap } from './raster.js';

/**
 * ESC/POS byte-buffer builder — BUILD-PLAN.md §12, §15.3.
 *
 * Text lines become ESC/POS text commands; a raster line (an Urdu line, or
 * the receipt logo — both rasterised by `raster.ts`) becomes a `GS v 0`
 * block. Both live in the same `doc.lines` array, in print order, so the
 * buffer this module builds is already the "interleave into one buffer"
 * step §15.3's diagram draws — the print bridge agent that receives it over
 * `POST /print` never has to know the difference.
 */

export type EscPosAlign = 'left' | 'center' | 'right';

export interface EscPosTextLine {
  readonly text: string;
  readonly bold?: boolean | undefined;
  /**
   * Double height, normal width (`GS ! 0x01`) — ADR 0028, for the delivery
   * address and the total. Width is left alone so the line keeps the paper's
   * full column count and wraps where every other line does.
   */
  readonly tall?: boolean | undefined;
  readonly align?: EscPosAlign | undefined;
}

export interface EscPosRasterLine {
  readonly raster: RasterBitmap;
  readonly align?: EscPosAlign | undefined;
}

export type EscPosLine = EscPosTextLine | EscPosRasterLine;

function isRasterLine(line: EscPosLine): line is EscPosRasterLine {
  return 'raster' in line;
}

export interface EscPosDocument {
  readonly lines: readonly EscPosLine[];
  /** Blank lines fed before the cut, so the cut clears the last line of text. Default 4. */
  readonly feedLines?: number | undefined;
}

const ESC = 0x1b;
const GS = 0x1d;

/**
 * `GS v 0 m xL xH yL yH d1...dk` — `m = 0` (normal mode, no scaling). Width
 * is in *bytes*, not dots, which is exactly why `raster.ts` only ever
 * produces bitmaps whose `widthDots` is a multiple of 8.
 */
function gsV0Raster(bitmap: RasterBitmap): Buffer {
  const bytesPerRow = bitmap.widthDots / 8;
  const header = Buffer.from([
    GS,
    0x76,
    0x30,
    0x00,
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    bitmap.heightDots & 0xff,
    (bitmap.heightDots >> 8) & 0xff,
  ]);
  return Buffer.concat([header, bitmap.packed]);
}

function alignCode(align: EscPosAlign): number {
  switch (align) {
    case 'left':
      return 0;
    case 'center':
      return 1;
    case 'right':
      return 2;
    default: {
      const exhaustive: never = align;
      throw new TypeError(`unknown align ${String(exhaustive)}`);
    }
  }
}

/** One buffer per document: initialize, each line at its own alignment/weight, feed, full cut. */
export function buildEscPosBuffer(doc: EscPosDocument): Buffer {
  const chunks: Buffer[] = [Buffer.from([ESC, 0x40])];

  let currentAlign: EscPosAlign | null = null;
  let currentBold: boolean | null = null;
  let currentTall = false;

  for (const line of doc.lines) {
    const align = line.align ?? 'left';
    if (align !== currentAlign) {
      chunks.push(Buffer.from([ESC, 0x61, alignCode(align)]));
      currentAlign = align;
    }

    if (isRasterLine(line)) {
      chunks.push(gsV0Raster(line.raster));
      continue;
    }

    const bold = line.bold ?? false;
    if (bold !== currentBold) {
      chunks.push(Buffer.from([ESC, 0x45, bold ? 1 : 0]));
      currentBold = bold;
    }
    const tall = line.tall ?? false;
    if (tall !== currentTall) {
      chunks.push(Buffer.from([GS, 0x21, tall ? 0x01 : 0x00]));
      currentTall = tall;
    }
    chunks.push(Buffer.from(`${line.text}\n`, 'ascii'));
  }

  chunks.push(Buffer.from('\n'.repeat(doc.feedLines ?? 4), 'ascii'));
  chunks.push(Buffer.from([GS, 0x56, 0x00]));

  return Buffer.concat(chunks);
}
