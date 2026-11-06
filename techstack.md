# Technology and execution

Updated 2026-11-07. The manifest and package-lock.json remain the canonical inventory. No dependency was added or upgraded for the river-city change.

| Component | Choice |
| --- | --- |
| UI | Browser-native JavaScript, semantic HTML/CSS; full-viewport observation HUD. |
| Rendering | Three.js 0.187.0 / OrbitControls; stable-ID animation, varied building components, physical cargo visuals and environment-driven sky. |
| Build | Vite 8.3.6 and scripts/build-offline.mjs; regular dist site plus identical root/dist CHRONOS.html with an inline worker. |
| Model | Deterministic colony.js transitions, local stock/cargo conservation and environment.js; no external AI/backend or whole-history snapshots. |
| Learning | Persisted tabular transport action values and observed journey means; model.md records data/equations/limits. |
| Runtime | Shared world-loop.js in a background worker or page fallback; timestamped frames and fractional recovery checkpoints. |
| Persistence | Strict schema-3 JSON, validated schema-2 migration, local raw backup and guarded localStorage autosave/export/import. |
| Compatibility | Retained schema-2 validator and earlier schema-1 engine/archive; chronos.world remains untouched. |
| Tests | Node built-in node:test; actual browser workflows separately recorded. |

Run with Node 22.12+ (development runtime 22.21.1, npm 10.9.4). From this directory: npm.cmd ci, npm.cmd run dev, npm.cmd test, npm.cmd run build, npm.cmd run preview. The offline bundler checks embedded program syntax, licenses, a single bundled entry, no external script/style imports and below 1 MB. Generated source index.html requires an HTTP server; CHRONOS.html is self-contained. Direct file launch remains browser-unverified because the test browser blocks that protocol.

The active colony engine, migration validation and worker are embedded in the current game. The earlier simulation.js remains outside the bundle for historical compatibility. A background worker keeps model work away from rendering, with a page fallback if unavailable. Hardware frame times and fallback behavior require actual browser evidence. Closed-page life is catch-up on return, not continuous hosting. No credentials, remote assets, network inference, analytics, paid AI or automatically started database/CI services are required. Public source distribution is authorized; website hosting and production operations remain outside scope.
