/** Size-specific assets for the consolidated beverage families. Other sizes use the parent image. */
export function variantImageUrl(sku: string | null, name: string): string | null {
  if (sku === null) return null;
  const sizes: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    BV01: {
      '345ml': 'drink-345ml.jpg',
      '500ml': 'drink-500ml.jpg',
      '1000ml': 'drink-1000ml.jpg',
      '1500ml': 'drink-1500ml.jpg',
    },
    BV07: { small: 'mineral-water-small.jpg', large: 'mineral-water-large.jpg' },
  };
  const asset = sizes[sku]?.[name.toLowerCase().replace(/\s+/g, '')];
  return asset ? `/images/${asset}` : null;
}
