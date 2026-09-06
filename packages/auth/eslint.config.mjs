import base, { strictPackage } from '@natech/config/eslint/base';

// R11 — zero non-null assertions in a package that decides who may do what.
export default [...base, strictPackage];
