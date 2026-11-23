# TMAP rolling application budget

`TMAP_ROLLING_24H_CAP` is a server-only opt-in production setting. Default is **8**;
only decimal integer strings 1–500 are accepted, otherwise the default applies.
The authorized paid-use production setting is **500**, not an unlimited allowance.
This application budget is not the provider's remaining balance or a billing cap.

Every outbound TMAP attempt, including failures, reserves one timestamp in shared
Postgres scope `tmap:summary`. The atomic UPDATE rechecks the rolling 24-hour count
under the row lock. Changing the setting does not reset or replace timestamps:
8 existing reservations leave 492 slots at 500. Lowering the limit never refunds
usage. Missing scopes still bootstrap exhausted at the configured limit because
previous usage is unknown. No billing/subscription configuration is modified.

TMAP cache fingerprints include a non-default budget, so a setting upgrade cannot
reuse quota-denied estimates from the old budget. No room/participant deletion or
bulk cache purge is needed. Default and ODsay fingerprints are unchanged. Cache TTL
remains 600 seconds; owner-token fencing and the 180-second lease are unchanged.
A cache miss may calculate up to 2 × participants × 5 routing legs; return legs
reserve independently. Cache hits make no routing requests.

Offline verification (no live provider requests):

```sh
npm test
ALLOW_PROTECTION_DB_TEST=1 node --env-file=.env.local --conditions=react-server --import ./tests/register.mjs scripts/verify-cap-db.mjs
```

The explicit DB test uses only a unique synthetic scope, verifies the 499→500
boundary, four-process contention, preserving old-eight timestamps, lowering and
unknown-usage bootstrap, then removes and reads back only its owned scratch row.
Never seed, reset, or backdate the real production quota row for verification.

Deploy the server environment value through stdin, redeploy production, verify
READY and exact source SHA, and confirm the stored calculation fingerprint matches
500 rather than 8. For live QA use one new two-person room: one transit participant
both directions and one car participant, maximum ten TMAP attempts from one actual
calculation, followed only by cache hits within ten minutes. Read quota and cached
leg flags afterward. Do not describe estimated legs as successful live routes or
mobile-width browser QA as a physical-phone test. Prices and final invoices must
be checked separately; do not infer an exact bill from application reservations.
