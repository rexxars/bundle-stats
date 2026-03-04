#!/usr/bin/env bash
# PR comment management functions.
# Sourced by run.sh — expects GITHUB_REPOSITORY and PR_NUMBER in the environment.

COMMENT_MARKER='<!-- bundle-stats-comment -->'

# Find the existing bundle-stats comment on the PR.
# Prints the comment ID if found, or empty string.
find_comment() {
  gh api \
    "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" \
    --paginate \
    --jq ".[] | select(.body | startswith(\"${COMMENT_MARKER}\")) | .id" \
  | head -n1
}

# Create or update the PR comment.
# Usage: upsert_comment "markdown body"
upsert_comment() {
  local body="${COMMENT_MARKER}
${1}"
  local comment_id
  comment_id="$(find_comment)"

  # Write body to a temp file to avoid "Argument list too long" errors
  # when the markdown is very large (e.g. packages with many exports).
  local tmpfile
  tmpfile="$(mktemp)"
  printf '%s' "$body" > "$tmpfile"

  if [[ -n "$comment_id" ]]; then
    gh api \
      "repos/${GITHUB_REPOSITORY}/issues/comments/${comment_id}" \
      --method PATCH \
      --field "body=@${tmpfile}" \
      --silent
  else
    gh api \
      "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" \
      --method POST \
      --field "body=@${tmpfile}" \
      --silent
  fi

  rm -f "$tmpfile"
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
