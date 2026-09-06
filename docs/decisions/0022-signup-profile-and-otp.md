# 0022 — capture a name, mobile and address at sign-up, behind an email code

**Status:** accepted
**Date:** 2026-09-05
**Milestone:** post-M19 (product request, not a numbered milestone)
**Supersedes:** the password-only registration path added after M14. It reopens
`packages/contracts` under ADR 0008's stated exception, and restores §13.3's OTP
requirement, which had been built in M14 and then bypassed.

## Context

The product owner asked for a customer address and mobile number at sign-up, and
for OTP verification during sign-up and order placement.

Three decisions were confirmed before implementation: the code goes by **email**,
reusing what exists; OTP is required at **sign-up only**, not on every repeat
order; and the address is **required once, at sign-up**, for every customer
rather than only for take-away.

Most of what the request needs was already in the repository and unreachable.
`lib/auth/otp.ts` implements §13.3 in full — six digits, ten-minute TTL, single
use, five verify attempts before the code burns, three sends per email per hour,
five per IP per hour, `bcrypt(code + OTP_PEPPER)`, and the code never in a log or
a response body. `POST /api/otp/send` and `POST /api/otp/verify` exist at the
literal paths §13.3 names. `otp_codes` has been migrated since M02. All of it was
orphaned when password sign-in landed and `authenticateOrRegisterCustomer` became
the way an account was created — which is why the sign-up help text read "No
email OTP is required."

`customers` already carried `email`, `phone`, `name` and `password_hash`. It had
no address.

## Decision

**One new column: `customers.address`, nullable text** (`0003_nasty_dragon_man`).
Free-form, one field. A delivery address in Pakistan is a house number, a street,
a block and an area in whatever order the person writing it uses, and a rider
reads it as a sentence; structuring it would only guarantee the parts arrive in
the wrong boxes.

**Sign-up goes back through the code.** `authenticateOrRegisterCustomer` is now
`authenticateCustomer` and does sign-in only — the registration branch is gone
rather than left dormant, because two functions that can both mint a customer are
two places for the new fields to be forgotten. `verifyOtp` is the single place a
storefront customer row is created, and the profile is written in the same
statement as the row.

**The profile travels with the code, not before it.** An email nobody has proven
cannot leave a half-built customer row behind it.

**`/api/otp/send` refuses an email that already has an account**, rather than
mailing a code the customer will carry back only to be told they should have used
the other tab — and rather than spending one of three sends an hour on it.

**Signing in is deliberately not gated on a code.** A returning customer has a
password and proved their address the day they signed up. A code on every order
is a round trip to an inbox between wanting food and getting it.

**`canonicalPhone` lands in `@natech/domain`, and both apps use it.**
`customers_phone_idx` is a unique index, and two apps write through it: the
till's walk-in capture (ADR 0016) and now the storefront's sign-up. Neither
normalised. The same number typed with dashes at the counter and without them on
a phone was two different strings, two rows, and one customer who is a stranger
on their second visit — a defect the index cannot catch, because the strings
genuinely differ. Only a shared canonical form can, so the canonicaliser sits
where both apps can reach it and the storefront validates with the same function
the server writes the column with.

**`WebOrderSchema` gains `customerPhone` and `customerAddress`, both nullable.**
ADR 0008 permits touching the frozen contract "when a decision record states what
surface required it and why the existing shape could not answer": the surface is
the web-order inbox. A take-away order arrives with no table, and staff could
previously accept one and then hold nothing but an email address. The inbox shows
the phone as a `tel:` link, and the address only where there is no table — a
dine-in order has a table number, and a home address on it is noise on a card
being read under time pressure.

**An unconfigured mailer now refuses in production.** Every other Resend send in
this codebase skips silently when unconfigured, and while OTP was optional that
was a convenience. It is the only way an account is created now, and a silent
skip means a green "code sent" screen above a box that can never be filled in —
worse than a refusal, because the customer keeps trying. Development machines
keep the skip.

## Consequences

- **`OTP_PEPPER` and `RESEND_API_KEY`/`RESEND_FROM_OTP` are now on the critical
  path**, not optional extras. All three are set in the current `.env.local`;
  M00's provisioning checklist already lists the first.
- **Existing customers are unaffected.** They sign in with the password they
  have. Their `address` is null until they place an order through a flow that
  asks for one, which today is only a new sign-up — a "your details" screen for
  returning customers is the obvious next thing and is not in this decision.
- **A code is spent only once the write is certain to be attempted.** `verifyOtp`
  checks phone ownership across the whole `customers` table _before_ marking the
  code consumed, so a refusal the customer cannot act on does not cost them one
  of three sends an hour.
- `# ponytail: two sign-ups racing on the same new mobile number both clear the
pre-check and one loses to `customers_phone_idx` — an unhandled unique
violation, not a silent duplicate. Same call and the same upgrade path
(`onConflictDoUpdate`against the partial index) as`setOrderCustomerAction`
under ADR 0016, if it is ever actually observed.`
- **SMS was considered and not chosen**, on the owner's call. If it is wanted
  later, `sendOtpEmail` is the only function that knows the channel; the
  generation, hashing, TTL, attempt burn and rate limits are all channel-blind
  and would not move.
- `TextAreaField` gained one passthrough prop, `autoComplete`, so the delivery
  address can offer the one the browser already holds. Not the whole
  `TextareaHTMLAttributes` surface — just the attribute that matters on the one
  field in the product where retyping is most likely to go wrong.
