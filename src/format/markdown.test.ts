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

test('makes significant increases visible before detailed measurements', () => {
  const baseline = createTestReport(createTestResult('export:.', 10_000, 5_000))
  const current = createTestReport(createTestResult('export:.', 14_000, 8_000))
  const markdown = formatMarkdown(compareReports(current, baseline))

  assert.match(markdown, /\[!WARNING\]/)
  assert.match(markdown, /🔴 `\.` \(export\)/)
  assert.ok(markdown.indexOf('🔴') < markdown.indexOf('<details>'))
})

test('counts significant decreases and formats metrics on separate lines', () => {
  const baseline = createTestReport(createTestResult('export:.', 10_000, 5_000))
  const current = createTestReport(createTestResult('export:.', 5_000, 2_500))
  const markdown = formatMarkdown(compareReports(current, baseline))

  assert.match(markdown, /\[!NOTE\]\n> 1 significant change\./)
  assert.match(markdown, /🟢 `\.` \(export\)  \nGzip: 2\.4 KB, down 2\.4 KB \(50\.0%\)/)
  assert.match(markdown, /Raw: 4\.9 KB, down 4\.9 KB \(50\.0%\)/)
  assert.doesNotMatch(markdown, /regression/i)
  assert.doesNotMatch(markdown, /\n- 🟢/)
})

test('shortens scenario names for one package and spells out empty values', () => {
  const baseline = createTestReport(createTestResult('export:.', 10_000, 5_000))
  const current = createTestReport(createTestResult('export:.', 10_000, 5_000))
  const markdown = formatMarkdown(compareReports(current, baseline))

  assert.match(markdown, /\| ⚪ \. \| export \| 9\.8 KB \/ 4\.9 KB \| None \| None \| None \|/)
  assert.doesNotMatch(markdown, /fixture \/ \./)
})

test('summarizes added scenarios without calling them significant', () => {
  const baseline = createTestReport(createTestResult('export:.', 10_000, 5_000))
  const current = createTestReport(createTestResult('export:.', 10_000, 5_000))
  const baselinePackage = baseline.packages.at(0)
  if (!baselinePackage) throw new Error('Expected a fixture package')
  baselinePackage.scenarios = []

  const markdown = formatMarkdown(compareReports(current, baseline))

  assert.match(markdown, /\[!NOTE\]\n> 1 scenario added\./)
  assert.doesNotMatch(markdown, /No significant changes/)
})

test('does not expose a missing baseline consumer entry as a measurement error', () => {
  const baselineResult = createTestResult('consumer:readme-minimal', 0, 0)
  baselineResult.bundle = null
  baselineResult.diagnostics = [
    {
      severity: 'error',
      phase: 'discovery',
      message: 'Consumer scenario "readme-minimal" was not found at /fixture/readme-minimal.ts',
    },
  ]
  const baseline = createTestReport(baselineResult)
  const current = createTestReport(
    createTestResult('consumer:readme-minimal', 17_118, 5_508, 'current'),
  )

  const markdown = formatMarkdown(compareReports(current, baseline))

  assert.match(markdown, /\[!NOTE\]\n> 1 scenario added\./)
  assert.match(markdown, /➕ `readme-minimal` \(consumer\)  \nAdded/)
  assert.match(
    markdown,
    /\| ➕ readme-minimal \| consumer \| 16\.7 KB \/ 5\.4 KB \| N\/A \| None \| N\/A \|/,
  )
  assert.doesNotMatch(markdown, /was not found/)
  assert.doesNotMatch(markdown, /❌/)
})
