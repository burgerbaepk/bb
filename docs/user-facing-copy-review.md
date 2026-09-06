# User-facing copy review

Updated 40 passages across 16 application files. Changes affect copy only; permissions, billing calculations, and workflows are unchanged.

Reviewed POS, admin, storefront, and settings text for internal specification references, draft language, and implementation details. Internal code comments and the developer design-system reference were excluded. Relevant legal references in tax settings and audit records were preserved.

## Changes

### `apps/pos/components/admin/StaffManager.tsx`

| Before                                                                                                                                           | After                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| A terminal is bound for the shift; a person is identified by a PIN per till action. Both halves have to be managed for a shared till to be safe. | Manage staff accounts, roles, and PINs for access to shared tills.                             |
| They sign in with an email and a password. A till PIN comes afterwards.                                                                          | Create a staff account, then set up a PIN for till access.                                     |
| §14.1 fixes what each role may do. A role change takes effect on their next action.                                                              | Choose the access this person needs. Role changes apply from their next action.                |
| At least 12 characters. Hand it over in person and have them change it.                                                                          | Use at least 12 characters. Share the password securely and ask the staff member to change it. |
| 4 to 6 digits. Not a run, a repeat, or a year.                                                                                                   | Use 4 to 6 digits. Avoid consecutive or repeated digits and years.                             |

### `apps/pos/components/admin/TerminalsManager.tsx`

| Before                                                                                                                                           | After                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Every till that can be signed in to has to be registered here first — this is the list §14.2's terminal picker on the lock screen is drawn from. | Register and manage the tills available at sign-in.     |
| Every till that will bind a shift has to exist here first (§14.2).                                                                               | Register a till so staff can select it when signing in. |

### `apps/pos/components/admin/MenuManager.tsx`

| Before                                                                                                                                                    | After                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Prices are tax-exclusive. A size is a variant on one item, never a second tile. Drag a row to reorder it; the new order is written the moment you let go. | Manage menu items, sizes, and prices before tax. Drag rows to reorder them; changes save automatically. |
| Image placeholder                                                                                                                                         | No image added                                                                                          |
| Standard food and beverage is the rate that depends on payment method (§6.7).                                                                             | For standard food and beverages, the tax rate depends on the payment method.                            |
| Tax is added at payment: 16% on cash, 8% on card and digital. Never enter a tax-inclusive price.                                                          | Enter the price before sales tax. The applicable tax is added at payment.                               |

### `apps/pos/components/admin/ModifierBuilder.tsx`

| Before                                                                                                                                   | After                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Modifiers and notes are the loudest thing on an order line. They are what turns a line into an instruction staff can follow.             | Manage item options, extras, and their prices to help staff prepare each order.                                                  |
| A modifier price is charged once per line, not once per unit (§6.3) — three portions with extra butter are charged for one extra butter. | Extras are charged once per order line. For example, three portions on one line with extra butter incur one extra-butter charge. |
| Charged once per line, not once per unit (§6.3).                                                                                         | Charged once per order line, regardless of quantity.                                                                             |

### `apps/pos/components/shift/ShiftScreen.tsx`

| Before                                                      | After                                                       |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| Shift close is blocked while this terminal is offline (§8). | Connect this till to the internet before closing the shift. |

### `apps/pos/components/admin/SettingsRegistry.tsx`

| Before                                                                                                                  | After                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| This setting is audited at the highest level. The reason is stored beside the change.                                   | Enter a reason for this change. Your name and reason will be saved in the change history. |
| At least a sentence. It is written to setting_history against your name and read by whoever asks about this rate later. | Explain why this setting needs to change (at least 8 characters).                         |
| Punjab Finance Act 2026 reduced the card rate from 1 July.                                                              | Describe the reason for this change.                                                      |

### `apps/pos/components/admin/FloorEditor.tsx`

| Before                                                                                                                         | After                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Positions are stored on the logical grid, never in pixels, so the same plan reads correctly on a tablet and on a desk monitor. | Arrange tables and zones to match your restaurant. Save the layout when you are finished. |
| This only takes effect once the layout is saved. Discard changes undoes it just as well.                                       | Save the layout to apply this removal, or discard changes to keep the table.              |
| A name and a grid size. Tables are added to it afterwards.                                                                     | Name the zone and choose its grid size, then add tables.                                  |

