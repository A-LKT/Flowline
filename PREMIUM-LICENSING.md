# Premium Licensing

> How Flowline's premium tier is licensed and technically enforced. Companion to
> [`LICENSE-PREMIUM`](LICENSE-PREMIUM) (the commercial terms).

Flowline is **open-core**. The core is free software under **AGPL-3.0**. A handful
of directories are the paid **premium tier**, under a separate commercial license and
gated at runtime by a signed license key:

| Premium feature | Directory |
|---|---|
| LLM Assistant | `backend/src/plugins/assistant/` |
| Housekeeping | `backend/src/plugins/housekeeping/` |
| Artifact History | `backend/src/plugins/artifact-history/` |
| Multi-tenant (future) | *design-only today — see `MULTIUSER-DESIGN.md`* |

Premium source ships in the repository for transparency and single-build packaging,
but **using or enabling it requires a valid commercial license and key**.

## Threat model (read this first)

The key gate is **tamper-evident, not tamper-proof.** It stops:

- **Casual enabling** — there is no `EDITION=premium` env switch anymore; premium
  requires a token signed by the vendor's private key, which is not in this repo.
- **Copy-to-many** — a license is bound to a per-install *instance id*, so one key
  file dropped onto a second install fails verification there.
- **Indefinite use** — every license carries a hard **expiry**.

It does **not** try to beat a determined actor who forks the source, patches
`backend/src/edition.ts` to force `isPremium`, and rebuilds. That path is a violation
of the commercial license on the premium directories — handled legally, exactly as
n8n and GitLab-EE operate. The goal is to make unlicensed premium use require
deliberate infringement, not an env var.

## How enforcement works (offline, shipped today)

A **license token** is `base64url(payloadJSON) + "." + base64url(ed25519Signature)`:

```json
{
  "v": 1,
  "licenseId": "lic_…",
  "customer": "Acme Corp",
  "features": ["assistant", "housekeeping", "artifactHistory", "multiTenant"],
  "instanceId": "inst_…" ,   // or null for an unbound dev/eval license
  "issuedAt": 1734000000,
  "expiresAt": 1765536000
}
```

At boot, [`backend/src/edition.ts`](backend/src/edition.ts):

1. Reads the token from `FLOWLINE_LICENSE_KEY` (env) or `./data/license.key` (file).
2. Verifies the Ed25519 signature against the bundled public key
   ([`backend/src/license/publicKey.ts`](backend/src/license/publicKey.ts)) —
   **signature is checked before any payload field is trusted**.
3. Rejects an expired token (`expiresAt <= now`).
4. Rejects a bound token whose `instanceId` ≠ this install's id
   ([`backend/src/license/instanceId.ts`](backend/src/license/instanceId.ts),
   persisted at `./data/instance-id`).

Any failure → the app logs one line (`[license] premium disabled: <reason>`) and runs
as the **free** edition. It never throws; free is always the safe default. On success,
only the token's listed `features` unlock — so tiers/partial grants are possible.

Premium plugins load off `isPremium` in
[`backend/src/plugins/index.ts`](backend/src/plugins/index.ts); the frontend mirrors
the state via `GET /api/edition` and gates premium UI accordingly.

### Issuing a license (vendor side)

The signing **private key is never committed** (gitignored; generated once, kept
secret). Vendor tooling:

```bash
# one-time: generate the signing keypair; paste the printed public key into
# backend/src/license/publicKey.ts, keep ./data/license-signing.private.pem secret
npm run license:keygen

# issue a license bound to a customer's install id (they read it from
# ./data/instance-id or the GET /api/edition response)
npm run license:issue -- --customer "Acme Corp" --instance inst_xxxx \
  --features assistant,housekeeping,artifactHistory,multiTenant --days 365

# an unbound dev/eval license (any install, still expires)
npm run license:issue -- --customer "Eval" --instance any --days 14
```

The customer sets the printed token as `FLOWLINE_LICENSE_KEY` or writes it to
`./data/license.key`, then restarts.

### Invalidation, today

Offline enforcement is time-boxed: a license stops working at `expiresAt`. Issue
short terms (e.g. 1 year) and re-issue on renewal. For faster kill without the server
below, ship shorter terms.

## Online activation & revocation (spec — build when hosting exists)

To fully satisfy "one key can't power every instance" (global seat counting) and
"revoke instantly," add a hosted activation server. The client verification above is
the seam it plugs into — no rewrite required.

- **Activate**: `POST /activate { licenseKey, instanceId, fingerprint }` → the server
  validates the key, enforces **seat count** (distinct `instanceId`s per key ≤ the
  purchased seats; the N-th over the limit is refused), records the activation, and
  returns a **freshly signed, short-TTL entitlement token** (e.g. 24h–7d) bound to
  that `instanceId`. This is the same token format the client already verifies.
- **Refresh loop**: when `LICENSE_SERVER_URL` is configured, the client re-activates
  before the token's `exp` and caches the returned token. If the server is
  unreachable, the cached token keeps premium alive until `exp` (grace period), then
  falls back to free — no crash, no data loss.
- **Revocation**: mark the `licenseId` revoked server-side → the next refresh returns
  `403` → the token is not renewed → premium lapses at the current token's `exp`. The
  blast radius equals the TTL; shorten it for a tighter kill-switch. Optionally publish
  a static **revocation list (CRL)** URL the client polls, to cut long-lived offline
  tokens faster.
- **Seat counting** lives only on the server; the offline instance-binding is the
  client-side approximation of it.

### Config surface (when built)

| Var | Meaning |
|---|---|
| `FLOWLINE_LICENSE_KEY` / `./data/license.key` | the license token (offline) or the durable key exchanged at activation |
| `LICENSE_SERVER_URL` | activation/refresh endpoint; unset ⇒ pure offline mode |

## Key rotation

Run `npm run license:keygen`, replace the public key in
`backend/src/license/publicKey.ts`, rebuild, and re-issue outstanding licenses signed
with the new private key. Old tokens stop verifying against the new public key.
