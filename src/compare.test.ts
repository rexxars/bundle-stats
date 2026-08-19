import assert from 'node:assert/strict'
import {test} from 'node:test'

import {compareReports} from './compare.ts'
import {createTestReport, createTestResult} from './test-utils.ts'

test('classifies only changes above both significance limits', () => {
  const baseline = createTestReport(createTestResult('export:.', 10_000, 5_000))
  const smallChange = createTestReport(createTestResult('export:.', 10_500, 5_500))
  const largeChange = createTestReport(createTestResult('export:.', 13_000, 7_000))

  assert.equal(compareReports(smallChange, baseline).changes[0].significance, 'insignificant')
  assert.equal(compareReports(largeChange, baseline).changes[0].significance, 'regression')
})

test('marks changed consumer source as not comparable', () => {
  const baseline = createTestReport(createTestResult('consumer:query', 10_000, 5_000, 'before'))
  const current = createTestReport(createTestResult('consumer:query', 20_000, 10_000, 'after'))

  const comparison = compareReports(current, baseline)
  assert.equal(comparison.changes[0].significance, 'input-changed')
  assert.equal(comparison.summary.inputChanged, 1)
})
