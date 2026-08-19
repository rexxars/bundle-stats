#!/usr/bin/env bash
# Workspace resolution functions.
# Sourced by run.sh.

# Detect which package manager is in use.
# Prints "pnpm", "yarn", or "npm".
detect_pm() {
  if [[ -f "pnpm-lock.yaml" ]]; then
    echo "pnpm"
  elif [[ -f "yarn.lock" ]]; then
    echo "yarn"
  else
    echo "npm"
  fi
}

# List all workspace directories.
# Prints newline-separated absolute paths.
list_workspace_dirs() {
  local pm
  pm="$(detect_pm)"

  if [[ "$pm" == "pnpm" ]]; then
    pnpm list --recursive --depth=-1 --json | node --input-type=module -e "
      import {readFileSync} from 'node:fs';
      const data = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
      for (const pkg of data) {
        if (pkg.path) console.log(pkg.path);
      }
    "
  else
    # npm/yarn: read workspaces from package.json, expand globs
    node --input-type=module -e "
      import {readFileSync, globSync} from 'node:fs';
      import {resolve, dirname} from 'node:path';

      const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
      const patterns = pkg.workspaces || [];
      // workspaces can be an array or {packages: [...]}
      const globs = Array.isArray(patterns) ? patterns : (patterns.packages || []);

      for (const pattern of globs) {
        // Append /package.json to the pattern to find actual packages
        const matches = globSync(pattern + '/package.json');
        for (const match of matches) {
          console.log(resolve(dirname(match)));
        }
      }
    "
  fi
}

# Resolve a single package name or path to its directory.
# If input looks like a path (contains / or is .), return as-is.
# Otherwise search workspace dirs for a matching package.json name.
resolve_package() {
  local input="$1"

  # Path-like input: return as-is
  if [[ "$input" == "." ]] || [[ "$input" == *"/"* ]]; then
    echo "$input"
    return 0
  fi

  # Search workspaces for matching package name
  local found=""
  while IFS= read -r dir; do
    local pkg_name
    pkg_name="$(node --input-type=module -e "
      import {readFileSync} from 'node:fs';
      const pkg = JSON.parse(readFileSync('${dir}/package.json', 'utf-8'));
      process.stdout.write(pkg.name || '');
    ")"
    if [[ "$pkg_name" == "$input" ]]; then
      found="$dir"
      break
    fi
  done < <(list_workspace_dirs)

  if [[ -z "$found" ]]; then
    echo "Error: Could not resolve package '${input}' in workspaces." >&2
    return 1
  fi

  echo "$found"
}

# Name of the lockfile for the detected package manager, relative to cwd.
# Prints an empty string if npm is in use without a committed lockfile.
lockfile_name() {
  local pm
  pm="$(detect_pm)"

  case "$pm" in
    pnpm) echo "pnpm-lock.yaml" ;;
    yarn) echo "yarn.lock" ;;
    npm)
      if [[ -f "package-lock.json" ]]; then
        echo "package-lock.json"
      fi
      ;;
  esac
}

# Install dependencies for whatever ref is currently checked out.
# Checkout only changes tracked files, so node_modules is left over from
# whichever ref was installed last. Call this after a checkout whenever
# node_modules needs to be brought back in sync with that ref's lockfile.
install_deps() {
  local pm
  pm="$(detect_pm)"

  echo "Installing dependencies (${pm})..."

  case "$pm" in
    pnpm)
      pnpm install --frozen-lockfile
      ;;
    yarn)
      # Berry lockfiles carry a `__metadata` block; classic ones don't.
      # `.yarnrc.yml` isn't a reliable marker since it's optional in Berry.
      if grep -q '^__metadata:' yarn.lock 2>/dev/null; then
        yarn install --immutable
      else
        yarn install --frozen-lockfile
      fi
      ;;
    npm)
      if [[ -f "package-lock.json" ]]; then
        npm ci
      else
        npm install --no-audit --no-fund
      fi
      ;;
  esac
}

# Resolve comma-separated package inputs to newline-separated paths.
# Usage: resolve_packages "pkg1, pkg2, ./path"
resolve_packages() {
  local input="$1"
  local IFS=','

  for item in $input; do
    # Trim whitespace
    item="$(echo "$item" | xargs)"
    if [[ -n "$item" ]]; then
      resolve_package "$item" || return 1
    fi
  done
}
