import type {Report, ScenarioResult} from './types.ts'

export function createTestReport(scenario: ScenarioResult): Report {
  return {
    schemaVersion: 2,
    createdAt: '2026-08-19T00:00:00.000Z',
    refLabel: null,
    engine: {name: 'rolldown', version: '1.2.5'},
    environment: {node: 'v24.0.0', platform: 'linux', arch: 'x64'},
    config: {
      fingerprint: 'fixture',
      significance: {
        bundle: {bytes: 1024, percent: 1},
        importTime: {milliseconds: 5, percent: 10},
      },
    },
    packages: [{name: 'fixture', version: '1.0.0', root: '/fixture', scenarios: [scenario]}],
  }
}

export function createTestResult(
  id: string,
  rawBytes: number,
  gzipBytes: number,
  inputHash: string | null = null,
): ScenarioResult {
  const kind = id.startsWith('consumer:') ? 'consumer' : 'export'
  return {
    scenario: {
      id,
      name: id.slice(id.indexOf(':') + 1),
      kind,
      input: '/fixture/index.js',
      importSpecifier: kind === 'export' ? 'fixture' : null,
      inputHash,
    },
    bundle: {rawBytes, gzipBytes, treemapPath: null},
    importTime: null,
    diagnostics: [],
  }
}
