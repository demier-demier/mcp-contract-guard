import { sha256Text } from './hash.js';
import type { Report } from './core.js';

export function sarif(report: Report): object {
  const ruleIds = [...new Set(report.tools.flatMap(t => t.findings.map(f => f.ruleId)))].sort();
  return { version: '2.1.0', $schema: 'https://json.schemastore.org/sarif-2.1.0.json', runs: [{
    tool: { driver: { name: 'mcp-contract-guard', version: '0.1.0', rules: ruleIds.map(id => ({ id, shortDescription: { text: id.startsWith('META') ? 'Advisory metadata heuristic' : id === 'CONTRACT001' ? 'Tool contract changed' : 'Potential input or behavior expansion' } })) } },
    results: report.tools.flatMap(t => t.findings.map(f => ({ ruleId: f.ruleId, level: f.kind === 'change' ? 'error' : 'warning', message: { text: `${f.tool}: ${f.message}` }, locations: [{ logicalLocations: [{ fullyQualifiedName: f.path, kind: 'member' }] }], partialFingerprints: { contractFinding: sha256Text(f.ruleId + '\n' + f.path + '\n' + report.candidateDigest) }, properties: { kind: f.kind, evidencePath: f.path, toolFingerprint: t.afterHash ?? t.beforeHash, scope: report.scope } }))),
    properties: { decision: report.decision, baselineDigest: report.baselineDigest, candidateDigest: report.candidateDigest, redaction: report.redaction, advisoriesTruncated: report.advisoriesTruncated }
  }] };
}

