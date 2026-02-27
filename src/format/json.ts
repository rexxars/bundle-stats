import type {Report} from '../types.ts'

export function formatJson(report: Report): string {
  return JSON.stringify(report, null, 2)
}
