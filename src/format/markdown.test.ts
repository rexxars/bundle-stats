import assert from 'node:assert/strict'
import {test} from 'node:test'

import {compareReports} from '../compare.ts'
import {createTestReport, createTestResult} from '../test-utils.ts'
import {formatMarkdown} from './markdown.ts'

test('collapses insignificant changes behind details', () => {
  const baseline = createTestReport(createTestResult('export:.', 10_000, 5_000))
  const current = createTestReport(createTestResult('export:.', 10_500, 5_500))
  const markdown = formatMarkdown(compareReports(current, baseline), {ci: true})

  assert.match(markdown, /✅ No significant changes\./)
  assert.match(markdown, /<details>/)
  assert.match(markdown, /<!-- treemap-links -->/)
  assert.doesNotMatch(markdown, /\[!WARNING\]/)
})

test('makes regressions visible before detailed measurements', () => {
  const baseline = createTestReport(createTestResult('export:.', 10_000, 5_000))
  const current = createTestReport(createTestResult('export:.', 14_000, 8_000))
  const markdown = formatMarkdown(compareReports(current, baseline))

  assert.match(markdown, /\[!WARNING\]/)
  assert.match(markdown, /🔴 `\.` \(export\)/)
  assert.ok(markdown.indexOf('🔴') < markdown.indexOf('<details>'))
})
