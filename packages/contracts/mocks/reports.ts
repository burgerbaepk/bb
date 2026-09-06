import { paisa } from '@natech/domain';
import type {
  AuditorPack,
  CategoryMixRow,
  ChannelMixRow,
  CoversPerWaiterRow,
  ExceptionRow,
  FloorPerformanceRow,
  ItemSalesRow,
  PaymentMixRow,
  SalesByDateRow,
  ShiftReport,
  TaxLiabilityRow,
} from '../src/reports';
import { MOCK_BUSINESS_DATE, ago, uuidFrom } from './ids';

/**
 * Report rows — BUILD-PLAN.md §17.
 *
 * Every screen derives its header count and header sum from the rows below
 * (R16). That is the whole defence against defect C3 — `Total Revenue Rs. 0`
 * beside `Total Orders 19984` — and it is why no report here ships a
 * precomputed total alongside its rows.
 */

export const MOCK_SALES_BY_DATE: readonly SalesByDateRow[] = [
  {
    businessDate: '2026-08-16',
    invoiceCount: 118,
    covers: 402,
    netSales: paisa(48122000n),
    taxCollected: paisa(5216400n),
    serviceCharge: paisa(2406100n),
    grossTakings: paisa(55744500n),
  },
  {
    businessDate: '2026-08-17',
    invoiceCount: 96,
    covers: 331,
    netSales: paisa(39880000n),
    taxCollected: paisa(4305600n),
    serviceCharge: paisa(1994000n),
    grossTakings: paisa(46179600n),
  },
  {
    businessDate: '2026-08-18',
    invoiceCount: 88,
    covers: 297,
    netSales: paisa(35104000n),
    taxCollected: paisa(3861400n),
    serviceCharge: paisa(1755200n),
    grossTakings: paisa(40720600n),
  },
  {
    businessDate: '2026-08-19',
    invoiceCount: 101,
    covers: 352,
    netSales: paisa(41560000n),
    taxCollected: paisa(4571600n),
    serviceCharge: paisa(2078000n),
    grossTakings: paisa(48209600n),
  },
  {
    businessDate: '2026-08-20',
    invoiceCount: 133,
    covers: 470,
    netSales: paisa(54890000n),
    taxCollected: paisa(6037900n),
    serviceCharge: paisa(2744500n),
    grossTakings: paisa(63672400n),
  },
  {
    businessDate: '2026-08-21',
    invoiceCount: 149,
    covers: 521,
    netSales: paisa(61220000n),
    taxCollected: paisa(6733000n),
    serviceCharge: paisa(3061000n),
    grossTakings: paisa(71014000n),
  },
  {
    businessDate: MOCK_BUSINESS_DATE,
    invoiceCount: 62,
    covers: 214,
    netSales: paisa(25640000n),
    taxCollected: paisa(2820400n),
    serviceCharge: paisa(1282000n),
    grossTakings: paisa(29742400n),
  },
];

export const MOCK_ITEM_SALES: readonly ItemSalesRow[] = [
  {
    itemName: 'Mutton Tikka - 4 Pcs',
    categoryName: '01 Mutton BBQ',
    qtySold: '164',
    netSales: paisa(8692000n),
  },
  {
    itemName: 'Roti Per Head',
    categoryName: '11 Tandoor',
    qtySold: '612',
    netSales: paisa(4896000n),
  },
  {
    itemName: 'Special Mutton Champ',
    categoryName: '01 Mutton BBQ',
    qtySold: '31',
    netSales: paisa(4309000n),
  },
  {
    itemName: 'Mutton Gola Kabab - 5 Pcs',
    categoryName: '01 Mutton BBQ',
    qtySold: '58',
    netSales: paisa(3828000n),
  },
  {
    itemName: 'Mutton Karahi',
    categoryName: '02 Mutton Karahi',
    qtySold: '19',
    netSales: paisa(3192000n),
  },
  {
    itemName: 'Fresh Salad',
    categoryName: '08 Raita / Salad',
    qtySold: '94',
    netSales: paisa(2538000n),
  },
  {
    itemName: 'Mineral Water 1.5 Litre',
    categoryName: '10 Drinks',
    qtySold: '121',
    netSales: paisa(1936000n),
  },
  {
    itemName: 'Half Bowl',
    categoryName: 'Raita',
    qtySold: '67',
    netSales: paisa(1742000n),
  },
];

