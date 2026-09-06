'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { History, Scale, ShieldAlert } from 'lucide-react';
import {
  Button,
  Dialog,
  SegmentedControl,
  SelectField,
  StatusPill,
  Switch,
  TextAreaField,
  TextField,
  useToast,
} from '@natech/ui';
import type {
  SettingDefinition,
  SettingGroup,
  SettingHistoryEntry,
  SettingValue,
} from '@natech/contracts';
import { PageHeading } from './PageHeading';
import { formatDateTime } from '@/components/lib/format';
import { saveSettingAction } from '@/lib/settings/actions';

/**
 * The settings registry renderer — BUILD-PLAN.md §5.10, §6.8.
 *
 * `settings` is a key/jsonb table. A screen with one hand-built form per key
 * drifts the first time somebody adds a key and forgets the form, so the
 * registry is data and this component is the only renderer: each definition
 * declares its kind, its group, the permission needed to write it, its audit
 * level, and the clause it implements.
 *
 * **A HIGH-audit change will not save without a reason.** §5.10 gives
 * `setting_history` a `reason` column and §6.8 puts `tax.policy` behind
 * `settings.tax.write` at that level. It decides what a customer is charged
 * and what PRA is told; a change with no stated reason is exactly the thing
 * an inspector asks about, and an empty string in the audit trail is worse
 * than a refusal at the point of change.
 *
 * M21 gave this component a save path. Until then `commit` wrote the new
 * value into local `draft` state and announced "updated and recorded" — a
 * screen claiming a persisted, audited change that was neither. Every rule
 * above is now enforced in `saveSettingAction` as well as asked for here: the
 * dialog is where a reason is collected, not where it is required. The control
 * still moves optimistically so the switch does not lag the click, and
 * `router.refresh()` reconciles against what was actually written — a refused
 * change snaps back with the reason it was refused.
 */
const GROUP_LABELS: Readonly<Record<SettingGroup, string>> = {
  TAX: 'Tax',
  PRINTING: 'Printing',
  FLOOR: 'Floor',
  STOREFRONT: 'Storefront',
  SECURITY: 'Security',
};

export interface SettingsRegistryProps {
  readonly definitions: readonly SettingDefinition[];
  readonly values: readonly SettingValue[];
  readonly history: readonly SettingHistoryEntry[];
  readonly timezone: string;
  readonly leadingContent?: React.ReactNode;
  readonly embedded?: boolean;
}

interface PendingChange {
  readonly definition: SettingDefinition;
  readonly before: string;
  readonly after: string;
}

