import { describe, expect, it } from 'vitest';
import { IllegalTransitionError, defineMachine } from '../src/state-machines/machine';
import { orderMachine, type OrderStatus } from '../src/state-machines/order';
import { tableMachine, type TableStatus } from '../src/state-machines/table';
import { shiftMachine, type ShiftStatus } from '../src/state-machines/shift';
import { demandSheetMachine } from '../src/state-machines/demand-sheet';

/**
 * R4 — validate every state transition against an explicit machine and reject
 * illegal ones. BUILD-PLAN.md §2 R4, §5.6, §9.1, §10.4.
 */

describe('R4 — the order lifecycle', () => {
  it('treats an unknown persisted state as terminal', () => {
    const unknown = 'LEGACY' as OrderStatus;
    expect(orderMachine.can(unknown, 'DRAFT')).toBe(false);
    expect(orderMachine.next(unknown)).toEqual([]);
    expect(orderMachine.isTerminal(unknown)).toBe(true);
    expect(() => orderMachine.assert(unknown, 'DRAFT')).toThrow(/terminal state/);
  });

  it('runs the §6.2 happy path end to end', () => {
    const path: OrderStatus[] = ['DRAFT', 'PLACED', 'SERVED', 'FINALIZED'];
    for (let i = 1; i < path.length; i += 1) {
      expect(orderMachine.can(path[i - 1]!, path[i]!)).toBe(true);
    }
  });

  it('makes FINALIZED terminal — R5 as a state machine', () => {
    expect(orderMachine.isTerminal('FINALIZED')).toBe(true);
    // The way out of a finalized sale is a credit note plus a fresh invoice,
    // never an edit. Any transition here would be a second fiscal document.
    for (const to of ['DRAFT', 'SERVED', 'VOIDED'] as OrderStatus[]) {
      expect(orderMachine.can('FINALIZED', to)).toBe(false);
    }
  });

  it('makes VOIDED terminal', () => {
    expect(orderMachine.isTerminal('VOIDED')).toBe(true);
  });

  it('refuses to reopen a finalized order, with a readable reason', () => {
    expect(() => orderMachine.assert('FINALIZED', 'DRAFT')).toThrow(IllegalTransitionError);
    expect(() => orderMachine.assert('FINALIZED', 'DRAFT')).toThrow(
      /cannot move from FINALIZED to DRAFT/,
    );
    expect(() => orderMachine.assert('FINALIZED', 'DRAFT')).toThrow(/terminal state/);
  });

  it('refuses to skip from DRAFT straight to FINALIZED', () => {
    expect(() => orderMachine.assert('DRAFT', 'FINALIZED')).toThrow(IllegalTransitionError);
  });

  it('carries the entity and both states on the error', () => {
    try {
      orderMachine.assert('DRAFT', 'FINALIZED');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalTransitionError);
      const illegal = error as IllegalTransitionError;
      expect(illegal.entity).toBe('order');
      expect(illegal.from).toBe('DRAFT');
      expect(illegal.to).toBe('FINALIZED');
    }
  });

  it('lets a takeaway with nothing to cook go straight to SERVED', () => {
    expect(orderMachine.can('PLACED', 'SERVED')).toBe(true);
  });

  it('permits a void from every non-terminal state', () => {
    const nonTerminal: OrderStatus[] = ['DRAFT', 'PLACED', 'SERVED'];
    for (const state of nonTerminal) {
      expect(orderMachine.can(state, 'VOIDED')).toBe(true);
    }
  });
});

