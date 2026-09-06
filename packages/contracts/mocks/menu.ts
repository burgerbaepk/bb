import { paisa } from '@natech/domain';
import type { Category, Menu, MenuItem, ModifierGroup } from '../src/menu';
import { uuidFrom } from './ids';

/**
 * The menu — BUILD-PLAN.md §5.3, §5.4.
 *
 * Built on the §5.3 **variant collapse**: `Special Mutton Mix Olive` is one
 * item with `Full` and `Half`, not two tiles. The same applies to Butter,
 * Pickle, Black Pepper, Machli Olive, and Machli Butter. That removes roughly
 * two thirds of the grid tiles, which is what stops the category strip
 * overflowing and hiding categories 4 to 13.
 *
 * Prices are **tax-exclusive** paisa (§5.3). The eight items on the Appendix
 * A.1 reference invoice carry the prices the invoice states; the rest carry
 * plausible prices so the grid can be reviewed at a realistic density. This is
 * mock data under a `mocks/` directory, which is the only place the C4 gate
 * permits it, and the real price list arrives with the M08 menu manager.
 */

const UOM_PLATED = 'U1000087';
const UOM_PIECES = 'U1000069';
const UOM_LITRE = 'U1000009';

interface CategorySpec {
  readonly name: string;
  readonly nameUr: string;
  readonly slug: string;
}

/** §5.4 — the categories. */
const CATEGORY_SPECS: readonly CategorySpec[] = [
  { name: '01 Mutton BBQ', nameUr: 'مٹن باربی کیو', slug: 'mutton-bbq' },
  { name: '02 Mutton Karahi', nameUr: 'مٹن کڑاہی', slug: 'mutton-karahi' },
  { name: '03 Taka Tak', nameUr: 'تکہ تک', slug: 'taka-tak' },
  { name: '04 Mutton Steam Roast', nameUr: 'مٹن سٹیم روسٹ', slug: 'steam-roast' },
  { name: '05 Chicken BBQ', nameUr: 'چکن باربی کیو', slug: 'chicken-bbq' },
  { name: '06 Winter', nameUr: 'سردیوں کے کھانے', slug: 'winter' },
  { name: '07 Chicken', nameUr: 'چکن', slug: 'chicken' },
  { name: '08 Raita / Salad', nameUr: 'رائتہ اور سلاد', slug: 'raita-salad' },
  { name: '09 Desserts', nameUr: 'میٹھا', slug: 'desserts' },
  { name: '10 Drinks', nameUr: 'مشروبات', slug: 'drinks' },
  { name: '11 Tandoor', nameUr: 'تندور', slug: 'tandoor' },
  { name: 'Raita', nameUr: 'رائتہ', slug: 'raita' },
  { name: 'Extra', nameUr: 'اضافی', slug: 'extra' },
];

export const MOCK_CATEGORIES: readonly Category[] = CATEGORY_SPECS.map((spec, index) => ({
  id: uuidFrom(`category:${spec.slug}`),
  name: spec.name,
  nameUr: spec.nameUr,
  slug: spec.slug,
  sortOrder: index + 1,
  colour: null,
  isActive: true,
}));

export function categoryBySlug(slug: string): Category {
  const found = MOCK_CATEGORIES.find((category) => category.slug === slug);
  if (found === undefined) throw new Error(`no category ${slug}`);
  return found;
}

/** §5.3 — modifier groups. §10.1 makes these the loudest thing on an order line. */
export const MOCK_MODIFIER_GROUPS: readonly ModifierGroup[] = [
  {
    id: uuidFrom('modgroup:spice'),
    name: 'Spice level',
    nameUr: 'مرچ',
    minSelect: 1,
    maxSelect: 1,
    isRequired: true,
    modifiers: [
      {
        id: uuidFrom('mod:spice-mild'),
        name: 'Mild',
        nameUr: 'ہلکی',
        priceDelta: paisa(0n),
      },
      {
        id: uuidFrom('mod:spice-medium'),
        name: 'Medium',
        nameUr: 'درمیانی',
        priceDelta: paisa(0n),
      },
      {
        id: uuidFrom('mod:spice-hot'),
        name: 'Extra hot',
        nameUr: 'تیز',
        priceDelta: paisa(0n),
      },
    ],
  },
  {
    id: uuidFrom('modgroup:extras'),
    name: 'Extras',
    nameUr: 'اضافی',
    minSelect: 0,
    maxSelect: 3,
    isRequired: false,
    modifiers: [
      {
        id: uuidFrom('mod:extra-butter'),
        name: 'Extra butter',
        nameUr: 'اضافی مکھن',
        priceDelta: paisa(5000n),
      },
      {
        id: uuidFrom('mod:no-onion'),
        name: 'No onion',
        nameUr: 'پیاز کے بغیر',
        priceDelta: paisa(0n),
      },
      {
        id: uuidFrom('mod:extra-lemon'),
        name: 'Extra lemon',
        nameUr: 'اضافی لیموں',
        priceDelta: paisa(2000n),
      },
    ],
  },
  {
    id: uuidFrom('modgroup:bread'),
    name: 'Bread finish',
    nameUr: 'روٹی',
    minSelect: 0,
    maxSelect: 1,
    isRequired: false,
    modifiers: [
      {
        id: uuidFrom('mod:bread-butter'),
        name: 'Buttered',
        nameUr: 'مکھن لگا',
        priceDelta: paisa(3000n),
      },
      {
        id: uuidFrom('mod:bread-sesame'),
        name: 'Sesame',
        nameUr: 'تل والا',
        priceDelta: paisa(2000n),
      },
    ],
  },
];

