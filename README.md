# MCP Contract Guard

[![Contract guard](https://github.com/demier-demier/mcp-contract-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/demier-demier/mcp-contract-guard/actions/workflows/ci.yml)

**An offline review gate for changes in exported MCP tool definitions.**

An MCP tool can keep its name while its description, schema, or claimed behavior changes. Contract Guard compares a current `tools/list` export with an explicitly reviewed baseline, then produces precise evidence for another human review. It never starts a server, connects to a target, calls a tool, or invokes an AI model.

![Interactive MCP contract review report](docs/screenshot.png)

Open [the standalone demo](docs/demo.html) after downloading this repository, or inspect [its JSON evidence](docs/results.json). The demo uses a synthetic catalog: one added tool, one removed tool, four changed tools, and one unchanged tool.

## What it does

- SHA-256 fingerprints for complete tool definitions, input schemas, descriptions, and annotations.
- Detects additions, removals, metadata changes, and unknown extension-field changes. A harmless-looking description change still requires review.
- Highlights possible input or behavior expansion: newly accepted properties, removed requirements, expanded enums, and changes in untrusted annotation hints.
- Labels instruction-like text and invisible formatting as **heuristics**, with no claim that a hit proves an attack or a miss proves safety.
- Produces deterministic JSON, SARIF 2.1.0, and one self-contained HTML file with search, status filters, signal filters, and per-tool evidence.
- Rejects ambiguous exports, duplicate names/keys, incomplete pagination, malformed inputs, and common invalid JSON Schema keyword shapes before comparison.

## Run locally

Requires Node.js **22 or later**. There are no runtime dependencies; the lockfile pins the development compiler and type definitions.

```sh
npm ci --ignore-scripts
npm test
npm run demo:check
node dist/cli.js --help
```

Inspect the actual exported definitions before acknowledging a baseline. Use a scope label that identifies the server identity, environment, authorization context, and export policy in your own controlled inventory; do not put credentials or personal data in it.

```sh
node dist/cli.js baseline \
  --input fixtures/reviewed.json \
  --scope synthetic-catalog-demo \
  --reviewed \
  --output reviewed-baseline.json

node dist/cli.js compare \
  --baseline reviewed-baseline.json \
  --input fixtures/candidate.json \
  --scope synthetic-catalog-demo \
  --format html \
  --output review.html
```

The example comparison exits **2** because its contracts changed. `--format json` is the default; use `--format sarif` for code-scanning ingestion. Without `--output`, comparison writes the report to stdout. Existing output files are never overwritten. The baseline command requires both `--reviewed` and an output path; it cannot silently approve a new snapshot during comparison.

| Exit | Meaning | CI treatment |
| --- | --- | --- |
| `0` | Baseline created, or no tool-contract change | Continue only within the scope of this check |
| `2` | One or more tools added, removed, or changed | Pause for review |
| `1` | Invalid input, unsupported format, scope mismatch, or I/O failure | Fail the job |

An unchanged tool may still have advisory heuristic findings. Exit `0` means **no observed definition change**, not that a server is safe. Every definition change triggers exit `2`, independently of those heuristics.

## Input and evidence policy

Accepts `{ "tools": [...] }` or a JSON-RPC response with `result.tools`. Export and combine **all** pages first, preserving the authorization context. An export with any `nextCursor` field is rejected. This tool cannot establish completeness if an exporter silently omits tools.

Object keys and the top-level tool list are sorted for fingerprinting. All other arrays retain their order, including schema arrays: tuple positions must never be collapsed. Consequently, a `required` or `enum` reorder also requests review; this is intentionally conservative, not a semantic equivalence proof. Transport IDs and response-level metadata are outside the tool-contract fingerprint.

Report values are **omitted by default**. Tool names, scope labels, evidence paths, hashes, counts, and fixed finding messages remain visible. This is data minimization, not anonymization: names and property keys may reveal information, and hashes permit guessing attacks on low-entropy values. `--include-values` explicitly enables bounded value previews; the synthetic demo uses it. Baselines retain full metadata because comparison requires it. Keep real exports and baselines private. See [the complete format and limits](docs/FORMAT.md).

## Why this exists

[OWASP's client-side tool risk gating guidance](https://owasp.github.io/www-project-mcp-top-10/2025/recommended-controls/Client-Side-Tool-Risk-Gating) describes metadata changes after approval as a reason to fingerprint definitions and require renewed review. This project implements the **offline snapshot review** portion of that idea. It does not integrate a live MCP host or enforce permissions at invocation time.

The [MCP tools specification](https://modelcontextprotocol.io/specification/latest/server/tools) treats annotations as untrusted unless they come from trusted servers. Contract Guard never treats `readOnlyHint` or `destructiveHint` as evidence of actual behavior. The separate [MCP security guidance](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices) covers runtime concerns such as authorization and token handling that an export diff cannot test.

## Development and packaging

```sh
npm test                 # build plus parser, contract, renderer, and CLI tests
npm run demo             # regenerate synthetic baseline and all demo artifacts
npm run demo:check       # byte-for-byte deterministic artifact check
npm run build
npm pack --ignore-scripts
```

The package contains compiled JavaScript, declarations, documentation, and synthetic fixtures. Install the resulting `.tgz` locally to use the `mcp-contract-guard` command. The manifest is private to prevent accidental registry publication; GitHub source publication is independent. CI tests Node 22 and 24. No production adoption, live deployment, formal security verification, or AI inference is claimed.

[Threat model](docs/THREAT-MODEL.md) · [Format and limits](docs/FORMAT.md) · [Implementation provenance](PROVENANCE.md)
