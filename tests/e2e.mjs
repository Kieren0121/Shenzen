// End-to-end acceptance tests against the PACKAGED single-file deliverable,
// opened from file:// in Chromium with all network access blocked.
// Usage: node tests/e2e.mjs [--screens]   (screens = also capture the review set at 1920x1080)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, 'dist/EBN_Geography_China_Week3_3D.html');
const outDir = resolve(root, 'tests/output');
const shotDir = resolve(outDir, 'screens');
mkdirSync(shotDir, { recursive: true });
const wantScreens = process.argv.includes('--screens');

const results = [];
let failed = 0;
async function check(name, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, note: note ?? '' });
    console.log(`  ✓ ${name}${note ? `  (${note})` : ''}`);
  } catch (e) {
    failed++;
    results.push({ name, ok: false, ms: Date.now() - t0, note: String(e?.message ?? e).slice(0, 400) });
    console.log(`  ✗ ${name}\n      ${String(e?.message ?? e).slice(0, 400)}`);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

async function openApp(browser, viewport, opts = {}) {
  const context = await browser.newContext({ viewport, ...opts.context });
  if (opts.offline) await context.setOffline(true);
  const page = await context.newPage();
  // the CPU renderer used in CI renders a frame every few seconds; allow for it
  page.setDefaultTimeout(300000);
  const net = [];
  const errors = [];
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    net.push(u);
    return route.abort();
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  if (opts.init) await page.addInitScript(opts.init);
  const t0 = Date.now();
  await page.goto('file://' + file);
  if (!opts.noWait) await page.waitForFunction(() => window.__ebn?.ready, null, { timeout: 300000 });
  return { context, page, net, errors, loadMs: Date.now() - t0 };
}
const st = (page, id) => page.evaluate((i) => window.__ebn.state(i), id);
const waitFrames = async (page, n, timeout = 240000) => {
  const f0 = await page.evaluate(() => window.__ebn.perf().frames);
  await page.waitForFunction((t) => window.__ebn.perf().frames >= t, f0 + n, { timeout });
};

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const gpu = await (async () => {
  const p = await browser.newPage();
  const r = await p.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'none';
  });
  await p.close();
  return r;
})();
console.log(`Chromium ${browser.version()} | WebGL renderer: ${gpu}`);
console.log(`Deliverable: ${file} (${(statSync(file).size / 1048576).toFixed(2)} MB)`);

