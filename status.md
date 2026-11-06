# CHRONOS river-city implementation status

Updated 2026-11-07. Contracts are in prd.md, requirements.md, frontend.md and model.md. This record distinguishes local functional evidence from universal performance or production claims.

Markers: `[ ] Planned`, `[-] Active`, `[i] Implemented — Verification Pending`, `[x] Verified Complete`, `[!] Blocked`, `[~] Deferred`.

| Status | Scope | Acceptance / next evidence |
| --- | --- | --- |
| [x] Verified Complete | Persistent logistics and expansion | LIV-02–04,13–14: seed 731 develops beyond day 90; seeds 11/88 also grow. Conserved pickup/transport/unload, queued pier handling, interrupted jobs and full-queue recovery pass. |
| [x] Verified Complete | Building additions, reuse and salvage | LIV-06,15: retained IDs/shells, real costs/labor, material loss and save continuation pass. At 512 places, eligible additions and maintenance continue. Distinct structural forms are rendered. |
| [x] Verified Complete | Resident identity and movement | LIV-05,16: ID-stable appearance/offsets, timestamp anchoring, route corners and follow behavior pass. Browser frame samples are recorded below. |
| [x] Verified Complete | Sun, Moon and environment | LIV-17: six pure environment tests plus actual sky views; seasonal ice affects routes. Frozen barges keep their load and wait for thaw; recovering cargo stays stationary until reached. Thaw reroutes carts onto bridges. |
| [x] Verified Complete | Online delivery learning | LIV-18: completed outcomes update bounded tabular estimates; legal modes, persistence and deterministic continuation pass. Actual journey estimates are visible. Comparative policy superiority remains unverified. |
| [x] Verified Complete | Background simulation loop | LIV-09,19: three runtime tests cover budgeted recovery, checkpoint timing and fractional restart. Embedded worker confirmed in browser; fallback receives code/test review, not a forced browser-failure test. |
| [x] Verified Complete | Existing-world migration and packaging | LIV-08,10,12: strict schema-2 migration, conservation, schema-3 rejection/continuation, local raw backup, export/import and canceled reset verified. Single-file production build passes embedded syntax/license/size checks. |
| [x] Verified Complete | Final source longevity | After the final fixes, two 730-day runs pass all 1,460 daily serialization/conservation validations. See outcomes below. Your actual browser world was restored and exported at day 679; the temporary QA server is stopped. |
| [~] Deferred | Advanced institutions and detailed physics | Banking contagion, learned credit pricing, full ice/fluid/rigid-body cargo physics and coin wagons remain outside this implementation. |

## Verification evidence

Windows, Node 22.21.1/npm 10.9.4, in-app Chromium/WebGL. `npm.cmd test`: 61 passed, zero failed/skipped. `npm.cmd run build`: regular site and identical root/dist self-contained HTML, approximately 770 KB. SHA-256: `169716c1982d652a1cc0dfc275fdbea17aeea7953e2c36044d907ff84c873722`. No dependency was added or upgraded.

Browser checks cover the actual migrated city expanding from its earlier plateau to 1,024 residents/134 places, cargo inspection/following, changing architecture, the Sun/Moon/Sky camera, portable export/import, malformed-reference rejection, reset cancellation, guide/Escape, HUD hide/return and fullscreen. The real world was backed up before fixtures and restored afterward. Mobile 375×812 had no document overflow; camera controls fit and following dismissed the panel.

Final-source longevity, stepping and validating every day:

| World | Simulated days | Final day | People / places | Completed deliveries | Additions / reuse / salvage |
| --- | --- | --- | --- | --- | --- |
| Fresh seed 731 | 730 | 731 | 1,024 / 128 | 234,787 | 309 / 0 / 18 |
| Actual migrated export | 730 | 925 | 1,024 / 135 | 275,521 | 295 / 2 / 13 |

Both runs preserve the four-child lifetime limit for either parent through deaths/repartnering. Tests also cover full shipment queues, the 512-place planning boundary and frozen/stranded barge recovery; limits cannot be tested only by a naturally grown 135-place world.

Brief 240-frame windows: an actual 1,024-resident/134-place world at 892×812 recorded p95 12.2 ms/p99 18.1 ms; mobile recorded p95 6.2 ms/p99 12.0 ms. A separately labeled synthetic 1,024-resident/512-place capacity fixture on the final build recorded p95 6.2 ms/p99 12.1 ms, zero frames over 50 ms and `geometryClipped=0`, with the worker running and no console warnings/errors. These are local samples, not a soak test or a hardware guarantee. Overview rain fog was adjusted after visual QA so it no longer hides the expanded city.

Enforced limits: 1,024 people, 512 places, 160 shipments, 100 recent events, 120 daily records and a 2 MB import bound. The synthetic maximum fixture on the final source serialized to 870,541 bytes; a 144-tick Node profile measured 21.4 ms/tick, 17.1 ms/save and 2.9 ms/snapshot. It is a stress fixture, not evidence that every city naturally reaches 512 places. Growth remains demand/resource dependent and cannot expand without limits.

## Remaining limits

The environment and compressed demography are fictional approximations. The travel table learns from simulated outcomes; no neural cognition or measured superiority over a fixed policy is claimed. Advanced institutions/physics listed above remain deferred. Other browsers/devices, extended GPU soak, full screen-reader equivalence, deliberate worker/storage failure injection and direct `file://` launching are unverified. The test browser denied that file protocol; HTTP use of the self-contained artifact is verified. Closed-page life is bounded catch-up on return, not a hosted service. This is a locally verified game, not a production deployment assessment.

Source publication: https://github.com/Nikhil-4404/chronos is the existing public repository. Personal saves, local backups and work/ diagnostics are excluded from publication. No website hosting is part of this task. Temporary preview processes are stopped at handoff.
