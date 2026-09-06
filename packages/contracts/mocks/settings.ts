import type { SettingDefinition, SettingHistoryEntry, SettingValue } from '../src/settings';
import { MOCK_TAX_POLICY_SETTING } from './tax';
import { ago, uuidFrom } from './ids';

/**
 * The settings registry — BUILD-PLAN.md §5.10, §6.8, §8, §10.6, §12, §13.3.
 *
 * One renderer draws every one of these, because a key/jsonb table with a
 * hand-built form per key drifts the moment somebody adds a key. Each entry
 * declares what it is, who may write it, and what it costs to get wrong.
 *
 * §6.8's tax policy sits at audit level HIGH behind `settings.tax.write`. It
 * decides what a customer is charged and what PRA is told, so a change is
 * written to `setting_history` with an actor and a reason.
 */
export const MOCK_SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  {
    key: 'tax.policy.serviceChargeBps',
    label: 'Service charge',
    help: 'Applied to the taxable base on dine-in orders. 500 bps is 5%.',
    group: 'TAX',
    kind: 'BPS',
    options: [],
    permission: 'settings.tax.write',
    auditLevel: 'HIGH',
    legalReference: 'PSTSA 2012 s.7(1)',
  },
  {
    key: 'tax.policy.serviceChargeTaxable',
    label: 'Service charge is taxable',
    help: 'Pending P4 — a written opinion from the tax advisor under s.7(1), whose Explanation covers charges by whatever name called. If it comes back the other way, every invoice issued in the meantime understated the tax.',
    group: 'TAX',
    kind: 'BOOLEAN',
    options: [],
    permission: 'settings.tax.write',
    auditLevel: 'HIGH',
    legalReference: 'PSTSA 2012 s.7(1) Explanation',
  },
  {
    key: 'tax.policy.posFeePaisa',
    label: 'POS service fee',
    help: 'A fixed charge per invoice, in paisa. The reference invoice carries Rs. 1.00.',
    group: 'TAX',
    kind: 'MONEY',
    options: [],
    permission: 'settings.tax.write',
    auditLevel: 'HIGH',
    legalReference: null,
  },
  {
    key: 'tax.policy.posFeeTaxable',
    label: 'POS fee is taxable',
    help: 'Also pending P4.',
    group: 'TAX',
    kind: 'BOOLEAN',
    options: [],
    permission: 'settings.tax.write',
    auditLevel: 'HIGH',
    legalReference: 'PSTSA 2012 s.7(1)',
  },
  {
    key: 'tax.policy.splitPaymentTaxPolicy',
    label: 'Split payment tax policy',
    help: 'How the taxable base is divided when a customer pays by more than one method. PROPORTIONAL allocates in proportion to what was tendered against each.',
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
  {
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
  {
    key: 'tax.policy.rounding',
    label: 'Grand total rounding',
    help: 'Rounding happens once, on the grand total, and the movement is written to rounding_adj. Tax lines are never rounded twice.',
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
];

/** §12 printing, §10.6 courses, §13.3 storefront, §14.2 idle lock. */
export const MOCK_OPERATIONAL_SETTINGS: readonly SettingDefinition[] = [
  {
    key: 'print.activePath',
    label: 'Active print path',
    help: 'Per terminal. The bridge agent owns the queue, paper-out handling, and offline buffering; the other two are fallbacks.',
    group: 'PRINTING',
    kind: 'ENUM',
    options: [
      { value: 'BRIDGE_AGENT', label: 'Print bridge agent' },
      { value: 'WEB_USB', label: 'WebUSB / WebSerial' },
      { value: 'HTML_DIALOG', label: '80mm HTML print dialog' },
    ],
    permission: 'settings.write',
    auditLevel: 'NORMAL',
    legalReference: null,
  },
  {
    key: 'receipt.showUrdu',
    label: 'Bilingual receipts',
    help: 'Urdu lines are rasterised server-side to a 1-bit bitmap and interleaved into the ESC/POS buffer. Text mode cannot render Nastaliq.',
    group: 'PRINTING',
    kind: 'BOOLEAN',
    options: [],
    permission: 'settings.write',
    auditLevel: 'LOW',
    legalReference: 'PSTSA 2012 s.31(1)',
  },
  {
    key: 'storefront.sessionDays',
    label: 'Storefront session length',
    help: 'How long a verified customer stays signed in before another email code is needed.',
    group: 'STOREFRONT',
    kind: 'INTEGER',
    options: [],
    permission: 'settings.write',
    auditLevel: 'LOW',
    legalReference: null,
  },
  {
    key: 'security.idleLockSeconds',
    label: 'Till idle lock',
    help: 'How long a bound terminal stays unlocked between till actions before the PIN is required again.',
    group: 'SECURITY',
    kind: 'INTEGER',
    options: [],
    permission: 'settings.write',
    auditLevel: 'NORMAL',
    legalReference: null,
  },
  {
    key: 'offline.maxQueuedOrders',
    label: 'Offline queue warning',
    help: 'Past this depth the POS shows a blocking warning but keeps accepting orders. Refusing an order because the connection dropped is worse than queueing it.',
    group: 'SECURITY',
    kind: 'INTEGER',
    options: [],
    permission: 'settings.write',
    auditLevel: 'LOW',
    legalReference: null,
  },
];

export const MOCK_ALL_SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  ...MOCK_SETTING_DEFINITIONS,
  ...MOCK_OPERATIONAL_SETTINGS,
];

export const MOCK_SETTING_VALUES: readonly SettingValue[] = [
  {
    key: 'tax.policy.serviceChargeBps',
    value: MOCK_TAX_POLICY_SETTING.serviceChargeBps,
    updatedAt: ago(86400 * 20),
    updatedByName: 'Amina Karim',
  },
  {
    key: 'tax.policy.serviceChargeTaxable',
    value: MOCK_TAX_POLICY_SETTING.serviceChargeTaxable,
    updatedAt: ago(86400 * 20),
    updatedByName: 'Amina Karim',
  },
  {
    key: 'tax.policy.posFeePaisa',
    value: MOCK_TAX_POLICY_SETTING.posFeePaisa,
    updatedAt: ago(86400 * 20),
    updatedByName: 'Amina Karim',
  },
  {
    key: 'tax.policy.posFeeTaxable',
    value: MOCK_TAX_POLICY_SETTING.posFeeTaxable,
    updatedAt: ago(86400 * 20),
    updatedByName: 'Amina Karim',
  },
  {
    key: 'tax.policy.splitPaymentTaxPolicy',
    value: MOCK_TAX_POLICY_SETTING.splitPaymentTaxPolicy,
    updatedAt: ago(86400 * 20),
    updatedByName: 'Amina Karim',
  },
  {
    key: 'tax.policy.discountBeforeTax',
    value: MOCK_TAX_POLICY_SETTING.discountBeforeTax,
    updatedAt: ago(86400 * 20),
    updatedByName: 'Amina Karim',
  },
  {
    key: 'tax.policy.rounding',
    value: MOCK_TAX_POLICY_SETTING.rounding,
    updatedAt: ago(86400 * 20),
    updatedByName: 'Amina Karim',
  },
  { key: 'print.activePath', value: 'BRIDGE_AGENT', updatedAt: null, updatedByName: null },
  { key: 'receipt.showUrdu', value: true, updatedAt: ago(86400 * 9), updatedByName: 'Amina Karim' },
  { key: 'storefront.sessionDays', value: 90, updatedAt: null, updatedByName: null },
  { key: 'security.idleLockSeconds', value: 120, updatedAt: null, updatedByName: null },
  { key: 'offline.maxQueuedOrders', value: 200, updatedAt: null, updatedByName: null },
];

/** §5.10 — a HIGH-audit change carries a reason, not just a diff. */
export const MOCK_SETTING_HISTORY: readonly SettingHistoryEntry[] = [
  {
    id: uuidFrom('settinghistory:2'),
    key: 'tax.policy.serviceChargeTaxable',
    before: 'true',
    after: 'false',
    actorName: 'Amina Karim',
    reason: 'Interim position pending the P4 advisor opinion.',
    at: ago(86400 * 20),
  },
];
