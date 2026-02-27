import type {DeltaValue} from '../types.ts'

export function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes)
  const sign = bytes < 0 ? '-' : ''
  if (abs < 1024) return `${sign}${abs} B`
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`
  return `${sign}${(abs / (1024 * 1024)).toFixed(2)} MB`
}

export function formatMs(ms: number): string {
  const abs = Math.abs(ms)
  const sign = ms < 0 ? '-' : ''
  if (abs < 1000) return `${sign}${Math.round(abs)}ms`
  return `${sign}${(abs / 1000).toFixed(2)}s`
}

export function formatDelta(delta: DeltaValue, unitFn: (n: number) => string): string {
  const sign = delta.delta >= 0 ? '+' : ''
  return `${unitFn(delta.after)} (${sign}${unitFn(delta.delta)}, ${sign}${delta.percent.toFixed(1)}%)`
}
