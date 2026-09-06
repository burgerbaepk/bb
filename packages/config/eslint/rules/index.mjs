/**
 * eslint-plugin-natech — mechanical enforcement of the BUILD-PLAN §2 rules
 * that a linter can see. Rules whose real enforcement is a database constraint
 * or a snapshot test say so in their header, and name the milestone that
 * completes them.
 */
import noFloatMoney from './no-float-money.mjs';
import noNegativeDuration from './no-negative-duration.mjs';
import noPhysicalDirection from './no-physical-direction.mjs';

export const rules = {
  'no-float-money': noFloatMoney,
  'no-negative-duration': noNegativeDuration,
  'no-physical-direction': noPhysicalDirection,
};

export default {
  meta: { name: 'eslint-plugin-natech', version: '0.0.0' },
  rules,
};
