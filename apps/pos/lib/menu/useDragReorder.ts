'use client';

import { useCallback, useState, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Pointer-based list reordering — BUILD-PLAN.md M08 runfile "Drag-reorder
 * persistence". The same pointer-event technique `FloorEditor` uses for
 * table dragging (`onPointerDown` selects, a container-level `onPointerMove`
 * carries the drag), adapted from a 2-D grid to a 1-D list, and driven by
 * pointer events rather than mouse events because this runs on a tablet in a
 * working kitchen.
 *
 * The list reorders live, in local state, as the pointer crosses another
 * row's midpoint. Nothing is written until the pointer lifts, when `onCommit`
 * fires once with the final id order — `actions.ts`'s reorder functions then
 * re-sequence `sort_order` as one transaction with one audit row, per the
 * runfile's "writes a full re-sequence" decision.
 *
 * `visible` tracks the server's `items` prop until a drag starts, and reverts
 * to tracking it again once that prop's order actually matches what was
 * committed — confirmation the write landed and a later `revalidatePath`
 * refresh arrived — rather than snapping back to the pre-drag order the
 * instant the pointer lifts, which is what naively clearing the local draft
 * would do.
 */
function sameIdOrder<T>(a: readonly T[], b: readonly T[], getId: (item: T) => string): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => getId(item) === getId(b[index] as T));
}

export interface DragReorderResult<T> {
  /** What to render: the live drag order while dragging, the server order otherwise. */
  readonly visible: readonly T[];
  readonly draggingId: string | null;
  /** Spread onto each row's handle: `<span {...rowHandleProps(id)}>`. */
  rowHandleProps(id: string): {
    readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  };
  /** Spread onto the list container. */
  readonly containerProps: {
    readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  };
  readonly pending: boolean;
}

export function useDragReorder<T>(
  items: readonly T[],
  getId: (item: T) => string,
  onCommit: (orderedIds: readonly string[]) => Promise<{ readonly error: string | null }>,
): DragReorderResult<T> {
  const [draftOrder, setDraftOrder] = useState<readonly T[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Adjusted during render, not in an Effect — React's own documented pattern
  // for resetting state in response to a prop change ("Adjusting state when a
  // prop changes", react.dev). `lastSeenItems` guards it to fire once per
  // actual change in `items` rather than on every render, which is what makes
  // it safe to call `setState` here: React discards this render and starts
  // over immediately with the adjusted state, before anything commits.
  const [lastSeenItems, setLastSeenItems] = useState(items);
  if (items !== lastSeenItems) {
    setLastSeenItems(items);
    if (draftOrder !== null && sameIdOrder(items, draftOrder, getId)) {
      setDraftOrder(null);
    }
  }

  const rowHandleProps = useCallback(
    (id: string) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDraggingId(id);
        setDraftOrder((current) => current ?? items);
      },
    }),
    [items],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (draggingId === null) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const overId =
        target instanceof Element
          ? target.closest<HTMLElement>('[data-drag-id]')?.dataset['dragId']
          : undefined;
      if (overId === undefined || overId === draggingId) return;

      setDraftOrder((current) => {
        const base = current ?? items;
        const from = base.findIndex((item) => getId(item) === draggingId);
        const to = base.findIndex((item) => getId(item) === overId);
        if (from === -1 || to === -1 || from === to) return current;
        const next = base.slice();
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved as T);
        return next;
      });
    },
    [draggingId, items, getId],
  );

  const endDrag = useCallback(() => {
    if (draggingId === null) return;
    setDraggingId(null);

    setDraftOrder((current) => {
      if (current === null) return current;
      setPending(true);
      void onCommit(current.map(getId)).then((result) => {
        setPending(false);
        // Refused (a stale population, a permission pulled mid-drag): fall
        // back to the server's order rather than leave the screen showing
        // one nothing agrees with.
        if (result.error !== null) setDraftOrder(null);
      });
      return current;
    });
  }, [draggingId, onCommit, getId]);

  return {
    visible: draftOrder ?? items,
    draggingId,
    rowHandleProps,
    containerProps: { onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag },
    pending,
  };
}
