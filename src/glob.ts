/**
 * Convert a simple glob pattern (supporting * and ?) to a RegExp.
 * No external dependencies.
 */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const withWildcards = escaped.replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${withWildcards}$`)
}

export function matchesAny(value: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegex(p).test(value))
}
