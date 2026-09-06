import { z } from 'zod';

/**
 * A site origin: scheme and host, no path.
 *
 * The message illustrates the shape with IANA's reserved illustration domain
 * (RFC 2606 §3). `mock-data-grep`'s `placeholder-host` rule hunts stand-in
 * *asset* hosts left in shipped code, which this is not — and substituting a
 * real-looking domain to dodge the rule would be the worse answer, because
 * somebody owns those.
 */
const webUrl = z
  .string()
  .trim()
  .refine((value) => {
    if (value === '') return true;
    return z.string().url().safeParse(value).success && /^https?:\/\/[^/@?#]+\/?$/.test(value);
  }, 'Enter a website origin such as https://example.com, without a path.'); // mock-grep-allow

export const SeoSettingsSchema = z.object({
  siteUrl: webUrl.default(''),
  title: z.string().trim().max(120).default(''),
  description: z.string().trim().max(320).default(''),
  keywords: z.string().trim().max(500).default(''),
  socialImage: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^\/images\/[a-zA-Z0-9/_-]+\.(png|jpe?g|webp|avif)$/.test(value),
      'Use an image path under /images/.',
    )
    .default(''),
  googleVerification: z
    .string()
    .trim()
    .max(200)
    .regex(/^[a-zA-Z0-9_-]*$/, 'Enter only the verification code, not the HTML tag.')
    .default(''),
});
export type SeoSettings = z.infer<typeof SeoSettingsSchema>;
export const SEO_SETTINGS_KEY = 'storefront.seo';
export function parseSeoSettings(value: unknown): SeoSettings {
  const parsed = SeoSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : SeoSettingsSchema.parse({});
}
