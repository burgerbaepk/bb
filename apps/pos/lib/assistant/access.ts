import type { RoleKey } from '@natech/contracts';

/**
 * Who gets the assistant — ADR 0031.
 *
 * A role check rather than a permission, deliberately. Every tool the assistant
 * holds reads through `reports.read`, and AUDITOR holds that too; but an
 * inspector under PSTSA s.32(2) is owed the records, not a model's reading of
 * them, and an answer that paraphrased a figure wrongly would be a statement
 * the restaurant made to the authority. OWNER and MANAGER are the two roles
 * that run the business, which is what the assistant is for.
 *
 * Plain module, no `server-only`: the shell uses it to decide whether to draw
 * the button, and the action uses it again to decide whether to answer. The
 * second is the check that counts (§14.1).
 */
export function canUseAssistant(role: RoleKey): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}
