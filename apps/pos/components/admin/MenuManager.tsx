'use client';

import { useActionState, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, GripVertical, ImageOff, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  DataTable,
  IconButton,
  Money,
  SegmentedControl,
  SelectField,
  Sheet,
  StatusPill,
  Switch,
  TextField,
  cn,
  useToast,
} from '@natech/ui';
import type { Category, MenuItem, ModifierGroup, TaxClassKey } from '@natech/contracts';
import { MENU_IDLE } from '@/lib/menu/idle';
import {
  addVariantAction,
  assignModifierGroupAction,
  createCategoryAction,
  createMenuItemAction,
  deleteCategoryAction,
  deleteMenuItemAction,
  removeModifierGroupFromItemAction,
  removeVariantAction,
  reorderCategoriesAction,
  reorderItemModifierGroupsAction,
  reorderMenuItemsAction,
  updateCategoryAction,
  updateMenuItemAction,
  type ActionResult,
} from '@/lib/menu/actions';
import { useDragReorder } from '@/lib/menu/useDragReorder';
import { useAutoCloseOnSuccess } from '@/lib/useAutoCloseOnSuccess';
import { PageHeading } from './PageHeading';

/**
 * The menu manager — BUILD-PLAN.md §5.3, §7.6, §18 M05, M08.
 *
 * Three things this screen exists to make hard to get wrong.
 *
 * **A price is tax-exclusive** (§5.3) and the form says so beside the field.
 * The reference receipt settles it: the menu shows Rs. 530 and the invoice
 * line reads 4 × 530.00 against `Total (Ex Tax) 12,220.00`. Somebody typing a
 * tax-inclusive price here makes every check estimate wrong in both columns.
 *
 * **A size is a variant, not a second item** (§5.3). The item editor has a
 * variants section rather than a duplicate button, because the grid this
 * replaces carries Full and Half as separate tiles for six different dishes
 * and that is what overflows the category strip.
 *
 * **Reordering is a drag, not a number field.** Categories and the items
 * within one category both carry a plain-integer `sort_order`; dragging a row
 * re-sequences the whole affected list in one write (the runfile's
 * decision), rather than asking anyone to type "7".
 *
 * The three fiscal codes are edited here and snapshotted onto the order line
 * at add time (§5.6), so a correction made tonight cannot alter an invoice
 * already transmitted.
 */
export interface MenuManagerProps {
  readonly categories: readonly Category[];
  readonly items: readonly MenuItem[];
  readonly modifierGroups: readonly ModifierGroup[];
  /**
   * Resolved server-side, item id to a servable URL — `resolveAssetUrl` lives
   * in `lib/storage/r2.ts`, which is `server-only` and cannot be imported
   * here. `null` for an item with no image, or before `R2_PUBLIC_BASE_URL` is
   * configured (M08 runfile §4); either way the fallback is the same icon the
   * mock already rendered unconditionally.
   */
  readonly imageUrls: Readonly<Record<string, string | null>>;
}

const TAX_CLASS_OPTIONS: ReadonlyArray<{ value: TaxClassKey; label: string }> = [
  // Labels mirror `packages/db/seeds/tax.ts` — the frozen `TaxClassKeySchema`
  // carries no display name of its own, only the three keys.
  { value: 'STANDARD_FOOD', label: 'Standard food and beverage' },
  { value: 'EXEMPT', label: 'Exempt' },
  { value: 'ZERO', label: 'Zero rated' },
];

/** Mirrors the server-only storage limit for an immediate browser-side refusal. */

/** A row-level button that calls a reorder-shaped action directly, refreshes on success, toasts on refusal. */
function useDirectAction<Args extends readonly unknown[]>(
  action: (...args: Args) => Promise<ActionResult>,
): { readonly run: (...args: Args) => void; readonly pending: boolean } {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const run = (...args: Args) => {
    startTransition(async () => {
      const result = await action(...args);
      if (result.error !== null) toast.show('error', result.error);
      else router.refresh();
    });
  };

  return { run, pending };
}

