/** Menu transcribed from the client-supplied price list (BurgerBae_Products_Updated.xlsx, 4 September 2026). */
export interface CategorySeed {
  readonly name: string;
  readonly nameUr: string | null;
  readonly sortOrder: number;
}

/**
 * Ordered for the terminal grid, not alphabetically: a till operator reaches
 * for deals and signature burgers far more often than for a glass or a dip,
 * and §4.2's one-thumb rule means the common categories have to sit first.
 */
const categoryNames = [
  'Deals',
  'Signature Burgers',
  'Burgers',
  'Wraps & Tortillas',
  'Pizza',
  'Fries',
  'Side Orders',
  'Beverages',
] as const;
export const CATEGORIES: readonly CategorySeed[] = categoryNames.map((name, sortOrder) => ({
  name,
  nameUr: null,
  sortOrder,
}));

export interface MenuItemSeed {
  readonly variants?: readonly { name: string; priceDelta: bigint; isDefault: boolean }[];
  readonly category: string;
  readonly sku: string;
  readonly name: string;
  readonly nameUr: string | null;
  readonly description: string | null;
  readonly basePrice: bigint;
  readonly uomCode: string;
  readonly isActive: boolean;
  readonly imageKey: string | null;
}
type Raw = readonly [string, string, number];

/**
 * Product photography, keyed by SKU. Files are version-controlled under each
 * app's `public/images`; `resolveAssetUrl` accepts the bare filename.
 *
 * Deliberately partial. An item with no photograph renders as a name-and-price
 * tile, which is correct — a wrong photograph on a till button is how the
 * wrong item gets rung up, so a missing image is always preferable to an
 * approximate one. The two nachos burgers share one shot because the client
 * supplied a single image for the pair.
 */
const imageKeyBySku: Readonly<Record<string, string>> = {
  DL02: 'double-signature-deal.jpg',
  DL03: 'double-grilled-deal.jpg',
  DL04: 'double-zinger-deal.jpg',
  DL13: 'double-grilled-deal.jpg',
  DL14: 'double-zinger-deal.jpg',
  DL15: 'double-signature-deal.jpg',
  SB01: 'bae-beef-signature.jpg',
  SB02: 'bae-chicken-signature.jpg',
  SB03: 'big-blue-bang-beef.jpg',
  SB04: 'big-blue-bang-chicken.jpg',
  SB05: 'beef-chicken-combo.jpg',
  SB06: 'crunchy-monster-burger.jpg',
  SB07: 'messy-mighty-zinger.jpg',
  SB09: 'nachos-cheese-burger.jpg',
  SB10: 'nachos-cheese-burger.jpg',
  SB11: 'peri-peri-grilled-burger.jpg',
  BG01: 'zinger-burger.jpg',
  BG03: 'chicken-grilled-burger.jpg',
  BG04: 'jalapeno-grilled-burger.jpg',
  BG06: 'tower-grilled-burger.jpg',
  BG13: 'dip.jpg',
  FR03: 'loaded-fries.jpg',
  FR04: 'loaded-fries.jpg',
  FR05: 'loaded-fries.jpg',
  SD01: 'nuggets.jpg',
  SD02: 'nuggets.jpg',
  BV01: 'drink-345ml.jpg',
  BV02: 'drink-500ml.jpg',
  BV03: 'drink-1000ml.jpg',
  BV04: 'drink-1500ml.jpg',
  BV07: 'mineral-water-small.jpg',
  BV08: 'mineral-water-large.jpg',
};

/**
 * Menu copy for the storefront, keyed by SKU — §13.2.
 *
 * The price list the client supplied carries no descriptions, and an item with
 * an empty one renders as a bare name and price: `MenuRow` and `ItemDetail`
 * both already read `description`, and `/menu/[category]/[slug]` falls back to
 * a generated sentence for its meta description when there is none. So this is
 * data the screens were built for and were never given.
 *
 * Written for the market the storefront actually serves: plain, warm English
 * of the kind a Pakistani customer reads on a food app, naming the thing on
 * the plate rather than describing a mood. Deliberately free of any place
 * name — a description is menu data, reusable by the next deployment, while
 * the outlet's own town is identity and lives in `outlet_config` (R12).
 *
 * Keyed by SKU rather than by name because `MENU_ITEMS` collapses a size
 * family down to its first SKU (`VARIANT_FAMILIES`): SD01 is no longer
 * "Nuggets 6 Pc" by the time it reaches the storefront, it is "Nuggets" with
 * two sizes. Every entry below is a SKU that survives that collapse, and the
 * copy for one is written for the family, not for the size.
 */
