# EBN Geography | China · Week 3 | 3D

An offline, teacher-controlled 3D teaching application with two simulations for
GCSE Geography (EBN Academy 2, Autumn 2, Week 3, Blue worksheets):

1. **SHENZHEN** — *How did new factories change Shenzhen?* A 3D reconstruction
   that grows from farmland, fishing villages and a small town (1980) into a
   dense modern city (2020), with three teaching moments.
2. **GROUNDWATER** — *How can taking too much water dry up wells?* A geological
   cut-away driven by a water-balance model, where too much pumping lowers the
   water table until the shallow well runs dry.

**House style.** The interface uses the EBN Academy 2 Geography worksheet design so
it sits with the Week 3 resource pack:
- the dark header with the `GEOGRAPHY · AUTUMN 2 · WEEK 3 · 1.3.3 + 3.3.2` breadcrumb
  and stage pills (BLUE lit);
- the blue START HERE / Big question strip;
- the `LESSON 1 · CHINA` and `LESSON 1 · WATER` labels with BLUE 1 and BLUE 2 badges;
- blue "words you need first" panels and yellow key words;
- the teal 3-in-10 box;
- the pink YOUR TASK row, which shows the matching question from the Blue sheet
  with its command word (RECALL, DESCRIBE, EXPLAIN, CONNECT, DEFINE, APPLY).

The font is Aptos (installed with Microsoft 365), falling back to Segoe UI.

---

## Opening it (teacher)

1. Copy **`EBN_Geography_China_Week3_3D.html`** to the classroom PC.
2. Double-click it. It opens in **Google Chrome** or **Microsoft Edge**.
3. That's all: no internet, installation, login or server needed.

It takes a few seconds to build the 3D models (a progress bar shows this).

**Requirements:** a recent Chrome or Edge with hardware graphics acceleration
(WebGL 2). Any ordinary Windows PC from roughly the last eight years should be
fine. If the page says *3D graphics are not available*, open the browser's
*Settings → System* and turn on *Use graphics acceleration when available*, then
restart the browser.

## Controls

| Action | Mouse / button | Key |
|---|---|---|
| Orbit (turn the model) | Left-drag | |
| Pan (slide sideways) | Right-drag | |
| Zoom | Mouse wheel | |
| Fly to a feature | Double-click it | |
| Play / pause | ▶ button | **Space** |
| Reset the current scene and view | Reset buttons | **R** |
| Shenzhen | **1 · SHENZHEN** tab | **1** |
| Groundwater | **2 · GROUNDWATER** tab | **2** |
| Full-screen presentation | **Present** button | **F** (leave with **Esc**) |
| Hide / show the controls | | **H** |

In presentation mode the control strip slides away; move the mouse to the bottom
of the screen to bring it back. If the browser blocks full screen, press **F11**.

### Shenzhen controls
- **Timeline**: drag the slider or press **Play** (1980 → 2020 takes about 20 s).
- **1980** / **2020** buttons: jump to an end. These show the worksheet values,
  *about 330,000 people* and *over 17 million people*. Between the two dates the
  model is an illustration; no in-between population figures are shown.
- **Views**: *Overview*, *A · Factories & jobs*, *B · Migration & homes*,
  *C · Modern Shenzhen*. Choosing a moment flies the camera there and, if needed,
  moves the year forward so there is something to see.

### Groundwater controls
- **Water extraction** slider (LOW → HIGH). The green mark shows where pumping
  equals what rain replaces.
- **Play / pause**, **Reset scenario**, **Reset view**.
- The panel shows rain soaking in vs water pumped out, whether the groundwater
  store is steady, falling or rising, the depth to the water table, and each
  well's status.

## Suggested 3-minute demonstrations

**Shenzhen**
1. Open at 1980. Ask: *"How could a place this size become a huge city?"*
2. Press **Play**. Factories, roads and housing spread.
3. Pause and choose **A · Factories & jobs**: lower taxes, factories, jobs.
4. Choose **B · Migration & homes**: people move for work, more homes needed.
5. Choose **C · Modern Shenzhen**: 330,000 → over 17 million. Ask: *"Why did more
   factories mean more people?"*
6. End with the chain on screen: Factories → Jobs → Migration → Population growth.

**Groundwater**
1. Opens in balance (Stage 1). Ask: *"Where does the water in these wells come from?"*
2. Drag **Water extraction** towards HIGH (Stage 2, *over-abstraction*). Ask:
   *"What happens if we take out water faster than rain replaces it?"*
3. Let it run until Well A (shallow) shows **WELL HAS RUN DRY** (Stage 3, about
   20 s at HIGH). Well B (deep) keeps pumping.
4. End: Too much pumping → Falling water table → Dry well. Drag the slider back to
   LOW to show recovery, or press **Reset scenario**.

The teacher controls the pace throughout; nothing advances automatically except
the timeline/simulation while *Play* is on.

---

