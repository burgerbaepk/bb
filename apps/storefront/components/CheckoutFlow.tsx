'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CircleCheck,
  LockKeyhole,
  MailCheck,
  Trash2,
} from 'lucide-react';
import { Button, Money, SegmentedControl, TextAreaField, TextField } from '@natech/ui';
import { canonicalPhone } from '@natech/domain';
import { useLocale, useTranslations } from 'next-intl';
import { toStoredCart } from '@/lib/cart/persist';
import { placeOrderAction } from '@/lib/orders/actions';
import { usePick } from './i18n';
import { useCart } from './CartProvider';
import { QuantityStepper } from './QuantityStepper';

/**
 * Cart, sign-in, sign-up, and placement — BUILD-PLAN.md §13.2, §13.3, §13.4;
 * ADR 0022; docs/runfiles/M14-storefront.md.
 *
 * **The cart states a subtotal ex tax and no total** (§13.2). The rate depends
 * on a payment method nobody has chosen yet.
 *
 * **Placing an order does not start preparation** (§13.4). It is never
 * auto-accepted; a human at the POS accepts or rejects it with a reason. The
 * confirmation says so, because a customer who thinks staff have already
 * started will not chase.
 *
 * **Sign-up proves the email before an account exists** (§13.3). Six digits, ten
 * minutes, single use, five attempts before the code burns — all of it already
 * built in M14 and left unwired when password sign-in landed. The name, phone
 * and address ADR 0022 collects travel *with* the code rather than being saved a
 * step earlier, so an email nobody proved cannot leave a half-built customer row
 * behind it.
 *
 * Signing in is deliberately not gated on a code. A returning customer has a
 * password, their email was proven the day they signed up, and a code on every
 * order is a round trip to their inbox between wanting food and getting it.
 */
type Step = 'CART' | 'AUTH' | 'CODE' | 'PLACED';
type AuthMode = 'SIGN_IN' | 'SIGN_UP';

interface ApiResult {
  readonly ok: boolean;
  readonly error?: string;
}

async function postJson(path: string, body: unknown): Promise<ApiResult> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed: unknown = await response.json();
  if (typeof parsed !== 'object' || parsed === null || !('ok' in parsed)) {
    return { ok: false };
  }
  const error = 'error' in parsed && typeof parsed.error === 'string' ? parsed.error : undefined;
  return response.ok && parsed.ok === true ? { ok: true } : { ok: false, ...(error && { error }) };
}

