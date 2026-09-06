'use client';

import { useActionState, useState } from 'react';
import { KeyRound, LockKeyhole, Plus, ShieldOff, Trash2, UserRound } from 'lucide-react';
import {
  Button,
  DataTable,
  SegmentedControl,
  SelectField,
  Sheet,
  StatusPill,
  TextField,
} from '@natech/ui';
import { RoleKeySchema, type Role, type RoleKey, type StaffMember } from '@natech/contracts';
import { STAFF_IDLE } from '@/lib/auth/actions/staff-idle';
import {
  createStaffAction,
  deleteStaffAction,
  setActiveAction,
  setPasswordAction,
  setPinAction,
  updateStaffAction,
} from '@/lib/auth/actions/staff';
import { useAutoCloseOnSuccess } from '@/lib/useAutoCloseOnSuccess';
import { PageHeading } from './PageHeading';

/**
 * Staff and roles — BUILD-PLAN.md §14.1, §14.2.
 *
 * §14.2 splits identity in two, and the screen has to keep the split visible: a
 * terminal is bound for the shift with email and password, and an individual is
 * identified by a 4-to-6 digit PIN per till action. A shared till with fast
 * cashier switching is only safe if both halves are managed, and the system
 * this replaces has neither.
 *
 * A PIN is never displayed, never returned, and never editable to a value — it
 * can only be reset. `StaffMember` carries `hasPin`, not a PIN, so the screen
 * has nothing to leak.
 *
 * M07 replaced M05's toasts with real actions. Every one of them re-checks
 * `staff.write` on the server: this component hiding a control is presentation,
 * and §14.1 says so in as many words.
 */
export interface StaffManagerProps {
  readonly staff: readonly StaffMember[];
  readonly roles: readonly Role[];
  /** Deactivating your own account is refused server-side; the control says so first. */
  readonly currentUserId: string;
}

export function StaffManager({ staff, roles, currentUserId }: StaffManagerProps) {
  const [tab, setTab] = useState<'PEOPLE' | 'ROLES'>('PEOPLE');
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeading
        title="Staff and roles"
        note="Manage staff accounts, roles, and PINs for access to shared tills."
        actions={
          <Button tone="primary" icon={Plus} onClick={() => setAdding(true)}>
            Add person
          </Button>
        }
      />

      <div className="mb-4">
        <SegmentedControl
          label="View"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'PEOPLE' as const, label: 'People', count: staff.length },
            { value: 'ROLES' as const, label: 'Roles', count: roles.length },
          ]}
        />
      </div>

      {tab === 'PEOPLE' ? (
        <DataTable
          rows={staff}
          getRowId={(member) => member.id}
          caption="Staff"
          onRowClick={setEditing}
          summary={(rows) => (
            <span>
              <strong className="text-ink tabular-nums">{rows.length}</strong> people ·{' '}
              <strong className="text-ink tabular-nums">
                {rows.filter((member) => member.hasPin).length}
              </strong>{' '}
              with a till PIN
            </span>
          )}
          columns={[
            {
              key: 'name',
              header: 'Person',
              render: (member) => (
                <span className="flex items-center gap-2">
                  <span className="bg-surface-sunken inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                    {member.initials}
                  </span>
                  <span>
                    <span className="font-medium">{member.displayName}</span>
                    <span className="text-ink-subtle block text-xs">{member.email}</span>
                  </span>
                </span>
              ),
            },
            {
              key: 'roles',
              header: 'Roles',
              render: (member) => member.roles.join(', '),
            },
            {
              key: 'status',
              header: 'Status',
              secondary: true,
              render: (member) =>
                member.isActive ? (
                  <StatusPill size="sm" tone="ok" icon={UserRound} label="Active" />
                ) : (
                  <StatusPill size="sm" tone="danger" icon={ShieldOff} label="Deactivated" />
                ),
            },
            {
              key: 'pin',
              header: 'Till PIN',
              secondary: true,
              render: (member) =>
                member.hasPin ? (
                  <StatusPill size="sm" tone="ok" icon={KeyRound} label="Set" />
                ) : (
                  <StatusPill size="sm" tone="neutral" icon={KeyRound} label="Not set" />
                ),
            },
          ]}
        />
      ) : (
        <DataTable
          rows={roles}
          getRowId={(role) => role.key}
          caption="Roles"
          summary={(rows) => (
            <span>
              <strong className="text-ink tabular-nums">{rows.length}</strong> roles ·{' '}
              <strong className="text-ink tabular-nums">
                {rows.reduce((total, role) => total + role.memberCount, 0)}
              </strong>{' '}
              assignments
            </span>
          )}
          columns={[
            {
              key: 'name',
              header: 'Role',
              render: (role) => (
                <span>
                  <span className="font-medium">{role.name}</span>
                  <span className="text-ink-subtle block max-w-md text-xs">{role.description}</span>
                </span>
              ),
            },
            {
              key: 'permissions',
              header: 'Permissions',
              secondary: true,
              render: (role) =>
                role.permissions.length === 0 ? (
                  <span className="text-ink-subtle">Token-scoped only</span>
                ) : (
                  <span className="text-xs">{role.permissions.length} granted</span>
                ),
            },
            {
              key: 'members',
              header: 'People',
              numeric: true,
              render: (role) => <span className="tabular-nums">{role.memberCount}</span>,
            },
          ]}
        />
      )}

      {adding && <StaffCreator roles={roles} onClose={() => setAdding(false)} />}
      {editing !== null && (
        <StaffEditor
          key={editing.id}
          member={editing}
          roles={roles}
          isSelf={editing.id === currentUserId}
          onClose={() => setEditing(null)}
        />
      )}
    </>
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

