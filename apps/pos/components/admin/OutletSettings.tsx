'use client';

import { useActionState, useEffect } from 'react';
import { Building2, Save } from 'lucide-react';
import { Button, TextField, useToast } from '@natech/ui';
import { saveOutletAction, type OutletFormState } from '@/lib/outlet/actions';
import { PageHeading } from './PageHeading';

export interface OutletSettingsValue {
  readonly legalName: string;
  readonly tradingName: string;
  readonly address: string;
  readonly city: string;
  readonly phone: string;
  readonly email: string | null;
  readonly ntn: string;
  readonly strn: string | null;
  readonly timezone: string;
  readonly businessDayCutoff: string;
  readonly latitude: string | null;
  readonly longitude: string | null;
  readonly storeOpen: string | null;
  readonly storeClose: string | null;
  readonly weeklyOffDays: readonly string[] | null;
  readonly googlePlaceId: string | null;
  readonly googleRating: string | null;
  readonly googleReviewCount: number | null;
}

const IDLE: OutletFormState = { error: null, message: null };

export function OutletSettings({
  outlet,
  embedded = false,
}: {
  readonly outlet: OutletSettingsValue | null;
  readonly embedded?: boolean;
}) {
  const { show } = useToast();
  const [state, action, pending] = useActionState(saveOutletAction, IDLE);

  useEffect(() => {
    if (state.error !== null) show('error', state.error);
    else if (state.message !== null) show('success', state.message);
  }, [state, show]);

  return (
    <form action={action}>
      {embedded ? (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Outlet</h2>
            <p className="text-ink-muted mt-1 text-sm">
              Business details, contact information, and opening hours.
            </p>
          </div>
          <Button tone="primary" icon={Save} type="submit" disabled={pending}>
            {pending ? 'Saving…' : outlet === null ? 'Create outlet' : 'Save outlet'}
          </Button>
        </div>
      ) : (
        <PageHeading
          title="Outlet settings"
          note="Business details, contact information, and opening hours."
          actions={
            <Button tone="primary" icon={Save} type="submit" disabled={pending}>
              {pending ? 'Saving…' : outlet === null ? 'Create outlet' : 'Save outlet'}
            </Button>
          }
        />
      )}

      {outlet === null && (
        <div className="border-warn bg-warn-soft text-warn mb-4 rounded-base border px-4 py-3 text-sm">
          No outlet is configured. Complete the required fields to enable order creation.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Business identity">
          <TextField
            label="Legal name"
            name="legalName"
            defaultValue={outlet?.legalName ?? ''}
            required
          />
          <TextField
            label="Trading name"
            name="tradingName"
            defaultValue={outlet?.tradingName ?? ''}
            required
          />
          <TextField
            label="NTN"
            name="ntn"
            defaultValue={outlet?.ntn ?? ''}
            help="Optional. It is only printed when provided."
          />
          <TextField label="STRN" name="strn" defaultValue={outlet?.strn ?? ''} />
        </Section>

        <Section title="Contact details">
          <TextField label="Address" name="address" defaultValue={outlet?.address ?? ''} required />
          <TextField label="City" name="city" defaultValue={outlet?.city ?? ''} required />
          <TextField
            label="Phone"
            name="phone"
            type="tel"
            defaultValue={outlet?.phone ?? ''}
            required
          />
          <TextField label="Email" name="email" type="email" defaultValue={outlet?.email ?? ''} />
        </Section>

        <Section title="Business day and hours">
          <TextField
            label="Timezone"
            name="timezone"
            defaultValue={outlet?.timezone ?? 'Asia/Karachi'}
            help="Used for orders, shifts, and reports. For example: Asia/Karachi."
            required
          />
          <TextField
            label="Business-day cutoff"
            name="businessDayCutoff"
            type="time"
            defaultValue={outlet?.businessDayCutoff.slice(0, 5) ?? '05:00'}
            help="Orders before this time belong to the previous business date."
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Opening time"
              name="storeOpen"
              type="time"
              defaultValue={outlet?.storeOpen?.slice(0, 5) ?? ''}
            />
            <TextField
              label="Closing time"
              name="storeClose"
              type="time"
              defaultValue={outlet?.storeClose?.slice(0, 5) ?? ''}
            />
          </div>
          <TextField
            label="Weekly off days"
            name="weeklyOffDays"
            defaultValue={outlet?.weeklyOffDays?.join(', ') ?? ''}
            help="Full weekday names separated by commas, for example Monday, Tuesday."
          />
        </Section>

        <Section title="Location">
          <TextField
            label="Latitude"
            name="latitude"
            type="number"
            step="any"
            min="-90"
            max="90"
            defaultValue={outlet?.latitude ?? ''}
          />
          <TextField
            label="Longitude"
            name="longitude"
            type="number"
            step="any"
            min="-180"
            max="180"
            defaultValue={outlet?.longitude ?? ''}
          />
        </Section>

        {/* R12 — the storefront's review QR and star rating are built from
            these, so which listing they point at is deployment data and lives
            here rather than in source. Left blank, the storefront renders
            neither, which is the correct behaviour for an outlet with no
            listing: better than a QR that opens somebody else's. */}
        <Section title="Google listing">
          <TextField
            label="Google place ID"
            name="googlePlaceId"
            defaultValue={outlet?.googlePlaceId ?? ''}
            help="From the Maps listing URL. The storefront turns this into a review QR code."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Google rating"
              name="googleRating"
              type="number"
              step="0.1"
              min="0"
              max="5"
              defaultValue={outlet?.googleRating ?? ''}
              help="Copy the score shown on the listing. Not fetched — update it when it moves."
            />
            <TextField
              label="Google review count"
              name="googleReviewCount"
              type="number"
              step="1"
              min="0"
              defaultValue={outlet?.googleReviewCount ?? ''}
            />
          </div>
        </Section>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-surface-raised rounded-base border p-4">
      <h2 className="mb-4 flex items-center gap-2 font-semibold">
        <Building2 aria-hidden="true" className="size-4" />
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
