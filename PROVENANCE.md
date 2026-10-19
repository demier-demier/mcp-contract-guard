# Provenance

This repository is a standalone, original, AI-assisted portfolio implementation created on **2026-10-19**. Its TypeScript source, tests, documentation, report design, and synthetic fixtures were authored for this project. It was not extracted from a private application or client engagement. No real personal data, employer data, customer records, production credentials, or operational exports were used.

The project demonstrates deterministic local engineering around MCP tool definitions. It does not call an AI inference service, connect to live MCP servers, claim production users or adoption metrics, or claim formal security verification. Tests establish the specifically exercised behaviors; they are not a security certification. The screenshot is captured from the actual locally generated synthetic report.

## Primary references checked on 2026-10-19

- [MCP tools specification](https://modelcontextprotocol.io/specification/latest/server/tools), which resolved to [the 2026-07-28 tools specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools). Used to verify `tools/list`, pagination, tool metadata, schema guidance, and the untrusted status of annotations.
- [MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices), which resolved to [the 2026-07-28 security tutorial](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices). Used to define runtime authorization and network controls as separate from this offline comparison.
- [OWASP MCP Top 10: Client-Side Tool Risk Gating](https://owasp.github.io/www-project-mcp-top-10/2025/recommended-controls/Client-Side-Tool-Risk-Gating). Motivation for detecting post-approval definition changes with fingerprints and human re-review, with description scanning kept advisory. This project implements an offline subset; it is not an OWASP product or conformance implementation.

No source code or fixtures were copied from those references. The deliberately instruction-like sentence in a synthetic fixture is inert metadata used to exercise an advisory text rule. There is no exploit implementation or live attack procedure.

## Dependencies and generated artifacts

Development dependencies are exact-version TypeScript and Node type definitions fetched from the official npm registry; the lockfile records package integrity. Runtime code uses Node standard-library APIs. The project installs no runtime packages and loads no remote assets in the report.

`npm run demo` generates `fixtures/baseline.json`, `docs/results.json`, `docs/results.sarif`, and `docs/demo.html` from the two synthetic source fixtures. `npm run demo:check` regenerates their content in memory and compares it byte for byte. The screenshot is a visual rendering and is not part of that text determinism check.