export function MenuManager({ categories, items, modifierGroups, imageUrls }: MenuManagerProps) {
  const [tab, setTab] = useState<'ITEMS' | 'CATEGORIES'>('ITEMS');
  const [categoryId, setCategoryId] = useState<string>('ALL');
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);

  const visibleItems = useMemo(
    () => items.filter((item) => categoryId === 'ALL' || item.categoryId === categoryId),
    [items, categoryId],
  );

  return (
    <>
      <PageHeading
        title="Menu"
        note="Manage menu items, sizes, and prices before tax. Drag rows to reorder them; changes save automatically."
        actions={
          tab === 'ITEMS' ? (
            <Button tone="primary" icon={Plus} onClick={() => setAddingItem(true)}>
              New item
            </Button>
          ) : (
            <Button tone="primary" icon={Plus} onClick={() => setAddingCategory(true)}>
              New category
            </Button>
          )
        }
      />

      <div className="mb-4">
        <SegmentedControl
          label="View"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'ITEMS' as const, label: 'Items', count: items.length },
            { value: 'CATEGORIES' as const, label: 'Categories', count: categories.length },
          ]}
        />
      </div>

      {tab === 'ITEMS' ? (
        <>
          <div className="mb-4">
            <SegmentedControl
              label="Filter by category"
              value={categoryId}
              onChange={setCategoryId}
              options={[
                { value: 'ALL', label: 'All', count: items.length },
                ...categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                  count: items.filter((item) => item.categoryId === category.id).length,
                })),
              ]}
            />
          </div>

          {categoryId === 'ALL' ? (
            <DataTable
              rows={visibleItems}
              getRowId={(item) => item.id}
              caption="Menu items"
              onRowClick={setEditing}
              summary={(rows) => (
                <span>
                  <strong className="text-ink tabular-nums">{rows.length}</strong> items ·{' '}
                  <strong className="text-ink tabular-nums">
                    {rows.filter((item) => item.variants.length > 0).length}
                  </strong>{' '}
                  with variants ·{' '}
                  <strong className="text-ink tabular-nums">
                    {rows.filter((item) => !item.isActive).length}
                  </strong>{' '}
                  inactive
                </span>
              )}
              columns={[
                {
                  key: 'name',
                  header: 'Item',
                  render: (item) => (
                    <ItemNameCell item={item} imageUrl={imageUrls[item.id] ?? null} />
                  ),
                },
                {
                  key: 'sku',
                  header: 'SKU',
                  secondary: true,
                  render: (item) => <span className="tabular-nums">{item.sku ?? '—'}</span>,
                },
                {
                  key: 'variants',
                  header: 'Variants',
                  secondary: true,
                  render: (item) =>
                    item.variants.length === 0 ? (
                      <span className="text-ink-subtle">—</span>
                    ) : (
                      <StatusPill
                        size="sm"
                        tone="info"
                        icon={Layers}
                        label={item.variants.map((variant) => variant.name).join(' / ')}
                      />
                    ),
                },
                {
                  key: 'price',
                  header: 'Price ex tax',
                  numeric: true,
                  render: (item) => <Money value={item.basePrice} />,
                },
                {
                  key: 'active',
                  header: 'Live',
                  numeric: true,
                  render: (item) => (item.isActive ? 'Yes' : 'No'),
                },
              ]}
            />
          ) : (
            <ItemOrderList
              categoryId={categoryId}
              items={visibleItems}
              imageUrls={imageUrls}
              onEdit={setEditing}
            />
          )}
        </>
      ) : (
        <CategoryList categories={categories} onEdit={setEditingCategory} />
      )}

      {editing !== null && (
        <ItemEditor
          key={editing.id}
          item={editing}
          categories={categories}
          modifierGroups={modifierGroups}
          onClose={() => setEditing(null)}
        />
      )}
      {addingItem && (
        <ItemCreator
          categories={categories}
          defaultCategoryId={categoryId === 'ALL' ? (categories[0]?.id ?? '') : categoryId}
          onClose={() => setAddingItem(false)}
        />
      )}

      {editingCategory !== null && (
        <CategoryEditor
          key={editingCategory.id}
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
        />
      )}
      {addingCategory && <CategoryCreator onClose={() => setAddingCategory(false)} />}
    </>
  );
}

