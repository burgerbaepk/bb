import { z } from 'zod';
import { PermissionSchema, RoleKeySchema } from './enums';

/**
 * Staff and access — BUILD-PLAN.md §14.1, §14.2.
 *
 * A terminal is bound for the shift with email and password; individual staff
 * are identified by a 4-to-6 digit PIN per till action (§14.2). That split is
 * why `StaffMember` carries `hasPin` rather than anything resembling a PIN: the
 * shape that reaches a screen must not be able to carry a credential.
 */

export const StaffMemberSchema = z.object({
  id: z.uuid(),
  displayName: z.string().min(1),
  initials: z.string().min(1).max(3),
  email: z.string(),
  roles: z.array(RoleKeySchema).min(1),
  hasPin: z.boolean(),
  isActive: z.boolean(),
  lastActiveAt: z.date().nullable(),
});
export type StaffMember = z.infer<typeof StaffMemberSchema>;

export const RoleSchema = z.object({
  key: RoleKeySchema,
  name: z.string().min(1),
  description: z.string().min(1),
  permissions: z.array(PermissionSchema),
  memberCount: z.int().nonnegative(),
});
export type Role = z.infer<typeof RoleSchema>;

/** The signed-in identity a POS surface renders against. */
export const ViewerSchema = z.object({
  id: z.uuid(),
  displayName: z.string().min(1),
  initials: z.string().min(1).max(3),
  role: RoleKeySchema,
  permissions: z.array(PermissionSchema),
});
export type Viewer = z.infer<typeof ViewerSchema>;

export function can(viewer: Viewer, permission: z.infer<typeof PermissionSchema>): boolean {
  return viewer.permissions.includes(permission);
}
