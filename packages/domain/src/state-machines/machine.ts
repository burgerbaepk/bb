/**
 * State machine helper — BUILD-PLAN.md §2 R4.
 *
 * R4: validate every state transition server-side against an explicit state
 * machine, and reject illegal transitions.
 *
 * The reason it is explicit rather than implied by a series of if-statements is
 * that the illegal transitions are the interesting ones. A table going from
 * CLEANING straight back to ORDERED means an order was attached to a table
 * nobody sat at; an order going from FINALIZED back to DRAFT means someone is
 * editing a transmitted fiscal document. Both should be refusals with a
 * readable reason, not silent writes.
 *
 * Every caller reaches this with an unchecked cast (`row.status as
 * OrderStatus`) — the type system cannot verify a value that came out of the
 * database, only out of this process. A row written under an enum this
 * machine has since narrowed (a status a migration removed, read before that
 * migration ran) is exactly the kind of value that cast cannot catch, so
 * `transitions[from]` is treated as absent — no legal transitions — rather
 * than trusted to exist, the one point this machine actually receives that
 * untrusted string.
 */

export class IllegalTransitionError extends Error {
  readonly entity: string;
  readonly from: string;
  readonly to: string;

  constructor(entity: string, from: string, to: string, allowed: readonly string[]) {
    const permitted = allowed.length === 0 ? 'nothing (terminal state)' : allowed.join(', ');
    super(`${entity}: cannot move from ${from} to ${to}. Permitted from ${from}: ${permitted}.`);
    this.name = 'IllegalTransitionError';
    this.entity = entity;
    this.from = from;
    this.to = to;
  }
}

export interface StateMachine<S extends string> {
  readonly entity: string;
  readonly transitions: Readonly<Record<S, readonly S[]>>;
  can: (from: S, to: S) => boolean;
  assert: (from: S, to: S) => void;
  next: (from: S) => readonly S[];
  isTerminal: (state: S) => boolean;
}

export function defineMachine<S extends string>(
  entity: string,
  transitions: Readonly<Record<S, readonly S[]>>,
): StateMachine<S> {
  return {
    entity,
    transitions,
    can: (from, to) => (transitions[from] ?? []).includes(to),
    assert: (from, to) => {
      const allowed = transitions[from] ?? [];
      if (!allowed.includes(to)) {
        throw new IllegalTransitionError(entity, from, to, allowed);
      }
    },
    next: (from) => transitions[from] ?? [],
    isTerminal: (state) => (transitions[state] ?? []).length === 0,
  };
}