export function SettingsRegistry({
  definitions,
  values,
  history,
  timezone,
  leadingContent,
  embedded = false,
}: SettingsRegistryProps) {
  const toast = useToast();
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [group, setGroup] = useState<SettingGroup>('TAX');
  const [draft, setDraft] = useState<Readonly<Record<string, string>>>({});
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [reason, setReason] = useState('');

  const groups = useMemo(
    () => [...new Set(definitions.map((definition) => definition.group))],
    [definitions],
  );

  /**
   * What is actually persisted. `commit` compares against this and never
   * against `valueOf`: a typed control reports every keystroke into `draft`,
   * so by the time it blurs, `valueOf` already returns the value being
   * committed and every change would look like a no-op and be dropped. It is
   * also the honest "Now" for the reason dialog — an audit prompt has to show
   * what is stored, not what the operator has typed over it.
   */
  const storedValueOf = (key: string): string => {
    const stored = values.find((value) => value.key === key);
    if (stored === undefined) return '';
    return Array.isArray(stored.value) ? stored.value.join(',') : String(stored.value);
  };

  /** What the control shows: the in-flight edit if there is one, else storage. */
  const valueOf = (key: string): string => draft[key] ?? storedValueOf(key);

  const save = (definition: SettingDefinition, next: string, changeReason: string) => {
    // Optimistic, then reconciled. A switch that waits for a round trip before
    // moving reads as a broken switch on a till.
    setDraft((current) => ({ ...current, [definition.key]: next }));
    startSaving(async () => {
      const result = await saveSettingAction({
        key: definition.key,
        value: next,
        reason: changeReason,
      });
      if (result.ok) {
        toast.show('success', `${definition.label} saved`);
      } else {
        // Drop the optimistic value so the control shows what is stored, not
        // what was attempted.
        setDraft((current) => {
          const { [definition.key]: _discarded, ...rest } = current;
          return rest;
        });
        toast.show('error', result.error ?? 'Could not save that setting.');
      }
      router.refresh();
    });
  };

  const commit = (definition: SettingDefinition, next: string) => {
    const before = storedValueOf(definition.key);
    if (before === next) return;

    // A LOW or NORMAL change is written straight through. A HIGH one stops
    // here and asks why — and `saveSettingAction` refuses it if the answer
    // never arrives.
    if (definition.auditLevel === 'HIGH') {
      setPending({ definition, before, after: next });
      setReason('');
      return;
    }

    save(definition, next, '');
  };

  const visible = definitions.filter((definition) => definition.group === group);

  return (
    <>
      {embedded ? (
        <div className="mb-5">
          <h2 className="text-xl font-semibold">POS rules</h2>
          <p className="text-ink-muted mt-1 text-sm">
            Tax, service charges, order behaviour, and day-to-day preferences.
          </p>
        </div>
      ) : (
        <PageHeading
          title="Settings"
          note="Tax, service charges, order behaviour, and day-to-day preferences."
        />
      )}

      {leadingContent}

      <div className="mb-4">
        <SegmentedControl
          label="Settings group"
          value={group}
          onChange={setGroup}
          options={groups.map((candidate) => ({
            value: candidate,
            label: GROUP_LABELS[candidate],
            count: definitions.filter((definition) => definition.group === candidate).length,
          }))}
        />
      </div>

      {/* A native <fieldset disabled> switches off every control inside it —
          Switch, SelectField and TextField alike — without threading a
          `disabled` prop through each one. It stops a second click landing on
          a tax setting while the first is still in flight, which would queue
          two writes and two history rows for one intended change. */}
      <fieldset disabled={saving} aria-busy={saving} className="min-w-0">
        <ul className="space-y-3">
          {visible.map((definition) => (
            <li
              key={definition.key}
              className="border-border bg-surface-raised rounded-base border p-4"
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{definition.label}</h2>
                    {!embedded && definition.auditLevel === 'HIGH' && (
                      <StatusPill size="sm" tone="warn" icon={ShieldAlert} label="High audit" />
                    )}
                    {!embedded && definition.legalReference !== null && (
                      <StatusPill
                        size="sm"
                        tone="neutral"
                        icon={Scale}
                        label={definition.legalReference}
                      />
                    )}
                  </div>
                  <p className="text-ink-muted max-w-2xl text-sm">{definition.help}</p>
                  {!embedded && (
                    <p className="text-ink-subtle mt-1 font-mono text-2xs">{definition.key}</p>
                  )}
                </div>

                <div className="w-full sm:w-64">
                  <SettingControl
                    definition={definition}
                    value={valueOf(definition.key)}
                    onEdit={(next) =>
                      setDraft((current) => ({ ...current, [definition.key]: next }))
                    }
                    onCommit={(next) => commit(definition, next)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </fieldset>

      <section className="mt-8">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
          <History aria-hidden="true" className="size-5" />
          Recent changes to these settings
        </h2>
        <ul className="divide-border border-border divide-y rounded-base border text-sm">
          {history.map((entry) => (
            <li key={entry.id} className="px-4 py-3">
              <p>
                <span className={embedded ? 'font-medium' : 'font-mono text-xs'}>
                  {embedded
                    ? (definitions.find((definition) => definition.key === entry.key)?.label ??
                      'Setting')
                    : entry.key}
                </span>{' '}
                <span className="text-ink-muted">
                  {entry.before} → <span className="text-ink font-medium">{entry.after}</span>
                </span>
              </p>
              <p className="text-ink-subtle text-xs">
                {entry.actorName} · {formatDateTime(entry.at, timezone)}
                {entry.reason !== null && ` · ${entry.reason}`}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <ReasonDialog
        pending={pending}
        reason={reason}
        onReason={setReason}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending === null) return;
          save(pending.definition, pending.after, reason);
          setPending(null);
        }}
      />
    </>
  );
}

/**
 * One control per `SettingKind`. Adding a kind is a case here and nowhere else.
 *
 * Two callbacks, because M21 gave a commit a cost. A discrete control — a
 * switch, a select — commits the moment it changes: the click is the decision.
 * A typed control reports keystrokes to `onEdit` and commits on blur, because
 * committing per keystroke means typing `600` into the idle lock writes 6, then
 * 60, then 600 — three `settings` writes, three `setting_history` rows and
 * three audit rows for one intended change, with a live six-second lock in
 * between. That was harmless while the old stub wrote to React state and
 * nothing else. It is not harmless now.
 */
function SettingControl({
  definition,
  value,
  onEdit,
  onCommit,
}: {
  readonly definition: SettingDefinition;
  readonly value: string;
  readonly onEdit: (next: string) => void;
  readonly onCommit: (next: string) => void;
}) {
  switch (definition.kind) {
    case 'BOOLEAN':
      return (
        <Switch
          checked={value === 'true'}
          onChange={(next) => onCommit(String(next))}
          label={definition.label}
        />
      );

    case 'ENUM':
    case 'ENUM_LIST':
      return (
        <SelectField
          label={definition.label}
          value={value}
          onChange={(event) => onCommit(event.target.value)}
          options={definition.options.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      );

    case 'BPS':
      return (
        <TextField
          label={`${definition.label} (%)`}
          value={String((Number(value) || 0) / 100)}
          onChange={(event) => onEdit(String(Math.round(Number(event.target.value) * 100)))}
          onBlur={(event) => onCommit(String(Math.round(Number(event.target.value) * 100)))}
          inputMode="decimal"
          tabular
        />
      );

    case 'MONEY':
      return (
        <TextField
          label={`${definition.label} (Rs.)`}
          value={String((Number(value) || 0) / 100)}
          onChange={(event) => onEdit(String(Math.round(Number(event.target.value) * 100)))}
          onBlur={(event) => onCommit(String(Math.round(Number(event.target.value) * 100)))}
          inputMode="decimal"
          tabular
        />
      );

    case 'INTEGER':
      return (
        <TextField
          label={definition.label}
          value={value}
          onChange={(event) => onEdit(event.target.value)}
          onBlur={(event) => onCommit(event.target.value)}
          inputMode="numeric"
          tabular
        />
      );

    case 'TIME':
    case 'TEXT':
    case 'TEXT_LIST':
      return (
        <TextField
          label={definition.label}
          value={value}
          onChange={(event) => onEdit(event.target.value)}
          onBlur={(event) => onCommit(event.target.value)}
        />
      );

    default: {
      const exhaustive: never = definition.kind;
      throw new TypeError(`unhandled setting kind ${String(exhaustive)}`);
    }
  }
}

/**
 * §5.10 — the reason a HIGH-audit change is recorded with.
 *
 * Mandatory rather than dismissible: Escape and the backdrop do not close it,
 * because the alternative to answering is cancelling the change, not making it
 * silently.
 */
function ReasonDialog({
  pending,
  reason,
  onReason,
  onCancel,
  onConfirm,
}: {
  readonly pending: PendingChange | null;
  readonly reason: string;
  readonly onReason: (value: string) => void;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  if (pending === null) return null;

  return (
    <Dialog
      open
      mandatory
      onClose={onCancel}
      title={`Change ${pending.definition.label}`}
      description="Enter a reason for this change. Your name and reason will be saved in the change history."
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button tone="primary" disabled={reason.trim().length < 8} onClick={onConfirm}>
            Save and record
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="border-border divide-border divide-y rounded-base border text-sm">
          <div className="flex items-baseline justify-between px-3 py-2">
            <dt className="text-ink-muted">Now</dt>
            <dd className="font-mono">{pending.before || '—'}</dd>
          </div>
          <div className="flex items-baseline justify-between px-3 py-2">
            <dt className="font-medium">Changing to</dt>
            <dd className="font-mono font-semibold">{pending.after}</dd>
          </div>
          {pending.definition.legalReference !== null && (
            <div className="flex items-baseline justify-between px-3 py-2">
              <dt className="text-ink-muted">Basis</dt>
              <dd>{pending.definition.legalReference}</dd>
            </div>
          )}
        </dl>

        <TextAreaField
          label="Why is this changing?"
          help="Explain why this setting needs to change (at least 8 characters)."
          value={reason}
          onChange={onReason}
          placeholder="Describe the reason for this change."
        />

        {reason.trim().length > 0 && reason.trim().length < 8 && (
          <p role="alert" className="text-danger text-sm font-medium">
            Give a real reason. "ok" is worse in an audit than no change at all.
          </p>
        )}
      </div>
    </Dialog>
  );
}
