import { describe, expect, it } from 'vitest';
import { matchCategory } from './categories';

describe('matchCategory — M32, one category one spelling', () => {
  const existing = ['Influencers', 'Utilities'];

  it('reuses the existing spelling whatever the case and spacing', () => {
    expect(matchCategory(existing, 'utilities')).toBe('Utilities');
    expect(matchCategory(existing, '  UTILITIES ')).toBe('Utilities');
    expect(matchCategory(['Gas  bill'], 'gas bill')).toBe('Gas  bill');
  });

  it('keeps a genuinely new category, tidied', () => {
    expect(matchCategory(existing, '  Repairs   and  upkeep ')).toBe('Repairs and upkeep');
  });
});