const descriptionBySku: Readonly<Record<string, string>> = {
  DL01: 'Two loaded tortilla wraps to share — for when one is never enough.',
  DL02: 'Two of our signature burgers, priced for you and one hungry friend.',
  DL03: 'Two flame-grilled chicken burgers, straight off the grill for two.',
  DL04: 'Two crispy zingers with that fiery crunch, sorted for a pair.',
  DL05: 'Grilled tortilla, crispy fries and a chilled drink — a full meal in one order.',
  DL06: 'Burger, fries and a drink together. The value pick for a quick lunch.',
  DL07: 'Grilled tortilla with a side and a regular drink, easy on the wallet.',
  DL08: 'A bigger combo for a bigger appetite: burger, sides and a chilled drink.',
  DL09: 'Three grilled chicken burgers and a large drink, made for three friends.',
  DL10: 'Signature burgers, fries and drinks for the whole family. Dinner is handled.',
  DL11: 'Grilled burgers, fries and drinks for four — a family table with no cooking.',
  DL12: 'Crispy zingers, fries and drinks for four. The family favourite.',
  DL13: 'Two grilled chicken burgers with a regular drink to share.',
  DL14: 'Two spicy zingers and a regular drink. Crunch for two.',
  DL15: 'Two signature burgers and a regular drink — our most-ordered pair.',
  DL16: 'Two freshly baked pizzas in the size that suits your table.',
  SB01: 'Our house beef patty, chargrilled and stacked with signature sauce.',
  SB02: 'The signature chicken fillet, crisp on the outside and juicy inside.',
  SB03: 'A double-stacked beef burger built for a serious appetite.',
  SB04: 'Tall, loaded chicken burger with sauce in every single bite.',
  SB05: 'Beef and chicken in one bun, for anyone who cannot choose.',
  SB06: 'A monster of a crunch: crispy fillet, fresh salad and creamy sauce.',
  SB07: 'A spicy zinger done properly messy. Worth the extra napkins.',
  SB08: 'Spicy zinger with molten cheese that runs out at the first bite.',
  SB09: 'Beef patty under a pile of nacho crunch and warm cheese sauce.',
  SB10: 'Crispy chicken with nacho chips and cheese sauce, chatpata to the last bite.',
  SB11: 'Grilled chicken rubbed in peri peri spice for a proper hit of heat.',
  BG01: 'The classic crispy zinger — spicy, crunchy and always a safe order.',
  BG02: 'A zinger with an extra smack of sauce and spice.',
  BG03: 'Flame-grilled chicken in a soft bun. Lighter than fried, just as filling.',
  BG04: 'Grilled chicken with jalapenos, for anyone who likes it hot.',
  BG05: 'Grilled chicken with tangy Mexican salsa and fresh salad.',
  BG06: 'A tower of grilled chicken, cheese and hash brown crunch.',
  BG07: 'Chargrilled beef patty with fresh salad and our house sauce.',
  BG08: 'A simple, honest patty burger. The pocket-friendly bite.',
  BG09: 'An extra cheese or beef patty, added to any burger.',
  BG10: 'A second zinger fillet, for double the crunch.',
  BG11: 'An extra chicken fillet to make a burger heavier.',
  BG12: 'One slice of melting cheese, laid over the top.',
  BG13: 'A pot of house dipping sauce for fries and burgers.',
  WT01: 'Chargrilled beef rolled into a soft tortilla with salad and sauce.',
  WT02: 'Our signature filling, wrapped up and easy to eat on the move.',
  WT03: 'Peri peri chicken in a warm tortilla with a fiery kick.',
  WT04: 'Crispy chicken strips wrapped with fresh salad for maximum crunch.',
  WT05: 'Grilled chicken, crisp salad and sauce in a soft tortilla.',
  WT06: 'A spicy zinger fillet rolled into a flaky desi paratha.',
  WT07: 'Grilled chicken in a hot paratha roll — the desi way to eat a burger.',
  WT08: 'Creamy malai chicken rolled in a paratha. Rich and mild.',
  PZ01: 'Our loaded house special. Pick the size that fits the table.',
  PZ05: 'A classic pizza, baked fresh to order, from small to extra large.',
  PZ09: 'Crown crust pizza with a ring of cheese-filled bites around the edge.',
  PZ12: 'Kabab-stuffed crust — desi flavour baked right into the edge.',
  PZ15: 'Warm cheese sticks, pulled apart and shared. Best with a dip.',
  FR01: 'Golden fries, salted and served hot. Medium or large.',
  FR03: 'Fries buried under sauce, cheese and toppings. A meal on their own.',
  FR04: 'Loaded fries topped with crispy chicken for the extra crunch.',
  FR05: 'Our signature loaded fries — cheese, sauce and everything on top.',
  SD01: 'Crispy chicken nuggets. A six-piece snack or a large plate to share.',
  SD03: 'Oven-baked wings, marinated overnight and lighter than fried.',
  SD04: 'Golden fried wings with a proper spice hit.',
  SD07: 'A full chicken platter with fries and dips. Sorted for two.',
  SD08: 'A loaded beef platter with fries and dips, made for sharing.',
  BV01: 'A chilled soft drink, from a single 345 ml to 1.5 litres for the table.',
  BV05: 'Chilled Sting energy drink, in 345 ml or 500 ml.',
  BV07: 'Sealed mineral water, small or large bottle.',
  BV09: 'A serving glass with your bottled drink.',
};

