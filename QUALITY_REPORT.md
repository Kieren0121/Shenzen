# Quality report — EBN Geography | China Week 3 | 3D

Version 1.0 · 15 November 2026 · Deliverable `EBN_Geography_China_Week3_3D.html`
(single file, ≈0.7 MB, three.js r170 bundled).

This report separates **what was measured or verified** from **what could not be
verified in the build environment**. Nothing below is an estimate presented as
a measurement.

## 1. What was implemented

**Application.** One HTML file with two resident WebGL scenes, a classroom shell,
mouse and keyboard controls, presentation mode, projected labels and a loading
screen. If WebGL 2 is missing, the page shows an error message instead.

**Simulation A, Shenzhen 1980–2020**
- A continuous coastal terrain: bay and estuary, northern and eastern wooded
  hills, a park hill, and a distant far shore. The ground shader shows rice
  paddies, fish ponds and villages, which turn into construction sites and then
  paved districts as the years pass.
- About 9,900 instanced structures built from 40+ procedural archetypes:
  - village houses, old-town low-rise and 1980s towers;
  - standard multi-storey factories, sawtooth-roof sheds and warehouses with
    loading bays and lorries;
  - 1990s balcony slab estates, high-rise residential towers, urban-village
    blocks and offices;
  - two landmark-inspired supertalls, a mall and a container port with
    ship-to-shore cranes and ships.
- About 31,000 trees with chunked level of detail. Around 1,800 moving vehicles
  appear as roads are built.
- Shader façades: anti-aliased windows, curtain walls, AC units and balconies.
  Buildings under construction rise floor by floor in green safety netting,
  beside tower cranes. Roads grow along their length.
- The timeline plays 1980 → 2020 in 20 s, with pause, scrubbing, 1980/2020
  jumps and replay.
- Worksheet values are shown only at the two endpoints, with an on-screen note
  that the years in between are illustrative.
- Teaching moments A, B and C:
  - camera flights;
  - factory highlight;
  - housing highlight with an illustrative migration flow;
  - population panel;
  - China-wide 3-in-10 fact, labelled *CHINA (WHOLE COUNTRY)*.
- A cause-and-effect chain is shown, and all six required vocabulary terms
  appear.

**Simulation B, groundwater over-abstraction**
- A cut-away block with topsoil, sandy silt, a pebbly sand-and-gravel aquifer
  and a clay/rock base.
- Saturation and the water table are computed per pixel from the model. Water
  is shown in the pore spaces, and a magnifier lens shows dry versus
  water-filled gaps between grains.
- A dashed line marks the starting water table.
- Two wells shown in section: casing, slotted screen, submersible pump, rising
  main, and live water level.
- Surface: homes (Well A), a wheat farm with sprinklers and a factory (Well B),
  pipes, and rain from clouds.
- Flow chevrons: green for infiltration, amber for flow towards the wells, up
  the pump pipe and along surface pipes.
- One WATER EXTRACTION slider with a "rain replaces this much" mark, plus
  Play/Pause, Reset scenario and Reset view.
- Three stages are derived from the model state: *Water is replaced*,
  *Over-abstraction*, *The well runs dry*.

## 2. Automated tests actually run

### 2.1 Scientific and state tests: `npm run test:model` (Node 22), **15 / 15 pass**

| # | Test |
|---|---|
| 1 | Units: recharge rate; storage ↔ level; removing 120,000 m³ lowers the table exactly 1 m (Δh = ΔS / (A·Sy)) |
| 2 | Balanced extraction: 3,650 model days, drift < 0.01 m, Stage 1 |
| 3 | Extraction above recharge lowers the table every step, at exactly (R − Q)/(A·Sy) |
| 4 | Shallow well dries only when its local water level reaches the intake (within 0.3 m); never pumps below the intake; deep well keeps pumping; the same aquifer at a higher level keeps Well A working (so there is no timer) |
| 5 | Reducing extraction lets the table recover and Well A restart |
| 6 | 30,000 days of over-pumping: levels stay in bounds; the deep well never pumps below its intake; extraction settles to equal recharge |
| 7 | Mass balance: ΔS = ΣR − ΣQ (relative error < 10⁻⁶) |
| 8 | Reset restores time, storage, slider and well states exactly |
| 9 | Dupuit–Thiem cone: largest drawdown at the well, zero beyond R₀; sustainable yield gives a pumping level exactly at the intake |
| 10 | Fixed step: 10 s of playback at 30, 60 and 144 fps gives the same model time (±1 day) |
| 11 | Extraction control mapping; the balanced mark sits within the slider |
| 12 | Shenzhen endpoints are exactly the worksheet wording; no population value for 1985–2019 |
| 13 | The China statistic is labelled China-wide; teaching-moment titles match the specification |
| 14 | Timeline: 20 s playback; pause freezes; reset; replay |
| 15 | **No two structures in the city occupy the same ground at the same time, in any year** (every building, house, lorry, container stack, crane and ship; tower cranes excluded) |

Test 15 found real defects during development, which were then fixed:
- overlapping village houses;
- parked lorries overlapping each other;
- a mall placed under a landmark tower;
- a 1980s tower left on a redeveloped plot;
- a latent `Infinity` lifecycle value that becomes NaN on the GPU.

### 2.2 Browser tests on the packaged file: `node tests/e2e.mjs --screens`

Run against `dist/EBN_Geography_China_Week3_3D.html` opened from **file://**,
with `context.setOffline(true)` and every non-file request intercepted and
aborted. Results: see §2.3 (copied from `tests/output/e2e-results.json`).