interface ItemSpec {
  readonly categorySlug: string;
  readonly sku: string;
  readonly name: string;
  readonly nameUr: string;
  readonly slug: string;
  readonly description: string | null;
  readonly descriptionUr: string | null;
  readonly price: bigint;
  readonly uom: string;
  /** §5.3 — a collapsed item. `[label, urdu, delta]` per variant. */
  readonly variants?: readonly (readonly [string, string, bigint])[];
  readonly modifierGroups?: readonly string[];
}

const ITEM_SPECS: readonly ItemSpec[] = [
  // ---- the eight lines on the Appendix A.1 reference invoice --------------
  {
    categorySlug: 'mutton-bbq',
    sku: 'MTK-4PC',
    name: 'Mutton Tikka - 4 Pcs',
    nameUr: 'مٹن تکہ',
    slug: 'mutton-tikka-4-pcs',
    description: 'Four pieces of charcoal-grilled mutton tikka.',
    descriptionUr: 'کوئلے پر بنے چار پیس مٹن تکہ۔',
    price: 53000n,
    uom: UOM_PIECES,
    modifierGroups: ['modgroup:spice', 'modgroup:extras'],
  },
  {
    categorySlug: 'mutton-bbq',
    sku: 'MGK-5PC',
    name: 'Mutton Gola Kabab - 5 Pcs',
    nameUr: 'مٹن گولا کباب',
    slug: 'mutton-gola-kabab-5-pcs',
    description: 'Five skewers of minced mutton gola kabab.',
    descriptionUr: 'پانچ سیخ مٹن گولا کباب۔',
    price: 66000n,
    uom: UOM_PIECES,
    modifierGroups: ['modgroup:spice'],
  },
  {
    categorySlug: 'mutton-bbq',
    sku: 'SMC',
    name: 'Special Mutton Champ',
    nameUr: 'سپیشل مٹن چانپ',
    slug: 'special-mutton-champ',
    description: 'Marinated mutton chops from the grill.',
    descriptionUr: 'مصالحے میں بھگوئے مٹن چانپ۔',
    price: 139000n,
    uom: UOM_PLATED,
    modifierGroups: ['modgroup:spice'],
  },
  {
    categorySlug: 'mutton-bbq',
    sku: 'SMMO',
    name: 'Special Mutton Mix Olive',
    nameUr: 'سپیشل مٹن مکس زیتون',
    slug: 'special-mutton-mix-olive',
    description: 'Mixed mutton in olive oil, half or full.',
    descriptionUr: 'زیتون کے تیل میں مکس مٹن، ہاف یا فل۔',
    price: 302000n,
    uom: UOM_PLATED,
    variants: [
      ['Half', 'ہاف', 0n],
      ['Full', 'فل', 264000n],
    ],
  },
  {
    categorySlug: 'tandoor',
    sku: 'ROTI-PH',
    name: 'Roti Per Head',
    nameUr: 'روٹی فی کس',
    slug: 'roti-per-head',
    description: null,
    descriptionUr: null,
    price: 8000n,
    uom: UOM_PIECES,
    modifierGroups: ['modgroup:bread'],
  },
  {
    categorySlug: 'raita',
    sku: 'RAITA-HB',
    name: 'Half Bowl',
    nameUr: 'ہاف باؤل',
    slug: 'raita-half-bowl',
    description: 'Half bowl of mint raita.',
    descriptionUr: 'پودینے کا ہاف باؤل رائتہ۔',
    price: 26000n,
    uom: UOM_PLATED,
  },
  {
    categorySlug: 'raita-salad',
    sku: 'SALAD-FR',
    name: 'Fresh Salad',
    nameUr: 'تازہ سلاد',
    slug: 'fresh-salad',
    description: 'Cucumber, tomato, onion, lemon.',
    descriptionUr: 'کھیرا، ٹماٹر، پیاز، لیموں۔',
    price: 27000n,
    uom: UOM_PLATED,
    modifierGroups: ['modgroup:extras'],
  },
  {
    categorySlug: 'drinks',
    sku: 'WATER-15L',
    name: 'Mineral Water 1.5 Litre',
    nameUr: 'منرل واٹر',
    slug: 'mineral-water-1-5-litre',
    description: null,
    descriptionUr: null,
    price: 16000n,
    uom: UOM_LITRE,
  },
];

