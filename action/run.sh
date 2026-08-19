#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=action/comment.sh
source "${SCRIPT_DIR}/comment.sh"
# shellcheck source=action/workspace.sh
source "${SCRIPT_DIR}/workspace.sh"
# shellcheck source=action/build.sh
source "${SCRIPT_DIR}/build.sh"

WORK_DIR="$(mktemp -d)"
ERROR_FILE="$(mktemp)"
BUNDLE_STATS_DEPS="$(mktemp -d)"
RUNTIME_ROOT="$(mktemp -d)"

# A local action can live inside the repository that this script checks out.
# Keep an immutable runtime copy so base-ref checkouts cannot replace the v2 CLI.
mkdir -p "${RUNTIME_ROOT}/action"
cp -R "${ACTION_ROOT}/src" "${RUNTIME_ROOT}/src"
cp -R "${ACTION_ROOT}/bin" "${RUNTIME_ROOT}/bin"
cp "${ACTION_ROOT}/action/embed-treemaps.ts" "${RUNTIME_ROOT}/action/embed-treemaps.ts"

cleanup() {
  rm -f "$ERROR_FILE"
  rm -rf "$WORK_DIR"
  rm -rf "$RUNTIME_ROOT"
  rm -rf "$BUNDLE_STATS_DEPS"
}
trap cleanup EXIT

