# Secret Scanning

TrueStub uses [gitleaks](https://github.com/gitleaks/gitleaks) to prevent secrets (API keys, tokens, private keys, connection strings, etc.) from being committed to the repository. Scanning happens at two points: in your local environment before a commit lands, and in CI before a PR can be merged.

---

## Why we have secret scanning

Accidentally committing a secret — a Firebase API key, a Trustless Work API key, a Stellar secret key — can lead to account compromise, data loss, or unexpected charges before the key is rotated. Catching secrets as early as possible (ideally before the commit ever leaves your machine) is far cheaper than rotating credentials after the fact.

---

## Installing gitleaks locally

The pre-commit hook is a soft gate: if `gitleaks` is not found it prints a warning and lets the commit through. The CI job is the hard gate. That said, catching issues locally saves time, so install it:

**macOS (Homebrew)**
```bash
brew install gitleaks
```

**Linux (binary from GitHub Releases)**
```bash
# Replace X.Y.Z with the latest version from https://github.com/gitleaks/gitleaks/releases
VERSION=8.27.2
curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_linux_x64.tar.gz" \
  | tar -xz -C /usr/local/bin gitleaks
```

**Windows (Scoop)**
```powershell
scoop install gitleaks
```

Verify the install:
```bash
gitleaks version
```

---

## How the pre-commit hook works

The hook lives at `.husky/pre-commit` and is registered via [husky](https://typicode.github.io/husky/). It runs automatically on every `git commit`.

What it does:
1. Checks whether `gitleaks` is on `PATH`. If not, prints a warning and exits 0 (non-blocking).
2. Runs `gitleaks protect --staged --no-git --config=.gitleaks.toml` — this scans only the files you have staged (`git add`-ed), not the entire repository history.
3. If gitleaks finds a potential secret it exits non-zero, which aborts the commit and prints guidance.
4. If the scan is clean, the commit proceeds normally.

**False positive?** If gitleaks flags something that is not actually a secret (e.g. a test fixture or a documentation example), add an allowlist entry to `.gitleaks.toml` rather than skipping the hook. See the [configuration section](#configuration-gitleakstoml) below.

---

## How the CI job works

The `secret-scan` job is defined in `.github/workflows/frontend-ci.yml`. It runs on every pull request, regardless of which files were changed (unlike the `frontend` job which is path-filtered).

```yaml
secret-scan:
  name: Secret scanning
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0          # full history so gitleaks can diff the PR commits
    - uses: gitleaks/gitleaks-action@v2
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}   # optional
```

`fetch-depth: 0` gives the action full git history so it can compare the PR branch against its base. The action uses `GITHUB_TOKEN` (automatically provided by GitHub Actions) for checkout permissions — no extra secrets are required for public repos.

`GITLEAKS_LICENSE` is optional and only needed for org-level scanning features on private repositories. You can leave it unset.

---

## Configuration (`.gitleaks.toml`)

The root-level `.gitleaks.toml` extends gitleaks' built-in default ruleset and adds an `[allowlist]` section for TrueStub-specific false positives:

- **`.env.example` files** — these contain placeholder values like `<your apiKey>` and `<your-project-id>`, not real secrets.
- **Test fixtures and mocks** — unit tests may embed fake credential strings.
- **Docs and changelogs** — documentation sometimes quotes example key formats.
- **Placeholder regexes** — common patterns like `<your-*>`, `YOUR_*_HERE`, and `REPLACE_ME` are globally ignored.

To add a new allowlist entry, edit `.gitleaks.toml`. Prefer the narrowest possible scope (a specific path regex over a global regex allowlist).

---

## Rotating a leaked secret

If a secret has already been committed (even if later removed from git history), treat it as compromised:

1. Immediately revoke / rotate the credential in the relevant dashboard (Firebase console, Trustless Work dashboard, Stellar account, etc.).
2. Remove the secret from the repository and force-push if necessary (after team coordination).
3. Audit access logs for the compromised credential.
4. Open an internal incident report so the team knows what happened and can prevent recurrence.

Removing a secret from git history does **not** make it safe — anyone who cloned or forked the repo while it was present may have a copy.
