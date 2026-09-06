import { z } from 'zod';
import { canonicalPhone } from '@natech/domain';

/**
 * What sign-up collects beyond an email — BUILD-PLAN.md §13.3, §5.11; ADR 0022.
 *
 * Local to this app rather than a `packages/contracts` addition, for the reason
 * `/api/otp/verify` already states about its own request body: an input schema
 * belongs to the file that needs it unless another surface reads the same wire
 * shape. Nothing else sends this one.
 *
 * `phone` is transformed, not merely validated. `customers_phone_idx` is a
 * unique index and the till writes through it too (ADR 0016), so what reaches
 * the column has to be the canonical form or the same person becomes two
 * customers — see `canonicalPhone` in `@natech/domain`, which is where both
 * apps get their answer from.
 */
export const SignUpProfileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(80),
  phone: z
    .string()
    .trim()
    .min(1, 'Enter your mobile number.')
    .transform((raw, ctx) => {
      const canonical = canonicalPhone(raw);
      if (canonical === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'Enter a Pakistani mobile number, for example 03XX XXXXXXX.',
        });
        return z.NEVER;
      }
      return canonical;
    }),
  // One free-form field: a rider reads an address as a sentence, and splitting
  // it into boxes only guarantees the parts arrive in the wrong ones.
  address: z.string().trim().min(8, 'Enter an address we can deliver to.').max(300),
  password: z.string().min(6, 'Password must contain at least 6 characters.').max(128),
});

export type SignUpProfile = z.infer<typeof SignUpProfileSchema>;
