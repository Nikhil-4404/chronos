# Living-world rules and invariants

Canonical implementation: src/colony.js. This deterministic simulation is fictional; no trained model, real city data or calibrated prediction is used.

The state is schema 2: seed/PRNG state, absolute tick, logical saved time, resources, people, buildings, recent journal/history, weather and lifetime totals. One tick is ten fictional minutes; two ticks per real second gives 72 seconds per day. There is no final day and no historical-frame cache. Only current state and the next projected visual snapshot are needed.

Twenty-four founders begin in six completed homes alongside a farm, woodland lodge, stone yard, workshop, storehouse and garden. An additional home begins as a site. Plots are allocated outward from the founding neighborhood, excluding the river. Buildings reserve timber and stone at planning. Carriers physically travel to deliver them; builders physically travel to turn delivered materials and tools into progress. Construction runs during work shifts, not from an independent completion timer. Housing pressure and occupation capacity drive what is planned next (maximum two active sites).

Adults are assigned farmer, forester, mason, craftsperson, carrier, healer or builder roles to fill nearby available workplaces. Low food increases the farming share. People choose food, care, working hours, social time and sleep from needs and clock. Paths follow axis-aligned street routes and one of two bridges. Jobs produce bounded stocks; meals consume food; toolmaking consumes wood and stone; tools speed building. Healers must be present for care bonuses. Hunger and exhaustion affect health/productivity. Leisure restores social connection.

Each day ages residents, selects weather, processes deaths, considers births and newcomers, reassigns available work and records actual population. Households pair adults with spare room; births require food, age/capacity and family conditions. Children cannot work until maturity. Adult children can establish households when space is available. Age is a compressed fictional lifecycle counter, not real human years. Death and departure can lower population. Historical parent IDs may reference deceased residents; current partner references are reciprocal and live.

Weather affects farm yield (drought lower, rain higher). Day/night is cyclic and purely visual. Terrain trees, lamps, water and smoke are decorative; building construction and NPC task poses reflect actual state. Building shape is deterministic by stored variant and type. Display offsets separate residents sharing a modeled street node; they do not change resource/route calculations.

Bounds are explicit: 512 living people, 256 places, 80 recent events, 90 daily samples. Capacity and resources constrain expansion; reaching limits does not stop the clock. On total depopulation, favorable migration can repopulate vacant homes if food remains. No political, genetic, ownership, warfare or market-price model is implied.

Persistence validates exact field sets, numeric bounds, unique IDs, valid plots, references, household capacity, reciprocal partners and record ordering. Recovery advances elapsed ticks in small batches. Checkpoints use wall time minus outstanding tick time, preserving recovery work across reloads. A seven-real-day catch-up cap is a deliberate local-computation limit. A continuously operated service would be needed to run while the browser is closed.

Historical compatibility: src/simulation.js retains the schema-1 engine; it is not imported by the living-world app. The prior compatible single-file game is archived separately. Earlier comparison outcomes are not recast as colony history.
