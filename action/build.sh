#!/usr/bin/env bash
# Build orchestration functions.
# Sourced by run.sh — expects workspace.sh to be sourced first.

# Run builds for the given packages.
# Usage: run_builds "path1\npath2\n..."
#
# If INPUT_BUILD_COMMAND is set, runs it once globally.
# Otherwise runs per-package builds using the detected package manager.
run_builds() {
  local package_paths="$1"

  # Global build command — run once and return.
  # eval is intentional: the build-command input is authored by the workflow
  # maintainer who already has full code execution control via the workflow file.
  if [[ -n "${INPUT_BUILD_COMMAND:-}" ]]; then
    echo "Running global build command: ${INPUT_BUILD_COMMAND}"
    eval "$INPUT_BUILD_COMMAND"
    return $?
  fi

  local pm
  pm="$(detect_pm)"
  local script="${INPUT_BUILD_SCRIPT:-build}"

  while IFS= read -r pkg_path; do
    [[ -z "$pkg_path" ]] && continue

    # Read the package name from package.json
    local pkg_name
    pkg_name="$(node --input-type=module -e "
      import {readFileSync} from 'node:fs';
      const pkg = JSON.parse(readFileSync('${pkg_path}/package.json', 'utf-8'));
      process.stdout.write(pkg.name || '');
    ")"

    if [[ -z "$pkg_name" ]]; then
      echo "Error: No package name found in ${pkg_path}/package.json" >&2
      return 1
    fi

    echo "Building ${pkg_name} (${pm})..."

    case "$pm" in
      pnpm)
        pnpm --filter "${pkg_name}..." run "$script" || { echo "Error: Build failed for ${pkg_name}" >&2; return 1; }
        ;;
      yarn)
        yarn workspace "$pkg_name" run "$script" || { echo "Error: Build failed for ${pkg_name}" >&2; return 1; }
        ;;
      npm)
        npm run "$script" -w "$pkg_name" || { echo "Error: Build failed for ${pkg_name}" >&2; return 1; }
        ;;
    esac
  done <<< "$package_paths"
}
