'use client';

import { useActionState } from 'react';
import { Button, TextField } from '@natech/ui';
import type { SeoSettings as Values } from '@natech/branding';
import { saveSeoAction } from '@/lib/seo/actions';

/**
 * IANA's reserved illustration domain (RFC 2606 §3), showing the expected
 * shape of a site origin. Not a stand-in asset host, and deliberately not a
 * real-looking domain — somebody owns those.
 */
const SITE_URL_EXAMPLE = 'https://example.com'; // mock-grep-allow

export function SeoSettings({ values }: { readonly values: Values }) {
  const [state, action, pending] = useActionState(saveSeoAction, { error: null, message: null });
  return (
    <form
      action={action}
      className="border-border bg-surface-raised max-w-3xl space-y-5 rounded-base border p-5"
    >
      <div>
        <h2 className="text-xl font-semibold">Storefront SEO</h2>
        <p className="text-ink-muted mt-2 text-sm">
          Leave title, description, keywords, or share image blank to use your outlet details,
          branding, and live menu. Edit the storefront logo under Branding and product descriptions
          under Menu.
        </p>
      </div>
      <TextField
        label="Public website URL"
        name="siteUrl"
        defaultValue={values.siteUrl}
        placeholder={SITE_URL_EXAMPLE}
        help="Used for your storefront links and the Order Online QR code on invoices. Leave blank to hide the invoice QR code; storefront links will use the deployment URL."
      />
      <TextField
        label="Homepage title"
        name="title"
        defaultValue={values.title}
        maxLength={120}
        help="Automatic: restaurant name, city, and online ordering."
      />
      <TextField
        label="Meta description"
        name="description"
        defaultValue={values.description}
        maxLength={320}
        help="Automatic: restaurant details and menu categories. Aim for a concise, useful summary."
      />
      <TextField
        label="Keywords"
        name="keywords"
        defaultValue={values.keywords}
        maxLength={500}
        help="Optional comma-separated terms describing your restaurant and menu."
      />
      <TextField
        label="Social share image"
        name="socialImage"
        defaultValue={values.socialImage}
        placeholder="/images/burger-bae-hero.jpg"
        help="An existing image under /images/. Used for Open Graph and Twitter cards."
      />
      <TextField
        label="Google site verification code"
        name="googleVerification"
        defaultValue={values.googleVerification}
        help="Optional code from Google Search Console, without the HTML tag."
      />
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-ok text-sm">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save SEO settings'}
      </Button>
    </form>
  );
}
