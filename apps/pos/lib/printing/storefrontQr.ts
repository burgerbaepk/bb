import QRCode from 'qrcode';
import { SeoSettingsSchema } from '@natech/branding';

/** Shared modules keep browser and thermal output identical, with a four-module quiet zone. */
export function storefrontQr(url: string | null | undefined) {
  const parsed = SeoSettingsSchema.shape.siteUrl.safeParse(url ?? '');
  if (!parsed.success || parsed.data === '') return null;
  try {
    const { modules } = QRCode.create(parsed.data, { errorCorrectionLevel: 'M' });
    return { url: parsed.data, modules, margin: 4, size: modules.size + 8 };
  } catch {
    // An unusable QR payload must not prevent an invoice from printing.
    return null;
  }
}