function ItemNameCell({
  item,
  imageUrl,
}: {
  readonly item: MenuItem;
  readonly imageUrl: string | null;
}) {
  return (
    <span className="flex items-center gap-2">
      {imageUrl === null ? (
        <ImageOff aria-hidden="true" className="text-ink-subtle size-4 shrink-0" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a raw R2 key/URL, not an optimisable local asset.
        <img src={imageUrl} alt="" className="size-6 shrink-0 rounded object-cover" />
      )}
      <span className="inline-flex min-w-0 items-baseline gap-3">
        <span dir="ltr" className="font-medium [unicode-bidi:isolate]">
          {item.name}
        </span>
        {item.nameUr !== null && (
          <span
            lang="ur"
            dir="rtl"
            className="text-ink-subtle shrink-0 text-sm [unicode-bidi:isolate]"
          >
            {item.nameUr}
          </span>
        )}
      </span>
    </span>
  );
}

function Feedback({
  error,
  message,
}: {
  readonly error: string | null;
  readonly message: string | null;
}) {
  if (error !== null) {
    return (
      <p
        role="alert"
        className="border-danger bg-danger-soft text-danger rounded-base border px-3 py-2 text-sm"
      >
        {error}
      </p>
    );
  }
  if (message !== null) {
    return (
      <p
        role="status"
        className="border-ok bg-ok-soft text-ok rounded-base border px-3 py-2 text-sm"
      >
        {message}
      </p>
    );
  }
  return null;
}

/* ------------------------------------------------------------- categories */

