# 0013 — offline TAX_DRIFT, check numbering, and print path

**Status:** accepted
**Date:** 2026-08-26
**Milestone:** M16

## Context

§8 leaves three things underspecified once earlier decisions are taken into
account:

1. It says client/server tax divergence "is logged to Sentry as `TAX_DRIFT`."
   ADR 0006 removed Sentry from scope and ADR 0011 already routed the one
   other §7 reference to Sentry (permanent fiscal failure) to the compliance
   dashboard plus an audit-trail-shaped record instead. §8 needs the same
   substitution; no milestone has made it yet.
2. It says `check_no` is "allocated client-side with a terminal prefix to
   avoid collision" but no column holds a per-terminal prefix — `pos_terminals`
   has no such field, and the one prefix that exists (`check_counter.prefix`,
   `'CHK-'`) is shared across every terminal by design (§5.7).
3. It does not say which print path an offline check or invoice uses. M15
   built the ESC/POS path's Urdu rasteriser (`@resvg/resvg-js`) as a
   server-side-only step (its own decision record: "executes in `apps/pos`'s
   server actions") — unreachable from a browser or a service worker, and
   therefore unreachable at all once the network that would carry the request
   to that server is the very thing that is down.

## Decision

1. **TAX_DRIFT is an audit-log row, not a Sentry issue.** `POST
/api/sync/orders` writes it inside the same transaction that recomputes the
   invoice: `entity: 'invoices'`, `entityId: <the new invoice id>`, `action:
'TAX_DRIFT'`, `before` the client's own reported totals
   (`clientGrandTotal`/`clientTaxTotal`/`clientEngineVersion`), `after` the
   server's recomputed `Totals`. This is the same "no paging system, a screen
   the owner checks" posture ADR 0011 already accepted for permanent fiscal
   failure — the audit trail is queryable and permanent, which a transient
   in-memory alert is not.
2. **The terminal's own `pos_terminals.label` is the collision-avoidance
   prefix.** It is already unique (`pos_terminals_label_idx`) and already
   reaches the till's client bundle (`PosShell`'s `terminalLabel` prop). An
   offline check number is minted as `CHK-OFF-<label>-<n>` — a prefix
   (`CHK-OFF-`) the server counter never produces, so an offline number can
   never collide with a server-allocated one, and no schema change is needed.
3. **Offline printing always uses the HTML_DIALOG path**, regardless of the
   terminal's configured `print.activePath` setting. The check and tax
   invoice React components already render correctly with no network (they
   are exactly what the HTML_DIALOG path already prints online); the ESC/POS
   buffer cannot be built without reaching the Next server for the Urdu raster
   step, so it is not offered as a choice while offline.

## Consequences

- An offline check number is legible as offline forever in the database
  (`CHK-OFF-…`), which is a feature for an audit, not a defect.
- A terminal relabelled after issuing offline checks keeps its old numbers
  distinguishable by the label at the time, since the string is stored, not
  looked up live.
- `TAX_DRIFT` is only as visible as the audit log — nobody is paged. Folding it
  into the nightly reconciliation email (`docs/decisions/0011-…`'s channel 2)
  is a natural extension, not built this milestone; carried forward the same
  way ADR 0011 itself carried "client-side error visibility" to before the M19
  pilot.
- A terminal whose configured print path is `BRIDGE_AGENT`/`WEB_USB` prints
  through HTML_DIALOG only while actually offline; the moment it reconnects,
  normal checks and invoices resume printing through its configured path.
