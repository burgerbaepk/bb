'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { Button, EmptyState, NumericKeypad, StatusPill, cn } from '@natech/ui';
import type { TillStaffOption } from '@/lib/auth/queries';
import { NO_ERROR } from '@/lib/auth/actions/session-idle';
import { unlockAction } from '@/lib/auth/actions/session';

/**
 * The till lock screen — BUILD-PLAN.md §14.2.
 *
 * "Identify individual staff with a 4 to 6 digit PIN per till action. Re-lock
 * on a configurable idle timeout."
 *
 * **Name first, then PIN.** A PIN alone cannot identify anybody here: PINs are
 * stored salted, so two people who both chose 4715 are indistinguishable
 * without a name to check against — and making them distinguishable would mean
 * hashing every PIN the same way, which is how a stolen database becomes a
 * lookup table. Picking a face costs one tap and buys a real credential.
 *
 * The terminal binding is untouched by this screen. Locking ends who is at the
 * till, not which till it is; the shift survives.
 */
export interface PinLockProps {
  readonly staff: readonly TillStaffOption[];
  readonly terminalLabel: string;
  readonly canManageStaff?: boolean;
  /** Shown when the lock came from the idle timeout rather than a fresh bind. */
  readonly reason: 'IDLE' | 'NEW';
}

export function PinLock({ staff, terminalLabel, reason, canManageStaff = false }: PinLockProps) {
  const [selected, setSelected] = useState<TillStaffOption | null>(null);
  const [pin, setPin] = useState('');
  const [state, action, pending] = useActionState(unlockAction, NO_ERROR);
  const [seenNonce, setSeenNonce] = useState(state.nonce);
  const formRef = useRef<HTMLFormElement>(null);

  // A rejected PIN clears itself: leaving the digits on screen invites a second
  // attempt at the same wrong number, and there are only five.
  //
  // Adjusted during render rather than in an effect, which React documents for
  // exactly this and which avoids the extra pass an effect would cost on a
  // four-year-old tablet. The nonce is what makes two identical refusals
  // distinguishable — the message alone repeats.
  if (state.nonce !== seenNonce) {
    setSeenNonce(state.nonce);
    if (state.error !== null) setPin('');
  }

  if (staff.length === 0) {
    return (
      <div className="mx-auto max-w-md p-8">
        <EmptyState
          icon={KeyRound}
          title="Nobody has a till PIN yet"
          description="A PIN identifies who takes each order. Set one for each member of staff in the back office, under Staff and roles."
        />
        {canManageStaff && (
          <Link
            href="/admin/staff"
            className="min-h-touch flex items-center justify-center text-sm underline underline-offset-4"
          >
            Set up staff PINs
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Lock aria-hidden="true" className="size-5" />
          {terminalLabel} is locked
        </h1>
        <p className="text-ink-muted mt-1 text-sm">
          {reason === 'IDLE'
            ? 'It locked itself after a spell with nobody using it. Choose your name and enter your PIN.'
            : 'The shift is bound to this terminal. Choose your name and enter your PIN to use it.'}
        </p>
      </header>

      <div>
        <h2 className="mb-2 text-sm font-medium">Who is at the till?</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {staff.map((member) => {
            const active = selected?.id === member.id;
            return (
              <li key={member.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSelected(member);
                    setPin('');
                  }}
                  className={cn(
                    'min-h-touch flex w-full items-center gap-3 rounded-base border px-3 py-3 text-start',
                    active
                      ? 'border-primary bg-primary text-primary-ink'
                      : 'border-border bg-surface-raised hover:bg-surface-sunken',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                      active ? 'bg-primary-ink/20' : 'bg-surface-sunken',
                    )}
                  >
                    {member.initials}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{member.displayName}</span>
                    <span
                      className={cn(
                        'block text-xs',
                        active ? 'text-primary-ink/80' : 'text-ink-subtle',
                      )}
                    >
                      {member.role}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {selected !== null && (
        <form
          ref={formRef}
          action={action}
          className="border-border bg-surface-raised rounded-base border p-4"
        >
          <input type="hidden" name="userId" value={selected.id} />
          <input type="hidden" name="pin" value={pin} />

          <div className="mb-3 flex items-center justify-between gap-3">
            <StatusPill icon={KeyRound} tone="neutral" size="sm" label={selected.displayName} />
            <span className="text-ink-subtle text-xs">4 to 6 digits</span>
          </div>

          <NumericKeypad
            // Remounts (and so re-autofocuses) whenever the cashier picks a
            // different name without leaving this screen.
            key={selected.id}
            mode="pin"
            value={pin}
            onChange={setPin}
            maxLength={6}
            label={`PIN for ${selected.displayName}`}
            autoFocus
            onSubmit={() => {
              if (pin.length >= 4 && !pending) formRef.current?.requestSubmit();
            }}
          />

          {state.error !== null && (
            <p
              role="alert"
              className="border-danger bg-danger-soft text-danger mt-3 rounded-base border px-3 py-2 text-sm"
            >
              {state.error}
            </p>
          )}

          <Button
            className="mt-3"
            tone="primary"
            block
            type="submit"
            disabled={pending || pin.length < 4}
          >
            {pending ? 'Checking…' : 'Unlock'}
          </Button>
        </form>
      )}
    </div>
  );
}
