#!/usr/bin/env bash
set -euo pipefail

# Resolve script directory and action root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source helper scripts
# shellcheck source=action/comment.sh
source "${SCRIPT_DIR}/comment.sh"
# shellcheck source=action/workspace.sh
source "${SCRIPT_DIR}/workspace.sh"
# shellcheck source=action/build.sh
source "${SCRIPT_DIR}/build.sh"

# Install action's own runtime dependencies (rollup, plugins, prettier).
# Rollup requires platform-specific native bindings so we can't bundle them.
# We install to an isolated temp directory to avoid interfering with the user's
# node_modules, lockfiles, or package manager setup.
# Prefer pnpm when available — npm has a long-standing bug (npm/cli#4828) that
# silently skips optional native binaries like @rollup/rollup-linux-x64-gnu.
if ! node -e "import('rollup')" 2>/dev/null; then
  BUNDLE_STATS_DEPS="$(mktemp -d)"
  node --input-type=module -e "
    import {readFileSync, writeFileSync} from 'node:fs';
    const pkg = JSON.parse(readFileSync('${ACTION_ROOT}/package.json', 'utf-8'));
    writeFileSync('${BUNDLE_STATS_DEPS}/package.json', JSON.stringify({private: true, dependencies: pkg.dependencies}));
  "
  if command -v pnpm &>/dev/null; then
    (cd "$BUNDLE_STATS_DEPS" && pnpm install 2>&1) || {
      echo "::error::Failed to install bundle-stats dependencies"
      exit 1
    }
  else
    (cd "$BUNDLE_STATS_DEPS" && npm install --no-audit --no-fund 2>&1) || {
      echo "::error::Failed to install bundle-stats dependencies"
      exit 1
    }
  fi
  export NODE_PATH="${BUNDLE_STATS_DEPS}/node_modules${NODE_PATH:+:$NODE_PATH}"
fi

BUNDLE_STATS="node ${ACTION_ROOT}/bin/bundle-stats.ts"

# --- Error trap (set up early so all failures are caught) ---

ERROR_FILE="$(mktemp)"
cleanup() {
  rm -f "$ERROR_FILE"
  rm -rf "${WORK_DIR:-}"
  rm -rf "${BUNDLE_STATS_DEPS:-}"
}
trap cleanup EXIT

