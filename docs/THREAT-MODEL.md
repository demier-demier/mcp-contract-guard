# Threat model and review boundaries

The protected decision is narrow: **has this exported tool contract changed since a person acknowledged a specific baseline?** Changed names, descriptions, schemas, annotation claims, icons, and unknown extension fields all invalidate that comparison. Only object-key order and top-level tool order are normalized away.

## Trust boundaries

1. **Export → parser.** Treat the entire file as untrusted. The CLI reads a regular file with a strict byte limit, fatal UTF-8 decoding, duplicate-key rejection, bounded nesting/node/string counts, and rejection of dangerous object keys. Exporting the actual authorized tool list is the operator's responsibility.
2. **Definitions → baseline.** `--reviewed` records an explicit human acknowledgement. It is not an identity proof, signature, trusted timestamp, or proof that the operator reviewed correctly. The scope label must stay consistent across server identity, environment, permissions, and export policy. Baseline integrity requires repository controls and independent review; someone able to replace both baseline and candidate can defeat this gate.
3. **Metadata → findings.** Tool metadata is data, never instructions to this program. No descriptions, regular expressions from schemas, URLs, references, icons, or server commands are executed or fetched. Annotation hints remain untrusted. Fixed heuristic rules can produce false positives and false negatives, including language and obfuscation gaps.
4. **Evidence → report.** All untrusted HTML content is escaped; the report uses a fixed inline script authorized by a CSP hash, with network access disabled. It contains no remote resources. Evidence values are omitted unless explicitly requested. Browser extensions, a modified report, and unsafe downstream renderers are outside this boundary.
5. **Report → CI.** Every definition change produces exit `2`. Invalid input produces exit `1`. A heuristic miss cannot turn a changed contract into exit `0`. CI must respect both nonzero codes and prevent unreviewed baseline replacement.

## What this cannot prove

- Identical definitions can accompany different server code, tool results, authorization decisions, or network behavior. This tool cannot detect such changes.
- Exported annotations do not establish permissions. Surface signals describe local syntactic changes, not a proof of JSON Schema containment or effective authorization expansion.
- Schema checking is structural, **not full JSON Schema conformance or instance validation**. References are never resolved; regex syntax/behavior, custom vocabularies, and cross-keyword semantics are not evaluated. Structural acceptance does not mean a schema is valid under every applicable vocabulary. Unknown keywords are retained and fingerprinted.
- Snapshots cannot prove that the exporter included every page or used the same principal. Missing tools still request review, but a fabricated baseline defeats the comparison.
- Prompt injection in tool results, resource content, or runtime dialogue is outside scope. No adversarial actions are implemented here.
- Hashes detect changes; they do not authenticate the producer, establish approval authority, or hide guessable secrets.

## Baseline renewal

The live browser demo uses the same parser and comparison core. Pasted text and chosen files remain in memory, with the same input bounds and fatal file UTF-8 decoding. It has no input API or persistent browser storage, and its CSP blocks network connections from the app. Untrusted metadata is displayed through DOM `textContent`. Input changes invalidate the current verdict. This does not protect against modified hosting assets, browser extensions, or a compromised browser. Use a trusted local checkout for sensitive reviews. A browser session acknowledgement is only a chosen review reference, not a signed approval or server identity proof.

Review the complete candidate metadata and its actual source, assess the change outside the model context, and record the review through your normal approval process. Create a new baseline as an explicit separate operation. Protect it with ordinary change-review controls. Contract Guard deliberately has no `--accept-all`, auto-update, server-launch, or remote-fetch option.

## Disclosure and local handling

Use a synthetic reproduction when reporting a defect. Avoid attaching real snapshots, secrets, production endpoints, or personal data. Keep sensitive exports and generated reports outside a public repository. The CLI creates output files with restrictive `0600` mode (subject to platform behavior); this is not encryption or access-control verification.

The runtime policy concerns described in [MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices)—including confused-deputy risks, token passthrough, and SSRF—need controls at the host, server, and authorization boundaries. This offline tool does not replace them.
