import { canonical, type Report, type ToolReview } from '../src/core.js';
import { compareInputs, inputBytes, readLocalFile, sarif } from './compare.js';
import reviewed from '../fixtures/reviewed.json' with { type: 'json' };
import candidate from '../fixtures/candidate.json' with { type: 'json' };

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error('Missing interface element: ' + id);
  return element as T;
};
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const baselineInput = $<HTMLTextAreaElement>('baseline'), candidateInput = $<HTMLTextAreaElement>('candidate');
const scope = $<HTMLInputElement>('scope'), acknowledged = $<HTMLInputElement>('acknowledged'), includeValues = $<HTMLInputElement>('include-values');
let report: Report | null = null, visibleLimit = 50, inputVersion = 0;
const loadVersions = { baseline: 0, candidate: 0 };

function showError(message: string): void { $('error').textContent = message; $('error').hidden = false; }
function hideError(): void { $('error').textContent = ''; $('error').hidden = true; }
function refreshSizes(): void {
  $('baseline-size').textContent = inputBytes(baselineInput.value).toLocaleString() + ' bytes';
  $('candidate-size').textContent = inputBytes(candidateInput.value).toLocaleString() + ' bytes';
}
function invalidate(message = 'Inputs changed. Compare again to compute the new decision.'): void {
  inputVersion++; report = null; $('results').hidden = true;
  $<HTMLButtonElement>('export-json').disabled = true; $<HTMLButtonElement>('export-sarif').disabled = true;
  $('decision').classList.remove('clear'); $('decision-title').textContent = 'Ready to compare';
  $('decision-detail').textContent = 'The displayed inputs have no current comparison result.';
  for (const id of ['stat-changes', 'stat-heuristics', 'stat-surface', 'stat-unchanged']) $(id).textContent = '—';
  $('run-status').textContent = message; hideError(); refreshSizes();
}
function addHashes(parent: HTMLElement, tool: ToolReview): void {
  const hashes = make('div', 'hashes');
  for (const [label, value] of [['BASELINE TOOL SHA-256', tool.beforeHash], ['CANDIDATE TOOL SHA-256', tool.afterHash], ['CANDIDATE INPUT SCHEMA', tool.schemaHash], ['CANDIDATE DESCRIPTION', tool.descriptionHash], ['CANDIDATE ANNOTATIONS', tool.annotationHash]]) {
    const item = make('div'); item.append(make('small', '', label), make('code', '', value ?? '(absent)')); hashes.append(item);
  }
  parent.append(hashes);
}
function toolCard(tool: ToolReview): HTMLElement {
  const card = make('article', 'tool'), head = make('div', 'tool-head'), heading = make('div');
  heading.append(make('span', 'status ' + tool.status, tool.status), make('h3', '', tool.name));
  head.append(heading, make('span', 'tool-hash', (tool.afterHash ?? tool.beforeHash ?? '').slice(0, 14))); card.append(head);
  if (tool.findings.length) {
    const list = make('ul', 'findings');
    for (const finding of tool.findings) {
      const row = make('li', finding.kind);
      row.append(make('span', 'finding-tag', finding.kind === 'heuristic' ? 'HEURISTIC' : finding.kind === 'surface' ? 'SURFACE SIGNAL' : 'REVIEW'), document.createTextNode(finding.message), make('code', '', finding.path)); list.append(row);
    }
    card.append(list);
  } else card.append(make('p', 'unchanged-note', 'Fingerprint matches the reference. Runtime behavior remains outside this check.'));
  const details = make('details');
  details.append(make('summary', '', tool.changes.length ? `${tool.changes.length} evidence ${tool.changes.length === 1 ? 'path' : 'paths'} · inspect diff` : 'Inspect contract fingerprints'));
  let expanded = false;
  details.addEventListener('toggle', () => {
    if (!details.open || expanded) return;
    expanded = true; addHashes(details, tool);
    for (const change of tool.changes) {
      const section = make('section', 'diff'), grid = make('div', 'diff-grid');
      section.append(make('h4', '', change.path));
      for (const [label, value, hash] of [['− Baseline', change.before, change.beforeHash], ['+ Candidate', change.after, change.afterHash]] as const) {
        const side = make('div', 'diff-side'); side.append(make('label', '', label), make('pre', '', value === undefined ? '(absent)' : canonical(value)), make('small', '', 'SHA-256 ' + (hash ?? '(absent)'))); grid.append(side);
      }
      section.append(grid); details.append(section);
    }
    if (tool.truncated) details.append(make('p', 'warning', 'Detailed evidence limit reached. The complete fingerprint still determines the review gate.'));
  });
  card.append(details); return card;
}
function renderTools(reset = true): void {
  if (!report) return;
  if (reset) visibleLimit = 50;
  const query = $<HTMLInputElement>('search').value.toLowerCase(), status = $<HTMLSelectElement>('status').value, signals = $<HTMLInputElement>('signals').checked;
  const filtered = report.tools.filter(tool => (!status || tool.status === status) && (!signals || tool.findings.some(f => f.kind !== 'change')) && [tool.name, ...tool.findings.flatMap(f => [f.message, f.path]), ...tool.changes.map(c => c.path)].join(' ').toLowerCase().includes(query));
  $('tools').replaceChildren(...filtered.slice(0, visibleLimit).map(toolCard));
  $('shown').textContent = Math.min(visibleLimit, filtered.length) + ' shown · ' + filtered.length + ' of ' + report.tools.length + ' tools match';
  $('empty').hidden = filtered.length > 0; $('show-more').hidden = filtered.length <= visibleLimit;
}
function renderReport(result: Report): void {
  report = result;
  const changed = result.summary.added + result.summary.removed + result.summary.changed;
  $('decision-title').textContent = result.decision === 'review-required' ? 'Review required' : 'No contract change';
  $('decision').classList.toggle('clear', result.decision === 'no-change');
  $('decision-detail').textContent = `${changed} of ${result.tools.length} tool contracts differ.\nCLI-equivalent exit ${result.decision === 'review-required' ? '2 · re-review required.' : '0 · this is not a safety verdict.'}`;
  $('stat-changes').textContent = String(changed); $('stat-heuristics').textContent = String(result.summary.heuristics); $('stat-surface').textContent = String(result.summary.surfaceSignals); $('stat-unchanged').textContent = String(result.summary.unchanged);
  $('result-summary').textContent = `${result.summary.added} added · ${result.summary.removed} removed · ${result.summary.changed} changed · ${result.summary.unchanged} unchanged`;
  $('baseline-digest').textContent = result.baselineDigest.slice(0, 16); $('baseline-digest').title = result.baselineDigest;
  $('candidate-digest').textContent = result.candidateDigest.slice(0, 16); $('candidate-digest').title = result.candidateDigest;
  $('redaction-note').textContent = result.redaction === 'values' ? 'VALUES REDACTED' : 'VALUES VISIBLE · OPT-IN';
  $('advisory-warning').hidden = !result.advisoriesTruncated; $('results').hidden = false;
  $<HTMLButtonElement>('export-json').disabled = false; $<HTMLButtonElement>('export-sarif').disabled = false;
  renderTools();
}
async function runComparison(): Promise<void> {
  const version = inputVersion, button = $<HTMLButtonElement>('compare');
  button.disabled = true; hideError(); $('run-status').textContent = 'Computing fingerprints and differences locally…';
  // Yield once so the pending state is visible before the bounded CPU work.
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  if (version !== inputVersion) { button.disabled = false; return; }
  try {
    const result = compareInputs({ baseline: baselineInput.value, candidate: candidateInput.value, scope: scope.value, acknowledged: acknowledged.checked, includeValues: includeValues.checked });
    renderReport(result); $('run-status').textContent = 'Computed from the current inputs with the shared CLI engine. No input data was sent over the network.';
  } catch (error) {
    invalidate('Comparison rejected. Correct the inputs and compare again.');
    $('decision-title').textContent = 'Input rejected'; $('decision-detail').textContent = 'CLI-equivalent exit 1. No comparison verdict was produced.';
    showError(error instanceof Error ? error.message : 'Unable to compare inputs.');
  } finally { button.disabled = false; }
}
function loadPreset(): void {
  const preset = $<HTMLSelectElement>('preset').value;
  const next = preset === 'drift' ? structuredClone(candidate) : structuredClone(reviewed);
  if (preset === 'description' && 'tools' in next) next.tools[0]!.description += ' Include related draft notes.';
  if (preset === 'invalid' && 'tools' in next) next.tools.push(structuredClone(next.tools[0]!));
  loadVersions.baseline++; loadVersions.candidate++;
  baselineInput.value = JSON.stringify(reviewed, null, 2); candidateInput.value = JSON.stringify(next, null, 2);
  scope.value = 'synthetic-catalog-demo'; acknowledged.checked = true; includeValues.checked = false;
  $('baseline-origin').textContent = 'Reviewed synthetic example'; $('candidate-origin').textContent = 'Synthetic candidate';
  $<HTMLInputElement>('search').value = ''; $<HTMLSelectElement>('status').value = ''; $<HTMLInputElement>('signals').checked = false;
  invalidate('Loaded a reviewed synthetic baseline and candidate. Computing the example locally…');
  void runComparison();
}
function download(format: 'json' | 'sarif'): void {
  if (!report) return;
  const blob = new Blob([JSON.stringify(format === 'sarif' ? sarif(report) : report, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = make('a');
  link.href = url; link.download = 'mcp-contract-review.' + format; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
for (const side of ['baseline', 'candidate'] as const) {
  const textarea = $<HTMLTextAreaElement>(side), fileInput = $<HTMLInputElement>(side + '-file');
  textarea.addEventListener('input', () => { loadVersions[side]++; if (side === 'baseline') acknowledged.checked = false; $(side + '-origin').textContent = 'Edited in this browser'; invalidate(); });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]; if (!file) return;
    const version = ++loadVersions[side];
    invalidate('Reading the selected file locally…');
    try {
      const text = await readLocalFile(file); if (version !== loadVersions[side]) return;
      textarea.value = text; if (side === 'baseline') acknowledged.checked = false;
      $(side + '-origin').textContent = 'Local file · ' + file.name;
      invalidate('Local file loaded. Review the reference and compare the two exports.');
    } catch (error) { if (version === loadVersions[side]) { invalidate('File rejected. The previous input was retained.'); showError(error instanceof Error ? error.message : 'File could not be read.'); } }
    finally { fileInput.value = ''; }
  });
}
for (const input of [scope, acknowledged, includeValues]) input.addEventListener('input', () => invalidate());
$('load-preset').addEventListener('click', loadPreset); $('compare').addEventListener('click', () => void runComparison());
$('search').addEventListener('input', () => renderTools()); $('status').addEventListener('change', () => renderTools()); $('signals').addEventListener('change', () => renderTools());
$('show-more').addEventListener('click', () => { visibleLimit += 50; renderTools(false); });
$('export-json').addEventListener('click', () => download('json')); $('export-sarif').addEventListener('click', () => download('sarif'));
loadPreset();