/**
 * The remaining §5.3 collapses and the items named elsewhere in the plan.
 *
 * Each of these is one tile with variants, which is the whole point: the grid
 * this replaces renders Butter, Pickle, Black Pepper, Machli Olive, and Machli
 * Butter as ten separate tiles.
 */
const COLLAPSED_SPECS: readonly ItemSpec[] = (
  [
    ['Butter', 'بٹر', 'butter-olive', 268000n],
    ['Pickle', 'اچار', 'pickle-olive', 272000n],
    ['Black Pepper', 'کالی مرچ', 'black-pepper-olive', 276000n],
    ['Machli Olive', 'مچھلی زیتون', 'machli-olive', 310000n],
    ['Machli Butter', 'مچھلی بٹر', 'machli-butter', 318000n],
  ] as const
).map(([name, nameUr, slug, price]) => ({
  categorySlug: 'mutton-bbq',
  sku: slug.toUpperCase(),
  name,
  nameUr,
  slug,
  description: null,
  descriptionUr: null,
  price,
  uom: UOM_PLATED,
  variants: [
    ['Full', 'فل', 0n],
    ['Half', 'ہاف', -128000n],
  ] as const,
}));

const REST_SPECS: readonly ItemSpec[] = [
  {
    categorySlug: 'mutton-bbq',
    sku: 'MGAN',
    name: 'Mutton Gandheri',
    nameUr: 'مٹن گنڈیری',
    slug: 'mutton-gandheri',
    description: 'Marrow-bone skewers, four pieces.',
    descriptionUr: 'گودے والی سیخ، چار پیس۔',
    price: 74000n,
    uom: UOM_PIECES,
    modifierGroups: ['modgroup:spice'],
  },
  {
    categorySlug: 'mutton-bbq',
    sku: 'MBTK',
    name: 'Mutton Boneless Tikka',
    nameUr: 'مٹن بونلیس تکہ',
    slug: 'mutton-boneless-tikka',
    description: null,
    descriptionUr: null,
    price: 61000n,
    uom: UOM_PIECES,
    modifierGroups: ['modgroup:spice'],
  },
  {
    categorySlug: 'mutton-karahi',
    sku: 'MKAR',
    name: 'Mutton Karahi',
    nameUr: 'مٹن کڑاہی',
    slug: 'mutton-karahi',
    description: 'Wok-cooked mutton karahi, half or full.',
    descriptionUr: 'کڑاہی میں پکا مٹن، ہاف یا فل۔',
    price: 168000n,
    uom: UOM_PLATED,
    variants: [
      ['Half', 'ہاف', 0n],
      ['Full', 'فل', 152000n],
    ],
    modifierGroups: ['modgroup:spice'],
  },
  {
    categorySlug: 'taka-tak',
    sku: 'TTAK',
    name: 'Mutton Taka Tak',
    nameUr: 'مٹن تکہ تک',
    slug: 'mutton-taka-tak',
    description: null,
    descriptionUr: null,
    price: 158000n,
    uom: UOM_PLATED,
    modifierGroups: ['modgroup:spice'],
  },
  {
    categorySlug: 'steam-roast',
    sku: 'MSTR',
    name: 'Mutton Steam Roast',
    nameUr: 'مٹن سٹیم روسٹ',
    slug: 'mutton-steam-roast',
    description: null,
    descriptionUr: null,
    price: 182000n,
    uom: UOM_PLATED,
  },
  {
    categorySlug: 'chicken-bbq',
    sku: 'CKAB',
    name: 'Chicken Kabab',
    nameUr: 'چکن کباب',
    slug: 'chicken-kabab',
    description: null,
    descriptionUr: null,
    price: 42000n,
    uom: UOM_PIECES,
    modifierGroups: ['modgroup:spice'],
  },
  {
    categorySlug: 'chicken-bbq',
    sku: 'CTKA',
    name: 'Chicken Tikka - 2 Pcs',
    nameUr: 'چکن تکہ',
    slug: 'chicken-tikka-2-pcs',
    description: null,
    descriptionUr: null,
    price: 38000n,
    uom: UOM_PIECES,
  },
  {
    categorySlug: 'chicken',
    sku: 'CHAND',
    name: 'Chicken Handi',
    nameUr: 'چکن ہانڈی',
    slug: 'chicken-handi',
    description: null,
    descriptionUr: null,
    price: 124000n,
    uom: UOM_PLATED,
  },
  {
    categorySlug: 'winter',
    sku: 'WPAY',
    name: 'Paya',
    nameUr: 'پائے',
    slug: 'paya',
    description: 'Slow-cooked trotters. Winter menu.',
    descriptionUr: 'سردیوں کا پائے۔',
    price: 96000n,
    uom: UOM_PLATED,
  },
  {
    categorySlug: 'raita-salad',
    sku: 'RAITA-FB',
    name: 'Full Bowl Raita',
    nameUr: 'فل باؤل رائتہ',
    slug: 'full-bowl-raita',
    description: null,
    descriptionUr: null,
    price: 44000n,
    uom: UOM_PLATED,
  },
  {
    categorySlug: 'desserts',
    sku: 'KHEER',
    name: 'Kheer',
    nameUr: 'کھیر',
    slug: 'kheer',
    description: null,
    descriptionUr: null,
    price: 32000n,
    uom: UOM_PLATED,
  },
  {
    categorySlug: 'drinks',
    sku: 'SOFT-REG',
    name: 'Soft Drink Regular',
    nameUr: 'کولڈ ڈرنک',
    slug: 'soft-drink-regular',
    description: null,
    descriptionUr: null,
    price: 12000n,
    uom: UOM_LITRE,
  },
  {
    categorySlug: 'drinks',
    sku: 'LASSI',
    name: 'Sweet Lassi',
    nameUr: 'میٹھی لسی',
    slug: 'sweet-lassi',
    description: null,
    descriptionUr: null,
    price: 22000n,
    uom: UOM_LITRE,
  },
  {
    categorySlug: 'tandoor',
    sku: 'RNAN',
    name: 'Roghni Nan',
    nameUr: 'روغنی نان',
    slug: 'roghni-nan',
    description: null,
    descriptionUr: null,
    price: 12000n,
    uom: UOM_PIECES,
    modifierGroups: ['modgroup:bread'],
  },
  {
    categorySlug: 'extra',
    sku: 'EXTRA-CHTNY',
    name: 'Chutney',
    nameUr: 'چٹنی',
    slug: 'chutney',
    description: null,
    descriptionUr: null,
    price: 6000n,
    uom: UOM_PLATED,
  },
];

