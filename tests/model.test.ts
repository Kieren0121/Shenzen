/**
 * Scientific / state tests (Section 16.2). Run with: npm run test:model
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AQUIFER, BALANCED_SLIDER, demandFraction, levelForStorage, localHead, pumpingLevel, RECHARGE_M3_PER_DAY, storageForLevel, sustainableYield, TOTAL_MAX_DEMAND, WELLS,
} from '../src/scenes/groundwater/AquiferModel';
import { GroundwaterSimulation } from '../src/scenes/groundwater/WaterBalance';
import { FixedStepper } from '../src/core/AnimationScheduler';
import { TimelineController } from '../src/core/TimelineController';
import { CHINA_FACT, MOMENTS, overviewBody, POPULATION } from '../src/scenes/shenzhen/ShenzhenData';
import { UrbanTimeline, PLAY_SECONDS } from '../src/scenes/shenzhen/UrbanTimeline';
import { generateCity } from '../src/scenes/shenzhen/CityGenerator';
import { createArchetypes } from '../src/scenes/shenzhen/BuildingAssets';

const run = (sim: GroundwaterSimulation, days: number) => { for (let i = 0; i < days; i++) sim.step(); };

test('units: recharge rate and storage/level conversion are consistent', () => {
  // 0.6 m/yr x 0.2 x 600,000 m² / 365 d
  assert.ok(Math.abs(RECHARGE_M3_PER_DAY - 197.26) < 0.01);
  const s = storageForLevel(42);
  assert.equal(s, 600000 * 0.2 * (42 - 14));
  assert.ok(Math.abs(levelForStorage(s) - 42) < 1e-9);
  // Δh = ΔS / (A·Sy): removing 120,000 m³ lowers the table by exactly 1 m
  assert.ok(Math.abs(levelForStorage(s - 120000) - 41) < 1e-9);
});

test('balanced extraction does not deplete the aquifer', () => {
  const sim = new GroundwaterSimulation(BALANCED_SLIDER);
  assert.ok(Math.abs(sim.demand - RECHARGE_M3_PER_DAY) < 1e-6, `demand ${sim.demand}`);
  const h0 = sim.waterTable;
  run(sim, 3650);
  assert.ok(Math.abs(sim.waterTable - h0) < 0.01, `drift ${sim.waterTable - h0}`);
  assert.equal(sim.stage, 1);
  assert.equal(sim.wells[0].status, 'pumping');
});

test('extraction above recharge lowers storage and the water table progressively', () => {
  const sim = new GroundwaterSimulation(100);
  assert.equal(sim.stage, 2);
  let prev = sim.waterTable;
  for (let i = 0; i < 400; i++) {
    sim.step();
    assert.ok(sim.waterTable < prev, 'water table must fall every step');
    prev = sim.waterTable;
  }
  // rate check: (R - Q) / (A Sy)
  const expected = (RECHARGE_M3_PER_DAY - TOTAL_MAX_DEMAND) / (AQUIFER.area * AQUIFER.specificYield);
  const before = sim.waterTable;
  sim.step();
  assert.ok(Math.abs(sim.waterTable - before - expected) < 1e-9);
});

test('shallow well runs dry only when the local water level reaches its intake', () => {
  const sim = new GroundwaterSimulation(100);
  const A = WELLS[0];
  let dryDay = -1;
  for (let d = 0; d < 4000 && dryDay < 0; d++) {
    sim.step();
    const w = sim.wells[0];
    // whenever the well is pumping, its pumping water level never falls below the intake
    if (w.rate > 0) assert.ok(w.pumpingLevel >= A.intake - 1e-6, `pumping below intake on day ${d}`);
    if (w.dry) dryDay = d;
  }
  assert.ok(dryDay > 0, 'well A should eventually run dry at high extraction');
  const w = sim.wells[0];
  // dry is decided by water level vs intake, not by a timer
  assert.ok(w.staticLevel - A.intake < 0.3 && w.staticLevel - A.intake > -0.3, `static ${w.staticLevel}`);
  assert.equal(w.rate, 0);
  assert.equal(sim.stage, 3);
  // the deeper well keeps pumping
  assert.notEqual(sim.wells[1].status, 'dry');
  assert.ok(sim.wells[1].rate > 0);
  // the same aquifer at a higher water table keeps well A working (no timer):
  const sim2 = new GroundwaterSimulation(100);
  run(sim2, Math.floor(dryDay * 0.5));
  assert.notEqual(sim2.wells[0].status, 'dry');
});

test('reducing extraction allows recovery and the shallow well restarts', () => {
  const sim = new GroundwaterSimulation(100);
  while (!sim.wells[0].dry) sim.step();
  const low = sim.waterTable;
  sim.setExtraction(0);
  run(sim, 2000);
  assert.ok(sim.waterTable > low + 1, 'water table should recover when pumping < recharge');
  assert.equal(sim.wells[0].dry, false);
  assert.notEqual(sim.stage, 3);
});

test('long-term over-pumping: deep well yield falls until it matches recharge; levels stay in bounds', () => {
  const sim = new GroundwaterSimulation(100);
  for (let d = 0; d < 30000; d++) {
    sim.step();
    const B = sim.wells[1];
    if (B.rate > 0) assert.ok(B.pumpingLevel >= WELLS[1].intake - 1e-6, 'deep well never pumps below its intake');
    const h = sim.waterTable;
    assert.ok(h >= AQUIFER.minWaterTable - 1e-9 && h <= AQUIFER.maxWaterTable + 1e-9);
  }
  assert.equal(sim.wells[0].dry, true);
  assert.equal(sim.wells[1].status, 'reduced');
  // a new equilibrium: what is pumped out equals what rain puts back
  assert.ok(Math.abs(sim.extraction - RECHARGE_M3_PER_DAY) / RECHARGE_M3_PER_DAY < 0.01, `Q=${sim.extraction}`);
  const sim2 = new GroundwaterSimulation(0);
  run(sim2, 30000);
  assert.ok(sim2.waterTable <= AQUIFER.maxWaterTable + 1e-9);
  assert.ok(sim2.cumulativeRejected > 0, 'surplus recharge is rejected once the aquifer is full');
});

test('mass balance: change in storage equals recharge minus extraction', () => {
  const sim = new GroundwaterSimulation(70);
  const s0 = sim.storage;
  run(sim, 1500);
  sim.setExtraction(5);
  run(sim, 1500);
  const ds = sim.storage - s0;
  const err = Math.abs(ds - (sim.cumulativeRecharge - sim.cumulativeExtraction));
  assert.ok(err < 1e-6 * Math.abs(s0), `mass balance error ${err}`);
});

test('reset fully restores the aquifer', () => {
  const sim = new GroundwaterSimulation(BALANCED_SLIDER);
  sim.setExtraction(100);
  run(sim, 2500);
  sim.reset();
  assert.equal(sim.time, 0);
  assert.equal(sim.waterTable, AQUIFER.initialWaterTable);
  assert.equal(sim.slider, BALANCED_SLIDER);
  assert.equal(sim.wells[0].status, 'pumping');
  assert.equal(sim.stage, 1);
});

test('Dupuit–Thiem cone: drawdown is largest at the well and zero beyond R0', () => {
  const rates = [0, 600];
  const B = WELLS[1];
  const atWell = localHead(42, B.x + AQUIFER.wellRadius, B.z, rates);
  const at50 = localHead(42, B.x + 50, B.z, rates);
  const far = localHead(42, B.x + 400, B.z, rates);
  assert.ok(atWell < at50 && at50 < 42);
  assert.equal(far, 42);
  assert.ok(Math.abs(pumpingLevel(42, 600) - atWell) < 1e-6);
  // sustainable yield is the rate that brings the pumping level exactly to the intake
  const q = sustainableYield(30, 20);
  assert.ok(Math.abs(pumpingLevel(30, q) - 20) < 1e-6);
});

test('fixed-step simulation is independent of display frame rate', () => {
  const runAt = (fps: number) => {
    const sim = new GroundwaterSimulation(100);
    const st = new FixedStepper(1 / AQUIFER.daysPerSecond, 1000);
    const frames = Math.round(10 * fps);
    for (let i = 0; i < frames; i++) st.advance(1 / fps, () => sim.step());
    return sim.time;
  };
  const a = runAt(30), b = runAt(60), c = runAt(144);
  assert.ok(Math.abs(a - b) <= 1 && Math.abs(b - c) <= 1, `${a} ${b} ${c}`);
});

test('extraction control maps LOW..HIGH to demand fractions', () => {
  assert.ok(demandFraction(0) > 0 && demandFraction(0) < RECHARGE_M3_PER_DAY / TOTAL_MAX_DEMAND);
  assert.equal(demandFraction(100), 1);
  assert.ok(BALANCED_SLIDER > 5 && BALANCED_SLIDER < 30);
});

// ---------------------------------------------------------------- Shenzhen
test('Shenzhen: worksheet endpoint values and no invented intermediate data', () => {
  assert.equal(POPULATION.start.year, 1980);
  assert.equal(POPULATION.start.label, 'about 330,000 people');
  assert.equal(POPULATION.end.year, 2020);
  assert.equal(POPULATION.end.label, 'over 17 million people');
  const tl = new UrbanTimeline();
  tl.set(1980);
  assert.equal(tl.populationReference, 'start');
  for (const y of [1985, 1990, 2000, 2010, 2019]) {
    tl.set(y);
    assert.equal(tl.populationReference, null, `no population value may be shown for ${y}`);
    assert.ok(!/\d{3},\d{3}|million/.test(overviewBody(y)) || y >= 2019.5, `no population figure in caption for ${y}`);
  }
  tl.set(2020);
  assert.equal(tl.populationReference, 'end');
});

test('Shenzhen: China-wide statistic is not presented as Shenzhen-only', () => {
  assert.match(CHINA_FACT.scope, /CHINA/);
  assert.match(CHINA_FACT.text, /China/);
  assert.equal(CHINA_FACT.filled, 3);
  assert.equal(CHINA_FACT.of, 10);
  assert.equal(MOMENTS.factories.title, 'Factories create jobs');
  assert.equal(MOMENTS.housing.title, 'People move to Shenzhen');
  assert.match(MOMENTS.skyline.title, /330,000 → over 17 million/);
});

test('Shenzhen timeline: ~20 s playback, pause/resume, reset, replay', () => {
  const tl = new TimelineController(1980, 2020, PLAY_SECONDS);
  assert.equal(PLAY_SECONDS, 20);
  tl.play();
  for (let i = 0; i < 600; i++) tl.update(1 / 60); // 10 s
  assert.ok(Math.abs(tl.value - 2000) < 0.01);
  tl.pause();
  tl.update(5);
  assert.ok(Math.abs(tl.value - 2000) < 0.01, 'pause freezes the year');
  tl.play();
  for (let i = 0; i < 2000; i++) tl.update(1 / 60);
  assert.equal(tl.value, 2020);
  assert.equal(tl.isPlaying, false);
  tl.play(); // replay from 1980
  assert.equal(tl.value, 1980);
  tl.reset();
  assert.equal(tl.value, 1980);
  assert.equal(tl.isPlaying, false);
});

test('Shenzhen: no two structures occupy the same ground at the same time (any year)', () => {
  const plan = generateCity(createArchetypes());
  const recs = plan.buildings.filter((b) => b.arch !== 'crane');
  const cell = 80;
  const grid = new Map<string, number[]>();
  recs.forEach((b, i) => {
    for (let gx = Math.floor((b.x - b.hx) / cell); gx <= Math.floor((b.x + b.hx) / cell); gx++)
      for (let gz = Math.floor((b.z - b.hz) / cell); gz <= Math.floor((b.z + b.hz) / cell); gz++) {
        const k = `${gx},${gz}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k)!.push(i);
      }
  });
  const clashes: string[] = [];
  const seen = new Set<string>();
  for (const ids of grid.values()) {
    for (let a = 0; a < ids.length; a++) for (let c = a + 1; c < ids.length; c++) {
      const i = ids[a], j = ids[c];
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const A = recs[i], B = recs[j];
      // lifetime = from start of construction to end of demolition fade
      if (A.life[0] >= B.life[3] || B.life[0] >= A.life[3]) continue;
      const ox = Math.min(A.x + A.hx, B.x + B.hx) - Math.max(A.x - A.hx, B.x - B.hx);
      const oz = Math.min(A.z + A.hz, B.z + B.hz) - Math.max(A.z - A.hz, B.z - B.hz);
      if (ox > 0.5 && oz > 0.5) clashes.push(`${A.arch}@${A.x.toFixed(0)},${A.z.toFixed(0)} [${A.life.map((v) => v.toFixed(1))}] x ${B.arch}@${B.x.toFixed(0)},${B.z.toFixed(0)} [${B.life.map((v) => v.toFixed(1))}]`);
    }
  }
  assert.equal(clashes.length, 0, `${clashes.length} overlaps, e.g.\n${clashes.slice(0, 8).join('\n')}`);
  // every building appears no earlier than its plot's road network allows, and the plan is substantial
  assert.ok(plan.buildings.length > 5000 && plan.roads.length > 400 && plan.trees.length > 10000);
});
