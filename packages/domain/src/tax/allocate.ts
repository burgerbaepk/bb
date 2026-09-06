import { divideHalfUp, paisa, subtract, sum, ZERO, type Paisa } from '../money/paisa';

/**
 * Proportional allocation — BUILD-PLAN.md §6.6.
 *
 * Splits an amount across weighted slices so that the slices always sum back to
 * exactly the amount. That last property is the whole point: an allocation that
 * loses a paisa to rounding produces an invoice whose parts do not add up to its
 * total, which §6.11 requires be exact for transmission and which an inspector
 * would notice immediately.
 *
 * Every slice but the last is rounded half away from zero; the last absorbs the
 * remainder. The residual is at most one paisa per slice, and it lands on the
 * largest weight rather than the last one, so it is never visible as a
 * systematic bias against a particular payment method.
 */
export function allocateProportionally(total: Paisa, weights: readonly Paisa[]): readonly Paisa[] {
  if (weights.length === 0) return [];
  if (weights.length === 1) return [total];

  const weightTotal = sum(weights);

  // Nothing to weigh by — a zero-value order, or payments that have not been
  // recorded yet. Put the whole amount on the first slice rather than dividing
  // by zero.
  if (weightTotal === 0n) {
    return weights.map((_, index) => (index === 0 ? total : ZERO));
  }

  const shares = weights.map((weight) => paisa(divideHalfUp(total * weight, weightTotal)));

  // Give the rounding residual to the largest slice. On a 3-way split of an odd
  // amount that is a paisa; putting it on the biggest share keeps it
  // proportionally smallest.
  const residual = subtract(total, sum(shares));
  if (residual === 0n) return shares;

  let largest = 0;
  for (let i = 1; i < weights.length; i += 1) {
    if ((weights[i] as Paisa) > (weights[largest] as Paisa)) largest = i;
  }

  return shares.map((share, index) => (index === largest ? paisa(share + residual) : share));
}
