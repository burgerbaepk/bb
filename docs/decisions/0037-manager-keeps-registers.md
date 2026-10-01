# 0037 — the manager keeps the staff and supplier registers

**Status:** accepted
**Date:** 2026-10-01
**Amends:** [ADR 0032](0032-staff-register-and-attendance.md) (the staff
register was owner-only) and [ADR 0035](0035-purchasing-and-suppliers.md) (the
supplier register was owner-only). No schema change, no frozen contract change.

## Context

ADR 0032 and ADR 0035 kept the register of employees and the register of
suppliers with the owner (`staff.write`), so that the hand paying an advance or
a bill could not also create the person or supplier being paid. On
2026-10-01 the product owner asked that a manager be able to add employees,
mark attendance, and do everything on the supplier side. In this restaurant
the manager runs the day; an owner-only register meant new staff and new
suppliers waited for the owner.

## Decision

Both registers move to `expenses.write`, which OWNER and MANAGER hold and
CASHIER, WAITER and AUDITOR do not:

- `/admin/employees` and its three actions (add, edit, deactivate);
- adding, editing and deactivating suppliers.

Attendance, advances, purchase orders, bills and supplier payments were
already `expenses.write` and are unchanged. User accounts (`/admin/staff`),
terminals and customer credit accounts stay owner-only.

## Consequences

- **The separation of duties is gone, and this records that it is.** One
  manager can now create an employee and pay them an advance, or create a
  supplier, post a bill and pay it. The control that remains is detective, not
  preventive: every one of those writes is an audit row, and the activity log
  (ADR 0030) is owner-only. The owner should read it for `EMPLOYEE_CREATED` and
  `SUPPLIER_CREATED` followed by a payment.
- A cashier still cannot mark attendance or touch either register.
