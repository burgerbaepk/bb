import base, { domainPurity, strictPackage } from '@natech/config/eslint/base';

// §3 — this package must stay framework-free, and R11 admits no non-null
// assertions here.
export default [...base, domainPurity, strictPackage];