function roleOptions(roles: readonly Role[]) {
  return roles.map((role) => ({ value: role.key, label: role.name }));
}

function StaffCreator({
  roles,
  onClose,
}: {
  readonly roles: readonly Role[];
  readonly onClose: () => void;
}) {
  const [state, action, pending] = useActionState(createStaffAction, STAFF_IDLE);
  useAutoCloseOnSuccess(onClose, state.message);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add a person"
      description="Create a staff account, then set up a PIN for till access."
      side="inline-end"
    >
      <form action={action} className="space-y-4">
        <TextField label="Display name" name="displayName" required />
        <TextField label="Email" name="email" type="email" autoComplete="off" required />
        <SelectField
          label="Role"
          name="roleKey"
          options={roleOptions(roles)}
          defaultValue="WAITER"
          help="Choose the access this person needs. Role changes apply from their next action."
        />
        <TextField
          label="Temporary password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          help="Use at least 12 characters. Share the password securely and ask the staff member to change it."
        />

        <Feedback error={state.error} message={state.message} />

        <Button tone="primary" block type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create the account'}
        </Button>
      </form>
    </Sheet>
  );
}

function StaffEditor({
  member,
  roles,
  isSelf,
  onClose,
}: {
  readonly member: StaffMember;
  readonly roles: readonly Role[];
  readonly isSelf: boolean;
  readonly onClose: () => void;
}) {
  const [details, saveDetails, savingDetails] = useActionState(updateStaffAction, STAFF_IDLE);
  const [pin, savePin, savingPin] = useActionState(setPinAction, STAFF_IDLE);
  const [password, savePassword, savingPassword] = useActionState(setPasswordAction, STAFF_IDLE);
  const [activation, saveActivation, savingActivation] = useActionState(
    setActiveAction,
    STAFF_IDLE,
  );
  const [deletion, deleteMember, deleting] = useActionState(deleteStaffAction, STAFF_IDLE);
  useAutoCloseOnSuccess(
    onClose,
    details.message ?? pin.message ?? password.message ?? activation.message ?? deletion.message,
  );

  const currentRole: RoleKey = RoleKeySchema.safeParse(member.roles[0]).success
    ? (member.roles[0] as RoleKey)
    : 'WAITER';

  return (
    <Sheet
      open
      onClose={onClose}
      title={member.displayName}
      description={member.roles.join(', ')}
      side="inline-end"
    >
      <div className="space-y-6">
        <form action={saveDetails} className="space-y-4">
          <input type="hidden" name="userId" value={member.id} />
          <TextField
            label="Display name"
            name="displayName"
            defaultValue={member.displayName}
            required
          />
          <TextField label="Email" value={member.email} onChange={() => {}} readOnly />
          <SelectField
            label="Role"
            name="roleKey"
            options={roleOptions(roles)}
            defaultValue={currentRole}
          />
          <p className="text-ink-subtle text-xs">
            Initials on a table chip and a tray card come from the display name: {member.initials}.
          </p>

          <Feedback error={details.error} message={details.message} />

          <Button tone="primary" type="submit" disabled={savingDetails}>
            {savingDetails ? 'Saving…' : 'Save person'}
          </Button>
        </form>

        <section className="border-border rounded-base border p-3">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <KeyRound aria-hidden="true" className="size-4" />
            Till PIN
          </h3>
          <p className="text-ink-subtle mb-3 text-xs">
            Stored hashed and never shown again, here or anywhere. It can only be replaced. Five
            wrong attempts lock this PIN for a minute.
          </p>
          <form action={savePin} className="space-y-3">
            <input type="hidden" name="userId" value={member.id} />
            <TextField
              label={member.hasPin ? 'New PIN' : 'PIN'}
              name="pin"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              tabular
              required
              help="Use 4 to 6 digits. Avoid consecutive or repeated digits and years."
            />
            <Feedback error={pin.error} message={pin.message} />
            <Button size="sm" type="submit" disabled={savingPin}>
              {savingPin ? 'Setting…' : member.hasPin ? 'Replace the PIN' : 'Set a PIN'}
            </Button>
          </form>
        </section>

        <section className="border-border rounded-base border p-3">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <LockKeyhole aria-hidden="true" className="size-4" />
            Sign-in password
          </h3>
          <p className="text-ink-subtle mb-3 text-xs">
            Replace this person's password. The existing password cannot be viewed.
          </p>
          <form action={savePassword} className="space-y-3">
            <input type="hidden" name="userId" value={member.id} />
            <TextField
              label="New password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              help="At least 12 characters."
            />
            <TextField
              label="Confirm new password"
              name="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              required
            />
            <Feedback error={password.error} message={password.message} />
            <Button size="sm" type="submit" disabled={savingPassword}>
              {savingPassword ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        </section>

        <section className="border-border rounded-base border p-3">
          <h3 className="mb-1 text-sm font-semibold">Can sign in</h3>
          <form action={saveActivation} className="space-y-3">
            <input type="hidden" name="userId" value={member.id} />
            <input type="hidden" name="active" value={member.isActive ? 'false' : 'true'} />
            <p className="text-ink-subtle text-xs">
              {member.isActive
                ? 'Deactivating takes effect on their next request, not at the end of their shift.'
                : 'This account cannot sign in and cannot unlock a till.'}
            </p>
            <Feedback error={activation.error} message={activation.message} />
            <Button
              size="sm"
              tone={member.isActive ? 'danger' : 'secondary'}
              type="submit"
              disabled={savingActivation || isSelf}
            >
              {member.isActive ? 'Deactivate' : 'Reactivate'}
            </Button>
            {isSelf && (
              <p className="text-ink-subtle text-xs">
                This is your own account. Deactivating it would lock you out of it.
              </p>
            )}
          </form>
        </section>

        <section className="border-danger rounded-base border p-3">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Trash2 aria-hidden="true" className="size-4" />
            Delete account
          </h3>
          <p className="text-ink-subtle mb-3 text-xs">
            This permanently removes the account from staff lists and sign-in while preserving
            historical records. Type {member.displayName} to confirm.
          </p>
          <form action={deleteMember} className="space-y-3">
            <input type="hidden" name="userId" value={member.id} />
            <TextField
              label="Confirm display name"
              name="confirmation"
              autoComplete="off"
              required
              disabled={isSelf}
            />
            <Feedback error={deletion.error} message={deletion.message} />
            <Button
              size="sm"
              tone="danger"
              icon={Trash2}
              type="submit"
              disabled={deleting || isSelf}
            >
              {deleting ? 'Deleting…' : 'Delete account'}
            </Button>
            {isSelf && (
              <p className="text-ink-subtle text-xs">You cannot delete your own account.</p>
            )}
          </form>
        </section>

        <p className="text-ink-subtle flex items-start gap-2 text-xs">
          <UserRound aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Every permission is checked again on the server. Hiding a button is presentation, not
          access control.
        </p>
      </div>
    </Sheet>
  );
}
