/**
 * Floor zones — BUILD-PLAN.md §5.5, pre-flight P7.
 *
 * The existing system encodes zones inside table names as `1 B`, `1 BU`, `1 F`,
 * `1 U` (defect V9). §5.5 splits that into `zone_id` plus `code`.
 *
 * P7 asks the restaurant what B, BU, F and U actually stand for. These are the
 * §20 defaults and are a guess — a floor plan labelled with the wrong zone
 * names is worse than one labelled B and U, because staff will trust it.
 */
export interface ZoneSeed {
  readonly name: string;
  readonly nameUr: string;
  readonly legacyCode: string;
  readonly sortOrder: number;
  readonly gridCols: number;
  readonly gridRows: number;
}

export const ZONES: readonly ZoneSeed[] = [
  { name: 'Bala', nameUr: 'بالا', legacyCode: 'B', sortOrder: 1, gridCols: 40, gridRows: 24 },
  {
    name: 'Bala Upstairs',
    nameUr: 'بالا اوپر',
    legacyCode: 'BU',
    sortOrder: 2,
    gridCols: 40,
    gridRows: 24,
  },
  { name: 'Front', nameUr: 'سامنے', legacyCode: 'F', sortOrder: 3, gridCols: 40, gridRows: 24 },
  { name: 'Upstairs', nameUr: 'اوپر', legacyCode: 'U', sortOrder: 4, gridCols: 40, gridRows: 24 },
];