on_error() {
  local error_output
  error_output="$(cat "$ERROR_FILE" 2>/dev/null || echo 'Unknown error')"

  # Always print to Actions log
  echo "::error::${error_output}"

  # Post to PR if we have enough context (PR_NUMBER may not be resolved yet)
  if [[ -n "${PR_NUMBER:-}" ]] && [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    post_error "$error_output" || true
  fi

  cleanup
  exit 1
}
trap on_error ERR

# --- 1. Resolve inputs ---

# PR number from event JSON
PR_NUMBER="${PR_NUMBER:-}"
if [[ -z "$PR_NUMBER" ]] && [[ -n "${GITHUB_EVENT_PATH:-}" ]]; then
  PR_NUMBER="$(node --input-type=module -e "
    import {readFileSync} from 'node:fs';
    const event = JSON.parse(readFileSync('${GITHUB_EVENT_PATH}', 'utf-8'));
    process.stdout.write(String(event.pull_request?.number || event.number || ''));
  ")"
fi

# Base ref
BASE_REF="${INPUT_BASE_REF:-}"
if [[ -z "$BASE_REF" ]] && [[ -n "${GITHUB_EVENT_PATH:-}" ]]; then
  BASE_REF="$(node --input-type=module -e "
    import {readFileSync} from 'node:fs';
    const event = JSON.parse(readFileSync('${GITHUB_EVENT_PATH}', 'utf-8'));
    process.stdout.write(event.pull_request?.base?.sha || '');
  ")"
fi

# Head ref
HEAD_REF="${INPUT_HEAD_REF:-${GITHUB_SHA:-}}"

# Base branch name (for --ref-label)
BASE_BRANCH=""
if [[ -n "${GITHUB_EVENT_PATH:-}" ]]; then
  BASE_BRANCH="$(node --input-type=module -e "
    import {readFileSync} from 'node:fs';
    const event = JSON.parse(readFileSync('${GITHUB_EVENT_PATH}', 'utf-8'));
    process.stdout.write(event.pull_request?.base?.ref || '');
  ")"
fi

if [[ -z "$PR_NUMBER" ]]; then
  echo "Could not determine PR number. Is this running on a pull_request event?" >>"$ERROR_FILE"
  false # trigger ERR trap
fi

if [[ -z "$BASE_REF" ]]; then
  echo "Could not determine base ref. Set base-ref input or run on a pull_request event." >>"$ERROR_FILE"
  false # trigger ERR trap
fi

if [[ -z "$HEAD_REF" ]]; then
  echo "Could not determine head ref." >>"$ERROR_FILE"
  false # trigger ERR trap
fi

echo "PR #${PR_NUMBER}: comparing ${BASE_REF:0:8}..${HEAD_REF:0:8}"

# --- 2. Resolve packages ---

PACKAGE_PATHS="$(resolve_packages "${INPUT_PACKAGES:-.}")"

# Build display list of package names
PKG_DISPLAY=""
while IFS= read -r pkg_path; do
  [[ -z "$pkg_path" ]] && continue
  local_name="$(node --input-type=module -e "
    import {readFileSync} from 'node:fs';
    const pkg = JSON.parse(readFileSync('${pkg_path}/package.json', 'utf-8'));
    process.stdout.write(pkg.name || '${pkg_path}');
  ")"
  if [[ -n "$PKG_DISPLAY" ]]; then
    PKG_DISPLAY="${PKG_DISPLAY}, ${local_name}"
  else
    PKG_DISPLAY="${local_name}"
  fi
done <<< "$PACKAGE_PATHS"

echo "Packages: ${PKG_DISPLAY}"

# --- 3. Post calculating comment ---

post_calculating "$PKG_DISPLAY" || true

# --- 4. Build CLI flags ---

CLI_FLAGS=()
if [[ "${INPUT_NO_BENCHMARK:-false}" == "true" ]]; then
  CLI_FLAGS+=(--no-benchmark)
fi
if [[ "${INPUT_NO_BUNDLE:-false}" == "true" ]]; then
  CLI_FLAGS+=(--no-bundle)
fi

# Handle comma-separated ignore patterns
if [[ -n "${INPUT_IGNORE:-}" ]]; then
  IFS=',' read -ra IGNORE_PATTERNS <<< "$INPUT_IGNORE"
  for pattern in "${IGNORE_PATTERNS[@]}"; do
    pattern="$(echo "$pattern" | xargs)"
    if [[ -n "$pattern" ]]; then
      CLI_FLAGS+=(--ignore "$pattern")
    fi
  done
fi

# Handle comma-separated only patterns
if [[ -n "${INPUT_ONLY:-}" ]]; then
  IFS=',' read -ra ONLY_PATTERNS <<< "$INPUT_ONLY"
  for pattern in "${ONLY_PATTERNS[@]}"; do
    pattern="$(echo "$pattern" | xargs)"
    if [[ -n "$pattern" ]]; then
      CLI_FLAGS+=(--only "$pattern")
    fi
  done
fi

# Handle space-separated export conditions
if [[ -n "${INPUT_CONDITIONS:-}" ]]; then
  for cond in $INPUT_CONDITIONS; do
    CLI_FLAGS+=(--conditions "$cond")
  done
fi

# --- Helper: convert package path to a safe slug for filenames ---

path_to_slug() {
  echo "$1" | tr '@/' '__'
}

# --- 5. Measure baseline ---

WORK_DIR="$(mktemp -d)"

echo "Fetching baseline ref: ${BASE_REF}"
git fetch --depth=1 origin "$BASE_REF" 2>>"$ERROR_FILE"
echo "Checking out baseline: ${BASE_REF}"
git checkout "$BASE_REF" 2>/dev/null

echo "Building baseline..." >>"$ERROR_FILE"
run_builds "$PACKAGE_PATHS" 2>>"$ERROR_FILE"

while IFS= read -r pkg_path; do
  [[ -z "$pkg_path" ]] && continue
  slug="$(path_to_slug "$pkg_path")"
  echo "Measuring baseline for ${pkg_path}..."
  echo "Measuring baseline for ${pkg_path}" >>"$ERROR_FILE"
  $BUNDLE_STATS --package "$pkg_path" --format json --ref-label "${BASE_BRANCH:-baseline} (${BASE_REF:0:8})" --outdir "${WORK_DIR}/treemaps" "${CLI_FLAGS[@]}" > "${WORK_DIR}/baseline-${slug}.json" 2>>"$ERROR_FILE"
done <<< "$PACKAGE_PATHS"

echo "Fetching head ref: ${HEAD_REF}"
git fetch --depth=1 origin "$HEAD_REF" 2>>"$ERROR_FILE"
echo "Checking out head: ${HEAD_REF}"
git checkout "$HEAD_REF" 2>/dev/null

# --- 6. Measure current ---

echo "Building head..." >>"$ERROR_FILE"
run_builds "$PACKAGE_PATHS" 2>>"$ERROR_FILE"

while IFS= read -r pkg_path; do
  [[ -z "$pkg_path" ]] && continue
  slug="$(path_to_slug "$pkg_path")"
  echo "Measuring current for ${pkg_path}..."
  echo "Measuring current for ${pkg_path}" >>"$ERROR_FILE"
  TREEMAP_DIR="${GITHUB_WORKSPACE:-.}/.bundle-stats/${slug}"
  $BUNDLE_STATS --package "$pkg_path" --format json --outdir "$TREEMAP_DIR" "${CLI_FLAGS[@]}" > "${WORK_DIR}/current-${slug}.json" 2>>"$ERROR_FILE"
done <<< "$PACKAGE_PATHS"

# List generated treemap files for diagnostics
echo "Treemap files:"
find "${GITHUB_WORKSPACE:-.}/.bundle-stats" -name '*.html' 2>/dev/null || echo "  (none)"

# Compute run URL for artifact links (used in step 7 and 7b)
RUN_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"

# --- 7. Generate comparison markdown ---

MARKDOWN=""

while IFS= read -r pkg_path; do
  [[ -z "$pkg_path" ]] && continue
  slug="$(path_to_slug "$pkg_path")"
  echo "Generating comparison for ${pkg_path}..."
  COMPARE_NPM_FLAG=()
  if [[ -n "${INPUT_COMPARE_NPM:-}" ]]; then
    COMPARE_NPM_FLAG=(--compare-npm "${INPUT_COMPARE_NPM}")
  fi

  pkg_md="$(cat "${WORK_DIR}/baseline-${slug}.json" | $BUNDLE_STATS --package "$pkg_path" --format markdown --compare - --outdir "${WORK_DIR}/treemaps" "${COMPARE_NPM_FLAG[@]}" "${CLI_FLAGS[@]}" 2>>"$ERROR_FILE")"

  # Inject treemap viewer links for this package
  TREEMAP_DIR="${GITHUB_WORKSPACE:-.}/.bundle-stats/${slug}"
  if [[ -d "$TREEMAP_DIR" ]]; then
    embed_err="$(mktemp)"
    if encoded_md="$(printf '%s' "$pkg_md" | node "${ACTION_ROOT}/action/embed-treemaps.ts" \
      --treemap-dir "$TREEMAP_DIR" \
      --report "${WORK_DIR}/current-${slug}.json" \
      --run-url "$RUN_URL" 2>"$embed_err")"; then
      pkg_md="$encoded_md"
    else
      embed_detail="$(cat "$embed_err" 2>/dev/null)"
      echo "::warning::Failed to embed treemap links for ${pkg_path}: ${embed_detail:-unknown error}"
      echo "$embed_detail" >>"$ERROR_FILE"
    fi
    rm -f "$embed_err"
  fi

  if [[ -n "$MARKDOWN" ]]; then
    MARKDOWN="${MARKDOWN}

${pkg_md}"
  else
    MARKDOWN="${pkg_md}"
  fi
done <<< "$PACKAGE_PATHS"

# --- 7b. Link treemap artifacts in markdown (fallback for any un-replaced placeholders) ---

# Remove any leftover treemap placeholder that embed-treemaps didn't replace
MARKDOWN="${MARKDOWN//$'<!-- treemap-links -->\n\n'/}"
# Link remaining artifact notes inside <details> to the CI run
MARKDOWN="${MARKDOWN//Treemap artifacts are attached to the CI run/[Treemap artifacts are attached to the CI run](${RUN_URL})}"

# --- 8. Check thresholds ---

THRESHOLD_ARGS=""

if [[ -n "${INPUT_MAX_IMPORT_TIME:-}" ]]; then
  THRESHOLD_ARGS="${THRESHOLD_ARGS} --max-import-time ${INPUT_MAX_IMPORT_TIME}"
fi
if [[ -n "${INPUT_MAX_BUNDLE_SIZE_GZIP:-}" ]]; then
  THRESHOLD_ARGS="${THRESHOLD_ARGS} --max-bundle-size-gzip ${INPUT_MAX_BUNDLE_SIZE_GZIP}"
fi
if [[ -n "${INPUT_MAX_BUNDLE_SIZE_RAW:-}" ]]; then
  THRESHOLD_ARGS="${THRESHOLD_ARGS} --max-bundle-size-raw ${INPUT_MAX_BUNDLE_SIZE_RAW}"
fi
if [[ -n "${INPUT_MAX_INTERNAL_SIZE_GZIP:-}" ]]; then
  THRESHOLD_ARGS="${THRESHOLD_ARGS} --max-internal-size-gzip ${INPUT_MAX_INTERNAL_SIZE_GZIP}"
fi
if [[ -n "${INPUT_MAX_INTERNAL_SIZE_RAW:-}" ]]; then
  THRESHOLD_ARGS="${THRESHOLD_ARGS} --max-internal-size-raw ${INPUT_MAX_INTERNAL_SIZE_RAW}"
fi

# Build --report args for each package
REPORT_ARGS=""
while IFS= read -r pkg_path; do
  [[ -z "$pkg_path" ]] && continue
  slug="$(path_to_slug "$pkg_path")"
  pkg_name="$(node --input-type=module -e "
    import {readFileSync} from 'node:fs';
    const pkg = JSON.parse(readFileSync('${pkg_path}/package.json', 'utf-8'));
    process.stdout.write(pkg.name || '${pkg_path}');
  ")"
  REPORT_ARGS="${REPORT_ARGS} --report ${pkg_name}:${WORK_DIR}/current-${slug}.json"
done <<< "$PACKAGE_PATHS"

VIOLATIONS_MD=""
THRESHOLD_EXIT=0

if [[ -n "$THRESHOLD_ARGS" ]]; then
  VIOLATIONS_MD="$(node "${ACTION_ROOT}/action/check-thresholds.ts" ${REPORT_ARGS} ${THRESHOLD_ARGS} 2>>"$ERROR_FILE")" || THRESHOLD_EXIT=$?

  # Exit code 2 means invalid args — treat as error
  if [[ "$THRESHOLD_EXIT" -eq 2 ]]; then
    post_error "$(cat "$ERROR_FILE" 2>/dev/null || echo 'Threshold check failed with invalid arguments')" || true
    exit 1
  fi
fi

# --- 9. Update comment ---

FINAL_BODY="$MARKDOWN"
if [[ -n "$VIOLATIONS_MD" ]]; then
  FINAL_BODY="${FINAL_BODY}

${VIOLATIONS_MD}"
fi

# Reset error trap before final comment — we handle failure ourselves now
trap cleanup EXIT
trap - ERR

upsert_comment "$FINAL_BODY" || true

if [[ "$THRESHOLD_EXIT" -eq 1 ]]; then
  echo "Threshold violations detected — failing the check."
  exit 1
fi

echo "Bundle stats complete."