### `apps/pos/components/admin/DemandSheetList.tsx`

| Before                                                   | After                              |
| -------------------------------------------------------- | ---------------------------------- |
| Free text. There is no supplier list to keep up to date. | Enter the supplier name, if known. |

### `apps/pos/components/admin/TopItems.tsx`

| Before                                                          | After                                   |
| --------------------------------------------------------------- | --------------------------------------- |
| No finalized invoice in the last ${days} days has a line on it. | No items sold in the last ${days} days. |

### `apps/pos/components/admin/reports/FloorReport.tsx`

| Before                                                                                                    | After                                                                                      |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Turns, dwell, covers, revenue per seat-hour, and dead-table time — all of it derived from table sessions. | Review table turnover, visit duration, guest counts, revenue per seat-hour, and idle time. |

### `apps/pos/components/admin/reports/ExceptionsReport.tsx`

| Before                                                                                       | After                                                                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Voids, discounts, price overrides, and declined card attempts. Every row carries who did it. | Review voids, discounts, price overrides, and declined card attempts, including the staff member responsible. |

### `apps/pos/components/admin/reports/AuditorPackReport.tsx`

| Before                                                                                                     | After                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A read-only, date-ranged export satisfying PSTSA s.32(2). Generated server-side behind a permission check. | Review invoice counts, tax totals, and record counts for a date range. Export the summary for audit preparation. |
| The pack is read-only. There is no route by which this screen can alter a record.                          | Records can only be viewed on this screen.                                                                       |
| AUDITOR role                                                                                               | Read-only access                                                                                                 |

### `apps/pos/app/admin/reports/page.tsx`

| Before                                                                                                | After                                                                                  |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Every export is generated server-side behind a permission check. Nothing is assembled in the browser. | Review sales, taxes, shifts, and floor performance. Choose a report to view or export. |
| A read-only, date-ranged export satisfying PSTSA s.32(2).                                             | Review and export a summary of records for audit preparation.                          |

### `apps/pos/lib/auth/actions/staff.ts`

| Before                          | After                         |
| ------------------------------- | ----------------------------- |
| A PIN is 4 to 6 digits (§14.2). | Use a PIN with 4 to 6 digits. |

### `apps/pos/lib/menu/image-upload.ts`

| Before                                                        | After                                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Menu image uploads are disabled. A placeholder will be shown. | Menu image uploads are unavailable. Items will display without a photo. |

### `apps/pos/lib/settings/registry.ts`

| Before                                                                                                                                                                                                                | After                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Pending P4 — a written opinion from the tax advisor under s.7(1), whose Explanation covers charges by whatever name called. If it comes back the other way, every invoice issued in the meantime understated the tax. | Include the service charge when calculating sales tax. Confirm the correct treatment with your tax advisor.    |
| Also pending P4. Whether the fixed per-invoice fee forms part of the taxable base.                                                                                                                                    | Include the fixed POS fee when calculating sales tax. Confirm the correct treatment with your tax advisor.     |
| Rounding happens once, on the grand total, and the movement is written to rounding_adj. Tax lines are never rounded twice.                                                                                            | Round the final bill total and record the difference as a rounding adjustment.                                 |
| Which way the grand total moves when rounding applies. Half up rounds to the nearest; up and down always favour one side.                                                                                             | Choose how to round the final total. Half up rounds to the nearest increment, with halfway amounts rounded up. |
| Active print path                                                                                                                                                                                                     | Receipt printing method                                                                                        |
| The bridge agent owns the queue, paper-out handling, and offline buffering; the other two are fallbacks.                                                                                                              | Choose how this till sends receipts to the printer.                                                            |
| 80mm HTML print dialog                                                                                                                                                                                                | Browser print dialog (80 mm)                                                                                   |
| How long a bound terminal stays unlocked between till actions before the PIN is required again.                                                                                                                       | Seconds of inactivity before staff must enter their PIN again.                                                 |

## Validation

- POS TypeScript check passed.
- ESLint passed for all 16 changed application files.
- Existing POS test suite passed: 33 files, 223 tests.
- Scanned TypeScript and JSX text for internal specification markers; no matches remain in product-facing copy. Developer references remain in comments, the design-system gallery, and a server configuration diagnostic.
- Changes have not been deployed.
