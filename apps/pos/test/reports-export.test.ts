import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { toCsv, toPdfBuffer, toXlsxBuffer, type ExportColumn } from '@/lib/reports/export';

/**
 * The one pure, DB-free unit in M13 — docs/runfiles/M13-reporting.md §4 G7/G8.
 *
 * `lib/reports/export.ts` carries no `server-only` guard for exactly the
 * reason `businessDateLogic.ts` does not (that file's own doc comment): no
 * database, no framework, so it can be exercised directly here instead of
 * only ever through a page or route.
 */
interface Row {
  readonly name: string;
  readonly amount: string;
}

const COLUMNS: readonly ExportColumn<Row>[] = [
  { header: 'Name', value: (row) => row.name },
  { header: 'Amount', value: (row) => row.amount },
];

const ROWS: readonly Row[] = [
  { name: 'Plain', amount: '100' },
  { name: 'Has, a comma', amount: '200' },
  { name: 'Has "quotes"', amount: '300' },
  { name: 'Has\nnewline', amount: '400' },
];

describe('toCsv', () => {
  it('quotes a field touching a comma, a quote, or a newline — RFC 4180', () => {
    const lines = toCsv(COLUMNS, ROWS).split('\r\n');
    expect(lines[0]).toBe('Name,Amount');
    expect(lines[1]).toBe('Plain,100');
    expect(lines[2]).toBe('"Has, a comma",200');
    expect(lines[3]).toBe('"Has ""quotes""",300');
    expect(lines[4]).toBe('"Has\nnewline",400');
  });

  it('round-trips a plain row untouched', () => {
    expect(toCsv(COLUMNS, [{ name: 'Simple', amount: '50' }])).toBe('Name,Amount\r\nSimple,50\r\n');
  });
});

describe('toXlsxBuffer', () => {
  it('re-opens via exceljs to the same header row and row count', async () => {
    const buffer = await toXlsxBuffer('Test sheet', COLUMNS, ROWS);
    const workbook = new ExcelJS.Workbook();
    // `exceljs`'s own bundled `index.d.ts` re-declares a global `Buffer`
    // (`extends ArrayBuffer`) that merges with — and corrupts — Node's own,
    // so `tsc` rejects a real `Buffer` as not assignable to itself. A purely
    // nominal artifact of a third-party type bug, not a runtime one; `never`
    // is the narrowest cast that sidesteps the corrupted merge instead of
    // fighting it.
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.worksheets[0];
    expect(sheet?.getRow(1).getCell(1).text).toBe('Name');
    expect(sheet?.getRow(1).getCell(2).text).toBe('Amount');
    expect(sheet?.getRow(3).getCell(1).text).toBe('Has, a comma');
    expect(sheet?.rowCount).toBe(ROWS.length + 1);
  });
});

describe('toPdfBuffer', () => {
  it('starts with the PDF header and is non-trivial for a non-empty table', async () => {
    const buffer = await toPdfBuffer('Test report', COLUMNS, ROWS);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.byteLength).toBeGreaterThan(500);
  });
});
