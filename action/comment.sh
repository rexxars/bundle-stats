#!/usr/bin/env bash
# PR comment management functions.
# Sourced by run.sh — expects GITHUB_REPOSITORY and PR_NUMBER in the environment.

# Legacy marker for backward compatibility with existing PR comments.
LEGACY_COMMENT_MARKER='<!-- bundle-stats-comment -->'
# Current marker — overridden by run.sh after package resolution to include
# a unique suffix (package names or explicit comment-id input).
COMMENT_MARKER="$LEGACY_COMMENT_MARKER"

# Whether the token has permission to post PR comments.
# Starts true; set to false on first 403 (e.g. fork PRs with read-only tokens).
CAN_COMMENT=true

# Find the existing bundle-stats comment on the PR.
# Prints the comment ID if found, or empty string.
find_comment() {
  gh api \
    "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" \
    --paginate \
    --jq ".[] | select(.body | (startswith(\"${COMMENT_MARKER}\") or startswith(\"${LEGACY_COMMENT_MARKER}\"))) | .id" \
  | head -n1
}

# Create or update the PR comment.
# Usage: upsert_comment "markdown body"
# Prints the comment ID to stdout on success.
# Returns 0 on success, 1 if commenting is disabled (fork PRs).
upsert_comment() {
  if [[ "$CAN_COMMENT" != "true" ]]; then
    return 1
  fi

  local body="${COMMENT_MARKER}
${1}"
  local comment_id
  comment_id="$(find_comment 2>/dev/null)" || true

  # Write body to a temp file to avoid "Argument list too long" errors
  # when the markdown is very large (e.g. packages with many exports).
  local tmpfile
  tmpfile="$(mktemp)"
  printf '%s' "$body" > "$tmpfile"

  local rc=0
  local result_id=""
  if [[ -n "$comment_id" ]]; then
    result_id="$(gh api \
      "repos/${GITHUB_REPOSITORY}/issues/comments/${comment_id}" \
      --method PATCH \
      --field "body=@${tmpfile}" \
      --jq '.id' 2>/dev/null)" || rc=$?
  else
    result_id="$(gh api \
      "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" \
      --method POST \
      --field "body=@${tmpfile}" \
      --jq '.id' 2>/dev/null)" || rc=$?
  fi

  rm -f "$tmpfile"

  if [[ "$rc" -ne 0 ]]; then
    CAN_COMMENT=false
    echo "::warning::Unable to post PR comment (token may lack write permission, e.g. fork PRs). Results will be available as workflow artifacts only."
    return 1
  fi

  echo "$result_id"
}

# Post a "calculating" placeholder comment.
# Usage: post_calculating "pkg1, pkg2"
post_calculating() {
  local pkg_list="$1"
  upsert_comment "$(cat <<EOF
:hourglass_flowing_sand: **Bundle Stats** — Calculating bundle sizes for ${pkg_list}...
EOF
)"
}

# Post an error comment with details.
# Usage: post_error "error output text"
post_error() {
  local error_output="$1"
  upsert_comment "$(cat <<EOF
:x: **Bundle Stats** — An error occurred while calculating bundle sizes.

<details>
<summary>Error details</summary>

\`\`\`
${error_output}
\`\`\`

</details>
EOF
)"
}
