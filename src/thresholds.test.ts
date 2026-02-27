import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {parseValue} from './thresholds.ts'

describe('parseValue', () => {
  it('parses byte values', () => {
    assert.equal(parseValue('500b'), 500)
    assert.equal(parseValue('0b'), 0)
  })
  it('parses kilobyte values', () => {
    assert.equal(parseValue('100kb'), 100 * 1024)
    assert.equal(parseValue('1.5kb'), 1.5 * 1024)
  })
  it('parses megabyte values', () => {
    assert.equal(parseValue('1mb'), 1024 * 1024)
    assert.equal(parseValue('2.5mb'), 2.5 * 1024 * 1024)
  })
  it('parses millisecond values', () => {
    assert.equal(parseValue('500ms'), 500)
    assert.equal(parseValue('0ms'), 0)
  })
  it('parses second values', () => {
    assert.equal(parseValue('2s'), 2000)
    assert.equal(parseValue('1.5s'), 1500)
  })
  it('is case-insensitive', () => {
    assert.equal(parseValue('100KB'), 100 * 1024)
    assert.equal(parseValue('500MS'), 500)
    assert.equal(parseValue('1MB'), 1024 * 1024)
  })
  it('trims whitespace', () => {
    assert.equal(parseValue('  100kb  '), 100 * 1024)
  })
  it('throws on invalid input', () => {
    assert.throws(() => parseValue('abc'), /Invalid threshold value/)
    assert.throws(() => parseValue('100'), /Invalid threshold value/)
    assert.throws(() => parseValue('100xyz'), /Invalid threshold value/)
    assert.throws(() => parseValue(''), /Invalid threshold value/)
  })
})
