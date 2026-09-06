import { storefrontQr } from '@/lib/printing/storefrontQr';

export function OrderOnlineQr({ url }: { readonly url?: string | null | undefined }) {
  const qr = storefrontQr(url);
  if (qr === null) return null;
  const cells: string[] = [];
  for (let y = 0; y < qr.modules.size; y += 1) {
    for (let x = 0; x < qr.modules.size; x += 1) {
      if (qr.modules.get(y, x)) cells.push(`M${x + qr.margin} ${y + qr.margin}h1v1h-1z`);
    }
  }
  return (
    <div
      className="my-3 break-inside-avoid text-center"
      // brand-grep-allow — a QR is not brandable. ISO/IEC 18004 decoding
      // wants maximum luminance contrast, and a thermal printer renders a
      // tinted "black" as a dither pattern that breaks module edges. Pure
      // black on pure white, everywhere, whatever the outlet's palette.
      style={{ color: '#000', background: '#fff' }} // brand-grep-allow
    >
      <p className="text-sm font-bold">Order Online</p>
      <a href={qr.url} aria-label="Visit our online ordering website" className="inline-block">
        <svg
          role="img"
          aria-label="Scan to order online"
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${qr.size} ${qr.size}`}
          shapeRendering="crispEdges"
          style={{ display: 'block', width: '32mm', height: '32mm' }}
        >
          <rect width={qr.size} height={qr.size} fill="#fff" /> {/* brand-grep-allow */}
          <path d={cells.join('')} fill="#000" /> {/* brand-grep-allow */}
        </svg>
      </a>
    </div>
  );
}
