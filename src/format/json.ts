import type {ComparisonReport, Report} from '../types.ts'

export function formatJson(value: Report | ComparisonReport): string {
  return JSON.stringify(value, null, 2)
}