describe('R4 — the floor lifecycle', () => {
  it('runs the §9.1 service path', () => {
    const path: TableStatus[] = [
      'FREE',
      'SEATED',
      'ORDERED',
      'SERVED',
      'PAYING',
      'CLEANING',
      'FREE',
    ];
    for (let i = 1; i < path.length; i += 1) {
      expect(tableMachine.can(path[i - 1]!, path[i]!)).toBe(true);
    }
  });

  it('returns a no-show reservation to FREE', () => {
    expect(tableMachine.can('RESERVED', 'FREE')).toBe(true);
  });

  it('returns to SERVED when a payment is abandoned — ADR 0019', () => {
    // What happens when a card declines and the sheet is closed.
    expect(tableMachine.can('PAYING', 'SERVED')).toBe(true);
  });

  it('lets a served table order again', () => {
    expect(tableMachine.can('SERVED', 'ORDERED')).toBe(true);
  });

  it('can block a table from any state', () => {
    const states: TableStatus[] = [
      'FREE',
      'RESERVED',
      'SEATED',
      'ORDERED',
      'SERVED',
      'PAYING',
      'CLEANING',
    ];
    for (const state of states) {
      expect(tableMachine.can(state, 'BLOCKED')).toBe(true);
    }
  });

  it('only unblocks to FREE', () => {
    expect(tableMachine.next('BLOCKED')).toEqual(['FREE']);
  });

  it('refuses to seat a table that is still being cleaned', () => {
    expect(() => tableMachine.assert('CLEANING', 'ORDERED')).toThrow(
      /cannot move from CLEANING to ORDERED/,
    );
  });

  it('refuses to jump from FREE straight to PAYING', () => {
    expect(tableMachine.can('FREE', 'PAYING')).toBe(false);
  });

  it('has no terminal state — a table always comes back into service', () => {
    const states: TableStatus[] = [
      'FREE',
      'RESERVED',
      'SEATED',
      'ORDERED',
      'SERVED',
      'PAYING',
      'CLEANING',
      'BLOCKED',
    ];
    for (const state of states) {
      expect(tableMachine.isTerminal(state)).toBe(false);
    }
  });
});

describe('R4 — the shift lifecycle', () => {
  it('opens into closed', () => {
    expect(shiftMachine.can('OPEN', 'CLOSED')).toBe(true);
  });

  it('makes CLOSED terminal — no reopening a counted till', () => {
    expect(shiftMachine.isTerminal('CLOSED')).toBe(true);
    expect(shiftMachine.can('CLOSED', 'OPEN')).toBe(false);
  });

  it('refuses to close a shift that is already closed, with a readable reason', () => {
    expect(() => shiftMachine.assert('CLOSED', 'CLOSED')).toThrow(
      /cannot move from CLOSED to CLOSED/,
    );
  });

  it('lists CLOSED as the only permitted next state from OPEN', () => {
    const next: ShiftStatus[] = ['CLOSED'];
    expect(shiftMachine.next('OPEN')).toEqual(next);
  });
});

describe('R4 — the demand sheet lifecycle (ADR 0026)', () => {
  it('lets a draft be submitted or cancelled', () => {
    expect(demandSheetMachine.can('DRAFT', 'SUBMITTED')).toBe(true);
    expect(demandSheetMachine.can('DRAFT', 'CANCELLED')).toBe(true);
  });

  it('refuses to reopen a submitted sheet for editing', () => {
    // The freeze. A submitted sheet has been handed to somebody, so the way
    // back is a cancellation and a fresh sheet, never an edit — the same shape
    // R5 gives a finalized invoice and `shiftMachine` gives a counted till.
    expect(() => demandSheetMachine.assert('SUBMITTED', 'DRAFT')).toThrow(IllegalTransitionError);
  });

  it('refuses a double submit from a stale tab', () => {
    // Without this the second submit would overwrite the first `submitted_at`,
    // moving the time a document was handed over after the fact.
    expect(() => demandSheetMachine.assert('SUBMITTED', 'SUBMITTED')).toThrow(
      /cannot move from SUBMITTED to SUBMITTED/,
    );
  });

  it('makes CANCELLED terminal', () => {
    expect(demandSheetMachine.isTerminal('CANCELLED')).toBe(true);
    expect(demandSheetMachine.can('CANCELLED', 'DRAFT')).toBe(false);
  });

  it('has no RECEIVED state — receiving is the purchasing module ADR 0026 declines', () => {
    expect(Object.keys(demandSheetMachine.transitions)).toEqual([
      'DRAFT',
      'SUBMITTED',
      'CANCELLED',
    ]);
  });
});

describe('the machine helper itself', () => {
  const toy = defineMachine<'A' | 'B' | 'C'>('toy', { A: ['B'], B: ['C'], C: [] });

  it('reports the entity it guards', () => {
    expect(toy.entity).toBe('toy');
  });

  it('lists the permitted next states', () => {
    expect(toy.next('A')).toEqual(['B']);
    expect(toy.next('C')).toEqual([]);
  });

  it('exposes the transition table', () => {
    expect(toy.transitions.A).toEqual(['B']);
  });

  it('permits a legal transition silently', () => {
    expect(() => toy.assert('A', 'B')).not.toThrow();
  });

  it('names the permitted states in the error', () => {
    expect(() => toy.assert('A', 'C')).toThrow(/Permitted from A: B/);
  });
});
