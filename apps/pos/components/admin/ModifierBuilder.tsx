'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, CircleDot, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  IconButton,
  Money,
  Sheet,
  StatusPill,
  Switch,
  TextField,
  useToast,
} from '@natech/ui';
import type { ModifierGroup } from '@natech/contracts';
import { MENU_IDLE } from '@/lib/menu/idle';
import {
  addModifierAction,
  createModifierGroupAction,
  deleteModifierGroupAction,
  removeModifierAction,
  updateModifierGroupAction,
  type ActionResult,
} from '@/lib/menu/actions';
import { useAutoCloseOnSuccess } from '@/lib/useAutoCloseOnSuccess';
import { PageHeading } from './PageHeading';

/**
 * The modifier builder — BUILD-PLAN.md §5.3, §10.1, defect V5; M08 runfile.
 *
 * A modifier is not a pricing detail. §10.1 calls modifiers and notes the
 * highest-value data on an order line and records that the current system
 * shows neither (V5) — staff reading `1× Zinger Burger` has no way to know
 * the guest is allergic to nuts.
 *
 * So the editor states the consequence rather than only the price
 * delta, and `minSelect` / `maxSelect` / `isRequired` are edited together
 * because they only make sense as a set: a required group with `minSelect` 0
 * asks a question the cashier can skip — checked here and again server-side
 * in `validateSelectRange` (§14.1: client-side hiding is cosmetic).
 *
 * Neither a group nor a modifier carries a `sort_order` column (unlike the
 * item ↔ group assignment, which does and is reordered in `MenuManager`'s
 * item editor instead) — both list alphabetically here, and there is nothing
 * for a drag to persist on this screen.
 *
 * Flagged from M03 and still open: §6.3 defines the line subtotal as
 * `Σ(qty × unit_price) + modifier deltas`, implemented literally, so a
 * modifier delta is **not** multiplied by quantity. Three burgers with extra
 * cheese are charged for one portion of cheese. The editor says so beside the
 * price field rather than letting it be discovered from an invoice.
 */
export interface ModifierBuilderProps {
  readonly groups: readonly ModifierGroup[];
}

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

export function ModifierBuilder({ groups }: ModifierBuilderProps) {
  const [editing, setEditing] = useState<ModifierGroup | null>(null);
  const [adding, setAdding] = useState(false);
  const removeModifier = useDirectAction(removeModifierAction);

  return (
    <>
      <PageHeading
        title="Modifiers"
        note="Manage item options, extras, and their prices to help staff prepare each order."
        actions={
          <Button tone="primary" icon={Plus} onClick={() => setAdding(true)}>
            New group
          </Button>
        }
      />

      <ul className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <li key={group.id} className="border-border bg-surface-raised rounded-base border p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{group.name}</h2>
              {group.nameUr !== null && (
                <span lang="ur" dir="rtl" className="text-ink-subtle text-xs">
                  {group.nameUr}
                </span>
              )}
              <StatusPill
                size="sm"
                tone={group.isRequired ? 'warn' : 'neutral'}
                icon={group.isRequired ? CircleAlert : CircleDot}
                label={group.isRequired ? 'Required' : 'Optional'}
              />
              <span className="text-ink-subtle text-xs tabular-nums">
                choose {group.minSelect}–{group.maxSelect}
              </span>
            </div>

            <ul className="divide-border border-border divide-y rounded-base border text-sm">
              {group.modifiers.length === 0 && (
                <li className="text-ink-muted px-3 py-2">No modifiers in this group yet.</li>
              )}
              {group.modifiers.map((modifier) => (
                <li key={modifier.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span>
                    {modifier.name}
                    {modifier.nameUr !== null && (
                      <span lang="ur" dir="rtl" className="text-ink-subtle ms-2 text-xs">
                        {modifier.nameUr}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {modifier.priceDelta === 0n ? (
                      <span className="text-ink-subtle text-xs">no charge</span>
                    ) : (
                      <Money value={modifier.priceDelta} />
                    )}
                    <IconButton
                      size="sm"
                      tone="ghost"
                      icon={Trash2}
                      label={`Remove ${modifier.name}`}
                      disabled={removeModifier.pending}
                      onClick={() => removeModifier.run(modifier.id)}
                    />
                  </span>
                </li>
              ))}
            </ul>

            <p className="text-ink-subtle mt-3 text-xs">
              Extras are charged once per order line. For example, three portions on one line with
              extra butter incur one extra-butter charge.
            </p>

            <Button size="sm" className="mt-3" onClick={() => setEditing(group)}>
              Edit group
            </Button>
          </li>
        ))}
      </ul>

      {editing !== null && (
        <GroupEditor key={editing.id} group={editing} onClose={() => setEditing(null)} />
      )}
      {adding && <GroupCreator onClose={() => setAdding(false)} />}
    </>
  );
}

function GroupFields({
  name,
  setName,
  nameUr,
  setNameUr,
  minSelect,
  setMinSelect,
  maxSelect,
  setMaxSelect,
  required,
  setRequired,
}: {
  readonly name: string;
  readonly setName: (value: string) => void;
  readonly nameUr: string;
  readonly setNameUr: (value: string) => void;
  readonly minSelect: string;
  readonly setMinSelect: (value: string) => void;
  readonly maxSelect: string;
  readonly setMaxSelect: (value: string) => void;
  readonly required: boolean;
  readonly setRequired: (value: boolean) => void;
}) {
  const inconsistent = required && Number(minSelect) < 1;

  return (
    <>
      <TextField
        label="Group name"
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
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Minimum choices"
          name="minSelect"
          value={minSelect}
          onChange={(event) => setMinSelect(event.target.value)}
          inputMode="numeric"
          tabular
        />
        <TextField
          label="Maximum choices"
          name="maxSelect"
          value={maxSelect}
          onChange={(event) => setMaxSelect(event.target.value)}
          inputMode="numeric"
          tabular
        />
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium">Required before the item can be added</p>
        <Switch checked={required} onChange={setRequired} label="Group is required" />
      </div>
      {inconsistent && (
        <p role="alert" className="text-danger text-sm font-medium">
          A required group needs a minimum of at least one, otherwise the cashier can skip it.
        </p>
      )}
    </>
  );
}

