# Branch protection verification

Branch protection on `main` is a GitHub repository setting, not something
stored in this repo. Changes to it leave no trace in git history, so it can
drift without review. This document records the expected configuration and
how it is re-verified on a schedule.

## Expected settings for `main`

- Require a pull request before merging.
- Require status checks to pass before merging, including the contracts
  checks in `.github/workflows/contracts-ci.yml`.
- Require branches to be up to date before merging (`strict`).
- Block force pushes and branch deletion.

## Automated re-verification

`.github/workflows/branch-protection-check.yml` runs weekly (and on demand).
It calls the GitHub API for `main` and fails the run if:

- branch protection is missing or unreadable, or
- pull requests are not required before merging, or
- no required status checks are configured, or
- force pushes are allowed.

The workflow needs a repository secret named `BRANCH_PROTECTION_TOKEN`: a
token with repository administration read access. Without it the check
cannot read the settings and fails, so it never reports a false pass.

## Manual re-verification

Every quarter, or after any change to repository admins:

1. Open Settings → Branches → Branch protection rules for `main`.
2. Compare against the expected settings above.
3. Record the date and the reviewer in the team's ops log.

If the automated check fails, treat it as a drift alert and restore the
expected settings before merging anything else.
