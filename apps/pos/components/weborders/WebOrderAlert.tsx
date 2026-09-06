'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BellRing, BellOff } from 'lucide-react';
import { Button } from '@natech/ui';
import { alertingOrders, pruneAcknowledged } from '@/lib/webOrders/alerting';
import { loadPendingWebOrdersAction } from '@/lib/webOrders/actions';
import type { PendingWebOrder } from '@/lib/webOrders/queries';
import { useWebOrdersRealtime } from '@/lib/realtime/useWebOrdersRealtime';

/**
 * The web-order alarm — BUILD-PLAN.md §13.4, §16, §19.
 *
 * §13.4's flow reads "Redis publish → POS tray badge and audible chime". The
 * chime had never been built, and the badge beside it was reading the Phase-1
 * mock fixture, so a QR order landed on a live till with no signal of any kind
 * — the defect this component and `readPendingWebOrders` were written together
 * to close.
 *
 * It is mounted in the terminal layout rather than on `/web-orders`, because
 * the person who needs to hear it is by definition not looking at the inbox.
 * A cashier mid-sale on the order screen is the case that matters.
 *
 * **It does not stop on its own.** It rings until a human acts: accept or
 * reject the order (it leaves `pending`, which is what §13.4 wants), or press
 * Silence (acknowledges exactly the orders on screen — a later order rings
 * again). `lib/webOrders/alerting.ts` holds that rule, with the test.
 *
 * **The sound is never the only signal** (§19). A till runs muted, in a noisy
 * kitchen, and is operated by people who may not hear it at all; the bar is
 * `role="alert"` and stays on screen whether or not a single tone ever played.
 * The audio is the part that may fail — browsers refuse to play before a user
 * gesture — and it is deliberately the redundant half.
 */
const POLL_INTERVAL_MS = 3_000;
/** Long enough not to become a drone, short enough that a walk past the till catches it. */
const RING_INTERVAL_MS = 2_500;

/** A two-tone buzzer, generated rather than shipped as an asset. */
const PULSE_HZ = [880, 1174.66, 880];
const PULSE_SECONDS = 0.18;
const PULSE_GAP_SECONDS = 0.22;
const PULSE_PEAK_GAIN = 0.25;

/**
 * One burst of the alarm, synthesised through `AudioContext`.
 *
 * No audio file: an oscillator is a dozen lines, adds nothing to the bundle,
 * needs no cache entry in the service worker for a PWA that has to work
 * offline (§8), and cannot 404 on a till that installed the app before the
 * asset existed.
 *
 * The gain ramps rather than switching, because starting and stopping an
 * oscillator at full amplitude puts a step in the waveform and it is audible
 * as a click on the cheap speaker a till actually has.
 */
function ringOnce(context: AudioContext): void {
  // Scheduling against a suspended clock stacks every pulse on the moment it
  // resumes, which arrives as one flat blare instead of a chime.
  if (context.state !== 'running') return;

  PULSE_HZ.forEach((frequency, index) => {
    const at = context.currentTime + index * PULSE_GAP_SECONDS;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(PULSE_PEAK_GAIN, at + 0.01);
    gain.gain.setValueAtTime(PULSE_PEAK_GAIN, at + PULSE_SECONDS - 0.02);
    gain.gain.linearRampToValueAtTime(0, at + PULSE_SECONDS);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + PULSE_SECONDS + 0.02);
  });
}

export interface WebOrderAlertProps {
  /** Rendered by the server layout, so the bar is on screen in the first paint. */
  readonly initial: readonly PendingWebOrder[];
}

export function WebOrderAlert({ initial }: WebOrderAlertProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState<readonly PendingWebOrder[]>(initial);
  const [acknowledged, setAcknowledged] = useState<readonly string[]>([]);
  const contextRef = useRef<AudioContext | null>(null);

  const refresh = useCallback(async () => {
    const result = await loadPendingWebOrdersAction();
    // A refusal here is the PIN lock or a dropped session, not an empty inbox.
    // Leaving the last known list up is the safe read: it keeps ringing about
    // an order that is probably still waiting rather than falling silent on an
    // auth blip.
    if (!result.ok) return;
    setPending(result.orders);
    setAcknowledged((current) => pruneAcknowledged(result.orders, current));
  }, []);

  // §16 — the live signal and the three-second backstop are the same code
  // path, because the stream is the half that can silently stop.
  useWebOrdersRealtime(() => void refresh());
  useEffect(() => {
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const alerting = alertingOrders(pending, acknowledged);
  const ringing = alerting.length > 0;

  // A browser will not play audio before the page has been interacted with,
  // and a till that has just been unlocked has been. Resuming on any gesture
  // arms the alarm for the rest of the session without asking the operator to
  // opt into anything.
  useEffect(() => {
    if (typeof AudioContext === 'undefined') return undefined;
    const arm = () => void contextRef.current?.resume();
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);
    return () => {
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, []);

  useEffect(() => {
    if (!ringing) return undefined;
    // jsdom and a server render have no `AudioContext`; the bar below is the
    // signal that does not depend on one.
    if (typeof AudioContext === 'undefined') return undefined;

    const context = (contextRef.current ??= new AudioContext());
    const beat = () => {
      void context.resume();
      ringOnce(context);
    };
    beat();
    const timer = setInterval(beat, RING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [ringing]);

  // Accepting or rejecting happens on the inbox, and that page refreshes
  // itself; this only needs to notice the result. Navigating there from the
  // bar refreshes so the operator does not land on a stale list.
  const onInbox = pathname === '/web-orders';

  if (pending.length === 0) return null;

  const oldest = alerting[0] ?? pending[0];
  const waiting = pending.length;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 print:hidden"
    >
      <div
        className={[
          'mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-base border p-3 shadow-lg',
          ringing
            ? 'border-warn bg-warn-soft motion-safe:animate-pulse'
            : 'border-border bg-surface-raised',
        ].join(' ')}
      >
        <span
          className={
            ringing
              ? 'text-warn flex shrink-0 items-center'
              : 'text-ink-muted flex shrink-0 items-center'
          }
        >
          {ringing ? (
            <BellRing aria-hidden="true" className="size-5" />
          ) : (
            <BellOff aria-hidden="true" className="size-5" />
          )}
        </span>

        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">
            {waiting} web {waiting === 1 ? 'order' : 'orders'} waiting
          </span>
          {oldest !== undefined && (
            <span className="text-ink-muted">
              {' '}
              · #{oldest.orderNo}
              {oldest.tableCode !== null && ` · Table ${oldest.tableCode}`}
            </span>
          )}
          {!ringing && <span className="text-ink-subtle"> · silenced</span>}
        </p>

        {ringing && (
          <Button
            icon={BellOff}
            onClick={() => setAcknowledged(pending.map((order) => order.orderId))}
          >
            Silence
          </Button>
        )}
        {!onInbox && (
          <Link href="/web-orders" onClick={() => router.refresh()}>
            <Button tone="primary">Open inbox</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
