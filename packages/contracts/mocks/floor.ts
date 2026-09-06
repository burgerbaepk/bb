import type { FloorTable, TableChip, TableSession, Zone } from '../src/floor';
import { summariseFloor } from '../src/floor';
import type { TableShape, TableStatus } from '../src/enums';
import type { Viewer } from '../src/staff';
import { can } from '../src/staff';
import { MOCK_ORDERS, orderSubtotal } from './orders';
import { ago, elapsed, uuidFrom } from './ids';

/**
 * The floor — BUILD-PLAN.md §5.5, §9, pre-flight P7 and P8.
 *
 * Zone names are the P7 defaults, and every capacity is the P8 default of
 * min 2 / max 4 unless the layout below says otherwise. Both are guesses, and
 * both are load-bearing: capacity drives the occupancy dots on the chip, the
 * covers figure in the summary bar, and revenue per seat-hour in the Floor
 * Performance report.
 *
 * Geometry is on the logical grid, never pixels (§9.3).
 */

interface ZoneSpec {
  readonly name: string;
  readonly nameUr: string;
  readonly slug: string;
  readonly tables: readonly (readonly [string, number, number, TableShape, number, number])[];
}

const ZONE_SPECS: readonly ZoneSpec[] = [
  {
    name: 'Front',
    nameUr: 'سامنے',
    slug: 'front',
    tables: [
      ['1', 4, 8, 'RECT', 2, 15],
      ['2', 2, 4, 'SQUARE', 9, 15],
      ['3', 2, 4, 'SQUARE', 15, 15],
      ['4', 4, 6, 'ROUND', 21, 15],
      ['5', 2, 4, 'SQUARE', 28, 15],
      ['6', 2, 4, 'SQUARE', 34, 15],
      ['7', 4, 6, 'BOOTH', 2, 6],
      ['8', 4, 6, 'BOOTH', 10, 6],
    ],
  },
  {
    name: 'Bala',
    nameUr: 'بالا',
    slug: 'bala',
    tables: [
      ['9', 2, 4, 'SQUARE', 3, 4],
      ['10', 2, 4, 'SQUARE', 10, 4],
      ['11', 4, 6, 'ROUND', 17, 4],
      ['12', 2, 4, 'SQUARE', 25, 4],
      ['13', 2, 4, 'SQUARE', 3, 13],
      ['14', 4, 8, 'RECT', 10, 13],
      ['15', 2, 4, 'SQUARE', 20, 13],
      ['16', 2, 4, 'SQUARE', 27, 13],
    ],
  },
  {
    name: 'Upstairs',
    nameUr: 'اوپر',
    slug: 'upstairs',
    tables: [
      ['17', 6, 8, 'RECT', 4, 5],
      ['18', 2, 4, 'SQUARE', 14, 5],
      ['19', 2, 4, 'SQUARE', 21, 5],
      ['20', 4, 6, 'ROUND', 28, 5],
      ['21', 2, 4, 'BAR_STOOL', 6, 15],
      ['22', 2, 4, 'BAR_STOOL', 12, 15],
    ],
  },
  {
    name: 'Bala Upstairs',
    nameUr: 'بالا اوپر',
    slug: 'bala-upstairs',
    tables: [
      ['23', 2, 4, 'SQUARE', 5, 6],
      ['24', 2, 4, 'SQUARE', 12, 6],
      ['25', 4, 6, 'ROUND', 19, 6],
      ['26', 2, 4, 'SQUARE', 27, 6],
      ['27', 4, 8, 'RECT', 5, 15],
      ['28', 2, 4, 'SQUARE', 16, 15],
    ],
  },
];

export const MOCK_ZONES: readonly Zone[] = ZONE_SPECS.map((spec, index) => ({
  id: uuidFrom(`zone:${spec.slug}`),
  name: spec.name,
  nameUr: spec.nameUr,
  sortOrder: index + 1,
  gridCols: 40,
  gridRows: 24,
  backgroundImageKey: null,
  isActive: true,
}));

