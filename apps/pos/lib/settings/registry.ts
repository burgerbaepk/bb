import 'server-only';
import type { SettingDefinition } from '@natech/contracts';

/**
 * The real settings registry — BUILD-PLAN.md §5.10, §6.8, §13.3, §14.2;
 * docs/runfiles/M21-settings-registry.md §3.
 *
 * Two things live here, deliberately in one table.
 *
 * The `definition` is the frozen `SettingDefinition` contract shape, and it is
 * what reaches the browser: label, help, kind, permission, audit level. The
 * `storage` beside it says where the value actually lives, and never leaves the
 * server.
 *
 * **A setting key is a path, and the path is declared rather than parsed.**
 * `tax.policy.serviceChargeTaxable` is the field `serviceChargeTaxable` inside
 * the row `tax.policy`. `security.idleLockSeconds` is a whole row whose key
 * happens to contain a dot. Nothing in either string distinguishes the two
 * shapes, so each entry states which it is. Splitting on the last dot would
 * work for every key below and write `settings['security.idle']` the first
 * time somebody adds a key with a different number of segments.
 *
 * **This list is also the write whitelist.** `saveSettingAction` refuses a key
 * that is not here. Trusting the key the client sent would let anyone holding
 * `settings.write` write any row of the `settings` table — `branding` and
 * `tax.policy` wholesale included — through an action whose UI only ever
 * offers the nine keys below.
 *
 * **Every key here has a reader in this repository.** That is the entry
 * requirement, checked key by key in the runfile's §2 table. A settings screen
 * that writes a key nothing consumes is the same lie as one that writes
 * nothing at all, in a shape that is harder to spot — which is the defect
 * ADR 0025 removed from this screen. Three keys the Phase-1 fixture listed are
 * deliberately absent, and the runfile records why for each.
 */
export interface SettingStorage {
  /** The `settings.key` row. */
  readonly row: string;
  /** The field within that row's jsonb object, when the row holds an object. */
  readonly field?: string;
}

export interface RegisteredSetting {
  readonly definition: SettingDefinition;
  readonly storage: SettingStorage;
}

const TAX_POLICY_ROW = 'tax.policy';

/**
 * §6.8 — tax policy sits at HIGH behind `settings.tax.write`. It decides what
 * a customer is charged and what PRA is told.
 *
 * `serviceChargeBps` and `posFeePaisa` are **not** here. The billing form
 * directly above this registry on the same screen already writes both through
 * `saveServiceChargeSettingsAction`, and two write paths onto one field is
 * drift with a UI at each end.
 */
