# Free gateway ownership

This service is independently runnable and is outside the pnpm application
workspace. Its Node tests/local mock require no third-party dependencies.

| File | Responsibility |
| --- | --- |
| `worker.js` | Cloudflare Worker adapter and `SharedQuota` Durable Object export; composes selected inference and the single shared quota object. |
| `gateway.js` | HTTP route orchestration, timeout, inference response envelope and explicit quota/service errors. |
| `protocol.js` | Bounded UTF-8/JSON request validation, server-controlled prompt construction, quota identifier hashing and JSON errors. |
| `config.js` | Fixed model, trusted cat personality, conservative compute rates and fail-closed configuration limits. |
| `free-inference.js` | Fixed free BigModel endpoint/model, explicit operator confirmation, bounded response transport; Cloudflare AI is an explicitly selected alternative. |
| `quota-store.js` | Sole persistent quota owner: one synchronous SQL transaction reserves global/device/IP/day/minute budgets. |
| `sqlite-local.js` | Node SQLite adapter for the real server/mock/tests, including transactions and database close lifecycle. |
| `http-server.js` | Sole Node HTTP/database lifecycle, cancellation and trusted-proxy IP handling. |
| `node-server.js` | Composes the real free-model Node adapter and environment-based startup. One persistent database/process owns all quotas. |
| `mock-server.js` | Reuses the HTTP owner with a clearly labelled fixed mock reply; no model, credentials or cloud account. |
| `wrangler.jsonc` | Cloudflare bindings, SQLite export, deployment name and downward-only quota settings. |
| `tests/gateway.test.js` | Observable input bounds, atomic quotas/reset/persistence, failure reservations and real loopback HTTP mock tests. |
| `tests/client-contract.test.js` | Actual desktop payload builder → gateway parser integration, including repeated Chinese history and JSON escape/body bounds. |
| `tests/free-inference.test.js` | Real HTTP boundary with fixture inference, free-model pinning, fail-closed setup, secret isolation and spoofed-proxy rejection. |

Flow: request → bounded protocol → daily hashed identifiers → one atomic quota
owner (Node SQLite or Durable Object) → fixed confirmed free model → compatible
reply with quota status and reset time. Low warnings use configured daily fractions;
minute throttling is a separate busy status.
An error never redirects requests to a personal paid API. `README.md` documents
the interface and current deployment/testing limits.
