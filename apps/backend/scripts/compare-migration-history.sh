#!/usr/bin/env bash
# =============================================================================
# compare-migration-history.sh — cross-environment pgmigrations audit (#543)
#
# Pulls the `pgmigrations` table (node-pg-migrate's record of applied
# migrations) from every environment you pass, and compares each one against
# the migration files in this repository and against each other — both which
# migrations ran and the order they ran in.
#
# Usage (one NAME=DATABASE_URL pair per environment):
#
#   apps/backend/scripts/compare-migration-history.sh \
#     staging="$STAGING_DATABASE_URL" \
#     preview-123="$PREVIEW_DATABASE_URL" \
#     production="$PRODUCTION_DATABASE_URL"
#
# Requires only `psql`. Read-only: it runs a single SELECT per environment.
# Raw per-environment dumps are kept in $OUT_DIR (default: a temp dir) so the
# result can be attached to docs/DATABASE.md ("Cross-environment migration
# history audit").
#
# Exit status: 0 when every environment matches the repository, 1 when any
# discrepancy is found, 2 on usage / connection errors.
# =============================================================================
set -euo pipefail

if [[ $# -eq 0 ]]; then
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

command -v psql >/dev/null || { echo "psql is required" >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/../src/db/migrations"
OUT_DIR="${OUT_DIR:-$(mktemp -d)}"
mkdir -p "$OUT_DIR"

# Expected history: node-pg-migrate records the filename without extension and
# applies files in lexical order (so the two 007_* files run add_… then create_…).
EXPECTED="$OUT_DIR/expected.txt"
find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' -printf '%f\n' \
  | sed 's/\.sql$//' | LC_ALL=C sort > "$EXPECTED"

status=0
envs=()

for pair in "$@"; do
  name="${pair%%=*}"
  url="${pair#*=}"
  if [[ -z "$name" || -z "$url" || "$name" == "$pair" ]]; then
    echo "Invalid argument '$pair' — expected NAME=DATABASE_URL" >&2
    exit 2
  fi
  envs+=("$name")

  # name|run_on, in the order the migrations were actually applied.
  if ! psql "$url" --no-psqlrc --tuples-only --no-align --field-separator='|' -v ON_ERROR_STOP=1 \
      -c "SELECT name, to_char(run_on AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') FROM pgmigrations ORDER BY run_on, id" \
      > "$OUT_DIR/$name.raw" 2> "$OUT_DIR/$name.err"; then
    echo "[$name] could not read pgmigrations: $(cat "$OUT_DIR/$name.err")" >&2
    exit 2
  fi
  cut -d'|' -f1 "$OUT_DIR/$name.raw" > "$OUT_DIR/$name.applied"
done

echo "Repository migrations: $(wc -l < "$EXPECTED")   (dumps in $OUT_DIR)"
echo

for name in "${envs[@]}"; do
  applied="$OUT_DIR/$name.applied"
  echo "=== $name — $(wc -l < "$applied") applied, last: $(tail -n1 "$applied" || true)"

  missing=$(LC_ALL=C comm -23 "$EXPECTED" <(LC_ALL=C sort "$applied"))
  unknown=$(LC_ALL=C comm -13 "$EXPECTED" <(LC_ALL=C sort "$applied"))
  dupes=$(LC_ALL=C sort "$applied" | uniq -d)

  if [[ -n "$missing" ]]; then
    status=1; echo "  NOT APPLIED (in repo, not in pgmigrations):"; sed 's/^/    /' <<< "$missing"
  fi
  if [[ -n "$unknown" ]]; then
    status=1; echo "  UNKNOWN (in pgmigrations, no file in repo — renamed/removed migration):"; sed 's/^/    /' <<< "$unknown"
  fi
  if [[ -n "$dupes" ]]; then
    status=1; echo "  RECORDED MORE THAN ONCE:"; sed 's/^/    /' <<< "$dupes"
  fi

  # Order check: the applied sequence, restricted to known migrations, must
  # follow repository (lexical) order.
  known_applied=$(grep -Fxf "$EXPECTED" "$applied" || true)
  if [[ "$known_applied" != "$(LC_ALL=C sort <<< "$known_applied")" ]]; then
    status=1
    echo "  OUT OF ORDER — applied sequence differs from repository order:"
    diff <(LC_ALL=C sort <<< "$known_applied") <(echo "$known_applied") | sed 's/^/    /' || true
  fi

  if [[ -z "$missing$unknown$dupes" ]] && [[ "$known_applied" == "$(LC_ALL=C sort <<< "$known_applied")" ]]; then
    echo "  OK — matches repository history"
  fi
  echo
done

# Pairwise: environments that disagree with each other (even if both lag the repo).
if [[ ${#envs[@]} -gt 1 ]]; then
  first="${envs[0]}"
  for name in "${envs[@]:1}"; do
    if ! cmp -s "$OUT_DIR/$first.applied" "$OUT_DIR/$name.applied"; then
      status=1
      echo "=== $first vs $name — histories differ:"
      diff "$OUT_DIR/$first.applied" "$OUT_DIR/$name.applied" | sed 's/^/    /' || true
      echo
    fi
  done
fi

if [[ $status -eq 0 ]]; then
  echo "VERDICT: CONSISTENT — all ${#envs[@]} environment(s) match the repository migration history."
else
  echo "VERDICT: DISCREPANCIES FOUND — see above. Resolve with migrate:up (missing) or by reconciling pgmigrations rows (unknown/duplicate), then re-run."
fi
exit $status
