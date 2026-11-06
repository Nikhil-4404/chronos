# Technology and execution

Updated 2026-11-06. The manifest and package-lock.json remain the canonical inventory. No dependency was added or upgraded for the living-world change.

| Component | Choice |
| --- | --- |
| UI | Browser-native JavaScript, semantic HTML/CSS; full-viewport observation HUD. |
| Rendering | Three.js 0.187.0 / OrbitControls; procedural geometry and textures, bounded instanced residents/buildings. |
| Build | Vite 8.3.6 and scripts/build-offline.mjs; regular dist site plus identical root/dist CHRONOS.html. |
| Model | Deterministic seeded colony.js state transitions; no external AI, backend or whole-history snapshots. |
| Persistence | Strict schema-2 JSON, localStorage chronos.colony, export/import, guarded autosave and recovery checkpoints. |
| Compatibility | Prior schema-1 engine and archived single-file game; chronos.world remains untouched. |
| Tests | Node built-in node:test; actual browser workflows separately recorded. |

Run with Node 22.12+ (development runtime 22.21.1, npm 10.9.4). From this directory: npm.cmd ci, npm.cmd run dev, npm.cmd test, npm.cmd run build, npm.cmd run preview. The offline bundler checks embedded program syntax, licenses, a single bundled entry, no external script/style imports and below 1 MB. Generated source index.html requires an HTTP server; CHRONOS.html is self-contained. Direct file launch remains browser-unverified because the test browser blocks that protocol.

Only the active colony engine is included in the new bundle. The earlier simulation.js remains in source for historical compatibility tests. A server is not required for local functionality; closed-page simulation is catch-up on return, not continuous background hosting. No credentials, fonts, models, telemetry, network API, paid service or optional audio engine is used. A public GitHub source repository is authorized; website hosting and production operations are outside this request.