function CategoryList({
  categories,
  onEdit,
}: {
  readonly categories: readonly Category[];
  readonly onEdit: (category: Category) => void;
}) {
  const router = useRouter();
  const drag = useDragReorder(
    categories,
    (category) => category.id,
    async (orderedIds) => {
      const result = await reorderCategoriesAction(orderedIds);
      if (result.error === null) router.refresh();
      return result;
    },
  );

  return (
    <ol className="space-y-2" {...drag.containerProps}>
      {drag.visible.map((category) => (
        <li
          key={category.id}
          data-drag-id={category.id}
          className={cn(
            'border-border bg-surface-raised flex touch-none items-center gap-3 rounded-base border p-3',
            drag.draggingId === category.id && 'opacity-60',
          )}
        >
          <button
            type="button"
            aria-label={`Reorder ${category.name}`}
            className="text-ink-subtle cursor-grab touch-none active:cursor-grabbing"
            {...drag.rowHandleProps(category.id)}
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
          {category.colour !== null && (
            <span
              aria-hidden="true"
              className="border-border size-3 shrink-0 rounded-full border"
              style={{ backgroundColor: category.colour }}
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="font-medium">{category.name}</span>
          </span>
          <StatusPill
            size="sm"
            tone={category.isActive ? 'ok' : 'neutral'}
            icon={category.isActive ? Eye : EyeOff}
            label={category.isActive ? 'Visible' : 'Hidden'}
          />
          <Button size="sm" icon={Pencil} onClick={() => onEdit(category)}>
            Edit
          </Button>
        </li>
      ))}
    </ol>
  );
}

function CategoryFields({
  name,
  setName,
  nameUr,
  setNameUr,
  colour,
  setColour,
}: {
  readonly name: string;
  readonly setName: (value: string) => void;
  readonly nameUr: string;
  readonly setNameUr: (value: string) => void;
  readonly colour: string;
  readonly setColour: (value: string) => void;
}) {
  return (
    <>
      <TextField
        label="Name"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <TextField
        label="Name in Urdu"
        name="nameUr"
        value={nameUr}
        onChange={(event) => setNameUr(event.target.value)}
        lang="ur"
        dir="rtl"
      />
      <TextField
        label="Colour (hex, optional)"
        name="colour"
        value={colour}
        onChange={(event) => setColour(event.target.value)}
        help="A category accent, e.g. for the category strip. Leave blank for none."
      />
    </>
  );
}

function CategoryCreator({ onClose }: { readonly onClose: () => void }) {
  const [state, action, pending] = useActionState(createCategoryAction, MENU_IDLE);
  const [name, setName] = useState('');
  const [nameUr, setNameUr] = useState('');
  const [colour, setColour] = useState('');
  useAutoCloseOnSuccess(onClose, state.message);

  return (
    <Sheet open onClose={onClose} title="New category" side="inline-end">
      <form action={action} className="space-y-4">
        <CategoryFields
          name={name}
          setName={setName}
          nameUr={nameUr}
          setNameUr={setNameUr}
          colour={colour}
          setColour={setColour}
        />
        <Feedback error={state.error} message={state.message} />
        <Button tone="primary" block type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create category'}
        </Button>
      </form>
    </Sheet>
  );
}

function CategoryEditor({
  category,
  onClose,
}: {
  readonly category: Category;
  readonly onClose: () => void;
}) {
  const [state, action, pending] = useActionState(updateCategoryAction, MENU_IDLE);
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteCategoryAction,
    MENU_IDLE,
  );
  const [name, setName] = useState(category.name);
  const [nameUr, setNameUr] = useState(category.nameUr ?? '');
  const [colour, setColour] = useState(category.colour ?? '');
  const [active, setActive] = useState(category.isActive);
  useAutoCloseOnSuccess(onClose, state.message, deleteState.message);

  return (
    <Sheet open onClose={onClose} title={category.name} side="inline-end">
      <div className="space-y-6">
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={category.id} />
          <input type="hidden" name="isActive" value={active ? 'true' : 'false'} />
          <CategoryFields
            name={name}
            setName={setName}
            nameUr={nameUr}
            setNameUr={setNameUr}
            colour={colour}
            setColour={setColour}
          />
          <div>
            <p className="mb-1.5 text-sm font-medium">Shown on the menu</p>
            <Switch checked={active} onChange={setActive} label="Category is visible" />
          </div>
          <Feedback error={state.error} message={state.message} />
          <Button tone="primary" type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save category'}
          </Button>
        </form>

        <section className="border-border rounded-base border p-3">
          <h3 className="mb-1 text-sm font-semibold">Delete category</h3>
          <p className="text-ink-subtle mb-3 text-xs">
            Soft-deleted (R6) — the row survives with a deletion timestamp, and its name is free to
            reuse. Refused while any item still belongs to it.
          </p>
          <form action={deleteAction}>
            <input type="hidden" name="id" value={category.id} />
            <Feedback error={deleteState.error} message={deleteState.message} />
            <Button size="sm" tone="danger" icon={Trash2} type="submit" disabled={deletePending}>
              {deletePending ? 'Deleting…' : 'Delete category'}
            </Button>
          </form>
        </section>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ items */

function ItemOrderList({
  categoryId,
  items,
  imageUrls,
  onEdit,
}: {
  readonly categoryId: string;
  readonly items: readonly MenuItem[];
  readonly imageUrls: Readonly<Record<string, string | null>>;
  readonly onEdit: (item: MenuItem) => void;
}) {
  const router = useRouter();
  const drag = useDragReorder(
    items,
    (item) => item.id,
    async (orderedIds) => {
      const result = await reorderMenuItemsAction(categoryId, orderedIds);
      if (result.error === null) router.refresh();
      return result;
    },
  );

  if (items.length === 0) {
    return <p className="text-ink-muted text-sm">No items in this category yet.</p>;
  }

  return (
    <ol className="space-y-2" {...drag.containerProps}>
      {drag.visible.map((item) => (
        <li
          key={item.id}
          data-drag-id={item.id}
          className={cn(
            'border-border bg-surface-raised flex touch-none items-center gap-3 rounded-base border p-3',
            drag.draggingId === item.id && 'opacity-60',
          )}
        >
          <button
            type="button"
            aria-label={`Reorder ${item.name}`}
            className="text-ink-subtle cursor-grab touch-none active:cursor-grabbing"
            {...drag.rowHandleProps(item.id)}
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-start"
            onClick={() => onEdit(item)}
          >
            <ItemNameCell item={item} imageUrl={imageUrls[item.id] ?? null} />
          </button>
          <Money value={item.basePrice} />
          {!item.isActive && <StatusPill size="sm" tone="neutral" icon={EyeOff} label="Hidden" />}
        </li>
      ))}
    </ol>
  );
}

/**
 * The item editor.
 *
 * Everything a `menu_items` row carries, plus the variants and the assigned
 * modifier groups the §5.3 collapse depends on. The fiscal block is
 * separated because those three fields are transmitted to FBR verbatim and
 * P1 and P3 are still open on two of them.
 */
function ItemEditor({
  item,
  categories,
  modifierGroups,
  onClose,
}: {
  readonly item: MenuItem;
  readonly categories: readonly Category[];
  readonly modifierGroups: readonly ModifierGroup[];
  readonly onClose: () => void;
}) {
  const [state, action, pending] = useActionState(updateMenuItemAction, MENU_IDLE);
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteMenuItemAction,
    MENU_IDLE,
  );

  const [name, setName] = useState(item.name);
  const [nameUr, setNameUr] = useState(item.nameUr ?? '');
  const [sku, setSku] = useState(item.sku ?? '');
  const [description, setDescription] = useState(item.description ?? '');
  const [price, setPrice] = useState((item.basePrice / 100n).toString());
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [taxClass, setTaxClass] = useState<TaxClassKey>(item.taxClass);
  const [active, setActive] = useState(item.isActive);
  useAutoCloseOnSuccess(onClose, state.message, deleteState.message);

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      description="A price entered here is exclusive of sales tax."
      side="inline-end"
    >
      <div className="space-y-6">
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="basePrice" value={price} />
          <input type="hidden" name="isActive" value={active ? 'true' : 'false'} />
          <input type="hidden" name="imageKey" value="" />
          <input type="hidden" name="descriptionUr" value={item.descriptionUr ?? ''} />

          <div>
            <p className="mb-1.5 text-sm font-medium">Photo</p>
            <div className="flex items-center gap-3">
              <span className="border-border bg-surface-sunken flex size-16 items-center justify-center rounded-base border">
                <ImageOff aria-hidden="true" className="text-ink-subtle size-6" />
              </span>
              <span className="text-ink-muted text-sm">No image added</span>
            </div>
            <p className="text-ink-subtle mt-1 text-xs">Menu photos are currently disabled.</p>
          </div>

          <TextField
            label="Name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <TextField
            label="Name in Urdu"
            name="nameUr"
            help="Shown on the storefront and on a bilingual receipt."
            value={nameUr}
            onChange={(event) => setNameUr(event.target.value)}
            lang="ur"
            dir="rtl"
          />
          <TextField
            label="SKU (optional)"
            name="sku"
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            tabular
          />
          <TextField
            label="Description"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />

          <TextField
            label="Price, rupees ex tax"
            name="basePriceDisplay"
            help="Enter the price before sales tax. The applicable tax is added at payment."
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            inputMode="decimal"
            tabular
          />

          <SelectField
            label="Category"
            name="categoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            options={categories.map((category) => ({ value: category.id, label: category.name }))}
          />

          <SelectField
            label="Tax class"
            name="taxClass"
            help="For standard food and beverages, the tax rate depends on the payment method."
            value={taxClass}
            onChange={(event) => setTaxClass(event.target.value as TaxClassKey)}
            options={TAX_CLASS_OPTIONS}
          />

          <div>
            <p className="mb-1.5 text-sm font-medium">Available on the menu</p>
            <Switch checked={active} onChange={setActive} label="Item is live" />
          </div>

          <Feedback error={state.error} message={state.message} />
          <Button tone="primary" block type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save item'}
          </Button>
        </form>

        <VariantsSection item={item} />
        <ModifierGroupsSection item={item} allGroups={modifierGroups} />

        <section className="border-border rounded-base border p-3">
          <h3 className="mb-1 text-sm font-semibold">Delete item</h3>
          <p className="text-ink-subtle mb-3 text-xs">
            Soft-deleted (R6) — the row survives with a deletion timestamp and its SKU is free to
            reuse.
          </p>
          <form action={deleteAction}>
            <input type="hidden" name="id" value={item.id} />
            <Feedback error={deleteState.error} message={deleteState.message} />
            <Button size="sm" tone="danger" icon={Trash2} type="submit" disabled={deletePending}>
              {deletePending ? 'Deleting…' : 'Delete item'}
            </Button>
          </form>
        </section>
      </div>
    </Sheet>
  );
}

function VariantsSection({ item }: { readonly item: MenuItem }) {
  const [state, action, pending] = useActionState(addVariantAction, MENU_IDLE);
  const remove = useDirectAction(removeVariantAction);
  const [name, setName] = useState('');
  const [nameUr, setNameUr] = useState('');
  const [priceDelta, setPriceDelta] = useState('0');
  const [isDefault, setIsDefault] = useState(false);

  return (
    <section className="border-border rounded-base border p-3">
      <h3 className="mb-1 text-sm font-semibold">Variants</h3>
      <p className="text-ink-subtle mb-3 text-xs">
        One item with Full and Half, never two items. Each variant carries a delta against the price
        above.
      </p>
      {item.variants.length === 0 ? (
        <p className="text-ink-muted text-sm">No variants. This item is sold one way.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {item.variants.map((variant) => (
            <li key={variant.id} className="flex items-center justify-between gap-2">
              <span>
                {variant.name}
                {variant.isDefault && <span className="text-ink-subtle ms-2 text-xs">default</span>}
              </span>
              <span className="flex items-center gap-2">
                <Money value={variant.priceDelta} />
                <span className="text-ink-subtle text-xs">
                  = <Money value={(item.basePrice + variant.priceDelta) as typeof item.basePrice} />
                </span>
                <IconButton
                  size="sm"
                  tone="ghost"
                  icon={Trash2}
                  label={`Remove ${variant.name}`}
                  disabled={remove.pending}
                  onClick={() => remove.run(variant.id)}
                />
              </span>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="menuItemId" value={item.id} />
        <input type="hidden" name="isDefault" value={isDefault ? 'true' : 'false'} />
        <div className="grid grid-cols-2 gap-2">
          <TextField
            label="Name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <TextField
            label="Price delta, rupees"
            name="priceDelta"
            value={priceDelta}
            onChange={(event) => setPriceDelta(event.target.value)}
            inputMode="decimal"
            tabular
          />
        </div>
        <TextField
          label="Name in Urdu"
          name="nameUr"
          value={nameUr}
          onChange={(event) => setNameUr(event.target.value)}
          lang="ur"
          dir="rtl"
        />
        <Switch checked={isDefault} onChange={setIsDefault} label="Default variant" />
        <Feedback error={state.error} message={state.message} />
        <Button size="sm" icon={Plus} type="submit" disabled={pending}>
          {pending ? 'Adding…' : 'Add variant'}
        </Button>
      </form>
    </section>
  );
}

function ModifierGroupsSection({
  item,
  allGroups,
}: {
  readonly item: MenuItem;
  readonly allGroups: readonly ModifierGroup[];
}) {
  const router = useRouter();
  const remove = useDirectAction(removeModifierGroupFromItemAction);
  const assign = useDirectAction(assignModifierGroupAction);
  const [selected, setSelected] = useState('');

  const drag = useDragReorder(
    item.modifierGroups,
    (group) => group.id,
    async (orderedIds) => {
      const result = await reorderItemModifierGroupsAction(item.id, orderedIds);
      if (result.error === null) router.refresh();
      return result;
    },
  );

  const unassigned = allGroups.filter(
    (group) => !item.modifierGroups.some((assigned) => assigned.id === group.id),
  );

  return (
    <section className="border-border rounded-base border p-3">
      <h3 className="mb-1 text-sm font-semibold">Modifier groups</h3>
      <p className="text-ink-subtle mb-3 text-xs">
        What a cashier is asked about when this item is added. Drag to change the order they're
        asked in.
      </p>

      {item.modifierGroups.length === 0 ? (
        <p className="text-ink-muted text-sm">No modifier groups attached.</p>
      ) : (
        <ol className="space-y-1" {...drag.containerProps}>
          {drag.visible.map((group) => (
            <li
              key={group.id}
              data-drag-id={group.id}
              className={cn(
                'bg-surface-sunken flex touch-none items-center gap-2 rounded-base px-2 py-1.5 text-sm',
                drag.draggingId === group.id && 'opacity-60',
              )}
            >
              <button
                type="button"
                aria-label={`Reorder ${group.name}`}
                className="text-ink-subtle cursor-grab touch-none active:cursor-grabbing"
                {...drag.rowHandleProps(group.id)}
              >
                <GripVertical aria-hidden="true" className="size-4" />
              </button>
              <span className="flex-1">{group.name}</span>
              <IconButton
                size="sm"
                tone="ghost"
                icon={Trash2}
                label={`Detach ${group.name}`}
                disabled={remove.pending}
                onClick={() => remove.run(item.id, group.id)}
              />
            </li>
          ))}
        </ol>
      )}

      {unassigned.length > 0 && (
        <div className="mt-3 flex items-end gap-2">
          <SelectField
            label="Attach a group"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            options={[
              { value: '', label: 'Choose…' },
              ...unassigned.map((group) => ({ value: group.id, label: group.name })),
            ]}
            className="flex-1"
          />
          <Button
            size="sm"
            disabled={selected === '' || assign.pending}
            onClick={() => {
              assign.run(item.id, selected);
              setSelected('');
            }}
          >
            Attach
          </Button>
        </div>
      )}
    </section>
  );
}

/** A fresh item has no id yet, so it gets its own simpler form — variants and modifier groups attach after the first save. */
function ItemCreator({
  categories,
  defaultCategoryId,
  onClose,
}: {
  readonly categories: readonly Category[];
  readonly defaultCategoryId: string;
  readonly onClose: () => void;
}) {
  const [state, action, pending] = useActionState(createMenuItemAction, MENU_IDLE);
  useAutoCloseOnSuccess(onClose, state.message);
  const [name, setName] = useState('');
  const [nameUr, setNameUr] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('0.00');
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [taxClass, setTaxClass] = useState<TaxClassKey>('STANDARD_FOOD');

  return (
    <Sheet
      open
      onClose={onClose}
      title="New item"
      description="A price entered here is exclusive of sales tax."
      side="inline-end"
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="isActive" value="true" />
        <input type="hidden" name="imageKey" value="" />
        <input type="hidden" name="description" value="" />
        <input type="hidden" name="descriptionUr" value="" />

        <TextField
          label="Name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <TextField
          label="Name in Urdu"
          name="nameUr"
          value={nameUr}
          onChange={(event) => setNameUr(event.target.value)}
          lang="ur"
          dir="rtl"
        />
        <TextField
          label="SKU (optional)"
          name="sku"
          value={sku}
          onChange={(event) => setSku(event.target.value)}
          tabular
        />
        <TextField
          label="Price, rupees ex tax"
          name="basePrice"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          inputMode="decimal"
          tabular
        />
        <SelectField
          label="Category"
          name="categoryId"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          options={categories.map((category) => ({ value: category.id, label: category.name }))}
        />
        <SelectField
          label="Tax class"
          name="taxClass"
          value={taxClass}
          onChange={(event) => setTaxClass(event.target.value as TaxClassKey)}
          options={TAX_CLASS_OPTIONS}
        />

        <Feedback error={state.error} message={state.message} />
        <Button tone="primary" block type="submit" disabled={pending || categories.length === 0}>
          {pending ? 'Creating…' : 'Create item'}
        </Button>
        {categories.length === 0 && (
          <p className="text-ink-subtle text-xs">Create a category first.</p>
        )}
      </form>
    </Sheet>
  );
}
