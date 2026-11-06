# Living-world delivery status

Updated 2026-11-06. This request replaces the active timeline product. Earlier UI verification is historical, not evidence for the new model. Contracts: prd.md, requirements.md, core.md and flow.md.

Markers: `[ ] Planned`, `[-] Active`, `[i] Implemented — Verification Pending`, `[x] Verified Complete`, `[!] Blocked`, `[~] Deferred`.

| Status | Acceptance | Evidence / limits |
| --- | --- | --- |
| [x] Verified Complete | LIV-01, 05, 11 | Browser opens directly into one live 3D settlement; zero playback/comparison controls. Clock advanced through guide, HUD hide/return and panels. Search and follow, mobile follow dismissal, cameras and observation panels exercised. |
| [x] Verified Complete | LIV-02–04 | Deterministic growth tests over 45 days; reserve/delivery/labor gating, no-worker site, working healers, household/capacity/resource invariants, births, migrants and building variants pass. Save continuation exercised beyond 100 days. |
| [x] Verified Complete | LIV-06–07 | Browser observed expanded seed-731 fixtures with 58 and 138 residents, 21 and 39 completed places, construction sites and births. These are deterministic test fixtures, not a user's prediction. Actual journal/history, articulated residents, type-specific architecture and day/night rendered without console errors. |
| [x] Verified Complete | LIV-08–09 | JSON continuation/validation and pending-recovery checkpoint tests pass. Native export/import exercised, invalid resident reference rejected and reset cancellation retained the current live world. Returning/importing backdated saves advanced days in browser. |
| [i] Implemented — Verification Pending | LIV-10 failure injection | Autosave, corruption recovery, other-tab compare guard and storage-failure messages implemented. Ordinary saving/export exercised; quota, corrupt storage and multi-tab races have not all been deliberately injected in this pass. |
| [x] Verified Complete | LIV-11 narrow layout | Measured 375×812: page equals viewport, top controls in bounds; panels and mobile following work. Ordinary desktop pane 892×812 exercised. Real touch hardware not tested. |
| [x] Verified Complete | LIV-12 packaging and relevant checks | 29 tests pass (9 new colony cases, 8 activity cases, 12 retained legacy cases). Production/offline build passes including syntax/asset/license/size self-checks. Keyboard guide Escape, cameras and HUD return exercised. |
| [i] Implemented — Verification Pending | Direct file launch / broader accessibility | Test browser denies file protocol; use of a local HTTP preview is verified. Other browsers, real touch, screen readers, forced WebGL loss, preference injection and low-end GPU profiling remain unverified. |

## Evidence

Windows, Node 22.21.1/npm 10.9.4, Codex in-app browser, 2026-11-06. `npm.cmd test`: 29 passed, 0 failed. `npm.cmd run build`: passed. Current self-contained game is 657,315 bytes, SHA-256 `4049CA375398FC1EC1D832BAC02D72CF1D9A81DA2A9F10B761A52075C2178B7E`. Root and dist copies are identical. Source archive is regenerated after documentation/QA completion.

Brief browser canvas counters sampled about 165 FPS in the ordinary pane during early-world checks; no long-duration or cross-hardware performance claim. A final-model 730-day run completed in 9,356 ms with 275 residents, 106 places, 149 births and 1287 deaths; saves were validated every 30 days. This is an accelerated fictional simulation, not elapsed browser time or a prediction. Tests are fictional state transitions; no real-world data or predictions are involved.

## Boundaries

512 living people, 256 places, 90 daily samples, 80 recent events; no final day, but no claim of unlimited growth. Seven-real-day elapsed catch-up cap; browser-closed server execution is not implemented. Growth can stall or reverse from shortages, travel, health, deaths or capacity. Imported/replaced worlds use a separate schema-2 key; earlier timeline data and a compatible archived game are preserved. No website hosting deployment performed. Keep JSON exports for durable backups.

## Final browser evidence

- The restored opening colony continued naturally through day 18 with 62 living residents, 22 completed places and two construction sites; a storehouse inspector showed 10% work and 100% delivered materials. The final active world is restored from its pre-fixture export; mature QA fixtures were replaced.
- Final packaged HTML was reloaded after implementation changes. The latest selected-subject heading shows the actual place name. Clock advanced while the guide and panels were open; Space did not introduce playback behavior. Hide/return and Above/frame cameras exercised.
- Resident search, Locate/Follow, mobile panel dismissal, chronicle population bars, event inspection and current construction details exercised. Invalid-reference import displayed `Invalid resident reference.`; cancelled new-world confirmation retained the active population/history.
- Backdated imports caught up while controls remained usable. Autosave showed recovery checkpoints, and reload resumed the saved colony. Pending elapsed time is also preserved by an assert-based continuation test.
- Earlier timeline export remained available. Its current seven-branch save was exported as a portable backup; the new app has no writes to the old key. The archived earlier game matches the pre-change artifact.
- Current screenshots: [living world](docs/images/living-world.png), [construction](docs/images/construction.png) and [chronicle](docs/images/chronicle.png). Browser fixtures and diagnostic scripts stay in work/, outside the source deliverable.

Final packaged reload: day 19, 64 living residents, 24 completed places and two active sites; no console warnings/errors. Native fullscreen enter/exit passed. The viewport override was reset, the loaded tab retained, and the owned QA server is stopped during teardown. Portable world backups remain local and are excluded from the public repository.

## Public source repository

The user authorized a public GitHub repository on 2026-11-06. [Nikhil-4404/chronos](https://github.com/Nikhil-4404/chronos) was created and source pushed to `main`. GitHub repository metadata confirms public visibility and the `main` default branch. `git ls-remote` matched the initial source commit `f8ca4333d8422fdbcb304ca3360d2f2d19b47fad` with the local branch. Source, tests, specifications, screenshots and the self-contained game are included. Browser worlds, local backups, dependencies and intermediate work are excluded; website hosting is outside scope. The publication checks reran successfully: 29 tests and the production/offline build. The staged 30-file source set passed a targeted credential/local-path/saved-world check.
