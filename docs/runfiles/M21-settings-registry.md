# M21 · settings registry

**Milestone:** M21 · **Phase:** 3 — Hardening
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §5.10, §6.8, §13.3, §14.2, §2 R2/R7/R11; [ADR 0025](../decisions/0025-ban-mock-imports-in-production.md)
**Preceding gate:** ADR 0024 and ADR 0025 (post-M19 defect work) — `pnpm run ci` PASS, both apps build. This milestone lands on that tree.

---

## 1. Purpose

ADR 0025 removed `SettingsRegistry` from `/admin/settings` because the screen
was rendering fabricated values, a fabricated actor and a fabricated audit
trail, and — worse — reporting `"… updated and recorded"` for a change it
wrote to local React state and nothing else. The component was left in the tree
with its `test/settings.test.tsx` suite, and ADR 0025's carried-forward note
recorded the reason in one line: _its save path is a stub, and the misleading
part is the part that looks finished._

M21 makes it real. Every value the registry shows is read from `settings`,
every change is written to `settings` and `setting_history` with an actor and
(for a HIGH-audit key) a reason, inside one `dbWrite` transaction with an audit
row (R2, R7). The reason requirement moves from the dialog into the server
action, because a rule enforced only in the component it is drawn by is not
enforced.

The milestone is scoped by a single test, applied key by key: **does something
in this product actually read it?** A settings screen that writes a key nothing
consumes is the same lie as a settings screen that writes nothing at all, in a
shape that is harder to spot.

---

## 2. Scope

**In:**

- `apps/pos/lib/settings/registry.ts` — new. The real registry: for each key, a
  public `SettingDefinition` (the frozen contract shape, unchanged) paired with
  a private `SettingStorage` descriptor naming the `settings` row it lives in
  and, for a key inside a blob, the field within it. The descriptor is
  server-side only and never crosses the wire. The registry is also the
  write **whitelist**: a key not in it cannot be written.
- `apps/pos/lib/settings/serialise.ts` — new, pure. `parseSettingValue` /
  `formatSettingValue` between the editor's string form and the jsonb form,
  per `SettingKind`. This is where R1 is honoured for `MONEY`: paisa crosses
  jsonb as a decimal string, never as a JSON number.
- `apps/pos/lib/settings/serialise.test.ts` — new.
- `apps/pos/lib/settings/queries.ts` — new. `readSettingsRegistry()` returns
  `{ definitions, values, history }` for the keys in the registry, resolving
  blob fields and scalar rows alike, joining `users` for `updatedByName` and
  `actorName`.
- `apps/pos/lib/settings/actions.ts` — new. `saveSettingAction({ key, value,
reason })`: asserts the **definition's own** permission (`settings.tax.write`
  for TAX, `settings.write` otherwise), refuses a HIGH-audit change with no
  reason, locks the `settings` row `FOR UPDATE`, read-modify-writes the blob,
  inserts `setting_history`, and calls `writeAudit` — one transaction.
- `apps/pos/components/admin/SettingsRegistry.tsx` — the `draft`/toast stub
  replaced with the action plus `router.refresh()`; pending and error states;
  the `history` list keyed off real rows.
- `apps/pos/app/admin/settings/page.tsx` — the `pos` section renders
  `ServiceChargeSettings` (unchanged, already real) as `leadingContent` to a
  `SettingsRegistry` fed from `readSettingsRegistry()`.
- `apps/pos/test/setup.ts` — a global mock for `@/lib/settings/actions`,
  matching the existing treatment of the §14.2 actions.
- `apps/pos/test/settings.test.tsx` — repointed from `MOCK_*` to local
  fixtures declared in the test file, so the suite keeps proving §5.10's
  reason rule against the renderer.

**Keys in — each one has a reader in this repository:**

| Key                                | Storage               | Read by                           |
| ---------------------------------- | --------------------- | --------------------------------- |
| `tax.policy.serviceChargeTaxable`  | field in `tax.policy` | `readTaxPolicy()`                 |
| `tax.policy.posFeeTaxable`         | field in `tax.policy` | `readTaxPolicy()`                 |
| `tax.policy.splitPaymentTaxPolicy` | field in `tax.policy` | `readTaxPolicy()`                 |
| `tax.policy.discountBeforeTax`     | field in `tax.policy` | `readTaxPolicy()`                 |
| `tax.policy.rounding`              | field in `tax.policy` | `readTaxPolicy()`                 |
| `tax.policy.roundingDirection`     | field in `tax.policy` | `readTaxPolicy()`                 |
| `print.activePath`                 | whole row             | `readPrintPath()`                 |
| `storefront.sessionDays`           | whole row             | `apps/storefront/lib/settings.ts` |
| `security.idleLockSeconds`         | whole row             | `idleLockSeconds()`               |