export const MOCK_CATEGORY_MIX: readonly CategoryMixRow[] = [
  {
    categoryName: '01 Mutton BBQ',
    itemCount: 253,
    netSales: paisa(16829000n),
    shareBps: 4322,
  },
  { categoryName: '02 Mutton Karahi', itemCount: 19, netSales: paisa(3192000n), shareBps: 820 },
  { categoryName: '11 Tandoor', itemCount: 612, netSales: paisa(4896000n), shareBps: 1257 },
  { categoryName: '08 Raita / Salad', itemCount: 94, netSales: paisa(2538000n), shareBps: 652 },
  { categoryName: '10 Drinks', itemCount: 121, netSales: paisa(1936000n), shareBps: 497 },
  { categoryName: 'Raita', itemCount: 67, netSales: paisa(1742000n), shareBps: 447 },
  { categoryName: '09 Desserts', itemCount: 44, netSales: paisa(1408000n), shareBps: 362 },
  { categoryName: '05 Chicken BBQ', itemCount: 38, netSales: paisa(1596000n), shareBps: 410 },
];

export const MOCK_CHANNEL_MIX: readonly ChannelMixRow[] = [
  { channel: 'POS', orderCount: 54, netSales: paisa(22188000n), shareBps: 8654 },
  { channel: 'WEB', orderCount: 7, netSales: paisa(2942000n), shareBps: 1148 },
  { channel: 'PHONE', orderCount: 1, netSales: paisa(510000n), shareBps: 198 },
];

/** §5.8 — declines are counted, not inferred from a gap. */
export const MOCK_PAYMENT_MIX: readonly PaymentMixRow[] = [
  {
    method: 'CARD',
    approvedCount: 34,
    declinedCount: 3,
    amount: paisa(17204000n),
    shareBps: 5782,
  },
  { method: 'CASH', approvedCount: 24, declinedCount: 0, amount: paisa(10920000n), shareBps: 3670 },
  { method: 'WALLET', approvedCount: 3, declinedCount: 1, amount: paisa(1206000n), shareBps: 405 },
  { method: 'QR', approvedCount: 1, declinedCount: 0, amount: paisa(412400n), shareBps: 143 },
];

/** Taxable value and tax collected, split by rate. */
export const MOCK_TAX_LIABILITY: readonly TaxLiabilityRow[] = [
  {
    taxClass: 'STANDARD_FOOD',
    rateBps: 800,
    method: 'CARD',
    taxableValue: paisa(15926000n),
    taxCollected: paisa(1274080n),
    invoiceCount: 34,
    legalReference: 'Punjab Finance Act 2026',
  },
  {
    taxClass: 'STANDARD_FOOD',
    rateBps: 1600,
    method: 'CASH',
    taxableValue: paisa(9414000n),
    taxCollected: paisa(1506240n),
    invoiceCount: 24,
    legalReference: 'PSTSA 2012, standard rate',
  },
  {
    taxClass: 'STANDARD_FOOD',
    rateBps: 800,
    method: 'WALLET',
    taxableValue: paisa(1116000n),
    taxCollected: paisa(89280n),
    invoiceCount: 3,
    legalReference: 'Punjab Finance Act 2026',
  },
  {
    taxClass: 'STANDARD_FOOD',
    rateBps: 800,
    method: 'QR',
    taxableValue: paisa(381000n),
    taxCollected: paisa(30480n),
    invoiceCount: 1,
    legalReference: 'Punjab Finance Act 2026',
  },
];

/** §17 Floor Performance. Unanswerable without `table_sessions` (§5.5). */
export const MOCK_FLOOR_PERFORMANCE: readonly FloorPerformanceRow[] = [
  {
    zoneName: 'Front',
    daypart: 'Lunch',
    turns: '2.4',
    averageDwellSeconds: 3120,
    covers: 74,
    revenuePerSeatHour: paisa(94200n),
    deadTableSeconds: 5400,
  },
  {
    zoneName: 'Front',
    daypart: 'Dinner',
    turns: '3.1',
    averageDwellSeconds: 3960,
    covers: 118,
    revenuePerSeatHour: paisa(126800n),
    deadTableSeconds: 2700,
  },
  {
    zoneName: 'Bala',
    daypart: 'Dinner',
    turns: '2.8',
    averageDwellSeconds: 4320,
    covers: 96,
    revenuePerSeatHour: paisa(112400n),
    deadTableSeconds: 4200,
  },
  {
    zoneName: 'Upstairs',
    daypart: 'Dinner',
    turns: '1.9',
    averageDwellSeconds: 5280,
    covers: 62,
    revenuePerSeatHour: paisa(88600n),
    deadTableSeconds: 9600,
  },
  {
    zoneName: 'Bala Upstairs',
    daypart: 'Dinner',
    turns: '1.2',
    averageDwellSeconds: 4680,
    covers: 34,
    revenuePerSeatHour: paisa(61200n),
    deadTableSeconds: 15300,
  },
];

