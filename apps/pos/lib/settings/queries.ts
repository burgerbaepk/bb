import 'server-only';
import { desc, eq, inArray } from 'drizzle-orm';
import { dbRead, settingHistory, settings, users } from '@natech/db';
import type { SettingDefinition, SettingHistoryEntry, SettingValue } from '@natech/contracts';
import { SETTINGS_REGISTRY, SETTING_DEFINITIONS } from './registry';
import { formatSettingValue } from './serialise';

/**
 * The settings screen's read side — BUILD-PLAN.md §5.10, §2 R2, R16;
 * docs/runfiles/M21-settings-registry.md.
 *
 * Every figure on the screen comes from `settings` and `setting_history`. That
 * is the whole point of M21: until ADR 0025 removed it, this screen rendered
 * `MOCK_SETTING_VALUES` and `MOCK_SETTING_HISTORY` — fabricated current values
 * attributed to a person who does not exist, above a fabricated audit trail, on
 * the screen whose §5.10 purpose is to *be* the audit trail.
 *
 * `dbRead` throughout (R2): this answers an RSC render.
 */
const HISTORY_LIMIT = 12;

export interface SettingsRegistryData {
  readonly definitions: readonly SettingDefinition[];
  readonly values: readonly SettingValue[];
  readonly history: readonly SettingHistoryEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readSettingsRegistry(): Promise<SettingsRegistryData> {
  // The distinct `settings` rows the registry's keys resolve to — six of the
  // nine tax keys share the single `tax.policy` row, so this is three rows,
  // not nine.
  const rowKeys = [...new Set(SETTINGS_REGISTRY.map((entry) => entry.storage.row))];
  const historyKeys = SETTINGS_REGISTRY.map((entry) => entry.definition.key);

  const [rows, historyRows] = await Promise.all([
    dbRead()
      .select({
        key: settings.key,
        value: settings.value,
        updatedAt: settings.updatedAt,
        updatedByName: users.displayName,
      })
      .from(settings)
      .leftJoin(users, eq(settings.updatedBy, users.id))
      .where(inArray(settings.key, rowKeys)),
    dbRead()
      .select({
        id: settingHistory.id,
        key: settingHistory.key,
        before: settingHistory.before,
        after: settingHistory.after,
        actorName: users.displayName,
        reason: settingHistory.reason,
        at: settingHistory.at,
      })
      .from(settingHistory)
      .leftJoin(users, eq(settingHistory.actorId, users.id))
      // Scoped to the keys this registry writes, which is why the panel is
      // labelled "changes to these settings" rather than "recent changes".
      // `saveServiceChargeSettingsAction` records its own rows under the row
      // key `tax.policy` with the whole policy object as before/after; a blob
      // diff cannot be rendered as one line, and showing it as
      // "[object Object] → [object Object]" on the screen whose job is to be
      // legible evidence would be worse than scoping the panel honestly.
      // Those rows are in `setting_history` and reach the auditor pack.
      .where(inArray(settingHistory.key, historyKeys))
      .orderBy(desc(settingHistory.at))
      .limit(HISTORY_LIMIT),
  ]);

  const rowByKey = new Map(rows.map((row) => [row.key, row]));

  const values: SettingValue[] = SETTINGS_REGISTRY.map((entry) => {
    const row = rowByKey.get(entry.storage.row);
    const stored =
      entry.storage.field === undefined
        ? row?.value
        : isRecord(row?.value)
          ? row.value[entry.storage.field]
          : undefined;

    return {
      key: entry.definition.key,
      // `SettingValue.value` is a union of primitives; the editor reads it
      // through the same `formatSettingValue` the history list uses, so a
      // string here cannot disagree with what the control renders.
      value: formatSettingValue(stored),
      // A field inside a blob has no timestamp of its own — the row's stamp is
      // the closest true statement, and it is the row that was written.
      updatedAt: row?.updatedAt ?? null,
      updatedByName: row?.updatedByName ?? null,
    };
  });

  const history: SettingHistoryEntry[] = historyRows.map((row) => ({
    id: row.id,
    key: row.key,
    before: formatSettingValue(row.before),
    after: formatSettingValue(row.after),
    // A row whose actor has since been deleted still happened. `SettingHistoryEntry`
    // requires a non-empty name, so it is named as what it is rather than dropped.
    actorName: row.actorName ?? 'Removed user',
    reason: row.reason,
    at: row.at,
  }));

  return { definitions: SETTING_DEFINITIONS, values, history };
}