function GroupCreator({ onClose }: { readonly onClose: () => void }) {
  const [state, action, pending] = useActionState(createModifierGroupAction, MENU_IDLE);
  useAutoCloseOnSuccess(onClose, state.message);
  const [name, setName] = useState('');
  const [nameUr, setNameUr] = useState('');
  const [minSelect, setMinSelect] = useState('0');
  const [maxSelect, setMaxSelect] = useState('1');
  const [required, setRequired] = useState(false);
  const inconsistent = required && Number(minSelect) < 1;

  return (
    <Sheet open onClose={onClose} title="New group" side="inline-end">
      <form action={action} className="space-y-4">
        <input type="hidden" name="isRequired" value={required ? 'true' : 'false'} />
        <GroupFields
          name={name}
          setName={setName}
          nameUr={nameUr}
          setNameUr={setNameUr}
          minSelect={minSelect}
          setMinSelect={setMinSelect}
          maxSelect={maxSelect}
          setMaxSelect={setMaxSelect}
          required={required}
          setRequired={setRequired}
        />
        <Feedback error={state.error} message={state.message} />
        <Button tone="primary" block type="submit" disabled={pending || inconsistent}>
          {pending ? 'Creating…' : 'Create group'}
        </Button>
      </form>
    </Sheet>
  );
}

function GroupEditor({
  group,
  onClose,
}: {
  readonly group: ModifierGroup;
  readonly onClose: () => void;
}) {
  const [state, action, pending] = useActionState(updateModifierGroupAction, MENU_IDLE);
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteModifierGroupAction,
    MENU_IDLE,
  );
  const [modifierState, modifierAction, modifierPending] = useActionState(
    addModifierAction,
    MENU_IDLE,
  );
  useAutoCloseOnSuccess(onClose, state.message, deleteState.message);

  const [name, setName] = useState(group.name);
  const [nameUr, setNameUr] = useState(group.nameUr ?? '');
  const [minSelect, setMinSelect] = useState(String(group.minSelect));
  const [maxSelect, setMaxSelect] = useState(String(group.maxSelect));
  const [required, setRequired] = useState(group.isRequired);
  const inconsistent = required && Number(minSelect) < 1;

  const [modifierName, setModifierName] = useState('');
  const [modifierNameUr, setModifierNameUr] = useState('');
  const [modifierPrice, setModifierPrice] = useState('0');

  return (
    <Sheet open onClose={onClose} title={group.name} side="inline-end">
      <div className="space-y-6">
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={group.id} />
          <input type="hidden" name="isRequired" value={required ? 'true' : 'false'} />
          <GroupFields
            name={name}
            setName={setName}
            nameUr={nameUr}
            setNameUr={setNameUr}
            minSelect={minSelect}
            setMinSelect={setMinSelect}
            maxSelect={maxSelect}
            setMaxSelect={setMaxSelect}
            required={required}
            setRequired={setRequired}
          />
          <Feedback error={state.error} message={state.message} />
          <Button tone="primary" type="submit" disabled={pending || inconsistent}>
            {pending ? 'Saving…' : 'Save group'}
          </Button>
        </form>

        <section className="border-border rounded-base border p-3">
          <h3 className="mb-1 text-sm font-semibold">Modifiers</h3>
          <p className="text-ink-subtle mb-3 text-xs">
            Remove one from the card on the modifiers list — this section only adds.
          </p>
          <form action={modifierAction} className="space-y-2">
            <input type="hidden" name="groupId" value={group.id} />
            <div className="grid grid-cols-2 gap-2">
              <TextField
                label="Name"
                name="name"
                value={modifierName}
                onChange={(event) => setModifierName(event.target.value)}
              />
              <TextField
                label="Price, rupees"
                name="priceDelta"
                value={modifierPrice}
                onChange={(event) => setModifierPrice(event.target.value)}
                inputMode="decimal"
                tabular
                help="Charged once per order line, regardless of quantity."
              />
            </div>
            <TextField
              label="Name in Urdu"
              name="nameUr"
              value={modifierNameUr}
              onChange={(event) => setModifierNameUr(event.target.value)}
              lang="ur"
              dir="rtl"
            />
            <Feedback error={modifierState.error} message={modifierState.message} />
            <Button size="sm" icon={Plus} type="submit" disabled={modifierPending}>
              {modifierPending ? 'Adding…' : 'Add modifier'}
            </Button>
          </form>
        </section>

        <section className="border-border rounded-base border p-3">
          <h3 className="mb-1 text-sm font-semibold">Delete group</h3>
          <p className="text-ink-subtle mb-3 text-xs">
            Soft-deleted (R6). Refused while any item still has this group attached — detach it from
            every item in the menu editor first.
          </p>
          <form action={deleteAction}>
            <input type="hidden" name="id" value={group.id} />
            <Feedback error={deleteState.error} message={deleteState.message} />
            <Button size="sm" tone="danger" icon={Trash2} type="submit" disabled={deletePending}>
              {deletePending ? 'Deleting…' : 'Delete group'}
            </Button>
          </form>
        </section>
      </div>
    </Sheet>
  );
}