## Scientific model (groundwater)

A **conceptual teaching model** of a simple unconfined aquifer. It is not a
calibrated forecast and does not represent northern China, Plachimada or any
real place. No real-world timescale is shown or implied.

| Quantity | Value | Note |
|---|---|---|
| Modelled aquifer area *A* | 1,000 m × 600 m = 600,000 m² | shown with sideways distances squeezed 5× |
| Ground level | 50 m | above the model base |
| Aquifer base (top of clay/rock) | 14 m | low permeability |
| Starting water table | 42 m (8 m below ground) | |
| Specific yield *Sy* | 0.20 | sand and gravel; typical published range ≈ 0.15–0.30 |
| Rainfall / recharge fraction | 0.6 m/yr × 0.2 | recharge *R* ≈ 197 m³/day |
| Hydraulic conductivity *K* | 20 m/day | used only for the local cone |
| Radius of influence *R₀*, well radius *r_w* | 300 m, 0.15 m | |
| Well A (shallow): intake | 35 m (15 m deep) | homes; up to 225 m³/day |
| Well B (deep): intake | 18 m (32 m deep) | farm and factory; up to 675 m³/day |

- **Water balance**, fixed 1-day steps (50 model days per second of playback):
  `ΔS = (R − Q − D)·Δt` with other net outflows `D = 0` (stated assumption).
  `Δh = ΔS / (A × Sy)`.
- Only the recharge fraction of rainfall enters the aquifer. When the water
  table reaches its highest modelled level (2.5 m below ground), surplus recharge
  is rejected.
- **Cones of depression** use the steady-state Dupuit–Thiem approximation for
  an unconfined aquifer, superposed for both wells:
  `h(r)² = H² − Σ Qᵢ/(πK) · ln(R₀/rᵢ)`. The *same formula* draws the water table
  on the rock faces (GPU) and calculates the water level in each well (CPU).
- **Dry wells** depend only on water level, never on a timer. A well's
  sustainable yield is the rate that keeps its pumping water level at the pump
  intake: `Q = πK (H_s² − h_int²) / ln(R₀/r_w)`. Yield falls as the water table
  drops. When the well can supply less than 10% of its demand it stops (**DRY**,
  no flow). It restarts only once it could supply at least 30% (hysteresis), for
  example after pumping is reduced and the water table recovers.
- Long-term behaviour: at HIGH pumping the shallow well runs dry, while the deep
  well's yield eventually falls to match recharge (a new balance at a much lower
  water table).

## Shenzhen model

A **representative reconstruction**, not a digital twin. It shows a Pearl River
Delta–style coastal plain between sea and wooded hills. The city is generated
deterministically, the same every time, from an illustrative development
sequence:

1. The early industrial zone and port near the coast.
2. Then the old town and 1990s housing estates.
3. Then factories spreading inland and urban villages rebuilt upwards.
4. Then 2000s high-rise estates and a commercial centre with landmark-*inspired*
   towers.

This order is a teaching sequence. It does not claim that any specific building
was completed in a particular year.

Features:
- Construction sites (bare earth, then tower cranes and green safety netting)
  appear before finished buildings.
- Roads grow along their length.
- Old village houses are demolished just before new buildings need their space.
  An automated test checks that no two structures ever occupy the same ground at
  the same time.

---

## For developers

```
npm ci                 # install pinned tools (three 0.170.0, TypeScript, esbuild)
npm run build          # → dist/EBN_Geography_China_Week3_3D.html (single file)
npm run test:model     # scientific / state unit tests (Node)
npm run test:e2e       # browser tests on the packaged file (needs Playwright + Chromium)
npm test               # all of the above
```

The build bundles everything into one classic (non-module) script that is
inlined, with the CSS, into a single HTML file. There are no runtime `fetch`
calls, dynamic imports, CDNs, service workers or external files. A
Content-Security-Policy in the page blocks all network connections.

```
src/
  core/        Application, Renderer, CameraController, TimelineController,
               AnimationScheduler (fixed step), PresentationUI, ResourceManager
  shared/      Materials (building shader + lifecycle), GeometryBuilder,
               Lighting (sky/sun), Labels, Water, Performance, Random, Transitions
  scenes/shenzhen/     ShenzhenScene, CityGenerator, BuildingAssets, Terrain, Roads,
                       Factory/Residential/PortDistrict, Vegetation (LOD), Traffic,
                       Migration, UrbanTimeline, ShenzhenData (worksheet facts)
  scenes/groundwater/  GroundwaterScene, AquiferModel, WaterBalance, WellSystem,
                       RainfallSystem, GroundwaterVisuals, GroundwaterSurface, FlowParticles
tests/         model.test.ts (Node), e2e.mjs (Playwright)
build/         build.mjs, template.html, run-unit-tests.mjs
```

See `QUALITY_REPORT.md` for what was tested, and how. See `LICENSES.md` for credits.
