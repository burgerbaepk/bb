# M31 · attendance — fewer touches per day

**Milestone:** M31 · **Phase:** 3 — Hardening
**Plan reference:** [ADR 0032](../decisions/0032-staff-register-and-attendance.md) —
unchanged; this milestone changes the screen, not the book.
**Preceding gate:** [M30](./M30-customer-accounts.md), same session (see M29's
session note on §0 rule 1).

---

## 1. Purpose

The product owner asked for the attendance module to be checked and made
easy. The book (M26) was sound; filling it in was slow. Every person needed a
dropdown, two typed times and a save, every day, and the month showed counts
with no way to see which day was which.

## 2. Scope

**In:**

- `apps/pos/components/admin/AttendanceRegister.tsx` — rewritten as a
  controlled form with the same posted field names.
- `apps/pos/components/admin/AttendanceMonthGrid.tsx` — new.
- `apps/pos/lib/attendance/register.ts` — `withStatus`, `markRestPresent`,
  `shiftDate`, the status letters and tones (+ tests).
- `apps/pos/lib/attendance/queries.ts` — `readUsualTimes`; month rows carry
  their date.
- `apps/pos/app/admin/attendance/page.tsx`.

**Out, and why:** self clock-in from the till and anything about pay — ADR
0032, unchanged.

## 3. Decisions

- **One tap per status** (P / A / L / Off), a second tap clears it.
- **Present fills the person's usual times** — their latest times in the last
  sixty days — unless times are already typed. Any other status clears the
  times, because the save refuses times on an absence.
- **"Everyone else present"** marks every unmarked row present with usual
  times, leaving rows already tapped alone. Absences first, then one button.
- **"Now"** stamps the clock on today's register for someone walking in.
- **Previous / next day / today** links; the date stays in the URL.
- **A month grid** — person × day, a letter per marked day, counts and hours
  per row from `summariseMonth` over the same rows (R16). Printable.
- **The save action is untouched.** The form posts exactly M26's fields, so
  every refusal rule, the audit behaviour and the "unchanged rows write
  nothing" property hold as before.
- **The register is keyed by date in the page,** so taps on one day can never
  carry into the next.

## 4. Gate

| #   | Assertion                                                 | Method                         | Result      |
| --- | --------------------------------------------------------- | ------------------------------ | ----------- |
| 1   | Present fills usual times; an absence clears times        | `register.test.ts`             | **PASS**    |
| 2   | What the buttons produce is accepted by `collectRegister` | `register.test.ts`             | **PASS**    |
| 3   | "Everyone else present" leaves marked rows alone          | `register.test.ts`             | **PASS**    |
| 4   | Day stepping crosses month ends                           | `register.test.ts`             | **PASS**    |
| 5   | `pnpm run ci` green; build                                | CI (311 POS tests); build      | **PASS**    |
| 6   | A real day marked with the new screen                     | Signed-in manager on the pilot | **CARRIED** |