/**
 * The price list quotes whole rupees; R1 stores paisa, so the conversion
 * happens here rather than anywhere a reader could mistake 500 for five
 * rupees. `uomCode` is the FBR "Others" unit of measure — every line on this
 * menu is a prepared item sold by the piece, not by weight (§20 P3).
 */
const rows = (category: string, values: readonly Raw[]): MenuItemSeed[] =>
  values.map(([sku, name, rupees]) => ({
    category,
    sku,
    name,
    nameUr: null,
    description: descriptionBySku[sku] ?? null,
    basePrice: BigInt(rupees) * 100n,
    uomCode: 'U1000087',
    isActive: true,
    imageKey: imageKeyBySku[sku] ?? null,
  }));

export const SOURCE_MENU_ITEMS: readonly MenuItemSeed[] = [
  // The bracketed codes are the client's own kitchen shorthand for what a deal
  // contains (GT = grilled tortilla, CG = chicken grilled, SC = signature
  // chicken, NR = normal regular drink, LD = large drink). Kept verbatim: the
  // counter staff read the till by them, and the price list is the contract.
  ...rows('Deals', [
    ['DL01', 'Double Tortilla Deal', 1300],
    ['DL02', '2 Signature Deal', 1200],
    ['DL03', '2 Grill Deal', 900],
    ['DL04', '2 Zinger Deal', 900],
    ['DL05', 'Tortilla Deal (GT CRT NR)', 1180],
    ['DL06', 'Combo Deal 1', 1190],
    ['DL07', 'Combo Deal 2 (GT SL NR)', 1180],
    ['DL08', 'Combo Deal 3', 1490],
    ['DL09', 'Triple Treat (3 CG LD)', 1480],
    ['DL10', 'Family Deal Signature', 3500],
    ['DL11', 'Family Deal Grilled', 2250],
    ['DL12', 'Family Deal Zinger', 2250],
    ['DL13', 'Double Grilled Deal (2 CG NR)', 1000],
    ['DL14', 'Double Zinger Deal (2 ZINGER NR)', 1000],
    ['DL15', 'Double Signature Deal (2 SC NR)', 1400],
    ['DL16', 'Double Pizza Deal — Medium', 1900],
    ['DL17', 'Double Pizza Deal — Large', 2800],
    ['DL18', 'Double Pizza Deal — XL', 3700],
  ]),
  ...rows('Signature Burgers', [
    ['SB01', 'Bae Beef Signature', 850],
    ['SB02', 'Bae Chicken Signature', 700],
    ['SB03', 'Big Blue Bang Beef', 1100],
    ['SB04', 'Big Blue Bang Chicken', 800],
    ['SB05', 'Beef Chicken Combo', 850],
    ['SB06', 'Crunchy Monster Burger', 700],
    ['SB07', 'Messy Mighty Zinger', 690],
    ['SB08', 'Zinger Cheese Lava', 690],
    ['SB09', 'Nachos Cheese Beef', 850],
    ['SB10', 'Nachos Cheese Chicken', 700],
    ['SB11', 'Peri Peri Grilled Burger', 700],
  ]),
  // BG09–BG13 are add-ons rather than burgers. They stay in this category
  // because that is where the client's price list puts them, and because a
  // till operator adds a cheese slice while the burger is still on screen.
  ...rows('Burgers', [
    ['BG01', 'Zinger Burger', 500],
    ['BG02', 'Zinger Smack', 500],
    ['BG03', 'Chicken Grilled Burger', 500],
    ['BG04', 'Jalapeno Grilled Burger', 500],
    ['BG05', 'Mexican Salsa Burger', 500],
    ['BG06', 'Tower Grilled Burger', 550],
    ['BG07', 'Beef Grilled Burger', 550],
    ['BG08', 'Patty Burger', 350],
    ['BG09', 'Cheese / Beef Patty', 350],
    ['BG10', 'Extra Zinger / Smack', 300],
    ['BG11', 'Extra Chicken', 200],
    ['BG12', 'Cheese Slice', 50],
    ['BG13', 'Dip', 40],
  ]),
  ...rows('Wraps & Tortillas', [
    ['WT01', 'Beef Tortilla', 800],
    ['WT02', 'Signature Tortilla', 700],
    ['WT03', 'Peri Peri Tortilla', 700],
    ['WT04', 'Crunchy Tortilla', 650],
    ['WT05', 'Grilled Tortilla', 650],
    ['WT06', 'Zinger Paratha', 500],
    ['WT07', 'Grilled Chicken Paratha', 500],
    ['WT08', 'Malai Chicken Paratha', 500],
  ]),
  // Original price-list rows are retained as the source for size variants below.
  ...rows('Pizza', [
    ['PZ01', 'Burger Bae Special — Small', 650],
    ['PZ02', 'Burger Bae Special — Medium', 1250],
    ['PZ03', 'Burger Bae Special — Large', 1800],
    ['PZ04', 'Burger Bae Special — XL', 2400],
    ['PZ05', 'Small Pizza', 600],
    ['PZ06', 'Medium Pizza', 1100],
    ['PZ07', 'Large Pizza', 1600],
    ['PZ08', 'XL Pizza', 2100],
    ['PZ09', 'Medium Crown Crust', 1250],
    ['PZ10', 'Large Crown Crust', 1800],
    ['PZ11', 'XL Crown Crust', 2400],
    ['PZ12', 'Medium Kabab Crust', 1250],
    ['PZ13', 'Large Kabab Crust', 1800],
    ['PZ14', 'XL Kabab Crust', 2400],
    ['PZ15', 'Cheese Stick Small', 600],
    ['PZ16', 'Cheese Stick Medium', 1100],
    ['PZ17', 'Cheese Stick Large', 1600],
  ]),
  ...rows('Fries', [
    ['FR01', 'Medium Fries', 300],
    ['FR02', 'Large Fries', 400],
    ['FR03', 'Special Loaded Fries', 650],
    ['FR04', 'Crunchy Loaded Fries', 650],
    ['FR05', 'Signature Loaded Fries', 700],
  ]),
  ...rows('Side Orders', [
    ['SD01', 'Nuggets 6 Pc', 250],
    ['SD02', 'Nuggets', 500],
    ['SD03', 'Baked Wings 6 Pc', 380],
    ['SD04', 'Fried Wings 6 Pc', 380],
    ['SD05', 'Baked Wings', 750],
    ['SD06', 'Fried Wings', 750],
    ['SD07', 'Chicken Platter', 700],
    ['SD08', 'Beef Platter', 850],
  ]),
  // "Glass" is the counter's charge for a glass with a bottled drink, not a
  // drink in itself; it is priced and rung up like any other line.
  ...rows('Beverages', [
    ['BV01', '345 ML Drink', 100],
    ['BV02', '500 ML Drink', 140],
    ['BV03', '1000 ML Drink', 180],
    ['BV04', '1500 ML Drink', 230],
    ['BV05', 'Sting 345 ML', 110],
    ['BV06', 'Sting 500 ML', 150],
    ['BV07', 'Mineral Water Small', 70],
    ['BV08', 'Mineral Water Large', 120],
    ['BV09', 'Glass', 10],
  ]),
];

