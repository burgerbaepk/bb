import 'server-only';

import { and, desc, eq, gte, ilike, isNull, lte, or } from 'drizzle-orm';
import { auditLog, dbRead, roles, userRoles, users } from '@natech/db';
import { RoleKeySchema, type RoleKey } from '@natech/contracts';

/** `roles.key` is `text` in the schema, so narrow it rather than assert it. */
function asRoleKey(value: string | null): RoleKey | null {
  if (value === null) return null;
  const parsed = RoleKeySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The activity log — BUILD-PLAN.md §2 R7, §5.2; ADR 0027.
 *
 * R7 has written an `audit_log` row for every mutation since M02, and PSTSA
 * s.32(2) is the reason: an officer may demand full access to electronic
 * records, and "who changed this, and when" has to be answerable years later
 * by someone who does not have the application. What was missing was any way
 * for the person who actually needs it daily — the owner watching a manager
 * who watches the till — to read it. The rows existed and nobody could see
 * them, which is the same as not having them.
 *
 * Nothing here writes. This module is a reader over a table that was already
 * being filled correctly; the control it enables is that staff know it is
 * read.
 */

export interface ActivityRow {
  readonly id: string;
  readonly at: Date;
  readonly actorName: string | null;
  readonly actorRole: RoleKey | null;
  readonly entity: string;
  readonly entityId: string | null;
  readonly action: string;
  readonly ip: string | null;
  readonly after: unknown;
}

export interface ActivityFilters {
  readonly actorId?: string;
  readonly role?: string;
  readonly action?: string;
  readonly from?: string;
  readonly to?: string;
}

const MAX_ROWS = 200;

/**
 * Everyone who has ever been an actor, for the filter dropdown.
 *
 * Read off `users` rather than off distinct `audit_log.actor_id`, so a staff
 * member with nothing recorded yet is still selectable — "show me what this
 * person did" returning an empty list is a meaningful answer and a distinct
 * one from "this person is not in the dropdown".
 */
export async function listActors(): Promise<
  ReadonlyArray<{ id: string; name: string; role: RoleKey | null }>
> {
  const rows = await dbRead()
    .select({ id: users.id, name: users.displayName, role: roles.key })
    .from(users)
    .leftJoin(userRoles, and(eq(userRoles.userId, users.id), isNull(userRoles.deletedAt)))
    .leftJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.deletedAt)))
    .where(isNull(users.deletedAt))
    .orderBy(users.displayName);

  // A user may hold more than one role grant; the first is enough to label them.
  const byId = new Map<string, { id: string; name: string; role: RoleKey | null }>();
  for (const row of rows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, { id: row.id, name: row.name, role: asRoleKey(row.role) });
    }
  }
  return [...byId.values()];
}

export async function listActivity(filters: ActivityFilters): Promise<ActivityRow[]> {
  const conditions = [isNull(auditLog.deletedAt)];
  if (filters.actorId) conditions.push(eq(auditLog.actorId, filters.actorId));
  const role = asRoleKey(filters.role ?? null);
  if (role !== null) conditions.push(eq(roles.key, role));
  if (filters.from) conditions.push(gte(auditLog.at, new Date(`${filters.from}T00:00:00Z`)));
  // Inclusive of the whole closing day, which is what a date picker means by "to".
  if (filters.to) conditions.push(lte(auditLog.at, new Date(`${filters.to}T23:59:59.999Z`)));
  if (filters.action) {
    const search = or(
      ilike(auditLog.action, `%${filters.action}%`),
      ilike(auditLog.entity, `%${filters.action}%`),
    );
    if (search) conditions.push(search);
  }

  const rows = await dbRead()
    .select({
      id: auditLog.id,
      at: auditLog.at,
      actorName: users.displayName,
      actorRole: roles.key,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      action: auditLog.action,
      ip: auditLog.ip,
      after: auditLog.after,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .leftJoin(userRoles, and(eq(userRoles.userId, users.id), isNull(userRoles.deletedAt)))
    .leftJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.deletedAt)))
    .where(and(...conditions))
    .orderBy(desc(auditLog.at))
    .limit(MAX_ROWS);

  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    actorName: row.actorName,
    actorRole: asRoleKey(row.actorRole),
    entity: row.entity,
    entityId: row.entityId,
    action: row.action,
    ip: row.ip,
    after: row.after,
  }));
}
