import { describe, expect, it } from 'vitest';
import { hashSecret, isGuessablePin, isWellFormedPin, verifySecret } from '../src/hash';

describe('hashSecret / verifySecret', () => {
  it('verifies the secret it hashed', async () => {
    const stored = await hashSecret('correct horse battery staple');
    expect(await verifySecret('correct horse battery staple', stored)).toBe(true);
  });

  it('refuses a wrong secret', async () => {
    const stored = await hashSecret('correct horse battery staple');
    expect(await verifySecret('correct horse battery stapler', stored)).toBe(false);
  });

  it('salts, so two hashes of one secret differ', async () => {
    expect(await hashSecret('1234')).not.toBe(await hashSecret('1234'));
  });

  it('records its parameters, so the cost can be raised later', async () => {
    expect((await hashSecret('1234')).startsWith('scrypt$16384$8$1$')).toBe(true);
  });

  it('normalises unicode, so a keyboard that composes differently still verifies', async () => {
    const stored = await hashSecret('café-\u0041\u030A');
    expect(await verifySecret('caf\u0065\u0301-\u00C5', stored)).toBe(true);
  });

  it('returns false rather than throwing on a corrupt or absent stored value', async () => {
    expect(await verifySecret('1234', null)).toBe(false);
    expect(await verifySecret('1234', '')).toBe(false);
    expect(await verifySecret('1234', 'not-a-hash')).toBe(false);
    expect(await verifySecret('1234', 'scrypt$x$8$1$AAAA$AAAA')).toBe(false);
    expect(await verifySecret('1234', 'bcrypt$16384$8$1$AAAA$AAAA')).toBe(false);
  });
});

describe('PIN shape — §14.2', () => {
  it('accepts 4 to 6 digits and nothing else', () => {
    expect(isWellFormedPin('1357')).toBe(true);
    expect(isWellFormedPin('135790')).toBe(true);
    expect(isWellFormedPin('135')).toBe(false);
    expect(isWellFormedPin('1357902')).toBe(false);
    expect(isWellFormedPin('13a7')).toBe(false);
    expect(isWellFormedPin(' 1357')).toBe(false);
  });

  it('rejects the PINs a shared till converges on', () => {
    expect(isGuessablePin('1111')).toBe(true);
    expect(isGuessablePin('1234')).toBe(true);
    expect(isGuessablePin('123456')).toBe(true);
    expect(isGuessablePin('4321')).toBe(true);
    expect(isGuessablePin('2026')).toBe(true);
    expect(isGuessablePin('1984')).toBe(true);
    expect(isGuessablePin('4715')).toBe(false);
    expect(isGuessablePin('907213')).toBe(false);
  });
});