on_error() {
  local error_output
  error_output="$(cat "$ERROR_FILE" 2>/dev/null || echo 'Unknown error')"
  echo "::error::${error_output}"
  if [[ -n "${PR_NUMBER:-}" ]] && [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    post_error "$error_output" || true
  fi
  exit 1
}
trap on_error ERR

# Install the action runtime separately from the target repository.
node --input-type=module -e "
  import {readFileSync, writeFileSync} from 'node:fs';
  const pkg = JSON.parse(readFileSync('${ACTION_ROOT}/package.json', 'utf8'));
  writeFileSync(
    '${BUNDLE_STATS_DEPS}/package.json',
    JSON.stringify({private: true, type: 'module', dependencies: pkg.dependencies}),
  );
"
if command -v pnpm &>/dev/null; then
  (cd "$BUNDLE_STATS_DEPS" && pnpm install 2>&1) || {
    echo "Failed to install bundle-stats dependencies" >>"$ERROR_FILE"
    false
  }
else
  (cd "$BUNDLE_STATS_DEPS" && npm install --no-audit --no-fund 2>&1) || {
    echo "Failed to install bundle-stats dependencies" >>"$ERROR_FILE"
    false
  }
fi
ln -s "${BUNDLE_STATS_DEPS}/node_modules" "${RUNTIME_ROOT}/node_modules"

BUNDLE_STATS=(node "${RUNTIME_ROOT}/bin/bundle-stats.ts")

PR_NUMBER="${PR_NUMBER:-}"
if [[ -z "$PR_NUMBER" ]] && [[ -n "${GITHUB_EVENT_PATH:-}" ]]; then
  PR_NUMBER="$(node --input-type=module -e "
    import {readFileSync} from 'node:fs';
    const event = JSON.parse(readFileSync('${GITHUB_EVENT_PATH}', 'utf8'));
    process.stdout.write(String(event.pull_request?.number || event.number || ''));
  ")"
fi

BASE_REF="${INPUT_BASE_REF:-}"
if [[ -z "$BASE_REF" ]] && [[ -n "${GITHUB_EVENT_PATH:-}" ]]; then
  BASE_REF="$(node --input-type=module -e "
    import {readFileSync} from 'node:fs';
    const event = JSON.parse(readFileSync('${GITHUB_EVENT_PATH}', 'utf8'));
    process.stdout.write(event.pull_request?.base?.sha || '');
  ")"
fi
HEAD_REF="${INPUT_HEAD_REF:-${GITHUB_SHA:-}}"

if [[ -z "$PR_NUMBER" ]]; then
  echo "Could not determine the pull request number" >>"$ERROR_FILE"
  false
fi
if [[ -z "$BASE_REF" ]]; then
  echo "Could not determine the base ref" >>"$ERROR_FILE"
  false
fi
if [[ -z "$HEAD_REF" ]]; then
  echo "Could not determine the head ref" >>"$ERROR_FILE"
  false
fi

CONFIG_ARGS=(--config "${INPUT_CONFIG:-bundle-stats.config.ts}")
"${BUNDLE_STATS[@]}" resolve-config "${CONFIG_ARGS[@]}" --output "${WORK_DIR}/config.json" 2>>"$ERROR_FILE"

PACKAGE_PATHS="$(node --input-type=module -e "
  import {readFileSync} from 'node:fs';
  const config = JSON.parse(readFileSync('${WORK_DIR}/config.json', 'utf8'));
  for (const pkg of config.packages) console.log(pkg.root);
")"
PKG_DISPLAY="$(node --input-type=module -e "
  import {readFileSync} from 'node:fs';
  const config = JSON.parse(readFileSync('${WORK_DIR}/config.json', 'utf8'));
  const names = config.packages.map((pkg) => {
    const value = JSON.parse(readFileSync(pkg.root + '/package.json', 'utf8'));
    return value.name || pkg.root;
  });
  process.stdout.write(names.join(', '));
")"

COMMENT_MARKER="<!-- bundle-stats:${INPUT_COMMENT_ID:-default} -->"
post_calculating "$PKG_DISPLAY" || true

echo "PR #${PR_NUMBER}: comparing ${BASE_REF:0:8}..${HEAD_REF:0:8}"
git fetch --depth=1 origin "$BASE_REF" 2>>"$ERROR_FILE"
git fetch --depth=1 origin "$HEAD_REF" 2>>"$ERROR_FILE"

DEPS_CHANGED=0
LOCKFILE_NAME="$(lockfile_name)"
if [[ -n "$LOCKFILE_NAME" ]]; then
  BASE_LOCKFILE_SHA="$(git rev-parse "${BASE_REF}:${LOCKFILE_NAME}" 2>/dev/null || echo missing-base)"
  HEAD_LOCKFILE_SHA="$(git rev-parse "${HEAD_REF}:${LOCKFILE_NAME}" 2>/dev/null || echo missing-head)"
  if [[ "$BASE_LOCKFILE_SHA" != "$HEAD_LOCKFILE_SHA" ]]; then
    DEPS_CHANGED=1
  fi
fi

git checkout "$BASE_REF" 2>>"$ERROR_FILE"
if [[ "$DEPS_CHANGED" -eq 1 ]]; then install_deps 2>>"$ERROR_FILE"; fi
run_builds "$PACKAGE_PATHS" 2>>"$ERROR_FILE"
"${BUNDLE_STATS[@]}" measure \
  --resolved-config "${WORK_DIR}/config.json" \
  --ref-label "baseline (${BASE_REF:0:8})" \
  --outdir "${WORK_DIR}/baseline-treemaps" \
  --output "${WORK_DIR}/baseline.json" 2>>"$ERROR_FILE"

git checkout "$HEAD_REF" 2>>"$ERROR_FILE"
if [[ "$DEPS_CHANGED" -eq 1 ]]; then install_deps 2>>"$ERROR_FILE"; fi
run_builds "$PACKAGE_PATHS" 2>>"$ERROR_FILE"
"${BUNDLE_STATS[@]}" measure \
  --resolved-config "${WORK_DIR}/config.json" \
  --ref-label "current (${HEAD_REF:0:8})" \
  --outdir "${GITHUB_WORKSPACE:-.}/.bundle-stats" \
  --output "${WORK_DIR}/current.json" 2>>"$ERROR_FILE"

"${BUNDLE_STATS[@]}" compare \
  --baseline "${WORK_DIR}/baseline.json" \
  --current "${WORK_DIR}/current.json" \
  --format markdown \
  --ci \
  --output "${WORK_DIR}/comment.md" 2>>"$ERROR_FILE"

FINAL_BODY="$(cat "${WORK_DIR}/comment.md")"
trap cleanup EXIT
trap - ERR
COMMENT_ID="$(upsert_comment "$FINAL_BODY")" || true

if [[ -n "$COMMENT_ID" ]]; then
  RUN_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
  embed_err="$(mktemp)"
  if enriched="$(printf '%s' "$FINAL_BODY" | node "${RUNTIME_ROOT}/action/embed-treemaps.ts" \
    --report "${WORK_DIR}/current.json" \
    --run-url "$RUN_URL" \
    --comment-id "$COMMENT_ID" \
    --repo "${GITHUB_REPOSITORY}" \
    --visibility "${REPO_VISIBILITY:-public}" 2>"$embed_err")"; then
    upsert_comment "$enriched" >/dev/null || true
  else
    echo "::warning::Failed to embed treemap links: $(cat "$embed_err")"
  fi
  rm -f "$embed_err"
fi

MEASUREMENT_ERRORS="$(node --input-type=module -e "
  import {readFileSync} from 'node:fs';
  const report = JSON.parse(readFileSync('${WORK_DIR}/current.json', 'utf8'));
  const count = report.packages.flatMap((pkg) => pkg.scenarios)
    .filter((scenario) => scenario.diagnostics.some((item) => item.severity === 'error')).length;
  process.stdout.write(String(count));
")"
if [[ "$MEASUREMENT_ERRORS" -gt 0 ]]; then
  echo "Bundle stats completed with ${MEASUREMENT_ERRORS} measurement errors."
  exit 1
fi

echo "Bundle stats complete."
