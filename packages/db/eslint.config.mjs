import base, { strictPackage } from '@natech/config/eslint/base';

// R11 — zero non-null assertions in this package.
export default [...base, strictPackage];
