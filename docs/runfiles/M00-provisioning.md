# M00 · provisioning checklist

**Companion to:** [M00-foundation.md](./M00-foundation.md)
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §4, §7.9, §18 (M00)
**Owner:** Najam (vendor)

Every item here needs an account, a credential, or a payment method. None was executed during the M00 build
session — all configuration is committed and ready, but **no live account calls were made**. Work top to
bottom; step 4 closes gate G7.

---

## 1. Neon — Postgres

Two connection strings are required and they are not interchangeable (R2).

1. Create a project, region `aws-ap-southeast-1` (Singapore — lowest latency to Pakistan of Neon's regions).
2. Copy the **pooled** connection string → `NEON_DATABASE_URL`. All writes. WebSocket `Pool` driver.
3. Copy the **unpooled/direct** string → `NEON_DATABASE_URL_HTTP`. RSC reads only. HTTP driver.
4. Create a `dev` branch off `main` for local work.

> The HTTP driver silently no-ops a multi-statement transaction. Putting the HTTP URL in
> `NEON_DATABASE_URL` produces a system that appears to work and loses writes. Verify the two are different
> before running M02.

## 2. Cloudflare R2 — object storage

1. Create a bucket. Set `R2_BUCKET`.
2. Create an API token scoped to that bucket → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`.
3. Attach a public custom domain → `R2_PUBLIC_BASE_URL`.
4. The image-resizing Worker (§13.5) is M08 — not needed now.

## 3. Resend — email

Two sending identities, deliberately separate (§13.3): a marketing complaint against the transactional
domain must not be able to delay a login code.

1. Verify the primary domain → `RESEND_FROM_TRANSACTIONAL`.
2. Verify a **dedicated subdomain** for OTP → `RESEND_FROM_OTP`.
3. Configure SPF, DKIM, and DMARC on both.
4. API key → `RESEND_API_KEY`.

## 4. Fiscal relay host — closes gate G7

PRAL spec §5 requires a whitelisted fixed public IP. Vercel functions egress from a rotating pool and cannot
be whitelisted. This service exists solely to own a stable egress address (§7.9).

**Fly.io** (config committed at `services/fiscal-relay/fly.toml`):

```bash
cd services/fiscal-relay
fly launch --no-deploy --copy-config
fly ips allocate-v4                 # dedicated IPv4 — NOT the shared one
fly secrets set FBR_TOKEN=... PRA_TOKEN=... RELAY_SHARED_SECRET=...
fly secrets set FBR_MODE=SANDBOX PRA_MODE=SANDBOX ALLOWED_ORIGINS=https://<pos-domain>
fly deploy
fly ips list                        # record the v4 address
curl https://<app>.fly.dev/health   # expect {"ok":true,...}
```

`fly ips allocate-v4` is billed and is **not** the default — a shared IPv4 will not satisfy whitelisting.

**Hetzner CX11 alternative:** provision the instance, install Docker, `docker build -t fiscal-relay .`,
run behind Caddy for TLS. The Dockerfile is portable; only the TLS terminator differs.

Then record the address and run step 5.

## 5. FBR IP whitelisting

Send `docs/preflight/fbr-ip-whitelist.md` to **helpline@fbr.gov.pk** with NTN, hosting company, the public
IPv4 from step 4, and country. Blocks M11. Start it the moment step 4 completes — turnaround is not immediate.

## 6. Upstash Redis

1. Create a database in the region closest to the Vercel deployment.
2. REST URL and token → `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

Used for SSE fan-out (§16), outbox leases (§7.8), and receipt-bitmap caching (§15.3).

## 7. Error tracking — out of scope

Sentry was removed from scope during M00. See
[ADR 0006](../decisions/0006-no-sentry.md).

Two consequences carry forward and are **not** resolved:

- §7.7 requires every PERMANENT fiscal failure to reach a human within one retry
  cycle. M11 must route it to the compliance dashboard (§7.10) and the nightly
  reconciliation email, both of which §7.10 already requires.
- §7.10 specifies a Sentry issue on reconciliation drift. That needs another
  destination, decided in M11.

The two Sentry variables are still listed in .env.example, which
reproduces §4 verbatim. Leave them until §4 is amended; nothing reads them.

## 8. Vercel

Three projects, one per app. The repo root is the monorepo root in each; set the root directory per project.

```bash
vercel login
vercel link --cwd apps/pos          # repeat for storefront, kds
vercel env add NEON_DATABASE_URL production
# ... every variable in .env.example
```

`vercel.json` is committed per app. `pos` and `kds` carry `X-Robots-Tag: noindex` (§3); `storefront` must not.

## 9. Secrets to generate locally

```bash
openssl rand -base64 32     # AUTH_SECRET
openssl rand -hex 32        # ENCRYPTION_KEY   (AES-256, 32 bytes)
openssl rand -base64 32     # OTP_PEPPER
openssl rand -base64 32     # FISCAL_RELAY_SECRET / RELAY_SHARED_SECRET (same value both sides)
```

`FISCAL_RELAY_SECRET` (app) and `RELAY_SHARED_SECRET` (relay) must hold the **same** value.

> **This step was skipped, and M07 found it.** All three were present in
> `.env.local` with empty values. Auth.js logs `MissingSecret` and then returns
> `null` from `auth()`, which is indistinguishable from "nobody is signed in" —
> so the POS accepted a correct password and returned the cashier to the
> sign-in screen, with the only evidence in a server log. `currentBinding()` in
> `apps/pos/lib/auth/session.ts` now refuses to run without a 32-character
> `AUTH_SECRET`, so the same omission fails loudly on the next deployment.
>
> `@natech/auth` derives every key it needs through HKDF, so the encoding of
> these values does not matter. The length does: nothing under 32 characters is
> accepted.

---

## Verification

- [ ] `NEON_DATABASE_URL` and `NEON_DATABASE_URL_HTTP` are different strings
- [ ] `AUTH_SECRET`, `ENCRYPTION_KEY`, and `OTP_PEPPER` are each at least 32 characters — an empty one is what §9 above records
- [ ] `curl https://<relay>/health` returns 200 from the public address
- [ ] `fly ips list` shows a **dedicated** v4
- [ ] That exact IPv4 was sent to FBR, and the reply is filed in `docs/decisions/`
- [ ] No authority token appears anywhere outside the relay's secret store (§7.9)
- [ ] `.env` is untracked; `.env.example` holds no real values
