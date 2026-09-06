/**
 * Demand sheet catalogue — ADR 0026 (amended), docs/runfiles/M24-demand-catalogue.md.
 *
 * The standing list a manager walks the store against. Transcribed from the
 * restaurant's own printed demand sheet — four columns, in the printed order,
 * which `sortOrder` preserves so the screen reads like the paper.
 *
 * **This is client data and belongs here, not in `apps/`.** "Turbo", "Mighty"
 * and "Zinger" are this restaurant's product names; another deployment gets a
 * different file, exactly as ADR 0012 treats the menu. R12's brand-grep guards
 * `apps/`, and a catalogue transcribed into a component would have put one
 * client's stock list into every build.
 *
 * **No units.** The paper form has no unit column — everyone in the kitchen
 * knows chicken is kilos and pizza boxes are pieces. Guessing a unit for 143
 * items would put 143 fabricated values on a live screen, which is the defect
 * class ADR 0025 removed from the settings page. `defaultUnit` is null until
 * somebody who knows fills it in.
 *
 * The two divider cells on the paper — "Miscellaneous" in the Items column and
 * "Misc" in Drinks — are visual rules, not things to buy, so they are not
 * items. Their position survives in `sortOrder`.
 *
 * 146 cells on the sheet, 143 items here: two dividers, and "Black pepper"
 * printed twice in the Bakery column.
 */
export interface DemandItemSeed {
  readonly name: string;
  readonly category: string;
  readonly sortOrder: number;
}