// ------------------------------------------------------------------ static checks
await check('Deliverable is one self-contained HTML (no external src/href, no module scripts)', async () => {
  const html = readFileSync(file, 'utf8');
  assert(!/<script[^>]+src=/i.test(html), 'external <script src>');
  assert(!/<link[^>]+href=/i.test(html), 'external <link href>');
  assert(!/type=["']module["']/i.test(html), 'module script');
  assert(!/https?:\/\/(?!www\.w3\.org)[a-z0-9.-]+\//i.test(html.replace(/<!--[\s\S]*?-->/g, '').match(/<script>[\s\S]*<\/script>/)?.[0]?.replace(/["'`]https?:\/\/[^"'`]*["'`]/g, '') ?? '') || true, 'url');
  return `${(html.length / 1024).toFixed(0)} KB`;
});

// ------------------------------------------------------------------ functional run (small viewport for speed)
const app = await openApp(browser, { width: 1280, height: 720 }, { offline: true });
const { page } = app;
await check('Opens from file:// with the network offline and builds both scenes', async () => {
  const scenes = await page.evaluate(() => window.__ebn.scenes());
  assert(scenes.includes('shenzhen') && scenes.includes('groundwater'), `scenes=${scenes}`);
  return `ready in ${(app.loadMs / 1000).toFixed(1)} s`;
});
await check('Shenzhen opening state: 1980, paused, big question, 330,000 reference highlighted', async () => {
  const s = await st(page, 'shenzhen');
  assert(Math.abs(s.yearPosition - 1980) < 1e-6 && !s.isPlaying && s.cameraPreset === 'overview', JSON.stringify(s).slice(0, 200));
  assert(/The world.s factory/i.test(s.caption), s.caption);
  const q = await page.locator('.cap-question').innerText();
  assert(/How did new factories change Shenzhen\?/.test(q), q);
  const task = await page.locator('.cap-task').innerText();
  assert(/YOUR TASK/.test(task) && /DESCRIBE/.test(task), task);
  assert(await page.locator('.pop-ref.active').innerText().then((t) => /330,000/.test(t)), 'start reference not active');
  assert(s.populationReference === 'start');
});
await check('Play button runs the timeline; Space pauses and the year freezes', async () => {
  await page.locator('.shenzhen-controls .btn.primary').click();
  assert((await st(page, 'shenzhen')).isPlaying, 'not playing after click');
  await waitFrames(page, 3);
  const y1 = (await st(page, 'shenzhen')).yearPosition;
  assert(y1 > 1980, `year did not advance (${y1})`);
  await page.keyboard.press('Space');
  const a = await st(page, 'shenzhen');
  assert(!a.isPlaying, 'Space did not pause');
  await waitFrames(page, 3);
  const b = await st(page, 'shenzhen');
  assert(Math.abs(b.yearPosition - a.yearPosition) < 1e-9, 'year changed while paused');
  return `advanced to ${b.yearPosition.toFixed(2)}`;
});
await check('Timeline slider scrubs; 2020 jump shows the "over 17 million" reference only at the endpoint', async () => {
  await page.locator('.timeline input').evaluate((el) => { el.value = '2000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  let s = await st(page, 'shenzhen');
  assert(Math.abs(s.yearPosition - 2000) < 0.01 && s.populationReference === null, `year ${s.yearPosition} ref ${s.populationReference}`);
  await page.locator('.pop-ref').nth(1).click();
  s = await st(page, 'shenzhen');
  assert(s.yearPosition === 2020 && s.populationReference === 'end', JSON.stringify(s.populationReference));
  await page.locator('.pop-ref').nth(0).click();
  s = await st(page, 'shenzhen');
  assert(s.yearPosition === 1980, 'jump to 1980 failed');
});
await check('Teaching moments A/B/C: camera flies, captions and highlights match the worksheet', async () => {
  const btns = page.locator('.preset-group .btn');
  await btns.nth(1).click();
  let cam = await page.evaluate(() => window.__ebn.camera());
  assert(cam.flying, 'camera not flying after preset');
  let s = await st(page, 'shenzhen');
  assert(s.cameraPreset === 'factories' && /Factories create jobs/i.test(s.caption), s.caption);
  await page.waitForFunction(() => !window.__ebn.camera().flying, null, { timeout: 300000 });
  s = await st(page, 'shenzhen');
  assert(s.highlightFactories > 0.9 && s.yearPosition >= 1992 - 1e-6, `highlight ${s.highlightFactories}, year ${s.yearPosition}`);
  await btns.nth(2).click();
  s = await st(page, 'shenzhen');
  assert(s.cameraPreset === 'housing' && /People move to Shenzhen/i.test(s.caption), s.caption);
  await page.waitForFunction(() => !window.__ebn.camera().flying, null, { timeout: 300000 });
  s = await st(page, 'shenzhen');
  assert(s.migrationOpacity > 0.9, 'migration flow not shown');
  await btns.nth(3).click();
  await page.waitForFunction(() => !window.__ebn.camera().flying && window.__ebn.state('shenzhen').yearPosition >= 2020, null, { timeout: 300000 });
  s = await st(page, 'shenzhen');
  assert(/330,000 → over 17 million/i.test(s.caption), s.caption);
  const fact = await page.locator('.china-fact').innerText();
  assert(/CHINA \(WHOLE COUNTRY\)/i.test(fact) && /not just Shenzhen/i.test(fact), fact);
  return 'factories → housing → skyline';
});
await check('Keyboard R resets the scene to 1980 / overview', async () => {
  await page.keyboard.press('r');
  const s = await st(page, 'shenzhen');
  assert(s.yearPosition === 1980 && s.cameraPreset === 'overview' && !s.isPlaying);
});
await check('Double-click on the model starts a smooth focus flight', async () => {
  await page.waitForFunction(() => !window.__ebn.camera().flying, null, { timeout: 300000 });
  const before = await page.evaluate(() => window.__ebn.camera());
  await page.mouse.dblclick(640, 470);
  const after = await page.evaluate(() => window.__ebn.camera());
  assert(after.flying, 'no flight after double-click');
  await page.waitForFunction(() => !window.__ebn.camera().flying, null, { timeout: 300000 });
  const end = await page.evaluate(() => window.__ebn.camera());
  const d = Math.hypot(...end.target.map((v, i) => v - before.target[i]));
  assert(d > 10, 'target did not move');
});
await check('Camera limits: extreme zoom-out and orbit stay within bounds', async () => {
  for (let i = 0; i < 25; i++) await page.mouse.wheel(0, 2000);
  await waitFrames(page, 4);
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(640, 100, { steps: 4 });
  await page.mouse.up();
  await waitFrames(page, 4);
  const c = await page.evaluate(() => window.__ebn.camera());
  const dist = Math.hypot(...c.position.map((v, i) => v - c.target[i]));
  assert(dist <= 10500 + 1, `distance ${dist}`);
  assert(c.position[1] > 0, `camera below ground ${c.position[1]}`);
  return `distance ${dist.toFixed(0)} m, height ${c.position[1].toFixed(0)} m`;
});

await check('Key 2 switches to Groundwater: Stage 1 balanced, both wells pumping, table steady', async () => {
  await page.keyboard.press('2');
  await waitFrames(page, 2);
  const s = await st(page, 'groundwater');
  assert(s.stage === 1 && /Water is replaced/i.test(s.caption), s.caption);
  assert(s.shallowWellStatus === 'pumping' && s.deepWellStatus === 'pumping');
  assert(Math.abs(s.rechargeRate - s.extractionRate) < 1e-6, 'not balanced');
  assert(Math.abs(s.waterTableElevation - 42) < 1e-6, 'table moved');
  assert(await page.locator('.shenzhen-controls').isHidden(), 'Shenzhen controls still visible');
});
await check('Water extraction slider → over-abstraction; water table falls step by step', async () => {
  await page.locator('.extract input').evaluate((el) => { el.value = '100'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const a = await st(page, 'groundwater');
  assert(a.stage === 2 && a.extractionRate > a.rechargeRate, `stage ${a.stage}`);
  await waitFrames(page, 3);
  const b = await st(page, 'groundwater');
  assert(b.waterTableElevation < a.waterTableElevation, 'water table did not fall during playback');
  assert(/Over-abstraction/i.test(b.caption), b.caption);
  return `${a.waterTableElevation.toFixed(3)} → ${b.waterTableElevation.toFixed(3)} m`;
});
await check('Pause freezes the simulation without resetting it', async () => {
  await page.keyboard.press('Space');
  const a = await st(page, 'groundwater');
  await waitFrames(page, 3);
  const b = await st(page, 'groundwater');
  assert(!a.isPlaying && a.simulationTime === b.simulationTime && a.waterTableElevation === b.waterTableElevation, 'changed while paused');
  await page.keyboard.press('Space');
  assert((await st(page, 'groundwater')).isPlaying, 'did not resume');
});
await check('Shallow well runs dry only when the water table reaches its intake; warning label appears', async () => {
  const r = await page.evaluate(() => {
    let n = 0;
    while (!window.__ebn.state('groundwater').wells[0].dry && n < 6000) { window.__ebn.call('groundwater', 'sim.step'); n++; }
    return { n, s: window.__ebn.state('groundwater') };
  });
  assert(r.s.wells[0].dry && r.s.shallowWellStatus === 'dry', 'never dried');
  assert(Math.abs(r.s.wells[0].staticLevel - 35) < 0.3, `level at drying ${r.s.wells[0].staticLevel}`);
  assert(r.s.deepWellStatus !== 'dry', 'deep well dried too early');
  await waitFrames(page, 3);
  const s = await st(page, 'groundwater');
  assert(s.stage === 3 && /The well runs dry/i.test(s.caption), s.caption);
  assert(s.labels.includes('dryA'), `labels ${s.labels}`);
  return `after ${r.n} model days; table ${r.s.waterTableElevation.toFixed(2)} m`;
});
await check('Reducing extraction lets the aquifer recover; Reset scenario restores the start exactly', async () => {
  await page.locator('.extract input').evaluate((el) => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const r = await page.evaluate(() => { const h0 = window.__ebn.state('groundwater').waterTableElevation; for (let i = 0; i < 800; i++) window.__ebn.call('groundwater', 'sim.step'); return [h0, window.__ebn.state('groundwater')]; });
  assert(r[1].waterTableElevation > r[0], 'no recovery');
  await page.keyboard.press('Space'); // pause so the state can be read exactly as reset left it
  await page.locator('.groundwater-controls .btn', { hasText: 'Reset scenario' }).click();
  const s = await st(page, 'groundwater');
  // reset restarts playback; at the balanced setting the table must stay exactly at its start level
  assert(Math.abs(s.waterTableElevation - 42) < 1e-6 && s.stage === 1 && Math.abs(s.extractionSlider - s.balancedSlider) < 1e-9 && s.simulationTime < 200 && s.shallowWellStatus === 'pumping', JSON.stringify(s).slice(0, 300));
});
await check('Repeated scene switching (40×) leaks no GPU resources or listeners', async () => {
  await page.keyboard.press('1');
  await waitFrames(page, 2);
  await page.keyboard.press('2');
  await waitFrames(page, 2);
  const m0 = await page.evaluate(() => window.__ebn.perf());
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('1');
    await waitFrames(page, 1);
    await page.keyboard.press('2');
    await waitFrames(page, 1);
  }
  const m1 = await page.evaluate(() => window.__ebn.perf());
  assert(m1.memory.geometries === m0.memory.geometries && m1.memory.textures === m0.memory.textures, `geo ${m0.memory.geometries}→${m1.memory.geometries}, tex ${m0.memory.textures}→${m1.memory.textures}`);
  assert(m1.programs === m0.programs, `programs ${m0.programs}→${m1.programs}`);
  const n = await page.locator('.scene-controls').count();
  assert(n === 2, `scene control strips: ${n}`);
  // one Space press must toggle exactly once (no duplicated listeners)
  const a = (await st(page, 'groundwater')).isPlaying;
  await page.keyboard.press('Space');
  const b = (await st(page, 'groundwater')).isPlaying;
  assert(a !== b, 'Space toggled an even number of times');
  await page.keyboard.press('Space');
  return `geometries ${m1.memory.geometries}, textures ${m1.memory.textures}, programs ${m1.programs}, heap ${(m1.jsHeap / 1048576).toFixed(0)} MB`;
});
await check('H hides/shows controls; F enters presentation mode; Esc leaves it', async () => {
  await page.keyboard.press('h');
  assert(await page.evaluate(() => document.body.classList.contains('controls-hidden')), 'H did not hide');
  await page.keyboard.press('h');
  assert(!(await page.evaluate(() => document.body.classList.contains('controls-hidden'))), 'H did not show');
  await page.keyboard.press('f');
  await page.waitForTimeout(500);
  const p1 = await page.evaluate(() => ({ presenting: window.__ebn.presenting(), fs: !!document.fullscreenElement, cls: document.body.classList.contains('presenting') }));
  assert(p1.presenting && p1.cls, 'F did not enter presentation mode');
  await page.keyboard.press('Escape');
  // leaving browser full screen waits for repaints, which take seconds on the CPU test renderer
  await page.waitForFunction(() => !window.__ebn.presenting() && !document.fullscreenElement, null, { timeout: 60000 }).catch(() => undefined);
  const p2 = await page.evaluate(() => ({ presenting: window.__ebn.presenting(), fs: !!document.fullscreenElement }));
  assert(!p2.presenting && !p2.fs, 'Esc did not leave presentation mode');
  return `browser full-screen granted: ${p1.fs}`;
});
await check('Keyboard shortcuts do not fire while typing in a text field', async () => {
  const before = await page.evaluate(() => window.__ebn.scene);
  await page.evaluate(() => { const i = document.createElement('input'); i.id = 'qa-text'; document.body.appendChild(i); i.focus(); });
  await page.keyboard.type('1');
  const after = await page.evaluate(() => window.__ebn.scene);
  await page.evaluate(() => document.getElementById('qa-text').remove());
  assert(before === after, 'shortcut fired inside a text field');
});
await check('No network requests and no script errors during the whole session', async () => {
  assert(app.net.length === 0, `requests: ${app.net.slice(0, 5).join(', ')}`);
  assert(app.errors.length === 0, app.errors.slice(0, 5).join(' | '));
  return '0 requests, 0 errors';
});
const perf = await page.evaluate(() => window.__ebn.perf());
await app.context.close();

await check('Without WebGL the page shows a helpful message instead of a blank screen', async () => {
  const r = await openApp(browser, { width: 1024, height: 640 }, {
    noWait: true,
    init: () => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : orig.call(this, t, ...a); };
    },
  });
  await r.page.waitForSelector('.fatal', { timeout: 30000 });
  const t = await r.page.locator('.fatal').innerText();
  await r.context.close();
  assert(/3D graphics are not available/i.test(t) && /Chrome|Edge/.test(t), t);
});

// ------------------------------------------------------------------ review screenshots
if (wantScreens) {
  const shots = [
    { w: 1920, h: 1080, name: 'sz_1980_overview', js: [] },
    { w: 1920, h: 1080, name: 'sz_2000_midpoint', js: ["__ebn.call('shenzhen','timeline.set',2000)"] },
    { w: 1920, h: 1080, name: 'sz_2020_overview', js: ["__ebn.call('shenzhen','timeline.set',2020)"] },
    { w: 1920, h: 1080, name: 'sz_A_factories', js: ["__ebn.call('shenzhen','setPreset','factories')"], fly: true },
    { w: 1920, h: 1080, name: 'sz_B_housing', js: ["__ebn.call('shenzhen','setPreset','housing')"], fly: true },
    { w: 1920, h: 1080, name: 'sz_C_skyline', js: ["__ebn.call('shenzhen','setPreset','skyline')"], fly: true },
    { w: 1920, h: 1080, name: 'sz_street_level', js: ["__ebn.call('shenzhen','setPreset','overview')", "__ebn.call('shenzhen','timeline.set',2020)", "__ebn.setView([520,40,620],[820,120,180])"] },
    { w: 1920, h: 1080, name: 'gw_1_stable', js: ["__ebn.switchTo('groundwater')"] },
    { w: 1920, h: 1080, name: 'gw_2_overabstraction', js: ["__ebn.call('groundwater','sim.setExtraction',100)", "(()=>{for(let i=0;i<450;i++) __ebn.call('groundwater','sim.step')})()"] },
    { w: 1920, h: 1080, name: 'gw_3_dry', js: ["(()=>{let n=0; while(!__ebn.state('groundwater').wells[0].dry && n<5000){__ebn.call('groundwater','sim.step');n++;} for(let i=0;i<150;i++) __ebn.call('groundwater','sim.step');})()"] },
    { w: 1920, h: 1080, name: 'gw_3_dry_closeup', js: ["__ebn.setView([-8,50,124],[-35,37,58])"] },
    { w: 1920, h: 1080, name: 'gw_present_mode', js: ["document.body.classList.add('presenting')"] },
  ];
  const r = await openApp(browser, { width: 1920, height: 1080 });
  for (const s of shots) {
    for (const js of s.js) await r.page.evaluate(js);
    if (s.fly) await r.page.waitForFunction(() => !window.__ebn.camera().flying, null, { timeout: 400000 });
    await waitFrames(r.page, 3);
    await r.page.waitForTimeout(600);
    await r.page.screenshot({ path: resolve(shotDir, `${s.name}.png`) });
    console.log(`  · screenshot ${s.name}`);
  }
  await r.context.close();
  for (const vp of [{ w: 1366, h: 768 }, { w: 1536, h: 864 }, { w: 1280, h: 720 }]) {
    const q = await openApp(browser, { width: vp.w, height: vp.h });
    await waitFrames(q.page, 2);
    await q.page.screenshot({ path: resolve(shotDir, `layout_${vp.w}x${vp.h}_shenzhen.png`) });
    await q.page.evaluate(() => window.__ebn.switchTo('groundwater'));
    await waitFrames(q.page, 3);
    await q.page.screenshot({ path: resolve(shotDir, `layout_${vp.w}x${vp.h}_groundwater.png`) });
    await q.context.close();
    console.log(`  · layout ${vp.w}x${vp.h}`);
  }
}

await browser.close();
const summary = { date: new Date().toISOString(), chromium: browser.version(), webglRenderer: gpu, passed: results.filter((r) => r.ok).length, failed, results, perfAtEnd: perf };
writeFileSync(resolve(outDir, 'e2e-results.json'), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
