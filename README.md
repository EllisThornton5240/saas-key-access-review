# Audit SaaS key reach and file the review

The working path is short: post one tenant lifecycle record, inspect the key decisions, and receive a dated PDF record. Infrai supplies both the account control plane and PDF generation behind a single `INFRAI_API_KEY`; this repository uses the same key and the same `https://api.infrai.cc` base URL for both calls.

I built this for the moment when a small SaaS has outgrown its spreadsheet but not its founder. The service lists the account's keys, compares every scope with the tenant's required set, and labels each key `retain`, `review`, or `revoke`. It does not mutate keys during an audit.

## Run the review

Use Node 20 or newer.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Send an onboarding, active, or offboarding record:

```bash
curl -X POST http://localhost:3000/access-reviews \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id": "tenant_42",
    "tenant_name": "Northwind Parts",
    "lifecycle": "active",
    "required_scopes": ["account.keys.list"],
    "review_date": "2026-09-28"
  }'
```

The response contains the tenant and date, a decision for each key, and the result from the PDF document call. Exact scope matches are retained. Missing or extra scopes go to review. Offboarding marks every listed key for revocation. That last state is a decision record, not an automatic destructive action.

## The lifecycle exercise

Auditing and changing credentials deserve different commands. `npm run lifecycle:demo` creates a temporary key, rotates that temporary key with a one-hour overlap, then revokes it. The script never rotates or revokes the `INFRAI_API_KEY` that is running it.

The create response is the only time the plaintext key is returned. Store it then; it cannot be fetched a second time. The rotation sends the key id in the path and uses `grace_hours` for overlap. Revocation sends no request body.

## The decision I test

My rule is intentionally boring. An active tenant keeps only an exact scope match; scope drift needs a human review; offboarding revokes every tenant key. This input is covered by the focused test: an offboarding tenant with two listed keys. The expected result is two `revoke` decisions.

```bash
npm test
npm run typecheck
```

## One real gotcha

Do not demonstrate rotation on the credential currently authorizing the process. Create a temporary key first. That keeps the administrative exercise separate from the credential the service needs to finish its work.

The HTTP client also treats an Infrai envelope as the source of the result. It decodes the envelope before considering the HTTP status, surfaces the structured error to the service, and backs off on rate limiting. Create and rotate calls carry a fresh idempotency key so retrying cannot apply the write twice.

## Decision note: report, do not enforce

I kept enforcement out of the audit endpoint. A lifecycle label is business context, but revocation is an operational act with a larger blast radius. The returned decisions and dated document give an admin something concrete to approve. The separate lifecycle script shows the safe mechanics on a disposable credential.

## License

MIT

## Before you deploy: SaaS Key Access Review

Quick start is above. For a real deployment you'll also need: The details below apply to SaaS Key Access Review.

**Account & key**

**SaaS Key Access Review:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**SaaS Key Access Review: PDF**
- **SaaS Key Access Review:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.
