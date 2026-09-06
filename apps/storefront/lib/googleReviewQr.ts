import 'server-only';
import { cache } from 'react';
import QRCode from 'qrcode';

/**
 * The review QR — kept in its own module because `qrcode` is a Node-only
 * dependency: `googleReview.ts` beside it is a pure string builder that the
 * jsdom test environment has to be able to import without pulling this in.
 *
 * A PNG data URL, rendered on the server so the footer costs no client
 * JavaScript and no third-party image request. `cache()` because the layout
 * renders on every route and the input changes about once a year.
 *
 * `margin: 1` not the default 4: the code sits in a small fixed box, and four
 * modules of quiet zone shrink the payload area until a phone camera has to be
 * held uncomfortably close.
 */
export const googleReviewQr = cache(async (url: string): Promise<string> =>
  QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: { dark: '#000000ff', light: '#ffffffff' },
  }),
);
