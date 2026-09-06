/**
 * The canonical form of a Pakistani mobile number — ADR 0022, ADR 0016, §5.11.
 *
 * `customers_phone_idx` is a unique index, and two apps write through it: the
 * till's walk-in capture (ADR 0016) and the storefront's sign-up. Until this
 * existed neither normalised, so the same number typed with dashes at the
 * counter and without them on a phone was two different strings, two rows, and
 * one customer who is a stranger on their second visit. The index cannot catch that
 * — the strings genuinely differ. Only a shared canonical form can.
 *
 * Lives in `domain` because it is the canonical form of a domain value, the
 * same way `Paisa` is, and because the alternative is one copy per app, which
 * is the defect it exists to prevent.
 *
 * Accepts what people actually type — spaces, dashes, brackets, a `+92`, a
 * `0092`, or a bare leading `3` — and emits exactly `03XXXXXXXXX`, eleven
 * digits, or `null` when the input is not a Pakistani mobile number at all.
 * Landlines are deliberately not accepted: the number is captured so somebody
 * can be reached about a take-away order, and it is the mobile that reaches
 * them.
 */
export function canonicalPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');

  // `0092…` is `+92…` dialled the long way round.
  if (digits.startsWith('0092')) digits = digits.slice(2);
  // `92 3XX …` — the country code without a trunk zero.
  if (digits.startsWith('92') && digits.length === 12) digits = `0${digits.slice(2)}`;
  // `3XX …` — typed without either, which is what a form with a `+92` prefix
  // printed beside it invites.
  if (digits.startsWith('3') && digits.length === 10) digits = `0${digits}`;

  return /^03\d{9}$/.test(digits) ? digits : null;
}

/**
 * `03XX XXXXXXX` — the canonical form, spaced the way it is written down.
 * Storage stays canonical; only the reading of it is grouped.
 */
export function formatPhone(canonical: string): string {
  return /^03\d{9}$/.test(canonical) ? `${canonical.slice(0, 4)} ${canonical.slice(4)}` : canonical;
}
