import {describe, it} from 'node:test'
import assert from 'node:assert/strict'

import {resolveNpmVersion} from './npm.ts'

describe('resolveNpmVersion', () => {
  it('returns the specified version when given a string', () => {
    const result = resolveNpmVersion('@rexxars/bundle-stats', '1.0.0')
    assert.equal(result, '1.0.0')
  })

  it('resolves latest version from npm when given true', () => {
    const result = resolveNpmVersion('@rexxars/bundle-stats', true)
    assert.match(result, /^\d+\.\d+\.\d+/)
  })
})