export const DEMAND_ITEMS: readonly DemandItemSeed[] = [
  // ---- Items -------------------------------------------------------
  { name: 'Meat', category: 'Items', sortOrder: 1 },
  { name: 'Turbo', category: 'Items', sortOrder: 2 },
  { name: 'Mighty', category: 'Items', sortOrder: 3 },
  { name: 'Zinger', category: 'Items', sortOrder: 4 },
  { name: 'Potato', category: 'Items', sortOrder: 5 },
  { name: 'Tortilla', category: 'Items', sortOrder: 6 },
  // Miscellaneous — a divider on the paper, not an item.
  { name: 'Gas', category: 'Items', sortOrder: 8 },
  { name: 'Viper', category: 'Items', sortOrder: 9 },
  { name: 'Gloves', category: 'Items', sortOrder: 10 },
  { name: 'Glass', category: 'Items', sortOrder: 11 },
  { name: 'Tissue', category: 'Items', sortOrder: 12 },
  { name: 'Dips', category: 'Items', sortOrder: 13 },
  { name: 'F2', category: 'Items', sortOrder: 14 },
  { name: 'Lids', category: 'Items', sortOrder: 15 },
  { name: 'Butter Paper', category: 'Items', sortOrder: 16 },
  { name: 'Food bag (s)', category: 'Items', sortOrder: 17 },
  { name: 'Food bag (m)', category: 'Items', sortOrder: 18 },
  { name: 'Food bag (l)', category: 'Items', sortOrder: 19 },
  { name: 'Duster', category: 'Items', sortOrder: 20 },
  { name: 'Butter paper S', category: 'Items', sortOrder: 21 },
  { name: 'Butter paper L', category: 'Items', sortOrder: 22 },
  { name: 'Liner (s)', category: 'Items', sortOrder: 23 },
  { name: 'Liner (l)', category: 'Items', sortOrder: 24 },
  { name: 'Food tray D.J', category: 'Items', sortOrder: 25 },
  { name: 'Food tray T.A', category: 'Items', sortOrder: 26 },
  { name: 'Forks', category: 'Items', sortOrder: 27 },
  { name: 'Pizza box (s)', category: 'Items', sortOrder: 28 },
  { name: 'Pizza box (m)', category: 'Items', sortOrder: 29 },
  { name: 'Pizza box (l)', category: 'Items', sortOrder: 30 },
  { name: 'Pizza box (XD)', category: 'Items', sortOrder: 31 },
  { name: 'Pizza table', category: 'Items', sortOrder: 32 },
  { name: 'Pizza (s)', category: 'Items', sortOrder: 33 },
  { name: 'Pizza (m)', category: 'Items', sortOrder: 34 },
  { name: 'Pizza (l)', category: 'Items', sortOrder: 35 },
  { name: 'Pizza (xl)', category: 'Items', sortOrder: 36 },
  // ---- Kitchen -----------------------------------------------------
  { name: 'Chicken', category: 'Kitchen', sortOrder: 1 },
  { name: 'Butterfly', category: 'Kitchen', sortOrder: 2 },
  { name: 'Chilli', category: 'Kitchen', sortOrder: 3 },
  { name: 'Tomato', category: 'Kitchen', sortOrder: 4 },
  { name: 'Tawny', category: 'Kitchen', sortOrder: 5 },
  { name: 'Fries', category: 'Kitchen', sortOrder: 6 },
  { name: 'Mozzarella', category: 'Kitchen', sortOrder: 7 },
  { name: 'Pizza Cheese', category: 'Kitchen', sortOrder: 8 },
  { name: 'Thigh', category: 'Kitchen', sortOrder: 9 },
  { name: 'Nuggets', category: 'Kitchen', sortOrder: 10 },
  { name: 'Wings', category: 'Kitchen', sortOrder: 11 },
  { name: 'Lettuce', category: 'Kitchen', sortOrder: 12 },
  { name: 'Mayo', category: 'Kitchen', sortOrder: 13 },
  { name: 'Red Mayo', category: 'Kitchen', sortOrder: 14 },
  { name: 'Aghaz', category: 'Kitchen', sortOrder: 15 },
  { name: 'Simple oil', category: 'Kitchen', sortOrder: 16 },
  { name: 'Bread Crumbs', category: 'Kitchen', sortOrder: 17 },
  { name: 'Milk', category: 'Kitchen', sortOrder: 18 },
  { name: 'Patty', category: 'Kitchen', sortOrder: 19 },
  { name: 'Snack', category: 'Kitchen', sortOrder: 20 },
  { name: 'BBQ', category: 'Kitchen', sortOrder: 21 },
  { name: 'Smoky bbq', category: 'Kitchen', sortOrder: 22 },
  { name: 'Sriracha', category: 'Kitchen', sortOrder: 23 },
  { name: 'Pizza Sauce', category: 'Kitchen', sortOrder: 24 },
  { name: 'Peri Peri', category: 'Kitchen', sortOrder: 25 },
  { name: 'Powum', category: 'Kitchen', sortOrder: 26 },
  { name: 'Chilli (s)', category: 'Kitchen', sortOrder: 27 },
  { name: 'Tomato (s)', category: 'Kitchen', sortOrder: 28 },
  { name: 'Cheese Slice', category: 'Kitchen', sortOrder: 29 },
  { name: 'Mustard', category: 'Kitchen', sortOrder: 30 },
  { name: 'Olive', category: 'Kitchen', sortOrder: 31 },
  { name: 'Jalapeno', category: 'Kitchen', sortOrder: 32 },
  { name: 'Eggs', category: 'Kitchen', sortOrder: 33 },
  { name: 'Mint', category: 'Kitchen', sortOrder: 34 },
  { name: 'Cucumber', category: 'Kitchen', sortOrder: 35 },
  { name: 'Onion', category: 'Kitchen', sortOrder: 36 },
  { name: 'Garlic', category: 'Kitchen', sortOrder: 37 },
  // ---- Bakery ------------------------------------------------------
  { name: 'Flour Zinger', category: 'Bakery', sortOrder: 1 },
  { name: 'Flour Rice', category: 'Bakery', sortOrder: 2 },
  { name: 'Corn flour', category: 'Bakery', sortOrder: 3 },
  { name: 'Soya sauce', category: 'Bakery', sortOrder: 4 },
  { name: 'Hot sauce', category: 'Bakery', sortOrder: 5 },
  { name: 'Black pepper', category: 'Bakery', sortOrder: 6 },
  { name: 'White pepper', category: 'Bakery', sortOrder: 7 },
  { name: 'Chilli flakes', category: 'Bakery', sortOrder: 8 },
  { name: 'Salt', category: 'Bakery', sortOrder: 9 },
  { name: 'Lemon juice', category: 'Bakery', sortOrder: 10 },
  { name: 'Vinegar', category: 'Bakery', sortOrder: 11 },
  { name: 'Oregano', category: 'Bakery', sortOrder: 12 },
  { name: 'Shakar', category: 'Bakery', sortOrder: 13 },
  { name: 'Sugar', category: 'Bakery', sortOrder: 14 },
  { name: 'corns', category: 'Bakery', sortOrder: 15 },
  { name: 'Tea', category: 'Bakery', sortOrder: 16 },
  { name: 'Tang', category: 'Bakery', sortOrder: 17 },
  { name: 'Channa', category: 'Bakery', sortOrder: 18 },
  { name: 'Khushkash', category: 'Bakery', sortOrder: 19 },
  { name: 'Dhaniya', category: 'Bakery', sortOrder: 20 },
  { name: 'Zeera', category: 'Bakery', sortOrder: 21 },
  { name: 'Butter', category: 'Bakery', sortOrder: 22 },
  { name: 'Elka', category: 'Bakery', sortOrder: 23 },
  { name: 'Icing Sugar', category: 'Bakery', sortOrder: 24 },
  { name: 'Yeast', category: 'Bakery', sortOrder: 25 },
  { name: 'Dry Milk', category: 'Bakery', sortOrder: 26 },
  { name: 'Gluten', category: 'Bakery', sortOrder: 27 },
  { name: 'Sausages', category: 'Bakery', sortOrder: 28 },
  { name: 'Pizza Topping', category: 'Bakery', sortOrder: 29 },
  { name: 'Tikka', category: 'Bakery', sortOrder: 30 },
  { name: 'Fajita', category: 'Bakery', sortOrder: 31 },
  { name: 'Malai', category: 'Bakery', sortOrder: 32 },
  { name: 'Smoky', category: 'Bakery', sortOrder: 33 },
  { name: 'Mughlai', category: 'Bakery', sortOrder: 34 },
  // 'Black pepper' is printed twice in the Bakery column of the supplied
  // sheet — at rows F13 and F38. It is one thing to buy, so it is one row
  // here; a second identical box would let a manager order it twice.
  { name: 'Ch. pepperoni', category: 'Bakery', sortOrder: 36 },
  { name: 'Beef pepperoni', category: 'Bakery', sortOrder: 37 },
  // ---- Drinks ------------------------------------------------------
  { name: 'Pepsi', category: 'Drinks', sortOrder: 1 },
  { name: '7up', category: 'Drinks', sortOrder: 2 },
  { name: 'Dew', category: 'Drinks', sortOrder: 3 },
  { name: 'Fanta', category: 'Drinks', sortOrder: 4 },
  { name: 'Sting 300', category: 'Drinks', sortOrder: 5 },
  { name: 'Sting 500', category: 'Drinks', sortOrder: 6 },
  { name: 'Water 500', category: 'Drinks', sortOrder: 7 },
  { name: 'Water 1.5', category: 'Drinks', sortOrder: 8 },
  { name: 'Coke 1.0', category: 'Drinks', sortOrder: 9 },
  { name: 'Coke 1.5', category: 'Drinks', sortOrder: 10 },
  { name: 'Sprite 1.5', category: 'Drinks', sortOrder: 11 },
  { name: 'Coke can', category: 'Drinks', sortOrder: 12 },
  { name: 'Sprite can', category: 'Drinks', sortOrder: 13 },
  { name: 'Zero can', category: 'Drinks', sortOrder: 14 },
  { name: '0.5 pepsi', category: 'Drinks', sortOrder: 15 },
  // Misc — a divider on the paper, not an item.
  { name: 'Ice', category: 'Drinks', sortOrder: 17 },
  { name: 'Lemon max', category: 'Drinks', sortOrder: 18 },
  { name: 'Soap', category: 'Drinks', sortOrder: 19 },
  { name: 'Steel wool', category: 'Drinks', sortOrder: 20 },
  { name: 'Phenyl', category: 'Drinks', sortOrder: 21 },
  { name: 'Scotch brite', category: 'Drinks', sortOrder: 22 },
  { name: 'Tape', category: 'Drinks', sortOrder: 23 },
  { name: 'Stapler pins', category: 'Drinks', sortOrder: 24 },
  { name: 'Printer rolls', category: 'Drinks', sortOrder: 25 },
  { name: 'Flags', category: 'Drinks', sortOrder: 26 },
  { name: 'Sticks', category: 'Drinks', sortOrder: 27 },
  { name: 'Bar glass', category: 'Drinks', sortOrder: 28 },
  { name: 'Straws', category: 'Drinks', sortOrder: 29 },
  { name: 'Surf', category: 'Drinks', sortOrder: 30 },
  { name: 'Serving trays', category: 'Drinks', sortOrder: 31 },
  { name: 'Oil tray', category: 'Drinks', sortOrder: 32 },
  { name: 'Dates check', category: 'Drinks', sortOrder: 33 },
  { name: 'Cleaning', category: 'Drinks', sortOrder: 34 },
  { name: 'Beef', category: 'Drinks', sortOrder: 35 },
  { name: 'Cardamom', category: 'Drinks', sortOrder: 36 },
];