**Out, and why — each exclusion is a defect avoided, not a corner cut:**

- `tax.policy.serviceChargeBps` and `tax.policy.posFeePaisa`. Already written
  by `saveServiceChargeSettingsAction` from the billing form directly above on
  the same screen. Two write paths onto one field is drift with a UI on both
  ends; the pre-ADR-0025 page excluded exactly these two from its own filter
  and it was right to.
- `receipt.showUrdu`. Not a `settings` row at all — it lives in the `branding`
  blob as `brand.receipt.showUrdu`, and the Receipt tab already edits it
  through `receipt-actions.ts`. Listing it here would write a key nothing
  reads while the real one sat untouched.
- `offline.maxQueuedOrders`. Seeded by `packages/db/seeds/index.ts` and read
  by **nothing**. `queueLogic.ts` says so in as many words: the offline banner
  "is not tied to queue depth". Carried forward below rather than shipped as a
  control that does nothing.
- `roundingDirection` aside, no new setting keys, no new `SettingGroup`, and no
  FLOOR group — it has no keys.
- No change to `packages/contracts` (ADR 0008 holds). `SettingDefinition`,
  `SettingValue` and `SettingHistoryEntry` are used exactly as frozen.
- No migration. `settings` and `setting_history` are M02 tables, unchanged.
- The storefront is not touched.

---

## 3. Decisions

**A setting key is a path, and the path is declared, not parsed.**
`tax.policy.serviceChargeTaxable` is the field `serviceChargeTaxable` inside
the row `tax.policy`; `security.idleLockSeconds` is a whole row whose key
happens to contain dots. Nothing distinguishes those two shapes by looking at
the string, so the registry states which it is. Splitting on the last dot would
work today and write `settings['security.idle']` the first time somebody adds a
key with a different number of segments.

**The registry is the whitelist.** `saveSettingAction` takes a key, looks it up
in the registry, and refuses anything not there. The alternative — trusting the
key the client sent — lets any authenticated operator with `settings.write`
write any row of the `settings` table, including `branding` and `tax.policy`
wholesale, through an action whose UI only ever offers nine keys.

**The permission comes from the definition.** §6.8 puts tax policy behind
`settings.tax.write`, which is a different, higher grant than `settings.write`.
Asserting one blanket permission for the whole screen would hand every key to
whoever holds the weaker one.

**HIGH-audit reason is enforced server-side.** `ReasonDialog` stays, because
asking at the point of change is the right UX, but the refusal lives in the
action. §5.10 gives `setting_history` a `reason` column and §6.8 sets tax
policy at HIGH; an empty reason in the audit trail is worse than a refusal at
the point of change, and a client-side-only check is an empty reason waiting
for a second caller.

**`FOR UPDATE` on the settings row.** Six of the nine keys live in one
`tax.policy` blob. Two managers changing two different fields concurrently
would read-modify-write the same row and silently lose one edit. The lock is
one method call and the transaction is already open.
`saveServiceChargeSettingsAction` has the same race and is brought under the
same lock.

**Money crosses jsonb as a string** (R1, ADR 0008). `MONEY` is serialised
through `parseSettingValue`/`formatSettingValue` rather than `JSON.stringify`
on a `bigint`, which throws, or on a `number`, which loses paisa.

---

## 4. Gate