const ALL_SPECS: readonly ItemSpec[] = [...ITEM_SPECS, ...COLLAPSED_SPECS, ...REST_SPECS];

function toMenuItem(spec: ItemSpec, index: number): MenuItem {
  const groups = (spec.modifierGroups ?? []).map((key) => {
    const group = MOCK_MODIFIER_GROUPS.find((candidate) => candidate.id === uuidFrom(key));
    if (group === undefined) throw new Error(`no modifier group ${key}`);
    return group;
  });

  return {
    id: uuidFrom(`item:${spec.slug}`),
    categoryId: categoryBySlug(spec.categorySlug).id,
    sku: spec.sku,
    name: spec.name,
    nameUr: spec.nameUr,
    slug: spec.slug,
    description: spec.description,
    descriptionUr: spec.descriptionUr,
    imageKey: null,
    basePrice: paisa(spec.price),
    taxClass: 'STANDARD_FOOD',
    variants: (spec.variants ?? []).map(([name, nameUr, delta], variantIndex) => ({
      id: uuidFrom(`variant:${spec.slug}:${name}`),
      name,
      nameUr,
      priceDelta: paisa(delta),
      isDefault: variantIndex === 0,
    })),
    modifierGroups: groups,
    sortOrder: index + 1,
    isActive: true,
  };
}

export const MOCK_MENU_ITEMS: readonly MenuItem[] = ALL_SPECS.map(toMenuItem);

export const MOCK_MENU: Menu = {
  categories: [...MOCK_CATEGORIES],
  items: [...MOCK_MENU_ITEMS],
};

export function itemBySlug(slug: string): MenuItem {
  const found = MOCK_MENU_ITEMS.find((item) => item.slug === slug);
  if (found === undefined) throw new Error(`no menu item ${slug}`);
  return found;
}
