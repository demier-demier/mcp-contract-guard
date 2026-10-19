# Browser comparison app

Run `npm ci --ignore-scripts`, then `npm run web:build` from the repository root. Deploy **all** files in `web/dist/` under `/mcp-contract-guard/`. Relative script and stylesheet URLs keep the build independent of the host. The parent demo hub is linked as `../`. No application server or API is required.

The landing view computes the synthetic drift example on load. It is not a saved result. Four presets exercise changed, unchanged, description-only, and invalid inputs. Editing a baseline clears its review acknowledgement; every input change invalidates the last verdict and its download buttons. Filter by tool status or advisory signal, expand evidence lazily, and download the computed JSON or SARIF. Values are redacted by default.

`compare.ts` is a thin input adapter around `src/core.ts`, `src/parse.ts`, and `src/sarif.ts`. It does not implement comparison rules. `src/hash.ts` uses one pinned SHA-256 implementation in Node and the browser. Node filesystem I/O is isolated in `src/io.ts`. The build has no CDN imports, server endpoint, remote model, browser storage, or input telemetry. Chosen files are bounded before reading and decoded with a fatal UTF-8 decoder. The page CSP blocks app network connections.

`test/web.test.mjs` executes the browser-targeted adapter in a sandbox without Node globals or network APIs and checks output parity against the CLI. It also verifies file decoding/bounds, baseline acknowledgement/scope, invalid input, hash compatibility, and the complete browser bundle's static boundary. These are build and engine checks; they do not claim browser interaction QA.

The hosting page, browser extensions, and downloaded source code remain trust boundaries. This demo neither authenticates the export's source nor signs a baseline review. Use a trusted local checkout for sensitive material. Include the generated `THIRD_PARTY_NOTICES.txt` when deploying the SHA-256 dependency.
