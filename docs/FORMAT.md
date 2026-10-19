# Format, normalization, and limits

All inputs are UTF-8 JSON. The CLI accepts complete `tools/list` result objects or JSON-RPC responses with `result.tools`. `nextCursor`, a JSON-RPC error, an ambiguous envelope containing both `tools` and `result`, and a non-`complete` result type are rejected. There is no connection setup or MCP protocol negotiation.

## Supported input profile

- Root and every tool must be objects. Names are case-sensitive and unique, using 1–128 ASCII letters, numbers, dots, underscores, or hyphens. This deliberately enforces the specification's recommended name profile as a local policy.
- `inputSchema` must be a non-null object. `outputSchema`, when present, must also be an object. Boolean subschemas are accepted. The supported explicit dialect is `https://json-schema.org/draft/2020-12/schema`; absence uses that structural profile.
- Common validation/applicator keyword shapes are checked recursively. Examples: valid JSON types, unique `required` entries, nonempty distinct `enum` values, numeric bounds, schema maps, nonempty composition arrays, and boolean flags. This is not a complete metaschema validator. See the threat model for unresolved references, regex, vocabularies, and semantic limits.
- Known annotation flags must be booleans. Descriptions and titles must be strings when present. Unknown extension fields remain JSON values and are included in fingerprints.
- Object keys named `__proto__`, `prototype`, or `constructor` are rejected anywhere in files. This intentionally excludes some otherwise valid schemas. Decoded duplicate JSON object keys are rejected, including escaped duplicates.
- Numbers must be finite, use safe integers when integral, and round-trip their normalized decimal spelling without precision collapse. Very large integers, decimal values beyond representable precision, and underflow fail closed. JSON lexical differences such as `1`, `1.0`, and `1e0` are equivalent.

## Fixed limits

| Resource | Limit | Behavior |
| --- | --- | --- |
| Input file | 2 MiB | Reject before parsing; read itself is bounded |
| Nesting | 32 levels below root | Reject |
| JSON nodes | 100,000 | Reject |
| One decoded string/key | 32,768 UTF-16 code units | Reject |
| One decoded object key | 256 UTF-16 code units | Reject; bounds evidence path growth |
| Tool count | 1,000 per snapshot | Reject |
| Detailed changed-value entries | 2,000 per report | Mark affected tools `truncated`; all tool hashes still checked |
| Advisory findings | 1,000 per report | Set `advisoriesTruncated`; summary counts reflect retained findings |
| Visible value preview | 600 canonical characters | Show truncated preview with complete value fingerprint |

These limits are fixed rather than remotely configurable. CLI file reads and browser text/file inputs are the supported untrusted-input boundaries. They use the same pure parser and comparison engine. Library callers should use `readJson` or `parseJson` before `snapshot`; TypeScript `Json` typing does not sanitize arbitrary in-memory objects, accessors, cycles, or custom prototypes.

## Canonical fingerprints

Within each tool, recursively sort object keys in JavaScript lexical order. Serialize arrays in their original order, and primitive values using JSON. Sort tools by case-sensitive name. Hash the canonical UTF-8 representation with SHA-256. This is a documented project-specific format, not a claim of RFC 8785/JCS compliance. A future normalization change requires a format-version migration.

`baseline-v1` contains `scope`, an explicit review acknowledgement, all tool definitions, and their canonical set digest. Loading checks the digest against the stored tools and checks the requested scope. No timestamp is generated, so files are reproducible. The digest is not a signature.

The report contains full set digests; each tool has a full definition fingerprint plus candidate input-schema, description, and annotation fingerprints. Removing or adding a tool yields an absent before/after side. Each evidence entry includes exact before/after value fingerprints, even when its display value is redacted or truncated. Descriptions absent from a valid tool are represented as JSON `null` for the standalone description fingerprint; the complete tool fingerprint still distinguishes absent fields.

Evidence paths are JSON-Pointer-style paths over a **normalized map keyed by tool name**: `/tools/catalog.search/inputSchema/properties/query`. They are not byte offsets, line numbers, or indices into the original array. `~` and `/` in property names are escaped to `~0` and `~1`. SARIF records these as logical locations; it does not fabricate source line numbers.

Response-level IDs, cache fields, and response metadata do not enter the tool contract. This tool does not baseline the MCP server configuration, transport, launch command, principal, or authorization token. Those require separate inventory controls and a meaningful scope label.

## Redaction

Default JSON/HTML evidence replaces **every changed value** with a fixed omission marker and retains its hash. SARIF carries fixed messages and paths, without metadata values. Tool names, JSON keys in paths, scope labels, and digest values remain visible in every format. Hashes can reveal low-entropy values by guessing; redaction does not guarantee confidentiality.

`--include-values` enables raw bounded previews in JSON and HTML. Added/removed tools may appear as a single preview; full inspection requires the original snapshot. Baselines always include complete values. The generated demo files use only synthetic metadata and opt in to visible previews. No real account, organization, endpoint, credential, or production dataset was used.