export const MOCK_COVERS_PER_WAITER: readonly CoversPerWaiterRow[] = [
  {
    waiterName: 'Bilal Ahmed',
    covers: 128,
    orders: 41,
    netSales: paisa(9842000n),
    averageDwellSeconds: 3840,
  },
  {
    waiterName: 'Sana Iqbal',
    covers: 96,
    orders: 33,
    netSales: paisa(8106000n),
    averageDwellSeconds: 4020,
  },
  {
    waiterName: 'Amina Karim',
    covers: 62,
    orders: 18,
    netSales: paisa(5240000n),
    averageDwellSeconds: 4560,
  },
];

/**
 * §17 exception reports. Each row names an actor and, where the plan requires
 * one, the supervisor who authorised it. Defect list: there is currently no
 * record of a declined card attempt.
 */
export const MOCK_EXCEPTIONS: readonly ExceptionRow[] = [
  {
    id: uuidFrom('exception:2'),
    kind: 'DECLINED_CARD',
    at: ago(200),
    businessDate: MOCK_BUSINESS_DATE,
    actorName: 'Sana Iqbal',
    reference: 'INV-20260822-11273',
    tableCode: '17',
    amount: paisa(1380960n),
    reason: 'Issuer declined — insufficient funds',
    supervisorName: null,
  },
  {
    id: uuidFrom('exception:4'),
    kind: 'DISCOUNT',
    at: ago(4800),
    businessDate: MOCK_BUSINESS_DATE,
    actorName: 'Bilal Ahmed',
    reference: 'Order 20377',
    tableCode: '14',
    amount: paisa(120000n),
    reason: 'Long wait on the karahi',
    supervisorName: 'Faisal Rehman',
  },
  {
    id: uuidFrom('exception:6'),
    kind: 'PRICE_OVERRIDE',
    at: ago(7200),
    businessDate: MOCK_BUSINESS_DATE,
    actorName: 'Faisal Rehman',
    reference: 'Order 20368',
    tableCode: '11',
    amount: paisa(40000n),
    reason: 'Agreed rate for a staff meal',
    supervisorName: 'Faisal Rehman',
  },
  {
    id: uuidFrom('exception:7'),
    kind: 'VOID_ORDER',
    at: ago(11000),
    businessDate: '2026-08-21',
    actorName: 'Sana Iqbal',
    reference: 'Order 20344',
    tableCode: '8',
    amount: paisa(316000n),
    reason: 'Party left before ordering was confirmed',
    supervisorName: 'Faisal Rehman',
  },
];

/** §12, §17 — the Z report. */
export const MOCK_SHIFT_REPORT: ShiftReport = {
  shiftId: uuidFrom('shift:current'),
  kind: 'X',
  openedAt: ago(18000),
  closedAt: null,
  openedByName: 'Sana Iqbal',
  businessDate: MOCK_BUSINESS_DATE,
  openingFloat: paisa(1000000n),
  expectedCash: paisa(11920000n),
  countedCash: null,
  variance: null,
  paymentMix: [...MOCK_PAYMENT_MIX],
  cashMovements: [
    {
      id: uuidFrom('cash:1'),
      type: 'PAY_OUT',
      amount: paisa(250000n),
      reason: 'Vegetable supplier, cash on delivery',
      actorName: 'Faisal Rehman',
      at: ago(9000),
    },
    {
      id: uuidFrom('cash:2'),
      type: 'DROP',
      amount: paisa(5000000n),
      reason: 'Mid-shift drop to the safe',
      actorName: 'Sana Iqbal',
      at: ago(5400),
    },
    {
      id: uuidFrom('cash:3'),
      type: 'PAY_IN',
      amount: paisa(120000n),
      reason: 'Float top-up, small change',
      actorName: 'Sana Iqbal',
      at: ago(3600),
    },
  ],
  invoiceCount: 62,
  netSales: paisa(25640000n),
  taxCollected: paisa(2820400n),
};

/** §17 — the s.32(2) access pack. Six-year retention under s.32(1). */
export const MOCK_AUDITOR_PACK: AuditorPack = {
  range: { fromBusinessDate: '2026-07-01', toBusinessDate: MOCK_BUSINESS_DATE },
  invoiceCount: 4218,
  creditNoteCount: 37,
  taxCollected: paisa(191840600n),
  generatedAt: ago(600),
  retentionUntil: '2033-06-30',
  contents: [
    { label: 'Tax invoices', rowCount: 4218 },
    { label: 'Invoice tax lines', rowCount: 4611 },
    { label: 'Payments, including declined attempts', rowCount: 4506 },
    { label: 'Credit notes', rowCount: 37 },
    { label: 'Checks, including superseded and voided', rowCount: 4402 },
    { label: 'Tax snapshots', rowCount: 4218 },
    { label: 'Audit log', rowCount: 51884 },
  ],
};
