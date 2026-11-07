# CHRONOS implementation status

Updated 2026-11-07. Contracts: [prd.md](prd.md), [requirements.md](requirements.md), [frontend.md](frontend.md), [core.md](core.md), and [model.md](model.md). This records local evidence, not universal performance or production readiness.

## Current increment

| Status | Scope | Evidence / limits |
| --- | --- | --- |
| [x] Verified Complete | Expanding settlement and varied buildings | Schema 4 supports six districts, 18 functional kinds, persistent additions, reuse/salvage, and up to 512 places. A final-source 180-day seeded run advanced a migrated day-708 world to day 888, 1,024 people, 512 places, all 18 kinds, and 327 measured development outcomes; all 180 daily serialization/resource-conservation checks passed. Demand, supplies, land and declared bounds still constrain growth. |
| [x] Verified Complete | Learning and observability | Bounded contextual policies learn measured delivery and development outcomes. Three paired 120-day seed evaluations completed with 720 daily serialization/conservation checks. Outcomes were mixed: one learned-policy seed had lower wellbeing than baseline; improvement is not guaranteed. |
| [x] Verified Complete | Sky, weather, crossings and river cargo | Sun/Moon use world bearings and horizon constraints; nighttime stars and seasonal terrain are rendered; rain uses short wind-driven drops with ground/water effects. Water channels, bridges, NPC route poses and barge/rescue rendering are covered by focused unit and visual checks. The weather is fictional and does not model real forecasts. |
| [x] Verified Complete | Compatibility and single-file release | Schema 2/3 saves are validated and migrated to schema 4 with a local pre-migration backup. The build emits matching root and `dist/CHRONOS.html` standalone files. |
| [~] Deferred | Advanced institutions and physical simulation | Banking contagion/learned credit pricing, full fluid/rigid-body cargo physics and embodied tax wagons are not implemented. |

## Verification

Windows, Node 22.21.1/npm 10.9.4. `npm.cmd test`: 78 passed, zero failed or skipped (2026-11-07). `npm.cmd run build`: passed, including embedded syntax/license/size checks; standalone HTML is 839,228 bytes and root/dist copies match. SHA-256: `B1FB6EAFCF7077F5C831168E87ACA0F0554A4874D603F9FB197B4825F044C648`. No dependency added or upgraded.

Final-source model growth and paired-policy evidence are described in [model.md](model.md). Maximum-capacity browser samples use explicitly synthetic worlds and do not show that every natural run reaches its limit. Browser/WebGL evidence is from the local in-app Chromium environment; other browsers/devices, extended GPU soak, screen-reader equivalence, forced worker/storage failure, and direct `file://` launch remain unverified. The closed-page simulation uses bounded catch-up, not a hosted service.

The existing public repository is https://github.com/Nikhil-4404/chronos. Personal saves and private QA artifacts are excluded. This is a locally verified game, not a production deployment assessment.