export function CheckoutFlow({
  signedIn = false,
  accountMode,
}: {
  readonly signedIn?: boolean;
  readonly accountMode?: AuthMode;
}) {
  const router = useRouter();
  const t = useTranslations();
  const pick = usePick();
  const locale = useLocale();
  const cart = useCart();
  const [step, setStep] = useState<Step>(accountMode ? 'AUTH' : 'CART');
  const [authMode, setAuthMode] = useState<AuthMode>(accountMode ?? 'SIGN_IN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publicId, setPublicId] = useState<string | null>(null);

  const emailLooksValid = /.+@.+\..+/.test(email);
  const passwordLooksValid = password.length >= 6;
  // The same canonicaliser the server writes the column with, so a number this
  // screen accepts is a number the unique index will accept (ADR 0022).
  const phoneLooksValid = canonicalPhone(phone) !== null;
  const detailsComplete =
    emailLooksValid &&
    passwordLooksValid &&
    phoneLooksValid &&
    name.trim().length >= 2 &&
    address.trim().length >= 8;

  function cartBody() {
    return toStoredCart({
      lines: [...cart.lines],
      tableToken: cart.tableToken,
      tableCode: cart.tableCode,
      note: null,
    });
  }

  /** Shared tail: price and insert the order, then show the tracking id. */
  async function place(): Promise<void> {
    if (accountMode) {
      router.push('/menu');
      router.refresh();
      return;
    }
    const result = await placeOrderAction({ cart: cartBody() });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    cart.clear();
    setPublicId(result.publicId);
    setStep('PLACED');
  }

  async function run(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch {
      setError(t('checkout.errorNetwork'));
    } finally {
      setBusy(false);
    }
  }

  const signInAndPlace = () =>
    run(async () => {
      if (!signedIn) {
        const auth = await postJson('/api/auth/password', {
          email,
          password,
          cart: cartBody(),
          tableToken: cart.tableToken,
        });
        if (!auth.ok) {
          setError(auth.error ?? t('checkout.errorCredentials'));
          return;
        }
      }
      await place();
    });

  const sendCode = () =>
    run(async () => {
      const sent = await postJson('/api/otp/send', { email, locale });
      if (!sent.ok) {
        setError(sent.error ?? t('checkout.errorNetwork'));
        return;
      }
      setCode('');
      setStep('CODE');
    });

  const verifyAndPlace = () =>
    run(async () => {
      const verified = await postJson('/api/otp/verify', {
        email,
        code,
        cart: cartBody(),
        tableToken: cart.tableToken,
        profile: { name, phone, address, password },
      });
      if (!verified.ok) {
        setError(verified.error ?? t('checkout.errorCode'));
        return;
      }
      await place();
    });

  if (step === 'PLACED') {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <CircleCheck aria-hidden="true" className="text-ok mx-auto mb-3 size-10" />
        <h1 className="font-display text-3xl font-bold">{t('checkout.placed')}</h1>
        <p className="text-store-muted mt-2">{t('checkout.placedHelp')}</p>
        <Link
          href={`/order/${publicId ?? ''}`}
          className="bg-store-accent min-h-touch mt-6 inline-flex items-center rounded-full px-6 font-bold text-white shadow-md"
        >
          {t('checkout.viewStatus')}
        </Link>
      </div>
    );
  }

  return (
    // M22 — a labelled landmark rather than a bare div. The storefront now has
    // two surfaces that say "Your order": this flow and `OrderPanel`, the
    // standing summary beside the menu. A screen-reader user moving by landmark
    // could otherwise not tell the summary from the thing that takes payment.
    <section aria-labelledby="checkout-title" className="mx-auto max-w-lg px-4 py-6">
      {step !== 'CART' && (!accountMode || step === 'CODE') && (
        <button
          type="button"
          onClick={() => {
            setStep(step === 'CODE' ? 'AUTH' : 'CART');
            setError(null);
          }}
          className="text-store-muted hover:text-store-ink mb-3 inline-flex min-h-touch items-center gap-1.5 text-sm"
        >
          <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
          {step === 'CODE' ? t('checkout.backToDetails') : t('checkout.backToCart')}
        </button>
      )}

      <h1 id="checkout-title" className="font-display text-3xl font-bold">
        {step === 'CART'
          ? t('cart.title')
          : step === 'CODE'
            ? t('checkout.codeTitle')
            : accountMode
              ? t(authMode === 'SIGN_IN' ? 'checkout.signIn' : 'checkout.signUp')
              : t('checkout.title')}
      </h1>

      {cart.tableCode !== null && step === 'CART' && (
        <p className="text-store-muted mt-1 text-sm">
          {t('cart.table')} {cart.tableCode}
        </p>
      )}

      {error !== null && (
        <p
          role="alert"
          className="border-danger bg-danger-soft text-danger mt-3 flex items-start gap-2 rounded-base border p-3 text-sm"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {step === 'CART' &&
        (cart.lines.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-lg">{t('cart.empty')}</p>
            <p className="text-store-muted mt-1 text-sm">{t('cart.emptyHelp')}</p>
            <Link
              href="/menu"
              className="border-store-line min-h-touch mt-4 inline-flex items-center rounded-full border px-5 text-sm font-semibold"
            >
              {t('nav.menu')}
            </Link>
          </div>
        ) : (
          <>
            <ul className="divide-store-line mt-4 divide-y">
              {cart.lines.map((line) => {
                const lineName = pick(line.name, line.nameUr);
                return (
                  <li key={line.lineId} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{lineName}</span>
                      {line.variantLabel !== null && (
                        <span className="text-store-muted block text-xs">{line.variantLabel}</span>
                      )}
                    </span>

                    <QuantityStepper
                      quantity={Number(line.qty / 1000n)}
                      label={lineName}
                      onIncrement={() => cart.increment(line.lineId)}
                      onDecrement={() => cart.remove(line.lineId)}
                    />

                    <button
                      type="button"
                      aria-label={`${t('cart.remove')}, ${lineName}`}
                      onClick={() => cart.removeLine(line.lineId)}
                      className="text-store-muted hover:text-danger inline-flex size-11 items-center justify-center rounded-full transition-colors"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>

                    <Money
                      className="w-20 text-end"
                      value={
                        ((line.unitPriceExTax * line.qty) / 1000n) as typeof line.unitPriceExTax
                      }
                    />
                  </li>
                );
              })}
            </ul>

            <div className="border-store-line mt-4 flex items-baseline justify-between border-t pt-3">
              <span className="font-medium">{t('cart.subtotal')}</span>
              <Money value={cart.subtotalExTax} symbol="Rs." emphasis="strong" />
            </div>

            <Button
              block
              tone="primary"
              size="lg"
              className="mt-4 rounded-full"
              disabled={busy}
              onClick={() => {
                if (signedIn) void signInAndPlace();
                else setStep('AUTH');
              }}
            >
              {busy ? t('checkout.placing') : t('cart.checkout')}
            </Button>
          </>
        ))}

      {step === 'AUTH' && (
        <div className="mt-6 space-y-4">
          <SegmentedControl
            label={t('checkout.accountAccess')}
            value={authMode}
            onChange={(mode) => {
              setAuthMode(mode);
              setError(null);
            }}
            options={[
              { value: 'SIGN_IN', label: t('checkout.signIn') },
              { value: 'SIGN_UP', label: t('checkout.signUp') },
            ]}
          />

          <p className="text-store-muted text-sm">
            {authMode === 'SIGN_IN' ? t('checkout.signInHelp') : t('checkout.signUpHelp')}
          </p>

          {authMode === 'SIGN_UP' && (
            <>
              <TextField
                label={t('checkout.nameLabel')}
                help={t('checkout.nameHelp')}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <TextField
                label={t('checkout.phoneLabel')}
                help={t('checkout.phoneHelp')}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                tabular
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                {...(phone !== '' && !phoneLooksValid && { error: t('checkout.errorPhone') })}
              />
              <TextAreaField
                label={t('checkout.addressLabel')}
                help={t('checkout.addressHelp')}
                autoComplete="street-address"
                rows={3}
                value={address}
                onChange={setAddress}
              />
            </>
          )}

          <TextField
            label={t('checkout.emailLabel')}
            help={authMode === 'SIGN_UP' ? t('checkout.emailHelp') : undefined}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label={t('checkout.passwordLabel')}
            help={t('checkout.passwordHelp')}
            type="password"
            autoComplete={authMode === 'SIGN_IN' ? 'current-password' : 'new-password'}
            minLength={6}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {authMode === 'SIGN_IN' ? (
            <Button
              block
              tone="primary"
              size="lg"
              icon={LockKeyhole}
              className="rounded-full"
              disabled={!emailLooksValid || !passwordLooksValid || busy}
              onClick={() => void signInAndPlace()}
            >
              {busy
                ? t('checkout.working')
                : t(accountMode ? 'checkout.signIn' : 'checkout.signInAndPlace')}
            </Button>
          ) : (
            <Button
              block
              tone="primary"
              size="lg"
              icon={MailCheck}
              className="rounded-full"
              disabled={!detailsComplete || busy}
              onClick={() => void sendCode()}
            >
              {busy ? t('checkout.sending') : t('checkout.sendCode')}
            </Button>
          )}
        </div>
      )}

      {step === 'CODE' && (
        <div className="mt-6 space-y-4">
          <p className="text-store-muted text-sm">{t('checkout.codeHelp', { email })}</p>

          <TextField
            label={t('checkout.codeLabel')}
            help={t('checkout.codeFieldHelp')}
            inputMode="numeric"
            // The one-time-code hint is what lets a phone offer the digits from
            // the notification instead of making someone switch apps for them.
            autoComplete="one-time-code"
            maxLength={6}
            tabular
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          />

          <Button
            block
            tone="primary"
            size="lg"
            icon={LockKeyhole}
            className="rounded-full"
            disabled={code.length !== 6 || busy}
            onClick={() => void verifyAndPlace()}
          >
            {busy
              ? t('checkout.working')
              : t(accountMode ? 'checkout.verifyAccount' : 'checkout.verifyAndPlace')}
          </Button>

          {/* No countdown. The server owns the sixty-second cooldown and the
              three-an-hour cap, and it says so in words when either bites —
              a second copy of those rules ticking on the client is a second
              place for them to disagree with the ones being enforced. */}
          <Button block tone="ghost" size="sm" disabled={busy} onClick={() => void sendCode()}>
            {t('checkout.resend')}
          </Button>
        </div>
      )}
    </section>
  );
}
