import { createInterface, type Interface } from 'node:readline';
import { eq, sql } from 'drizzle-orm';
import { hashSecret, isGuessablePin, isWellFormedPin } from '@natech/auth';
import { closeDb, dbWrite } from '../src/client';
import { writeAudit } from '../src/audit';
import { roles, userRoles, users } from '../src/schema';

/**
 * The first owner account — BUILD-PLAN.md §14.6.
 *
 * §14.6 gives `pnpm brand:init` the job of seeding "roles and an owner
 * account". Roles are reference data and live in `index.ts`; an owner account
 * is a credential and cannot, which is why it is a separate script that
 * prompts rather than a row in a committed seed. A default password in source
 * is a default password in production — every deployment of this product would
 * share it, and the brand-grep gate exists because that class of mistake is
 * exactly what this repository is written to prevent.
 *
 * Interactive by default. For provisioning automation, set OWNER_NAME,
 * OWNER_EMAIL, OWNER_PASSWORD and optionally OWNER_PIN in the environment.
 */

const MIN_PASSWORD_LENGTH = 12;

function ask(rl: Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

/** Same prompt, without the characters appearing on a screen behind a counter. */
function askSecret(rl: Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    const output = Reflect.get(rl, 'output') as NodeJS.WriteStream | undefined;
    let muted = false;
    const original = output?.write.bind(output);

    if (output !== undefined && original !== undefined) {
      output.write = ((chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
        if (muted && typeof chunk === 'string') return true;
        return Reflect.apply(original, output, [chunk, ...rest]) as boolean;
      }) as typeof output.write;
    }

    rl.question(question, (answer) => {
      muted = false;
      if (output !== undefined && original !== undefined) output.write = original;
      output?.write('\n');
      resolve(answer.trim());
    });
    muted = true;
  });
}

function fromEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

async function main(): Promise<void> {
  const db = dbWrite();

  const ownerRole = await db
    .select({ id: roles.id })
    .from(roles)
    .where(sql`${roles.key} = 'OWNER' and ${roles.deletedAt} is null`);
  const ownerRoleId = ownerRole[0]?.id;
  if (ownerRoleId === undefined) {
    throw new Error('No OWNER role. Run `pnpm db:seed` first.');
  }

  const existing = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(sql`${userRoles.roleId} = ${ownerRoleId} and ${users.deletedAt} is null`);

  if (existing[0] !== undefined) {
    console.warn(`An owner account already exists (${existing[0].email}).`);
    console.warn('Add further staff from the back office, which records who added them.');
    await closeDb();
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const displayName = fromEnv('OWNER_NAME') ?? (await ask(rl, 'Owner display name: '));
  const email = (fromEnv('OWNER_EMAIL') ?? (await ask(rl, 'Owner email: '))).toLowerCase();
  const password = fromEnv('OWNER_PASSWORD') ?? (await askSecret(rl, 'Password: '));
  const pin = fromEnv('OWNER_PIN') ?? (await askSecret(rl, 'Till PIN (4-6 digits, optional): '));

  rl.close();

  if (displayName === '') throw new Error('A display name is required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`Not an email address: ${email}`);
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (pin !== '') {
    if (!isWellFormedPin(pin)) throw new Error('A till PIN is 4 to 6 digits (§14.2).');
    if (isGuessablePin(pin))
      throw new Error('That PIN is a run, a repeat, or a year. Pick another.');
  }

  const passwordHash = await hashSecret(password);
  const pinHash = pin === '' ? null : await hashSecret(pin);

  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(users)
      .values({ email, displayName, passwordHash, pinHash })
      .returning({ id: users.id });

    const created = inserted[0];
    if (created === undefined) throw new Error('Inserting the owner returned no row.');

    await tx.insert(userRoles).values({ userId: created.id, roleId: ownerRoleId });

    // R7 — the first mutation on the system has no actor, and saying so is the
    // honest record. Everything after it is attributable.
    await writeAudit(
      tx,
      { actorId: undefined, ip: undefined, ua: 'seeds/owner.ts' },
      {
        entity: 'users',
        entityId: created.id,
        action: 'OWNER_BOOTSTRAPPED',
        after: { email, displayName, roles: ['OWNER'], hasPin: pinHash !== null },
      },
    );
  });

  console.warn(
    [
      `Owner created: ${displayName} <${email}>${pinHash === null ? ' (no till PIN)' : ''}`,
      `Initials on a table chip and a tray card: ${initials || '—'}`,
    ].join('\n'),
  );

  await closeDb();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