/** Explicit families: never infer a recipe or an unspecified portion from its price. */
export const VARIANT_FAMILIES = [
  {
    name: 'Nuggets',
    options: [
      ['SD01', '6 Pc'],
      ['SD02', 'Large'],
    ],
  },
  {
    name: 'Baked Wings',
    options: [
      ['SD03', '6 Pc'],
      ['SD05', 'Large'],
    ],
  },
  {
    name: 'Fried Wings',
    options: [
      ['SD04', '6 Pc'],
      ['SD06', 'Large'],
    ],
  },
  {
    name: 'Double Pizza Deal',
    options: [
      ['DL16', 'Medium'],
      ['DL17', 'Large'],
      ['DL18', 'XL'],
    ],
  },
  {
    name: 'Burger Bae Special',
    options: [
      ['PZ01', 'Small'],
      ['PZ02', 'Medium'],
      ['PZ03', 'Large'],
      ['PZ04', 'XL'],
    ],
  },
  {
    name: 'Pizza',
    options: [
      ['PZ05', 'Small'],
      ['PZ06', 'Medium'],
      ['PZ07', 'Large'],
      ['PZ08', 'XL'],
    ],
  },
  {
    name: 'Crown Crust',
    options: [
      ['PZ09', 'Medium'],
      ['PZ10', 'Large'],
      ['PZ11', 'XL'],
    ],
  },
  {
    name: 'Kabab Crust',
    options: [
      ['PZ12', 'Medium'],
      ['PZ13', 'Large'],
      ['PZ14', 'XL'],
    ],
  },
  {
    name: 'Cheese Stick',
    options: [
      ['PZ15', 'Small'],
      ['PZ16', 'Medium'],
      ['PZ17', 'Large'],
    ],
  },
  {
    name: 'Fries',
    options: [
      ['FR01', 'Medium'],
      ['FR02', 'Large'],
    ],
  },
  {
    name: 'Drink',
    options: [
      ['BV01', '345 ML'],
      ['BV02', '500 ML'],
      ['BV03', '1000 ML'],
      ['BV04', '1500 ML'],
    ],
  },
  {
    name: 'Sting',
    options: [
      ['BV05', '345 ML'],
      ['BV06', '500 ML'],
    ],
  },
  {
    name: 'Mineral Water',
    options: [
      ['BV07', 'Small'],
      ['BV08', 'Large'],
    ],
  },
] as const;

export const MENU_ITEMS: readonly MenuItemSeed[] = SOURCE_MENU_ITEMS.flatMap((item) => {
  const family = VARIANT_FAMILIES.find((candidate) =>
    candidate.options.some(([sku]) => sku === item.sku),
  );
  if (!family) return [item];
  if (family.options[0][0] !== item.sku) return [];
  return [
    {
      ...item,
      name: family.name,
      variants: family.options.map(([sku, name], index) => {
        const source = SOURCE_MENU_ITEMS.find((candidate) => candidate.sku === sku);
        if (!source) throw new Error(`Missing variant source ${sku}`);
        return { name, priceDelta: source.basePrice - item.basePrice, isDefault: index === 0 };
      }),
    },
  ];
});
