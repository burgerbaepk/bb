import { describe, expect, it } from 'vitest';
import { googleReviewUrl } from '@/lib/googleReview';
import type { OutletProfile } from '@/lib/outlet';

const outlet = (googlePlaceId: string | null): OutletProfile => ({
  tradingName: '',
  legalName: '',
  address: '',
  city: '',
  phone: '',
  email: null,
  timezone: 'Asia/Karachi',
  latitude: null,
  longitude: null,
  storeOpen: null,
  storeClose: null,
  googlePlaceId,
  googleRating: null,
  googleReviewCount: null,
});

describe('googleReviewUrl', () => {
  // An unconfigured outlet must render no QR at all. The failure this guards
  // against is a footer that points every deployment at whichever listing was
  // hardcoded first — R12.
  it('is null when no place ID is configured', () => {
    expect(googleReviewUrl(outlet(null))).toBeNull();
    expect(googleReviewUrl(outlet(''))).toBeNull();
  });

  it('opens the review composer for a configured listing', () => {
    expect(googleReviewUrl(outlet('ChIJexample'))).toBe(
      'https://search.google.com/local/writereview?placeid=ChIJexample',
    );
  });

  // Place IDs are base64url and can end in characters a raw interpolation
  // would leave to be read as URL syntax.
  it('escapes the place ID', () => {
    expect(googleReviewUrl(outlet('a&b=c'))).toContain('placeid=a%26b%3Dc');
  });
});