/** One table per §9.1 state, so the floor plan can be reviewed in full. */
const STATUS_BY_CODE: Readonly<Record<string, TableStatus>> = {
  '1': 'SEATED',
  '2': 'FREE',
  '3': 'CLEANING',
  '4': 'ORDERED',
  '5': 'FREE',
  '6': 'ORDERED',
  '7': 'RESERVED',
  '8': 'FREE',
  '9': 'PAYING',
  '10': 'FREE',
  '11': 'BLOCKED',
  '12': 'ORDERED',
  '13': 'FREE',
  '14': 'PAYING',
  '15': 'FREE',
  '16': 'SERVED',
  '17': 'SERVED',
  '18': 'FREE',
  '19': 'FREE',
  '20': 'SEATED',
  '21': 'FREE',
  '22': 'FREE',
  '23': 'FREE',
  '24': 'CLEANING',
  '25': 'FREE',
  '26': 'FREE',
  '27': 'FREE',
  '28': 'FREE',
};

export const MOCK_TABLES: readonly FloorTable[] = ZONE_SPECS.flatMap((spec) =>
  spec.tables.map(([code, minSeats, maxSeats, shape, x, y]) => ({
    id: uuidFrom(`table:${code}`),
    zoneId: uuidFrom(`zone:${spec.slug}`),
    code,
    minSeats,
    maxSeats,
    shape,
    geometry: {
      x,
      y,
      width: shape === 'RECT' ? 8 : shape === 'BOOTH' ? 6 : 5,
      height: shape === 'BOOTH' ? 4 : 5,
      rotation: 0,
    },
    status: STATUS_BY_CODE[code] ?? 'FREE',
    statusChangedAt: ago(600),
    mergedIntoId: null,
  })),
);

/** §5.5 — without a session there is no dwell, no covers, and no attribution. */
export const MOCK_TABLE_SESSIONS: readonly TableSession[] = [
  {
    id: uuidFrom('session:table-17'),
    tableId: uuidFrom('table:17'),
    openedAt: ago(1450),
    closedAt: null,
    guestCount: 4,
    waiterId: uuidFrom('staff:owner'),
    waiterInitials: 'AK',
    mergedGroupId: null,
    note: null,
  },
  {
    id: uuidFrom('session:table-4'),
    tableId: uuidFrom('table:4'),
    openedAt: ago(760),
    closedAt: null,
    guestCount: 6,
    waiterId: uuidFrom('staff:waiter-1'),
    waiterInitials: 'BA',
    mergedGroupId: null,
    note: 'Birthday — cake at the end',
  },
  {
    id: uuidFrom('session:table-9'),
    tableId: uuidFrom('table:9'),
    openedAt: ago(3900),
    closedAt: null,
    guestCount: 2,
    waiterId: uuidFrom('staff:cashier-1'),
    waiterInitials: 'SI',
    mergedGroupId: null,
    note: null,
  },
];

/**
 * §9.2 — the chip.
 *
 * `money` is null for a `WAITER`. §9.2 is explicit that the money row is
 * omitted entirely rather than blurred, and a null field is the only way to say
 * that without the component inventing a zero.
 *
 * ADR 0019 — the figure is always `Subtotal (ex tax)` (§6.9): the real total
 * is not knowable until the customer pays.
 */
export function tableChips(viewer: Viewer): readonly TableChip[] {
  const maySeeMoney = can(viewer, 'payment.take') || can(viewer, 'reports.read');

  return MOCK_TABLES.map((table) => {
    const session = MOCK_TABLE_SESSIONS.find((candidate) => candidate.tableId === table.id) ?? null;
    const order = MOCK_ORDERS.find((candidate) => candidate.tableId === table.id) ?? null;
    const zone = MOCK_ZONES.find((candidate) => candidate.id === table.zoneId);

    const money = !maySeeMoney || order === null ? null : { amount: orderSubtotal(order) };

    return {
      tableId: table.id,
      code: table.code,
      zoneName: zone?.name ?? '',
      status: table.status,
      maxSeats: table.maxSeats,
      seatedCount: session?.guestCount ?? 0,
      dwellSeconds: session === null ? 0 : elapsed(session.openedAt),
      waiterInitials: session?.waiterInitials ?? null,
      money,
      memberCodes: [],
    };
  });
}

/**
 * §9.3 summary bar. Re-exported from the contract so the mock, the floor plan,
 * and the M05 editor all derive it the same way (R16).
 */
export const floorSummary = summariseFloor;
