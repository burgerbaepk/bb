import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

/**
 * The one exporter every §17 report shares — BUILD-PLAN.md §17;
 * docs/runfiles/M13-reporting.md §3.
 *
 * `(title, columns, rows) → CSV string | XLSX buffer | PDF buffer`, knowing
 * nothing about sales, tax, or exceptions. Seven reports through three
 * formats is fourteen generators if each report writes its own; this is the
 * same logic once, fed a column list built from each row's own render-ready
 * strings (never a `Paisa`, a `Date`, or a `Qty` — those are formatted by the
 * caller, at the render boundary, exactly as `Money`/`formatDateTime` already
 * do for the screen).
 */
export interface ExportColumn<Row> {
  readonly header: string;
  readonly value: (row: Row) => string;
}

/** RFC 4180: a field touching a comma, quote, or newline is quoted, with `"` doubled. */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv<Row>(columns: readonly ExportColumn<Row>[], rows: readonly Row[]): string {
  const lines = [columns.map((column) => csvField(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvField(column.value(row))).join(','));
  }
  // CRLF — RFC 4180's own line ending, and the one every spreadsheet expects.
  return lines.join('\r\n') + '\r\n';
}

export async function toXlsxBuffer<Row>(
  title: string,
  columns: readonly ExportColumn<Row>[],
  rows: readonly Row[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // Sheet names cannot exceed 31 characters or carry `: \ / ? * [ ]`.
  const sheet = workbook.addWorksheet(title.slice(0, 31).replace(/[:\\/?*[\]]/g, ' '));
  sheet.addRow(columns.map((column) => column.header)).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(columns.map((column) => column.value(row)));
  }
  for (const [index, column] of columns.entries()) {
    const widths = [column.header.length, ...rows.map((row) => column.value(row).length)];
    // `.columns` assignment resets everything already written above; widths
    // are set per-column instead.
    sheet.getColumn(index + 1).width = Math.min(60, Math.max(10, ...widths) + 2);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

const PDF_MARGIN = 36;
const PDF_ROW_HEIGHT = 18;
const PDF_FONT_SIZE = 9;

export async function toPdfBuffer<Row>(
  title: string,
  columns: readonly ExportColumn<Row>[],
  rows: readonly Row[],
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PDF_MARGIN, layout: 'landscape' });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const pageWidth = doc.page.width - PDF_MARGIN * 2;
  const columnWidth = pageWidth / Math.max(1, columns.length);
  const bottom = doc.page.height - PDF_MARGIN;

  function drawHeader(): void {
    doc.font('Helvetica-Bold').fontSize(PDF_FONT_SIZE);
    let x = PDF_MARGIN;
    for (const column of columns) {
      doc.text(column.header, x, doc.y, { width: columnWidth, ellipsis: true });
      x += columnWidth;
    }
    doc.moveDown();
    doc.font('Helvetica').fontSize(PDF_FONT_SIZE);
  }

  doc.font('Helvetica-Bold').fontSize(14).text(title, { align: 'left' });
  doc.moveDown(0.5);
  drawHeader();

  for (const row of rows) {
    if (doc.y + PDF_ROW_HEIGHT > bottom) {
      doc.addPage({ size: 'A4', margin: PDF_MARGIN, layout: 'landscape' });
      drawHeader();
    }
    const y = doc.y;
    let x = PDF_MARGIN;
    for (const column of columns) {
      doc.text(column.value(row), x, y, { width: columnWidth, ellipsis: true });
      x += columnWidth;
    }
    doc.y = y + PDF_ROW_HEIGHT;
  }

  doc.end();
  return done;
}
