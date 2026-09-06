/**
 * The §4 secret, for the suite only. Not a real key: `env.ts` derives from
 * whatever string arrives, so the tests need length, not entropy.
 */
process.env['AUTH_SECRET'] = 'test-auth-secret-000000000000000000000000';
process.env['ENCRYPTION_KEY'] = 'test-encryption-key-00000000000000000000';