const TAX_SETTINGS: readonly RegisteredSetting[] = [
  {
    storage: { row: TAX_POLICY_ROW, field: 'serviceChargeTaxable' },
    definition: {
      key: 'tax.policy.serviceChargeTaxable',
      label: 'Service charge is taxable',
      help: 'Include the service charge when calculating sales tax. Confirm the correct treatment with your tax advisor.',
      group: 'TAX',
      kind: 'BOOLEAN',
      options: [],
      permission: 'settings.tax.write',
      auditLevel: 'HIGH',
      legalReference: 'PSTSA 2012 s.7(1) Explanation',
    },
  },
  {
    storage: { row: TAX_POLICY_ROW, field: 'posFeeTaxable' },
    definition: {
      key: 'tax.policy.posFeeTaxable',
      label: 'POS fee is taxable',
      help: 'Include the fixed POS fee when calculating sales tax. Confirm the correct treatment with your tax advisor.',
      group: 'TAX',
      kind: 'BOOLEAN',
      options: [],
      permission: 'settings.tax.write',
      auditLevel: 'HIGH',
      legalReference: 'PSTSA 2012 s.7(1)',
    },
  },
  {
    storage: { row: TAX_POLICY_ROW, field: 'splitPaymentTaxPolicy' },
    definition: {
      key: 'tax.policy.splitPaymentTaxPolicy',
      label: 'Split payment tax policy',
      help: 'How the taxable base is divided when a customer pays by more than one method. Proportional allocates in proportion to what was tendered against each.',
      group: 'TAX',
      kind: 'ENUM',
      options: [
        { value: 'PROPORTIONAL', label: 'Proportional' },
        { value: 'HIGHEST_RATE', label: 'Highest rate' },
        { value: 'PRIMARY_METHOD', label: 'Primary method' },
      ],
      permission: 'settings.tax.write',
      auditLevel: 'HIGH',
      legalReference: null,
    },
  },
  {
    storage: { row: TAX_POLICY_ROW, field: 'discountBeforeTax' },
    definition: {
      key: 'tax.policy.discountBeforeTax',
      label: 'Discount applies before tax',
      help: 'When on, a discount reduces the taxable base. When off, it comes off the total after tax.',
      group: 'TAX',
      kind: 'BOOLEAN',
      options: [],
      permission: 'settings.tax.write',
      auditLevel: 'HIGH',
      legalReference: null,
    },
  },
  {
    storage: { row: TAX_POLICY_ROW, field: 'rounding' },
    definition: {
      key: 'tax.policy.rounding',
      label: 'Grand total rounding',
      help: 'Round the final bill total and record the difference as a rounding adjustment.',
      group: 'TAX',
      kind: 'ENUM',
      options: [
        { value: 'NONE', label: 'None' },
        { value: 'NEAREST_RUPEE', label: 'Nearest rupee' },
        { value: 'NEAREST_5_RUPEE', label: 'Nearest 5 rupees' },
      ],
      permission: 'settings.tax.write',
      auditLevel: 'HIGH',
      legalReference: null,
    },
  },
  {
    storage: { row: TAX_POLICY_ROW, field: 'roundingDirection' },
    definition: {
      key: 'tax.policy.roundingDirection',
      label: 'Rounding direction',
      // `readTaxPolicy()` consumes this and the Phase-1 fixture omitted it. A
      // rounding mode with no direction is half a setting: it decides whether
      // the movement written to rounding_adj favours the customer or the
      // outlet, on every invoice.
      help: 'Choose how to round the final total. Half up rounds to the nearest increment, with halfway amounts rounded up.',
      group: 'TAX',
      kind: 'ENUM',
      options: [
        { value: 'HALF_UP', label: 'Half up' },
        { value: 'UP', label: 'Always up' },
        { value: 'DOWN', label: 'Always down' },
      ],
      permission: 'settings.tax.write',
      auditLevel: 'HIGH',
      legalReference: null,
    },
  },
];

/** §12 printing, §13.3 storefront, §14.2 idle lock — each a whole `settings` row. */
const OPERATIONAL_SETTINGS: readonly RegisteredSetting[] = [
  {
    storage: { row: 'print.activePath' },
    definition: {
      key: 'print.activePath',
      label: 'Receipt printing method',
      help: 'Choose how this till sends receipts to the printer.',
      group: 'PRINTING',
      kind: 'ENUM',
      options: [
        { value: 'BRIDGE_AGENT', label: 'Print bridge agent' },
        { value: 'WEB_USB', label: 'WebUSB / WebSerial' },
        { value: 'HTML_DIALOG', label: 'Browser print dialog (80 mm)' },
      ],
      permission: 'settings.write',
      auditLevel: 'NORMAL',
      legalReference: null,
    },
  },
  {
    storage: { row: 'storefront.sessionDays' },
    definition: {
      key: 'storefront.sessionDays',
      label: 'Storefront session length',
      help: 'How many days a verified customer stays signed in to online ordering before another email code is needed.',
      group: 'STOREFRONT',
      kind: 'INTEGER',
      options: [],
      permission: 'settings.write',
      auditLevel: 'LOW',
      legalReference: null,
    },
  },
  {
    storage: { row: 'security.idleLockSeconds' },
    definition: {
      key: 'security.idleLockSeconds',
      label: 'Till idle lock',
      help: 'Seconds of inactivity before staff must enter their PIN again. 0 means the till never locks on its own.',
      group: 'SECURITY',
      kind: 'INTEGER',
      options: [],
      permission: 'settings.write',
      auditLevel: 'NORMAL',
      legalReference: null,
    },
  },
];

export const SETTINGS_REGISTRY: readonly RegisteredSetting[] = [
  ...TAX_SETTINGS,
  ...OPERATIONAL_SETTINGS,
];

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = SETTINGS_REGISTRY.map(
  (entry) => entry.definition,
);

/** `undefined` for a key that is not in the registry — which is a refusal, not a miss. */
export function registeredSetting(key: string): RegisteredSetting | undefined {
  return SETTINGS_REGISTRY.find((entry) => entry.definition.key === key);
}
