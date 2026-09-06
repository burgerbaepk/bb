import { describe, expect, it } from 'vitest';
import { variantImageUrl } from './images';

describe('consolidated variant images', () => {
  it('resolves beverage sizes independently of the parent photo', () => {
    expect(variantImageUrl('BV01', '500 ML')).toBe('/images/drink-500ml.jpg');
    expect(variantImageUrl('BV01', '1500 ML')).toBe('/images/drink-1500ml.jpg');
    expect(variantImageUrl('BV07', 'Large')).toBe('/images/mineral-water-large.jpg');
  });
  it('leaves unknown products and sizes to the parent fallback', () => {
    expect(variantImageUrl(null, '500 ML')).toBeNull();
    expect(variantImageUrl('BV01', 'Other')).toBeNull();
    expect(variantImageUrl('BV05', '500 ML')).toBeNull();
  });
});