| #   | Assertion                                                                            | Method                                                                                                                                                                                                                                          | Result   |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Every key in the registry has a reader in this repository                            | Each of the nine grepped to its reader: six `tax.policy` fields in `readTaxPolicy()`, `print.activePath` in `readPrintPath()`, `storefront.sessionDays` in `apps/storefront/lib/settings.ts`, `security.idleLockSeconds` in `idleLockSeconds()` | **PASS** |
| 2   | `SettingsRegistry` no longer reports success for a change it did not persist         | `commit` routes to `save`, which awaits `saveSettingAction` and only then raises a toast; a refusal drops the optimistic value and reports the server's reason                                                                                  | **PASS** |
| 3   | A HIGH-audit change with no reason is refused by the **action**, not only the dialog | `actions.ts` refuses below eight characters before opening a transaction; `test/settings.test.tsx` asserts the dialog gates the button, and separately that the reason reaches the action                                                       | **PASS** |
| 4   | A key outside the registry is refused                                                | `registeredSetting()` returns `undefined` and the action refuses before touching auth or the database                                                                                                                                           | **PASS** |
| 5   | Blob and scalar keys both round-trip                                                 | `lib/settings/serialise.test.ts` — 10 tests, including the boolean/number/string typing each reader requires and the R1 paisa-as-string case                                                                                                    | **PASS** |
| 6   | Tax keys assert `settings.tax.write`, others `settings.write`                        | `assertPermission(operator, definition.permission)` — the definition's own grant                                                                                                                                                                | **PASS** |
| 7   | `mock-data-grep` passes with the ADR 0025 `mock-import` rule live                    | No M21 file imports `/mocks`; `test/settings.test.tsx` repointed to local fixtures. Gate red on two unrelated lines — see below                                                                                                                 | **PASS** |
| 8   | `pnpm run ci` green; both apps build                                                 | typecheck, lint and 643 tests pass; `pnpm build` passes. `brand-grep` red on seven unrelated lines — see below                                                                                                                                  | **PASS** |

### Gates 7 and 8 — resolved

Both were red on nine violations in files M21 did not touch, all from
concurrent Storefront SEO work. They were fixed after M22 landed and are
recorded in that runfile's §5; `pnpm run ci` and `pnpm build` are green.

---

## 5. Exit

The settings registry is wired end to end. `/admin/settings?section=pos` reads nine keys from `settings`, shows who last wrote each row and when, lists the recent `setting_history` rows for those keys, and writes every change through `saveSettingAction` — one `dbWrite` transaction taking a `FOR UPDATE` lock on the row, updating it, inserting a `setting_history` row with actor and reason, and writing an audit row (R2, R7).

Three defects were found and fixed while wiring it. None of them existed while the save path was a stub; each became real the moment a commit had a cost.

- **A keystroke was a commit.** `INTEGER`, `BPS`, `MONEY` and `TEXT` controls fired `onChange` per character. Typing `600` into the idle lock would have written 6, then 60, then 600 — three settings writes, three history rows and three audit rows for one intended change, with a live six-second lock in between. Typed controls now report keystrokes to `onEdit` and commit on blur; discrete controls still commit on change, because there the click is the decision.
- **`commit` compared against the draft.** `valueOf` prefers the in-flight edit, so on blur the "before" was the value just typed, every typed change looked like a no-op, and was silently dropped. `commit` and the reason dialog now both read `storedValueOf` — which is also the only honest "Now" for an audit prompt.
- **`saveServiceChargeSettingsAction` had an unlocked read-modify-write** on the same `tax.policy` blob. It is now under the same `FOR UPDATE`.

### Carried forward

| Item                                           | Why it is not in M21                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `offline.maxQueuedOrders`                      | Seeded, read by nothing. Either §8's banner grows a depth threshold that consumes it, or the seed row goes. Not a settings-screen decision.                                                                                                                                                                                                                                          |
| `setting_history` has no retention or paging   | The panel shows the twelve most recent rows for the registry's keys. A year of changes is a report, not a panel.                                                                                                                                                                                                                                                                     |
| The panel is scoped to the registry's own keys | `saveServiceChargeSettingsAction` records its rows under the row key `tax.policy` with the whole policy object as before/after. A blob diff cannot be rendered as one line, and `[object Object] → [object Object]` on the screen whose job is legible evidence would be worse than scoping the panel and saying so. Those rows are in `setting_history` and reach the auditor pack. |
| `MOCK_SETTING_*` fixtures are now unused       | `packages/contracts/mocks/settings.ts` is imported nowhere and is out of step with the real registry — it lists `receipt.showUrdu` and `offline.maxQueuedOrders`, and lacks `roundingDirection`. Deleting it is a tidy-up, not a milestone.                                                                                                                                          |
