export function parseValue(input: string): number {
  const match = input
    .trim()
    .toLowerCase()
    .match(/^([\d.]+)\s*(b|kb|mb|ms|s)$/)
  if (!match) throw new Error(`Invalid threshold value: "${input}"`)
  const num = parseFloat(match[1])
  const unit = match[2]
  switch (unit) {
    case 'b':
      return num
    case 'kb':
      return num * 1024
    case 'mb':
      return num * 1024 * 1024
    case 'ms':
      return num
    case 's':
      return num * 1000
    default:
      throw new Error(`Unknown unit: ${unit}`)
  }
}
