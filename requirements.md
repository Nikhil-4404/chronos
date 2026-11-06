# Living-world acceptance requirements

The user's 2026-11-06 observation-world request supersedes the earlier timeline controls and fixed 12-hour product. These IDs describe the current contract. See status.md for evidence, not this file, for completion claims.

| ID | Required behavior and acceptance |
| --- | --- |
| LIV-01 | One continuously advancing world. Opens directly into the 3D settlement, without play/pause, comparison, rewind or time-scrubber controls. Tick advances through observation panels/dialogs and beyond 720. |
| LIV-02 | Actual demand-led growth. New places reserve timber/stone, require carrier delivery and builder labor, and complete over work shifts. No people means no construction progress. Completed homes create usable capacity. |
| LIV-03 | Meaningful residents. Needs determine eating/rest/care; working hours and jobs produce food, wood, stone and tools. Builders/haulers affect sites; care needs a healer present. Positions follow street routes and bridge crossings. |
| LIV-04 | Generations and conditional population. Newcomers need a vacant completed home and food/wellbeing. Households can have children; children mature; people age and die. Capacity, stocks and population remain bounded and nonnegative. No guarantee of endless positive growth. |
| LIV-05 | Inspect every living subject. Search residents, inspect households/needs/current tasks and follow them. Inspect all places, construction/delivery and inhabitants. Departed residents referenced in journals show a history message rather than a broken inspector. |
| LIV-06 | Visible world changes. Actual snapshots drive articulated walking/work/eating/social poses, smaller children, different building forms and construction stages, roads, repeating day/night and harvest-affecting weather. No prebuilt distant city masquerades as growth. |
| LIV-07 | Witness records. Journal records births, arrivals, deaths, weather and construction; subjects can be located. Population history reflects actual daily counts, retains 90 records; journal retains 80. |
| LIV-08 | Durable local state. Schema-2 export/import continues the same causal world. Strict fields, finite/bounded numbers, size/array/reference checks reject bad data before replacement. Reset/import require confirmation; cancellation preserves the running world. Previous schema-1 saves remain untouched/exportable with an archived compatible game. |
| LIV-09 | Time away. Elapsed wall time advances on return, capped at seven real days. Recovery is batched with progress and backdated checkpoints that preserve unfinished elapsed time on reload. Clock rollback contributes no negative ticks. Closed-page execution is not claimed. |
| LIV-10 | Protect saves. Autosave approximately every ten seconds and on page hide; quota/corruption/other-tab changes do not silently overwrite data. Export remains available without storage. No credentials or external data transmission. |
| LIV-11 | Clean game interface. Full viewport, slate/green/copper textured surfaces, temporary panels, 360° orbit/pan/zoom, Street/Above/frame, HUD hide/return and fullscreen. At 375 px, no document overflow; panels scroll internally and following dismisses the panel. |
| LIV-12 | Accessibility and packaging. Named controls and native dialogs, keyboard observation shortcuts, visible focus, readable guide, reduced ambient motion. DOM lists provide access without picking tiny 3D meshes. Single-file artifact embeds its assets and notices and passes syntax/size checks. Full nonvisual equivalence is not assumed. |

Budgets: 512 people, 256 contiguous preallocated plots, 2 MB import bound, below 1 MB current-game artifact. Recovery batches target 12 ms before yielding; rendering uses bounded instanced capacity. Hardware-dependent timing is observed separately in status.md. No backend, external AI, analytics, new dependency or paid service is required.
