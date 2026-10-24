# 5 PM fallback eligibility and recovery

The existing cron remains **17:00 Asia/Kuala_Lumpur**, targeting tomorrow in Malaysia time regardless of the server timezone. This is missing-DOO recovery, not manual single-DOO retry or appointment confirmation. No stock movements or customer messages are triggered by fallback itself.

## GCA/TBM confirmation needed before enabling

Do not enable using guessed fields. Confirm:

1. Which `stock.picking` date field defines tomorrow's eligible deliveries, and whether it is an Odoo `date` or UTC `datetime`.
2. Which appointment-status field and values mean an **active confirmed appointment**, excluding unconfirmed, cancelled and pending-edit appointments as required by the agreed policy.
3. Whether an additional cancellation, operating-unit or other eligibility condition is required.
4. Which required appointment data must exist before a missing DOO can be imported. Include those requirements in the extra domain where appropriate; the importer also validates its order-line/preparation contract.

Only after approval, configure server environment variables (examples are placeholders, not confirmed GCA names):

```dotenv
ODOO_FALLBACK_POLICY_APPROVED=true
ODOO_FALLBACK_DATE_FIELD=x_confirmed_appointment_date
ODOO_FALLBACK_DATE_TYPE=date
ODOO_FALLBACK_APPOINTMENT_STATUS_FIELD=x_appointment_status
ODOO_FALLBACK_CONFIRMED_VALUES=["confirmed"]
ODOO_FALLBACK_EXTRA_DOMAIN=[]
ODOO_FALLBACK_PAGE_SIZE=200
```

A boolean status field is acceptable only if GCA confirms that `true` means active-confirmed and becomes false when cancelled/unconfirmed. Otherwise use an actual status field or additional approved cancellation conditions. `ODOO_FALLBACK_EXTRA_DOMAIN` is an Odoo JSON domain, not JavaScript. Do not put credentials in it.

Missing/unapproved/invalid mapping blocks fallback with a visible error and an internal run audit; it never silently falls back to `scheduled_date` alone. Outgoing DOOs already `done` or `cancel` are always excluded. Datetime filtering uses the half-open UTC range corresponding to the target MYT day; date fields are compared directly to the target date.

## Processing and retries

- ID-keyset pagination fetches every eligible page, with a run-start maximum ID. Records created above that maximum are considered on a subsequent run.
- Eligibility is checked again after reading the detail and immediately before import. A DOO which becomes ineligible is skipped.
- An existing CE Hub DOO is skipped. The import transaction rechecks existence using create-only mode, preventing concurrent fallback from updating an appointment already imported by push/another run.
- Each DOO has independent lookup/detail/eligibility/import error handling. A failed DOO cannot abort subsequent records.
- RPC requests time out after 15 seconds, rather than waiting indefinitely on one failed remote request.
- A page/discovery failure stops discovery safely but preserves previous successes and reports `discovery_failed`; rerun to recover missing records. It is never presented as a complete successful run.
- Same-process overlapping runs return `busy`. Database uniqueness and create-only transactions protect against other app instances.
- Correct failed data or transient connection problems, then rerun **Sync Now** (or `POST /api/orders/sync-odoo?date=YYYY-MM-DD`). Already-imported DOOs are skipped; manual single-DOO INT-05 retry remains a separate workflow.

## Traceability

Each run returns a unique `run_id`, target date, status, completion flag, counts, imported/skipped/failed DO references, skip reasons and per-record failure stages. Internal `FALLBACK_POLL_COMPLETE` outbox rows retain the approved policy and run outcome. A separate row is recorded for each retry, including empty/blocked/partially failed runs. Audit-write failure is explicitly reported.

The Sync Monitor shows partial failures and preserved successes, not an unconditional green success message. Fallback audit events do not claim an Odoo callback was delivered or trigger D-1 WhatsApp. The separate existing D-1 notification feature is outside this fallback change.

No database migration is required for these changes. End-to-end verification with GCA is still required after the eligibility mapping is agreed. These changes do not complete the separate appointment-confirmation integration gap.