__E2E_RESULTS__

### 2.3 Visual inspection (real renders, reviewed by eye)

These screenshots were rendered by the real application, not mock-ups, and are
included in the source ZIP under `tests/output/screens/`:

- **Shenzhen at 1920×1080:** 1980 overview, 2000 midpoint, 2020 overview,
  moment A (factories), moment B (housing and migration), moment C (skyline),
  street-level CBD.
- **Groundwater at 1920×1080:** stable, over-abstraction, dry well, dry-well
  close-up, presentation mode.
- **Both scenes at 1366×768, 1536×864 and 1280×720.** The last two match a
  1920×1080 screen at 125% and 150% browser zoom.

Issues found by inspecting renders, and fixed:
- overexposure and haze;
- façade pattern aliasing at mid distance (replaced with box-filtered patterns);
- farmland lost at distance;
- pale disc artefacts on village ground;
- labels hidden under panels (labels now avoid panels and flip below their
  anchor);
- the population panel overlapping the controls;
- the slider marker colliding with "LOW";
- the magnifier lens unreadable on the foreshortened face (moved to the front
  face);
- the "New homes" label anchored in the wrong district;
- missing well, water-table and unsaturated-zone labels.

Each fix was checked by rendering again.

## 3. Environment and performance (honest limits)

- **Test hardware:** a cloud Linux container with **no GPU**. WebGL 2 ran on
  **SwiftShader**, Google's CPU software renderer, in headless Chromium 153.
- **Frame rate:** in this environment the app ran at about 0.3–10 fps depending
  on scene and resolution. That is CPU rasterisation speed, **not** GPU
  performance, so it says nothing about classroom PCs. **The 60 fps / 30 fps
  targets were not measured and remain unverified.**
- **Measured main-thread cost per frame** (median; update, labels and draw-call
  submission, excluding GPU work): **≈3.6 ms in Shenzhen** and **≈1.7 ms in
  Groundwater**. CPU-side work therefore uses a small fraction of a 16.7 ms
  frame.
- **Scene size:**
  - Shenzhen at 2020: ≈1.7 M triangles and about 85 draw calls. Shadows are
    re-rendered only when the year changes (throttled to 12 Hz during
    playback), not every frame.
  - Groundwater: ≈120 k triangles.
- **Memory:** after 40+ scene switches, GPU geometry, texture and shader-program
  counts were unchanged, and the JS heap was ≈36 MB.
- **Load time:** both scenes are built and ready in ≈1.2 s, measured in this
  environment.

**Performance features:**
- instancing and shared materials (one shader program per material type);
- chunked tree level of detail and frustum culling;
- on-demand shadow maps of bounded size (4096 or 2048 depending on GPU);
- adaptive pixel ratio (0.55× to 2×, capped at about 3.7 MP) and fixed-step
  simulation.

## 4. Browser, display and offline conditions

| Condition | Status |
|---|---|
| Chromium (Playwright build) from file://, offline | **Verified** (§2.2) |
| Zero network requests, zero script errors | **Verified** (§2.2); a page Content-Security-Policy also blocks all connections |
| 1920×1080, 1366×768, 1536×864, 1280×720 layouts | **Verified** by screenshots |
| Full-screen API, F / Esc, fallback message | **Verified** in Chromium (headless granted full screen); fallback path is code-reviewed only |
| No-WebGL message | **Verified** (WebGL forced off) |
| **Google Chrome on Windows** | **Not tested (unverified).** The engine is the same Chromium family |
| **Microsoft Edge on Windows** | **Not tested (unverified)** |
| Real classroom GPU, projector and 4K display | **Not tested (unverified)**. The UI scales with viewport height and was checked up to 1920×1080 only |
| Real browser zoom (Ctrl +/−) | Emulated with viewport sizes only |

## 5. Scientific simplifications (also stated on screen and in the README)

- **Groundwater:**
  - one uniform unconfined aquifer (Sy = 0.20) with other net flows = 0;
  - average recharge treated as continuous;
  - surplus recharge rejected when the table is 2.5 m below ground;
  - cones from the steady-state Dupuit–Thiem approximation, applied to the
    current pumping rates;
  - sideways distances are squeezed 5× in the display.
  
  Parameter values are illustrative, not measurements, and no real-world
  timescale is shown.
- **Dry-well rule:** a well yields at most what keeps its pumping level at the
  intake. It stops below 10% of demand and restarts above 30%.
- **Shenzhen:**
  - the layout and development order are a representative teaching sequence,
    not historical records;
  - only the 1980 and 2020 population values are data;
  - the migration routes are explicitly marked as illustrative;
  - the landmark towers are "inspired by" real forms and are not named.

## 6. Asset provenance

All geometry, textures and shaders were written for this project and are
generated in code. There are no external images, models or fonts.
three.js r170 is MIT-licensed. See `LICENSES.md`.

## 7. Acceptance criteria not yet satisfied or not verifiable here

1. Measured frame rate on a mid-range and a low-end Windows school PC
   (60 / 30 fps targets): **not measured**. A 2–3 minute check on the real
   classroom PC is recommended.
2. Testing in branded Chrome and Edge on Windows: **not performed**.
3. Projector legibility from the back of a classroom: typography is sized for
   it (titles ≈44 px and body ≈27 px at 1080p), but this has not been checked
   in a room.
4. The double-click focus targets the terrain and features generally (and the
   wells specifically in Groundwater). It does not identify individual
   buildings in Shenzhen.
