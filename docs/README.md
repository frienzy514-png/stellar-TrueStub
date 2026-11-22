# docs/

Every document in this folder has one of three statuses:

- **Living**: describes how things are now. Keep it in sync when you change
  the code it describes.
- **Snapshot**: a dated, point-in-time audit or report. Never edited to look
  current. Re-run the audit and replace the file (or add a new dated one)
  instead.
- **Historical**: records a decision or change as it was at the time. Kept
  for context, not as a description of the current code.

Snapshots and historical docs carry a banner at the top that says so.

_Last audited: 2026-10-18 (issue #376)._

| Document | Status | Notes from the 2026-10-18 audit |
| --- | --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Living | Rewritten. It still described `apps/backend` as an unwired scaffold. |
| [CHANGELOG_TAXONOMY.md](CHANGELOG_TAXONOMY.md) | Living | Matches `changelog-taxonomy.ts`. No change. |
| [COMPLIANCE_NOTES.md](COMPLIANCE_NOTES.md) | Living | Updated. The backend now holds the dispute-resolver key and moves disputed funds, which changes the custody question. |
| [CONTRIBUTORS_GUIDELINE.md](CONTRIBUTORS_GUIDELINE.md) | Living | Fixed the hooks description (no pre-push hook) and npm → yarn. |
| [DATABASE.md](DATABASE.md) | Living | Added the `007` tables, rollback notes, and cross-environment migration-state check. Fixed `pgmigrations` and a broken `CHANGELOG_ARCHIVAL.md` link. |
| [DEPENDENCY_VERSION_DIFFERENCES.md](DEPENDENCY_VERSION_DIFFERENCES.md) | Living | Versions were stale. The `yarn audit:versions` script it described doesn't exist, so a manual check replaces it. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Living | Backend is no longer "scaffold". Added which frontend features need it. |
| [GIT_GUIDELINE.md](GIT_GUIDELINE.md) | Living | Added `change`/`remove` commit types to match `commitlint.config.js`. |
| [GRAPHQL_WIRING_STATUS.md](GRAPHQL_WIRING_STATUS.md) | Living | Re-derived from a fresh grep. Most listed paths had moved or been wired. |
| [MAINNET_CHECKLIST.md](MAINNET_CHECKLIST.md) | Living | Not re-verified item by item in this pass. |
| [PIPELINE.md](PIPELINE.md) | Living | Rewritten from `.github/workflows/`. The old version described workflows that don't exist. |
| [RUNBOOKS.md](RUNBOOKS.md) | Living | Rewritten against the refund code (issue #375). |
| [SECRET_SCANNING.md](SECRET_SCANNING.md) | Living | Accurate. Added a note distinguishing the separate bundle-secret check. |
| [dispute-resolver-key-rotation.md](dispute-resolver-key-rotation.md) | Living | Not re-verified step by step in this pass. |
| [STATUS_MAP_DOC_CHECK.md](STATUS_MAP_DOC_CHECK.md) | Living | Added 2026-11-20 (#602). Spec for the CI check comparing the README STATUS_MAP table with code. Records current drift. |
| [PERSISTENCE_CUTOVER_VERIFICATION.md](PERSISTENCE_CUTOVER_VERIFICATION.md) | Living (runbook) | Added 2026-11-20 (#600). Zero-data-loss procedure for the in-memory → Postgres cutover. |
| [PERSISTENCE_MIGRATION_CI_COVERAGE.md](PERSISTENCE_MIGRATION_CI_COVERAGE.md) | Living (checklist) | Added 2026-11-20 (#599). Confirms new persistence migrations are really exercised by migration CI. |
| [ANALYTICS_ACCESS_MODEL.md](ANALYTICS_ACCESS_MODEL.md) | Living | Added 2026-11-21 (#630). Records that `/api/analytics` is intentionally platform-wide and admin-only. |
| [BACKEND_README_TEST_COVERAGE.md](BACKEND_README_TEST_COVERAGE.md) | Snapshot (2026-11-20) | Added (#601). Every backend README claim mapped to its test, with gaps. |
| [ACCESSIBILITY_AUDIT.md](ACCESSIBILITY_AUDIT.md) | Snapshot (2026-08-25) | Banner added. Recommendations still open. |
| [DUPLICATE_BASENAMES.md](DUPLICATE_BASENAMES.md) | Snapshot (generated) | Banner added. The script and CI check are the living source. |
| [ROLE_ACCESS_CONTROL_AUDIT.md](ROLE_ACCESS_CONTROL_AUDIT.md) | Snapshot (2026-08-27) | Banner added. Findings still hold. |
| [TICKET_VERIFICATION_DESIGN.md](TICKET_VERIFICATION_DESIGN.md) | Historical (proposal) | Marked as a proposal, not shipped behavior. |
| [TURBOREPO_EVALUATION.md](TURBOREPO_EVALUATION.md) | Historical | Banner added. The backend has grown enough that its adoption trigger may now be met. |
| [PIVOT_NOTES.md](PIVOT_NOTES.md) | Historical | Banner added. Several follow-ups have since been done. |

When you add a doc here, add a row and pick a status. If it's a one-time
audit, date it in the title or a banner.
