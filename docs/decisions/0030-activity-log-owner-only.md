# 0030 — the activity log is for owners, not managers

**Status:** accepted
**Date:** 2026-09-25
**Milestone:** post-M23
**Amends:** [ADR 0027 (bill print accountability)](0027-bill-print-accountability.md),
which put `/admin/activity` behind `reports.read`. Adds one member,
`audit.read`, to the frozen `PermissionSchema` ([ADR 0008](0008-freeze-data-contracts.md)).
The change is additive, and it is recorded here rather than made silently.
There is no schema change and no migration.

## Context

The owner asked that the manager not be able to view the activity log.

ADR 0027 built the activity log so that the owner could watch the people who
handle the till's cash, and at this restaurant that is the manager. The live
records show the manager signing the terminal in with his own password and
working it all day. The back office runs as that account, so under
`reports.read` the manager could read the full record of his own voids, bill
prints and discounts, including the rows ADR 0029 flags in red. A control that
the person it watches can also read is weaker for it: that person learns
exactly what is recorded and when.

§14.1 gives a manager "all reports". The activity log is not a report. It is
the R7 audit trail itself.

## Decision

- A new permission, `audit.read`, gates `/admin/activity` and its link in the
  back-office menu.
- OWNER holds it through `*`, so no data change is needed.
- AUDITOR is granted it in the seed, because PSTSA s.32(2) gives an inspector
  full access to the electronic records.
- MANAGER is not granted it. The seed now says so in a comment, and
  `packages/db/test/roles.test.ts` asserts it.
- Everything else stays under `reports.read`, including the exceptions report,
  which a manager needs in order to run the floor, and the auditor pack, which
  shows only row counts.
- The daily Activity Summary email (ADR 0029) already goes only to OWNER
  accounts.

## Consequences

- A manager no longer sees "Activity log" in the back office. Opening the URL
  directly sends him to the back-office home with a "denied" notice.
- The live database needs no change for owners or managers. The AUDITOR role
  receives `audit.read` the next time `pnpm db:seed` runs. There are no
  auditor accounts today.
