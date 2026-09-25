import { describe, expect, it } from 'vitest';
import { parseQty } from '@natech/domain';
import {
  collectCounts,
  movementDelta,
  onHand,
  refuseMovement,
  showQty,
  type CountEntry,
  type MovementRequest,
} from './ledger';

/**
 * The stock ledger — ADR 0034, docs/runfiles/M28-stock-ledger.md §4.
 *
 * Asserted against the store-room book: the figures are what a manager would
 * write for the same week.
 */

const q = parseQty;

describe('on-hand (gate 1)', () => {
  it('is the exact sum of deltas, fractions included', () => {
    // 20 kg in, 0.1 kg out ten times, a count finding 18.9: the book is 19.000
    // before the count and 18.900 after, with no float drift in between.
    const deltas = [q('20'), ...Array.from({ length: 10 }, () => q('-0.1'))];
    expect(showQty(onHand(deltas))).toBe('19');
    const variance = movementDelta('COUNTED', q('18.9'), onHand(deltas));
    expect(showQty(variance)).toBe('-0.1');
    expect(showQty(onHand([...deltas, variance]))).toBe('18.9');
  });
});

describe('deltas (gate 2)', () => {
  it('signs each kind and makes a count the variance against the book', () => {
    expect(movementDelta('RECEIVED', q('5'), q('2'))).toBe(q('5'));
    expect(movementDelta('ISSUED', q('5'), q('9'))).toBe(q('-5'));
    expect(movementDelta('WASTED', q('0.25'), q('9'))).toBe(q('-0.25'));
    expect(movementDelta('COUNTED', q('12'), q('9'))).toBe(q('3'));
    expect(movementDelta('COUNTED', q('0'), q('9'))).toBe(q('-9'));
  });
});

const move = (over: Partial<MovementRequest>): MovementRequest => ({
  name: 'Chicken',
  kind: 'ISSUED',
  quantity: q('4'),
  book: q('4'),
  unit: 'kg',
  note: null,
  occurredOn: '2026-09-25',
  today: '2026-09-25',
  ...over,
});

describe('refusals (gate 3)', () => {
  it('issues down to exactly zero, and refuses a gram more', () => {
    expect(refuseMovement(move({}))).toBeNull();
    expect(refuseMovement(move({ quantity: q('4.001') }))).toBe(
      'Chicken: the book shows 4 kg. Record the delivery, or count it first.',
    );
  });

  it('needs a reason for waste, a unit for anything, and no future date', () => {
    expect(refuseMovement(move({ kind: 'WASTED' }))).toMatch(/why/);
    expect(refuseMovement(move({ kind: 'WASTED', note: 'Spoiled' }))).toBeNull();
    expect(refuseMovement(move({ unit: null }))).toMatch(/unit first/);
    expect(refuseMovement(move({ kind: 'RECEIVED', occurredOn: '2026-09-26' }))).toMatch(/future/);
  });

  it('lets a receipt be back-dated, but not a count', () => {
    expect(refuseMovement(move({ kind: 'RECEIVED', occurredOn: '2026-09-20' }))).toBeNull();
    expect(refuseMovement(move({ kind: 'COUNTED', occurredOn: '2026-09-20' }))).toMatch(/today/);
    expect(refuseMovement(move({ kind: 'COUNTED', quantity: q('0'), book: q('7') }))).toBeNull();
    expect(refuseMovement(move({ kind: 'RECEIVED', quantity: q('0') }))).toMatch(
      /greater than zero/,
    );
  });
});

const box = (over: Partial<CountEntry>): CountEntry => ({
  itemId: 'i1',
  name: 'Chicken',
  savedUnit: 'kg',
  rawQty: '',
  rawUnit: '',
  ...over,
});

describe('the count sheet (gate 4)', () => {
  it('treats zero as a count and blank as not counted', () => {
    const { lines, errors } = collectCounts([
      box({ itemId: 'a', rawQty: '0' }),
      box({ itemId: 'b', rawQty: '' }),
      box({ itemId: 'c', rawQty: ' 2.5 ' }),
    ]);
    expect(errors).toEqual([]);
    expect(lines.map((line) => [line.itemId, showQty(line.quantity)])).toEqual([
      ['a', '0'],
      ['c', '2.5'],
    ]);
  });

  it('takes a unit only for an item without one, and names a bad box', () => {
    const { lines, errors } = collectCounts([
      box({ name: 'Buns', savedUnit: null, rawQty: '40', rawUnit: 'piece' }),
      box({ name: 'Oil', savedUnit: 'litre', rawQty: '3', rawUnit: 'kg' }),
      box({ name: 'Salt', rawQty: 'lots' }),
    ]);
    expect(lines.map((line) => [line.name, line.unit, line.newUnit])).toEqual([
      ['Buns', 'piece', 'piece'],
      ['Oil', 'litre', null],
    ]);
    expect(errors).toEqual(['Salt: "lots" is not a quantity.']);
  });
});
