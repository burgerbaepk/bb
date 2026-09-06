import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@natech/ui';
import type { SettingDefinition, SettingHistoryEntry, SettingValue } from '@natech/contracts';
import { SettingsRegistry } from '@/components/admin/SettingsRegistry';
import { saveSettingAction } from '@/lib/settings/actions';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

/**
 * §5.10, §6.8 — a HIGH-audit change is recorded with a reason, and now
 * actually saved.
 *
 * `tax.policy` decides what a customer is charged and what PRA is told. §5.10
 * gives `setting_history` a `reason` column; a change that writes an empty
 * string there is worse than one that is refused, because it looks like an
 * answer.
 *
 * The fixtures are declared here rather than imported from
 * `@natech/contracts/mocks`. That set was written for the Phase-1 renderer and
 * no longer describes what the product registers — it still lists
 * `receipt.showUrdu` and `offline.maxQueuedOrders`, which M21 excluded, and
 * lacks `roundingDirection`, which M21 added. Asserting the renderer against a
 * definition list nothing ships is how a suite stays green while the screen
 * drifts. Two definitions, one of each audit level, is all these assertions
 * need; the real list lives in `lib/settings/registry.ts` and the action
 * whitelists against it.
 */
const DEFINITIONS: readonly SettingDefinition[] = [
  {
    key: 'tax.policy.serviceChargeTaxable',
    label: 'Service charge is taxable',
    help: 'Pending P4 — a written opinion from the tax advisor under s.7(1).',
    group: 'TAX',
    kind: 'BOOLEAN',
    options: [],
    permission: 'settings.tax.write',
    auditLevel: 'HIGH',
    legalReference: 'PSTSA 2012 s.7(1)',
  },
  {
    key: 'security.idleLockSeconds',
    label: 'Till idle lock',
    help: 'How long a bound terminal stays unlocked between till actions.',
    group: 'SECURITY',
    kind: 'INTEGER',
    options: [],
    permission: 'settings.write',
    auditLevel: 'NORMAL',
    legalReference: null,
  },
];

const VALUES: readonly SettingValue[] = [
  {
    key: 'tax.policy.serviceChargeTaxable',
    value: 'false',
    updatedAt: new Date('2026-08-16T09:00:00Z'),
    updatedByName: 'Amina Karim',
  },
  {
    key: 'security.idleLockSeconds',
    value: '300',
    updatedAt: null,
    updatedByName: null,
  },
];

const HISTORY: readonly SettingHistoryEntry[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    key: 'tax.policy.serviceChargeTaxable',
    before: 'true',
    after: 'false',
    actorName: 'Amina Karim',
    reason: 'Interim position pending the P4 advisor opinion.',
    at: new Date('2026-08-16T09:00:00Z'),
  },
];

function renderSettings() {
  return render(
    <ToastProvider>
      <SettingsRegistry
        definitions={DEFINITIONS}
        values={VALUES}
        history={HISTORY}
        timezone="Asia/Karachi"
      />
    </ToastProvider>,
  );
}

describe('the settings registry', () => {
  it('renders every definition in the selected group from the registry alone', () => {
    renderSettings();
    // A key can also appear in the audit trail beneath, so this asserts
    // presence rather than uniqueness.
    expect(screen.getAllByText('tax.policy.serviceChargeTaxable').length).toBeGreaterThan(0);
  });

  it('marks a HIGH-audit setting and states the clause it implements', () => {
    renderSettings();
    expect(screen.getAllByText('High audit')).toHaveLength(1);
    expect(screen.getAllByText('PSTSA 2012 s.7(1)').length).toBeGreaterThan(0);
  });

  it('will not save a HIGH-audit change without a reason — §5.10', async () => {
    const user = userEvent.setup({ delay: null });
    renderSettings();

    const toggle = screen.getByRole('switch', { name: 'Service charge is taxable' });
    await user.click(toggle);

    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: /Save and record/ });
    expect(save).toBeDisabled();

    await user.click(within(dialog).getByLabelText('Why is this changing?'));
    await user.paste('Advisor confirmed s.7(1) covers the service charge.');
    expect(save).toBeEnabled();
  });

  it('refuses a reason too short to mean anything', async () => {
    const user = userEvent.setup({ delay: null });
    renderSettings();

    await user.click(screen.getByRole('switch', { name: 'Service charge is taxable' }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByLabelText('Why is this changing?'));
    await user.paste('ok');
    expect(within(dialog).getByRole('button', { name: /Save and record/ })).toBeDisabled();
    expect(within(dialog).getByRole('alert')).toBeInTheDocument();
  });

  it('states the before and the after so the change is legible', async () => {
    const user = userEvent.setup({ delay: null });
    renderSettings();

    await user.click(screen.getByRole('switch', { name: 'Service charge is taxable' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('Now')).toBeInTheDocument();
    expect(within(dialog).getByText('Changing to')).toBeInTheDocument();
    expect(within(dialog).getByText('true')).toBeInTheDocument();
  });

  it('shows the audit trail with actor and reason — §5.10', () => {
    renderSettings();
    expect(screen.getAllByText(/Interim position pending/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Amina Karim/).length).toBeGreaterThan(0);
  });

  /**
   * M21. Before this, `onConfirm` wrote to local state and announced "updated
   * and recorded" — the change never left the browser. These two assert that
   * a save reaches the server action at all, which is the whole defect.
   */
  it('sends a HIGH-audit change to the server with its reason', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(saveSettingAction).mockClear();
    renderSettings();

    await user.click(screen.getByRole('switch', { name: 'Service charge is taxable' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Why is this changing?'));
    await user.paste('Advisor confirmed s.7(1) covers the service charge.');
    await user.click(within(dialog).getByRole('button', { name: /Save and record/ }));

    await waitFor(() => {
      expect(saveSettingAction).toHaveBeenCalledWith({
        key: 'tax.policy.serviceChargeTaxable',
        value: 'true',
        reason: 'Advisor confirmed s.7(1) covers the service charge.',
      });
    });
  });

  it('sends a NORMAL change straight through, with no reason', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(saveSettingAction).mockClear();
    renderSettings();

    await user.click(screen.getByRole('group', { name: 'Settings group' }).children[1] as Element);
    const field = await screen.findByLabelText('Till idle lock');
    await user.clear(field);
    await user.type(field, '600');
    await user.tab();

    await waitFor(() => {
      expect(saveSettingAction).toHaveBeenCalledWith({
        key: 'security.idleLockSeconds',
        value: '600',
        reason: '',
      });
    });
  });
});
