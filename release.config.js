// Wires the semantic-release plugins already installed in
// apps/frontend/package.json (@semantic-release/changelog, /git, /github;
// commit-analyzer and release-notes-generator ship bundled with the
// semantic-release core package) into a conventional-commits -> CHANGELOG.md
// -> git tag -> GitHub release pipeline.
//
// Runs from the repo root (see .github/workflows/release.yml) since that's
// where CHANGELOG.md, git tags, and GitHub releases apply — not scoped to
// apps/frontend even though that's where the plugin packages are declared.
// Depends on commitlint (commitlint.config.js, root) actually being
// enforced on merged commits: semantic-release's commit-analyzer can only
// compute a version bump from commit messages that follow the convention
// documented in docs/GIT_GUIDELINE.md.
//
// See docs/GIT_GUIDELINE.md and commitlint.config.js for the enforced
// commit type list. The default conventionalcommits release rules only
// recognize "feat" (minor) and "fix"/"perf" (patch); the extra `releaseRules`
// below maps this repo's non-standard "change" type (small changes/tweaks,
// per docs/GIT_GUIDELINE.md) to a patch release too, so it isn't silently
// excluded from ever triggering a release.

/** @type {import('semantic-release').GlobalConfig} */
module.exports = {
  branches: ["main"],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules: [{ type: "change", release: "patch" }],
      },
    ],
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/changelog",
      {
        changelogFile: "CHANGELOG.md",
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md", "package.json"],
        message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    "@semantic-release/github",
  ],
};
