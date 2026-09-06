import Image from 'next/image';
import QRCode from 'qrcode';
import { Button } from '@natech/ui';
import { PageHeading } from '@/components/admin/PageHeading';
import { PrintButton } from '@/components/admin/PrintButton';
import { requirePermissionPage } from '@/lib/auth/session';
import { generateMissingTableQrCodesAction, rotateTableQrCodeAction } from '@/lib/floor/qr-actions';
import { listTableQrCodes } from '@/lib/floor/qr';

export default async function Page() {
  await requirePermissionPage('floor.write');
  const rows = await listTableQrCodes();
  const origin = (process.env['NEXT_PUBLIC_STOREFRONT_URL'] ?? 'http://localhost:3001').replace(
    /\/$/,
    '',
  );
  const cards = await Promise.all(
    rows.map(async (row) => {
      const url = row.token === null ? null : `${origin}/t/${row.token}`;
      return {
        ...row,
        image:
          url === null
            ? null
            : await QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: 'M' }),
      };
    }),
  );
  const missing = cards.filter((card) => card.token === null).length;

  return (
    <div className="qr-admin-page">
      <PageHeading
        title="Table QR codes"
        note="Print one card per table. Scanned orders are assigned to that table; orders placed directly from the storefront remain Take Away."
        actions={
          <>
            {missing > 0 && (
              <form action={generateMissingTableQrCodesAction}>
                <Button type="submit">Generate {missing} missing</Button>
              </form>
            )}
            {cards.some((card) => card.image !== null) && <PrintButton />}
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.tableId}
            className="qr-print-card border-border bg-surface-raised rounded-base border p-5 text-center"
          >
            <p className="text-ink-muted text-sm">{card.zoneName}</p>
            <h2 className="mt-1 text-3xl font-bold">Table {card.tableCode}</h2>
            {card.image === null ? (
              <p className="text-ink-muted my-12 text-sm">No QR code generated</p>
            ) : (
              <>
                <Image
                  unoptimized
                  src={card.image}
                  alt={`Ordering QR code for table ${card.tableCode}`}
                  width={256}
                  height={256}
                  className="mx-auto my-3 size-64"
                />
                <p className="text-sm font-medium">Scan to view the menu and order</p>
              </>
            )}
            <form action={rotateTableQrCodeAction} className="qr-card-controls mt-4">
              <input type="hidden" name="tableId" value={card.tableId} />
              <Button type="submit" tone="ghost" size="sm">
                {card.token === null ? 'Generate code' : 'Replace code'}
              </Button>
            </form>
          </article>
        ))}
      </div>
    </div>
  );
}
