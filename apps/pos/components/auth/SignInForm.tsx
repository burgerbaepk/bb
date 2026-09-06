'use client';

import { useActionState } from 'react';
import { LogIn, ShieldAlert } from 'lucide-react';
import { Button, SelectField, TextField } from '@natech/ui';
import { NO_ERROR } from '@/lib/auth/actions/session-idle';
import { signInAction } from '@/lib/auth/actions/session';
import type { TerminalOption } from '@/lib/auth/queries';

/**
 * Binding a terminal for the shift — BUILD-PLAN.md §14.2.
 *
 * The till choice is what §14.2 means by binding. It is remembered on the
 * device afterwards so the next morning is one fewer decision, but the binding
 * that counts is the one in the session, re-made at every sign-in.
 */
export interface SignInFormProps {
  readonly terminals: readonly TerminalOption[];
  readonly defaultTerminalId: string | null;
  readonly notice: string | null;
}

export function SignInForm({ terminals, defaultTerminalId, notice }: SignInFormProps) {
  const [state, action, pending] = useActionState(signInAction, NO_ERROR);

  if (terminals.length === 0) {
    return (
      <div className="border-border bg-surface-raised rounded-base border p-6">
        <h1 className="mb-2 flex items-center gap-2 text-lg font-semibold">
          <ShieldAlert aria-hidden="true" className="text-warn size-5" />
          No till is registered
        </h1>
        <p className="text-ink-muted text-sm">
          A shift is bound to a terminal, so at least one has to exist before anyone can sign in.
          Register one with <code className="text-xs">pnpm db:seed</code>, then reload.
        </p>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="border-border bg-surface-raised rounded-base border p-6 shadow-xl shadow-black/5"
    >
      <div className="mb-5 text-center">
        {/*
          The lockup is a black wordmark on its own white plate, so it cannot
          go transparent — on a dark surface the wordmark would disappear.
          Rounding the image itself clips those white corners, which turns the
          plate from a bare white rectangle sitting on the dark card into a
          deliberate one. Applied unconditionally rather than behind a `dark:`
          variant: it costs nothing against the near-white light surface, and
          the theme has three states (§14.3 `mode`), so one rule that holds in
          all three beats two that have to agree.

          The asset carries its own even margin, wider than this radius eats
          into the corner, so no part of the mark is clipped.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/burger-bae-logo.png"
          alt="Burger Bae"
          className="rounded-lg mx-auto mb-4 h-20 w-auto object-contain"
        />
        <h1 className="text-2xl font-semibold">Welcome back</h1>
      </div>
      <p className="text-ink-muted mt-1 mb-5 text-sm">
        Sign in to start selling. This device will remember its till for next time.
      </p>

      {notice !== null && (
        <p
          role="status"
          className="border-warn bg-warn-soft text-warn mb-4 rounded-base border px-3 py-2 text-sm"
        >
          {notice}
        </p>
      )}

      <div className="space-y-4">
        {terminals.length === 1 ? (
          <input type="hidden" name="terminalId" value={terminals[0]?.id} />
        ) : (
          <SelectField
            label="Till"
            name="terminalId"
            defaultValue={defaultTerminalId ?? terminals[0]?.id}
            options={terminals.map((terminal) => ({ value: terminal.id, label: terminal.label }))}
            required
          />
        )}
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state.error !== null && (
        <p
          role="alert"
          className="border-danger bg-danger-soft text-danger mt-4 rounded-base border px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      )}

      <Button className="mt-5" tone="primary" icon={LogIn} block type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
