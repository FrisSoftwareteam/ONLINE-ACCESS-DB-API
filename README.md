# Registrar API

A read-only, server-to-server HTTPS API over the share registrar database, built as TypeScript
Vercel Serverless Functions. Deploys directly to Vercel; no server to manage.

## What this is

- The original 7 endpoints as specified: registers, shareholders (search + detail), accounts,
  holdings (units/certificates/transactions), dividends (paid/unpaid, paginated), and health —
  all sourced from `estock`, the comprehensive registrar database.
- 15 additional endpoints covering the rest of `frdb`'s business tables (see "frdb endpoints"
  below) — annual reports, authors, post categories/posts, FAQs, contacts, stockbrokers,
  register-level dividends, register holdings, share offers/subscriptions, e-cert
  holdings/requests, and the shareholders staging import table.
- A handful of `frdb` tables are deliberately **not** exposed — see "Tables intentionally
  excluded" below.
- Every endpoint requires a server-to-server API key (`X-Api-Key` header) and supports
  per-client IP allowlisting.
- All database access is genuinely read-only — the API's database login has `db_datareader`
  only on `frdb`/`estock` (writes are denied at the database permission level, not just in
  application code). The only writes this service ever makes are to its own operational
  database (`RegistrarApiDb`): request logs and `LastUsedOn` timestamps.

## Architecture

```
api/v1/
  registers.ts                        GET /api/v1/registers
  health.ts                           GET /api/v1/health
  shareholders/
    index.ts                          GET /api/v1/shareholders
    [regno]/
      index.ts                        GET /api/v1/shareholders/:regno
      accounts.ts                     GET /api/v1/shareholders/:regno/accounts
      holdings.ts                     GET /api/v1/shareholders/:regno/holdings
      dividends.ts                    GET /api/v1/shareholders/:regno/dividends
lib/
  db.ts            SQL Server connection pools (frdb, estock, RegistrarApiDb)
  auth.ts          API key validation + IP allowlist check
  handler.ts        shared wrapper: auth + error handling + request logging
  registry.ts       regno <-> account/register lookups
  pagination.ts      shared paging helpers
```

Three databases are involved, all on the same SQL Server instance:

- **`estock`** — the actual data source for everything shareholder/holdings/dividend-related.
  This is the comprehensive legacy registrar database (~15M shareholder-account rows across
  164 companies), not `frdb` (which is only the ~164-registrar slice used by the modern web
  portal and doesn't have the depth of data this API needs).
- **`frdb`** — checked by `/health` for completeness, not otherwise used by this API.
- **`RegistrarApiDb`** — this API's own database: API clients, IP allowlist, request log, and
  the `ShareholderRegistry` table (see "What is `regno`" below).

## What is `regno`?

No field called `regno` exists anywhere in the source databases. The closest real-world
concept is CSCS's CHN (Clearing House Number) — Nigeria's industry-wide unique investor code —
but it's only populated on about **46%** of the ~15 million shareholder-account records
(`consolid_id`, another candidate, covers just 2.9%; BVN covers 6%).

So `regno` is a value we assign and store in `RegistrarApiDb.ShareholderRegistry`:

- Where a CHN exists, every account sharing that CHN gets the **same** `regno` (this is the
  "real" cross-company shareholder identity — one person, many accounts, many companies).
- Where no CHN exists, each individual account gets its **own** `regno` (a single-account
  fallback identity). This was a deliberate choice over trying to fuzzy-match people by
  name/address, which risks silently attaching one person's holdings to someone else.

This means `regno` is stable and every shareholder has one, but two `regno`s can occasionally
turn out to be the same real person if their accounts happen to lack a CHN. This is a data
quality ceiling of the source system, not something the API can paper over.

If a business process later improves CHN coverage or provides a better matching key, rerun
the consolidation query that built `ShareholderRegistry` (`sql/02_consolidate_shareholder_registry.sql`)
— it's additive and safe to rerun after clearing `ShareholderRegistryAccounts`/`ShareholderRegistry`,
since `regno` values are reissued deterministically from the same source data.

## Known data characteristics (please read before integrating)

- **`GET /shareholders` requires a filter.** `search` or `register_code` must be provided.
  The underlying table is ~15M rows; an unfiltered scan/count times out and isn't a realistic
  use case for a search endpoint.
- **Dividend `status` supports `paid` and `unpaid` only.** There is no `returned` status
  (e.g. a warrant/cheque returned undelivered) trackable anywhere in the source data. Rather
  than fabricate it, the field is simply not offered — `status` is always `"paid"` or
  `"unpaid"`.
- **Two of `estock`'s dividend views are broken at the database level.**
  `api_claimed_dividend` and `api_unclaimeddividendbyphone` both throw `Invalid object name
  'dbo.api_divclientcompany'` — they reference a table/view that no longer exists inside their
  own definitions. This is a pre-existing bug in the legacy database, not something introduced
  by this API. Dividends are instead sourced entirely from `dbo.paid_unclaimed_dividend`, which
  works reliably and carries a `div_unclaimed` flag that already distinguishes paid (`0`) from
  unpaid (`1`) — so nothing is lost by avoiding the broken views. If those views get fixed on
  the database side, `api/v1/shareholders/[regno]/dividends.ts` is the only file that would
  need revisiting.
- **`certificates` and `transactionHistory` under `/holdings` come from the same underlying
  source** (`Qry_Online_Transaction`) — a certificate is just a transaction row that has a
  certificate number attached, so you'll see overlap between the two arrays by design.

## Database setup (one-time, before first deploy)

Run these against your SQL Server instance, in order:

1. `sql/01_create_schema.sql` — creates `RegistrarApiDb` and its tables (`ApiClients`,
   `ApiIpAllowlist`, `ShareholderRegistry`, `ShareholderRegistryAccounts`, `RequestLog`).
2. `sql/02_consolidate_shareholder_registry.sql` — populates `ShareholderRegistry` from
   `estock` (this took a few minutes against ~15M rows in testing; run it once, not per-deploy).
3. `sql/03_create_service_login.sql` — creates the read-only `registrarapi_svc` SQL login used
   by the API. **Edit the placeholder password in the file before running it.**

## Authentication

Every endpoint requires an `X-Api-Key` header. Keys are stored as SHA-256 hashes in
`RegistrarApiDb.dbo.ApiClients` — the raw key is never stored or logged.

**Create a client:**

```sql
-- Generate a key (e.g. `openssl rand -base64 32`), then hash it and insert:
INSERT INTO RegistrarApiDb.dbo.ApiClients (ClientName, ApiKeyHash, IsActive)
VALUES ('Acme Corp', HASHBYTES('SHA2_256', 'their-raw-api-key-here'), 1);
```

**IP allowlisting (optional per client):**

```sql
INSERT INTO RegistrarApiDb.dbo.ApiIpAllowlist (ApiClientId, IpAddress, Description)
VALUES (1, '203.0.113.10', 'Acme Corp production server');
-- CIDR blocks also work, e.g. '203.0.113.0/24'
```

If a client has **zero** allowlist rows, all IPs are permitted for that client (allowlisting
is opt-in per client, not mandatory) — add at least one row to start enforcing it.

## Endpoint reference

All responses are JSON. Paginated endpoints return
`{ data, page, pageSize, totalCount, totalPages }`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/registers` | No params. Returns all registers (`registerCode`, `companyName`, `active`). |
| GET | `/api/v1/shareholders` | `search`, `register_code`, `email_status` (`has_email`\|`no_email`), `sort` (`names`\|`-names`\|`account_number`\|`-account_number`), `page`, `page_size`. Requires `search` or `register_code`. |
| GET | `/api/v1/shareholders/:regno` | Returns one representative account's detail for that regno. |
| GET | `/api/v1/shareholders/:regno/accounts` | Every account/register linked to the regno. |
| GET | `/api/v1/shareholders/:regno/holdings` | `{ currentHoldings, certificates, transactionHistory }`. |
| GET | `/api/v1/shareholders/:regno/dividends` | `status` (`paid`\|`unpaid`, omit for both), `page`, `page_size`. |
| GET | `/api/v1/health` | `{ status, apiHealthy, frdbAvailable, estockAvailable, checkedAtUtc }`. Returns 503 if `estock` is unreachable. |

Pagination defaults to `page=1`, `page_size=25` (max `200`).

### frdb endpoints

All of these query `frdb` directly (not `estock`), support `page`/`page_size`, and most support
a `search` param (LIKE match across the noted columns). All support `sort` where noted.

| Method | Path | Filters | Search columns |
|---|---|---|---|
| GET | `/api/v1/annual-reports` | — | description |
| GET | `/api/v1/authors` | — | name |
| GET | `/api/v1/post-categories` | `type` | code, description |
| GET | `/api/v1/posts` | `category_id`, `author_id`, `promoted` | title, brief |
| GET | `/api/v1/faqs` | `section_id` | question |
| GET | `/api/v1/faq-sections` | — | description |
| GET | `/api/v1/contacts` | — | name, email |
| GET | `/api/v1/stockbrokers` | — | code, city, state |
| GET | `/api/v1/dividends` | `register_id` | description, paymentNo |
| GET | `/api/v1/register-holdings` | `register_id`, `account_no` | name, email |
| GET | `/api/v1/share-offers` | `register_id` | description |
| GET | `/api/v1/share-subscriptions` | `share_offer_id` | — |
| GET | `/api/v1/ecert-holdings` | `register_id`, `account_no` | certificateNo |
| GET | `/api/v1/ecert-requests` | `stock_broker_id`, `status` | description, code |
| GET | `/api/v1/shareholders-staging` | `register_code`, `account_number` | names, email, mobile, companyName |

**`shareholders-staging`** exposes `frdb.Shareholders_Staging` as-is — the raw ~2.88M-row
backup import loaded earlier (see the earlier `DateAddedToRegister` column: `null` for the
original 97-registrar batch, a real date for rows added later). This is unreconciled staging
data, not the authoritative `Shareholders`/`ShareHoldings` records — it was included at the
customer's explicit request, not because it's been merged into the real shareholder tables.
A clustered index on `account_number` and a nonclustered index on `register_code` were added
to this table to make the endpoint fast (it had none before, since it was only ever built as
a bulk-load landing table).

**Note:** `/api/v1/dividends` is a *different, separate thing* from
`/api/v1/shareholders/:regno/dividends` — the former lists `frdb.Dividends`, which are
register-level dividend **declarations** (one per company per payment round), sourced from
`frdb`. The latter is the per-shareholder **payment status** (paid/unpaid), sourced from
`estock`. Don't confuse the two; they answer different questions.

### Tables intentionally excluded

A handful of `frdb` tables are deliberately not exposed by any endpoint, regardless of what's
asked for them, because they carry real security/privacy risk:

- **`AspNetUsers`** — contains password hashes, security stamps, and 2FA secrets. Never expose
  authentication internals via an API, full stop.
- **`__EFMigrationsHistory`** — internal EF Core plumbing, not meaningful data.
- **`Staging_HoldingsBackup`** — a second, unused one-off import scratch table from the same
  earlier data-loading task. (`Shareholders_Staging` is now exposed via
  `/api/v1/shareholders-staging` at the customer's request — see above — but this one isn't.)
- **`Messages`, `Tickets`** — raw customer support conversations (PII-heavy free text).
- **`Payments`, `Subscriptions`** — individual users' financial transaction records.
- **`ECertHolders`** — contains ID document filenames, photo filenames, and signatures (KYC
  data) tied to a specific individual's identity.
- **`AuditLogs`** — internal system/staff activity trail.
- **`AccessRoles`** — reveals which users hold admin-level access.
- **`LastIds`** — internal ID counters, not meaningful data.

If any of these genuinely need to be exposed for a specific business reason, treat each one as
its own decision — don't add a generic passthrough that could expose all of them at once.

## Deploying to Vercel

1. Push this project to a Git repo, then `vercel link` / import it in the Vercel dashboard.
2. Set these **Environment Variables** in the Vercel project settings (Production and Preview):

   | Variable | Value |
   |---|---|
   | `DB_SERVER` | Your SQL Server's reachable hostname/IP |
   | `DB_PORT` | `1433` (or your configured port) |
   | `DB_USER` | `registrarapi_svc` (or your own read-only login) |
   | `DB_PASSWORD` | that login's password |
   | `FRDB_DATABASE` | `frdb` |
   | `ESTOCK_DATABASE` | `estock` |
   | `APIDB_DATABASE` | `RegistrarApiDb` |
   | `DB_ENCRYPT` | `true` |
   | `DB_TRUST_SERVER_CERTIFICATE` | `true` unless the server has a CA-signed cert |

3. `vercel --prod` to deploy.

**Firewall note:** Vercel functions run from Vercel's own IP ranges, not a fixed IP — the SQL
Server must accept inbound connections from the internet on the configured port (already the
case here; this machine's SQL Server is already internet-reachable, which is how the existing
web portal app connects to it). If you want to restrict *which* callers can reach the SQL
Server itself, that has to happen via SQL Server/firewall configuration, separately from this
API's own client-facing IP allowlist.

**Function duration:** `vercel.json` sets `maxDuration: 60`. Some queries against the legacy
`estock` views can take longer than the default 10s on first execution (SQL Server plan-cache
warmup) — confirm your Vercel plan supports a 60s function duration, or lower this if your
plan caps it, in which case expect occasional slow first-hits on cold dividend queries.

## Local development

```bash
npm install
npm run typecheck
```

The Vercel CLI's `vercel dev` needs an interactive account login/link, which doesn't work in
every environment. For local testing without that, `test-server.js` is a small local-only HTTP
server that routes to the compiled handlers directly:

```bash
npx tsc
node test-server.js
# then, in another terminal:
curl -H "X-Api-Key: <your-test-key>" http://localhost:3000/api/v1/registers
```

Copy `.env.example` to `.env` and fill in real values for local testing — `.env` is
gitignored and must never be committed.

## Security notes

- The database login (`registrarapi_svc`) has been verified to have **no write access** to
  `frdb` or `estock` — confirmed by direct test (an `UPDATE` attempt is denied at the SQL
  Server permission level).
- API keys are hashed (SHA-256) at rest; only the hash is ever stored.
- Connection strings/passwords are never committed — use environment variables (Vercel) or
  `dotnet user-secrets`-equivalent local `.env` files (gitignored) only.
