/**
 * @natech/domain — pure business logic.
 *
 * BUILD-PLAN.md §3, §6.
 *
 * Imports nothing from Next.js, React, or Drizzle, enforced by the
 * `natech/domain-purity` lint rule. The tax engine runs identically on the
 * server and inside the POS service worker; a framework import here breaks the
 * offline path (§8).
 */

// ---- money (R1, §6.10, §6.11) ------------------------------------------
export {
  ZERO,
  absolute,
  add,
  applyBps,
  divideHalfUp,
  isNegative,
  isZero,
  max,
  min,
  negate,
  paisa,
  parsePaisa,
  subtract,
  sum,
  type Paisa,
} from './money/paisa';

export { ONE, extend, parseQty, qty, qtyToString, whole, type Qty } from './money/quantity';

// ---- pricing (§6.3) ----------------------------------------------------
export {
  linesDiscountTotal,
  linesSubtotal,
  priceLine,
  priceLines,
  type LineModifier,
  type OrderLine,
  type PricedLine,
} from './pricing/lines';

// ---- customer (§5.11, ADR 0016, ADR 0022) -------------------------------
export { canonicalPhone, formatPhone } from './customer/phone';

// ---- tax (§6) ----------------------------------------------------------
export {
  ALL_PAYMENT_METHODS,
  DEFAULT_TAX_POLICY,
  type OrderType,
  type PaymentMethod,
  type RoundingDirection,
  type RoundingMode,
  type SplitPaymentTaxPolicy,
  type TaxClassKey,
  type TaxPolicy,
} from './tax/policy';

export { NoApplicableRateError, resolveRate, type ResolvedRate, type TaxRule } from './tax/rates';

export { allocateProportionally } from './tax/allocate';

export {
  EmptyOrderError,
  computeTotals,
  type ComputeInput,
  type PaymentSlice,
  type TaxLineResult,
  type Totals,
} from './tax/engine';

export {
  ENGINE_VERSION,
  buildTaxSnapshot,
  type SnapshotRule,
  type TaxSnapshot,
} from './tax/snapshot';

// ---- state machines (R4) -----------------------------------------------
export { IllegalTransitionError, defineMachine, type StateMachine } from './state-machines/machine';
export { orderMachine, type OrderStatus } from './state-machines/order';
export { tableMachine, type TableStatus } from './state-machines/table';
export { shiftMachine, type ShiftStatus } from './state-machines/shift';
export { demandSheetMachine, type DemandSheetStatus } from './state-machines/demand-sheet';
