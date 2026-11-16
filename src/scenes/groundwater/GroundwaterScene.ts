import * as THREE from 'three';
import { FixedStepper } from '../../core/AnimationScheduler';
import type { CameraLimits, CameraView } from '../../core/CameraController';
import { dom, KeyWord } from '../../core/PresentationUI';
import { ResourceManager } from '../../core/ResourceManager';
import type { SceneContext, TeachingScene } from '../../core/SceneTypes';
import { LabelLayer } from '../../shared/Labels';
import { createSkyEnvironment, createSunRig, SkyEnvironment } from '../../shared/Lighting';
import { createSharedUniforms, SharedUniforms } from '../../shared/Materials';
import { Rng } from '../../shared/Random';
import {
  AQUIFER, BALANCED_SLIDER, coneCoefficient, DISPLAY, localHead, RECHARGE_M3_PER_DAY, TOTAL_MAX_DEMAND, WELLS,
} from './AquiferModel';
import { FlowParticles } from './FlowParticles';
import { GroundwaterSurface } from './GroundwaterSurface';
import {
  AquiferUniforms, BLOCK, createAquiferUniforms, createBackdrop, createCutFaces, createPlinth, createStrataMaterial, createTopSurface, surfaceHeight, wellDisplay,
} from './GroundwaterVisuals';
import { RainfallSystem } from './RainfallSystem';
import { GroundwaterSimulation, WellStatus } from './WaterBalance';
import { PUMP_Z, WellSystem } from './WellSystem';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const FRONT = 60.35;

const WORDS: Record<string, KeyWord> = {
  groundwater: { term: 'groundwater', def: 'water stored under the ground' },
  well: { term: 'well', def: 'a deep hole reaching groundwater' },
  pump: { term: 'pump', def: 'a machine that pulls water up' },
  waterTable: { term: 'water table', def: 'the top of the water stored under the ground', key: true },
  over: { term: 'over-abstraction', def: 'taking out more water than rain replaces', key: true },
};

const STAGES = {
  1: { step: 'STAGE 1 · BALANCED', title: 'Water is replaced', body: 'Rain helps replace the water taken from underground.', tone: 'water' as const, words: [WORDS.groundwater, WORDS.waterTable],
    task: { n: '1', q: 'Where is groundwater stored?', start: 'Start: Groundwater is stored …', cmd: 'RECALL' } },
  2: { step: 'STAGE 2 · TOO MUCH PUMPING', title: 'Over-abstraction', body: 'More water is taken out than is replaced.', tone: 'pump' as const, words: [WORDS.over, WORDS.pump],
    task: { n: '3', q: 'What does over-abstraction mean?', start: 'Start: It means taking out more water than …', cmd: 'DEFINE' } },
  3: { step: 'STAGE 3 · THE WELL RUNS DRY', title: 'The well runs dry', body: 'The water table has fallen below the well.', tone: 'warn' as const, words: [WORDS.waterTable, WORDS.well],
    task: { n: '4', q: 'Explain why a well can become dry.', start: 'Start: When too much water is pumped out, … so …', cmd: 'EXPLAIN' } },
};

const CHAIN = ['Rain soaks into the ground', 'Groundwater is stored underground', 'Pumps take water out', 'Too much pumping', 'The water table falls', 'The shallow well runs dry'];

type PType = 'infil' | 'aq' | 'riser' | 'pipe' | 'spray';
interface PState {
  type: PType;
  i: number; // well / route / sprinkler / face index
  u: number; // position along the face (infiltration)
  t: number;
  sx: number; sy: number; ex: number; ey: number;
  speed: number;
  seed: number;
}

export class GroundwaterScene implements TeachingScene {
  readonly id = 'groundwater' as const;
  readonly title = 'Groundwater';
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.5, 8000);
  readonly limits: CameraLimits = {
    minDistance: 28,
    maxDistance: 560,
    minPolar: 0.15,
    maxPolar: 1.53,
    targetMin: V(-120, -2, -80),
    targetMax: V(120, 90, 80),
    ground: () => 1.5,
    minClearance: 0,
  };
  readonly openingView: CameraView = { position: V(112, 84, 196), target: V(-16, 25, 6) };

  readonly sim = new GroundwaterSimulation(BALANCED_SLIDER);
  private stepper = new FixedStepper(AQUIFER.stepDays / AQUIFER.daysPerSecond, 20);
  private prevH: number = AQUIFER.initialWaterTable;
  private displayH: number = AQUIFER.initialWaterTable;
  private ctx!: SceneContext;
  private shared: SharedUniforms = createSharedUniforms();
  private au: AquiferUniforms = createAquiferUniforms();
  private wet = { value: 0.6 };
  private res = new ResourceManager();
  private sky!: SkyEnvironment;
  private wells!: WellSystem;
  private rain!: RainfallSystem;
  private surface!: GroundwaterSurface;
  private flow!: FlowParticles;
  private parts: PState[] = [];
  private labels!: LabelLayer;
  private rng = new Rng(31);
  private colGreen = new THREE.Color(0.35, 1.0, 0.45);
  private colAmber = new THREE.Color(1.0, 0.68, 0.1);
  private colSpray = new THREE.Color(0.75, 0.92, 1.0);
  private resumeOnActivate = true;
  private flowClock = 0;

  // UI
  private controlsEl!: HTMLDivElement;
  private panelEl!: HTMLDivElement;
  private chainEl!: HTMLDivElement;
  private playBtn!: HTMLButtonElement;
  private slider!: HTMLInputElement;
  private barIn!: HTMLElement;
  private barOut!: HTMLElement;
  private storeEl!: HTMLElement;
  private depthEl!: HTMLElement;
  private wellChips: HTMLElement[] = [];
  private chainSteps: HTMLElement[] = [];
  private lastPanelKey = '';

  async build(ctx: SceneContext, progress: (p: number, label: string) => Promise<void>): Promise<void> {
    this.ctx = ctx;
    await progress(0.1, 'Groundwater: light');
    this.sky = createSkyEnvironment(ctx.renderer, { elevation: 48, azimuth: 35, turbidity: 9, rayleigh: 2.2, mieCoefficient: 0.008, mieDirectionalG: 0.8 });
    this.res.track(this.sky);
    this.scene.environment = this.sky.environment;
    this.scene.environmentIntensity = 0.55;
    this.scene.add(createBackdrop());
    this.scene.fog = new THREE.Fog(new THREE.Color(0.22, 0.25, 0.29), 700, 2600);
    const rig = createSunRig(this.scene, new THREE.Vector3(0.38, 0.82, 0.52).normalize(), 400, 150, Math.min(ctx.shadowMapSize, 2048), 3.0);
    rig.sun.shadow.normalBias = 0.08;
    rig.sun.shadow.bias = -0.0005;
    rig.hemi.intensity = 0.45;

    await progress(0.35, 'Groundwater: rock layers');
    const strata = createStrataMaterial(this.au);
    this.scene.add(createCutFaces(strata));
    this.scene.add(createTopSurface(this.wet));
    this.scene.add(createPlinth());

    await progress(0.55, 'Groundwater: wells and pumps');
    this.wells = new WellSystem();
    this.scene.add(this.wells.group);

    await progress(0.7, 'Groundwater: homes, farm and factory');
    this.surface = new GroundwaterSurface(this.shared);
    this.scene.add(this.surface.group);
    this.rain = new RainfallSystem();
    this.scene.add(this.rain.group);
    this.flow = new FlowParticles(300);
    this.scene.add(this.flow.points);
    this.initParticles();
    this.res.trackObject(this.scene);

    await progress(0.9, 'Groundwater: labels and controls');
    this.buildLabels();
    this.buildUI();
    this.syncUniforms(1);
    this.deactivate();
    this.resumeOnActivate = true;
    await progress(1, 'Groundwater ready');
  }

  // ------------------------------------------------------------- particles
  private initParticles(): void {
    const add = (type: PType, i: number, n: number) => {
      for (let k = 0; k < n; k++) this.parts.push({ type, i, u: 0, t: this.rng.next(), sx: 0, sy: 0, ex: 0, ey: 0, speed: 1, seed: this.rng.next() });
    };
    add('infil', 0, 30);
    add('infil', 1, 16);
    add('aq', 0, 18);
    add('aq', 1, 24);
    add('riser', 0, 8);
    add('riser', 1, 9);
    this.surface.routes.forEach((r, i) => add('pipe', i, Math.max(4, Math.round(r.share * 26))));
    this.surface.sprinklers.forEach((_, i) => add('spray', i, 14));
    for (const p of this.parts) this.respawn(p, true);
  }

  private respawn(p: PState, initial = false): void {
    const r = this.rng;
    if (!initial) p.t = 0;
    if (p.type === 'infil') {
      if (p.i === 0) {
        let u = 0;
        do u = r.range(BLOCK.x0 + 3, BLOCK.x1 - 3);
        while (WELLS.some((_, w) => Math.abs(u - wellDisplay(w).x) < 4.5) || Math.abs(u - 76) < 10);
        p.u = u;
      } else {
        let u = 0;
        p.u = r.range(BLOCK.z0 + 3, BLOCK.z1 - 3);
      }
      p.speed = r.range(3.2, 4.6);
    } else if (p.type === 'aq') {
      const wd = wellDisplay(p.i);
      const def = WELLS[p.i];
      const side = r.chance(0.5) ? -1 : 1;
      const hLocal = this.headDisplay(wd.x + side * 20, 60);
      p.sx = wd.x + side * r.range(7, p.i === 1 && side > 0 ? 22 : 52); // keep clear of the close-up lens
      const yTop = Math.min(hLocal - 0.7, def.screenTop + 9);
      const yBot = Math.max(AQUIFER.baseElevation + 1.2, def.screenBottom - 7);
      p.sy = yBot < yTop ? r.range(yBot, yTop) : def.intake;
      p.ex = wd.x + side * 1.4;
      p.ey = r.range(def.screenBottom + 0.3, def.screenTop - 0.3);
      p.speed = r.range(5, 7);
    } else if (p.type === 'riser') {
      p.speed = r.range(6, 8);
    } else if (p.type === 'pipe') {
      p.speed = r.range(8, 11);
    } else {
      p.u = r.range(0, Math.PI * 2);
      p.speed = r.range(0.6, 0.9);
    }
  }

  private headDisplay(x: number, z: number): number {
    return localHead(this.displayH, x * DISPLAY.horizontalScale, z * DISPLAY.horizontalScale, this.sim.rates);
  }

  private updateParticles(dt: number): void {
    const f = this.flow;
    const states = this.sim.wells;
    this.parts.forEach((p, idx) => {
      if (p.type === 'infil') {
        const x = p.i === 0 ? p.u : BLOCK.x1 + 0.35;
        const z = p.i === 0 ? FRONT : p.u;
        const top = surfaceHeight(x, p.i === 0 ? 60 : z) - 0.7;
        const bottom = this.headDisplay(x, p.i === 0 ? 60 : z) + 0.4;
        const range = Math.max(1, top - bottom);
        p.t += (dt * p.speed) / range;
        if (p.t >= 1) this.respawn(p);
        const y = top - p.t * range;
        const a = Math.min(1, p.t / 0.08) * Math.min(1, (1 - p.t) / 0.15);
        if (p.i === 0) f.set(idx, x, y, z, 0, -1, 0, this.colGreen, a * 0.95, 2.7, true);
        else f.set(idx, x, y, z, 0, -1, 0, this.colGreen, a * 0.95, 2.7, true);
        return;
      }
      if (p.type === 'aq' || p.type === 'riser') {
        const s = states[p.i];
        const frac = s.rate / WELLS[p.i].maxDemand;
        if (s.rate <= 0) {
          f.hide(idx);
          return;
        }
        const sp = p.speed * (0.45 + 0.75 * frac);
        if (p.type === 'aq') {
          const len = Math.hypot(p.ex - p.sx, p.ey - p.sy);
          p.t += (dt * sp) / Math.max(1, len);
          if (p.t >= 1) this.respawn(p);
          const x = p.sx + (p.ex - p.sx) * p.t, y = p.sy + (p.ey - p.sy) * p.t;
          const a = Math.min(1, p.t / 0.1) * Math.min(1, (1 - p.t) / 0.1) * (0.45 + 0.55 * Math.min(1, frac * 1.3));
          f.set(idx, x, y, FRONT, p.ex - p.sx, p.ey - p.sy, 0, this.colAmber, a, 2.6, true);
        } else {
          const v = this.wells.wells[p.i];
          const y0 = v.pumpTop, y1 = v.surface + 1.4;
          p.t += (dt * sp) / (y1 - y0);
          if (p.t >= 1) this.respawn(p);
          const a = Math.min(1, p.t / 0.08) * Math.min(1, (1 - p.t) / 0.08);
          f.set(idx, v.x, y0 + (y1 - y0) * p.t, PUMP_Z + 0.75, 0, 1, 0, this.colAmber, a, 2.0, true);
        }
        return;
      }
      if (p.type === 'pipe') {
        const route = this.surface.routes[p.i];
        const s = states[route.well];
        if (s.rate <= 0) {
          f.hide(idx);
          return;
        }
        const frac = s.rate / WELLS[route.well].maxDemand;
        const pts = route.points;
        let total = 0;
        for (let k = 1; k < pts.length; k++) total += pts[k].distanceTo(pts[k - 1]);
        p.t += (dt * p.speed * (0.45 + 0.75 * frac)) / total;
        if (p.t >= 1) this.respawn(p);
        let d = p.t * total;
        let k = 1;
        while (k < pts.length - 1 && d > pts[k].distanceTo(pts[k - 1])) {
          d -= pts[k].distanceTo(pts[k - 1]);
          k++;
        }
        const a0 = pts[k - 1], a1 = pts[k];
        const seg = a1.distanceTo(a0);
        const tt = Math.min(1, d / Math.max(seg, 1e-3));
        const a = Math.min(1, p.t / 0.05) * Math.min(1, (1 - p.t) / 0.08);
        f.set(idx, a0.x + (a1.x - a0.x) * tt, a0.y + 0.9, a0.z + (a1.z - a0.z) * tt, a1.x - a0.x, a1.y - a0.y, a1.z - a0.z, this.colAmber, a, 2.0, true);
        return;
      }
      // sprinkler spray: droplets on ballistic arcs, amount follows Well B's pumping
      const s = states[1];
      const frac = s.rate / WELLS[1].maxDemand;
      if (s.rate <= 0) {
        f.hide(idx);
        return;
      }
      p.t += dt * p.speed;
      if (p.t >= 1) this.respawn(p);
      const head = this.surface.sprinklers[p.i];
      const reach = 4 + 7 * frac;
      const x = head.x + Math.cos(p.u) * reach * p.t;
      const z = head.z + Math.sin(p.u) * reach * p.t;
      const y = head.y + 4.5 * p.t - 5.5 * p.t * p.t;
      f.set(idx, x, y, z, 0, 0, 0, this.colSpray, (1 - p.t) * 0.85, 0.75, false);
    });
  }

  // ------------------------------------------------------------- labels
  private buildLabels(): void {
    this.labels = new LabelLayer(this.ctx.ui.overlay);
    this.labels.setExclusions(() => this.ctx.ui.occupiedRects());
    const R = BLOCK.x1 + 0.4;
    const s = this.sim;
    const A = wellDisplay(0), B = wellDisplay(1);
    const L = this.labels;
    L.add({ id: 'rain', text: 'Rain soaks in', sub: 'some rain becomes groundwater', kind: 'green', anchor: () => V(-6, surfaceHeight(-6, 60) - 3.2, FRONT), priority: 7, stem: 36 });
    L.add({ id: 'unsat', text: 'Unsaturated zone', sub: 'air in the gaps', kind: 'muted', anchor: () => V(-84, (surfaceHeight(-84, 60) - 1.5 + this.headDisplay(-84, 60)) / 2, FRONT), priority: 8, stem: 26 });
    L.add({ id: 'wt', text: 'Water table', kind: 'water', anchor: () => V(57, this.headDisplay(57, 60), FRONT), priority: 9, stem: 30 });
    L.add({ id: 'gw', text: 'Groundwater', sub: 'water fills the gaps (saturated zone)', kind: 'water', anchor: () => V(14, (this.headDisplay(14, 60) + AQUIFER.baseElevation) / 2 - 2, FRONT), priority: 8, stem: 26 });
    L.add({ id: 'rock', text: 'Clay and rock', sub: 'water cannot soak through', kind: 'muted', anchor: () => V(-14, 6, FRONT), priority: 4, stem: 22 });
    L.add({ id: 'lens', text: 'Close-up', sub: 'water in the gaps between grains', kind: 'water', anchor: () => V(76, 38.5 + 8.7, FRONT), priority: 6, stem: 16 });
    L.add({ id: 'start', text: 'Water table at the start', kind: 'muted', anchor: () => V(R, AQUIFER.initialWaterTable, -20), visible: () => this.displayH < AQUIFER.initialWaterTable - 0.8, priority: 5, stem: 18 });
    L.add({ id: 'wellA', text: 'Well A', sub: 'shallow · 15 m deep', anchor: () => V(A.x, surfaceHeight(A.x, 60) + 4, 58.5), priority: 8, stem: 30 });
    L.add({ id: 'wellB', text: 'Well B', sub: 'deep · 32 m deep', anchor: () => V(B.x, surfaceHeight(B.x, 60) + 4, 58.5), priority: 8, stem: 30 });
    L.add({ id: 'pump', text: 'Pump', sub: 'pulls water up', kind: 'pump', anchor: () => V(B.x, WELLS[1].intake + 1.2, FRONT), visible: () => s.wells[1].rate > 0, priority: 7, stem: 24 });
    L.add({ id: 'dryA', text: 'WELL HAS RUN DRY', sub: 'Well A: water table below the pump', kind: 'warn', anchor: () => V(A.x, WELLS[0].intake + 1.0, FRONT), visible: () => s.wells[0].dry, priority: 20, stem: 46 });
    L.add({ id: 'dryB', text: 'WELL HAS RUN DRY', kind: 'warn', anchor: () => V(B.x, WELLS[1].intake + 1.0, FRONT), visible: () => s.wells[1].dry, priority: 19, stem: 40 });
    L.add({ id: 'homes', text: 'Homes', kind: 'muted', anchor: () => this.surface.anchors.homes, priority: 3 });
    L.add({ id: 'farm', text: 'Farm', sub: 'wheat fields', kind: 'muted', anchor: () => this.surface.anchors.farm, priority: 3 });
    L.add({ id: 'factory', text: 'Factory', kind: 'muted', anchor: () => this.surface.anchors.factory, priority: 3 });
    L.setVisible(false);
  }

  // ------------------------------------------------------------------ UI
  private buildUI(): void {
    const { el, button } = dom;
    const ui = this.ctx.ui;
    this.controlsEl = el('div', 'scene-controls groundwater-controls');
    this.playBtn = button('', { cls: 'primary', title: 'Play / pause (Space)', onClick: () => this.togglePlay() });
    const wrap = el('div', 'extract-wrap');
    const lab = el('div', 'ctl-label');
    lab.innerHTML = 'Water<br>extraction';
    const ex = el('div', 'extract');
    this.slider = el('input');
    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.max = '100';
    this.slider.step = '0.5';
    this.slider.value = String(BALANCED_SLIDER);
    this.slider.setAttribute('aria-label', 'Water extraction');
    const b = BALANCED_SLIDER;
    this.slider.style.setProperty('--track', `linear-gradient(90deg, rgba(102,211,110,0.75) 0%, rgba(102,211,110,0.75) ${b}%, rgba(255,176,32,0.85) ${b}%, rgba(255,90,50,0.95) 100%)`);
    this.slider.addEventListener('input', () => this.sim.setExtraction(parseFloat(this.slider.value)));
    const marks = el('div', 'extract-marks');
    const bal = el('span', 'bal', 'rain replaces this much');
    bal.style.left = `${b}%`;
    marks.appendChild(bal);
    const scale = el('div', 'extract-scale');
    scale.append(el('span', 'lo', 'LOW'), el('span', 'hi', 'HIGH'));
    ex.append(marks, this.slider, scale);
    wrap.append(lab, ex);
    this.controlsEl.append(
      this.playBtn,
      el('div', 'ctl-sep'),
      wrap,
      el('div', 'ctl-sep'),
      button('<span class="ico">⟲</span><span>Reset scenario</span>', { title: 'Start again with balanced pumping (R)', onClick: () => this.resetScenario() }),
      button('<span class="ico">⌖</span><span>Reset view</span>', { cls: 'ghost', title: 'Return to the opening view', onClick: () => this.ctx.flyTo(this.openingView, 2.0) }),
    );
    ui.controlsHost.appendChild(this.controlsEl);

    // water balance panel
    this.panelEl = el('div', 'scene-panel panel');
    this.panelEl.append(el('div', 'panel-title', 'Water balance (model)'));
    const row = (label: string, cls: string) => {
      const r = el('div', 'balance-row');
      const track = el('div', 'bar-track');
      const fill = el('div', `bar-fill ${cls}`);
      track.appendChild(fill);
      r.append(el('span', '', label), track);
      this.panelEl.appendChild(r);
      return fill;
    };
    this.barIn = row('Rain soaking in', 'in');
    this.barOut = row('Pumped out', 'out');
    this.storeEl = el('div', 'store-state steady', '');
    this.depthEl = el('div', 'wt-depth', '');
    this.panelEl.append(this.storeEl, this.depthEl);
    WELLS.forEach((w, i) => {
      const r = el('div', 'well-row');
      r.append(el('span', '', i === 0 ? 'Well A · shallow' : 'Well B · deep'));
      const chip = el('span', 'well-status ok', 'PUMPING');
      r.appendChild(chip);
      this.wellChips.push(chip);
      this.panelEl.appendChild(r);
    });
    this.panelEl.append(el('div', 'panel-note', 'A simple teaching model, not a forecast for any real place. Sideways distances are squeezed to fit.'));
    ui.panelHost.appendChild(this.panelEl);

    this.chainEl = el('div', 'scene-chain chain');
    this.chainEl.append(el('div', 'chain-title', 'Cause and effect'));
    CHAIN.forEach((c, i) => {
      const s = el('div', 'chain-step');
      s.append(el('span', 'dot'), el('span', '', c));
      this.chainEl.appendChild(s);
      this.chainSteps.push(s);
      if (i < CHAIN.length - 1) this.chainEl.appendChild(el('div', 'chain-arrow', '↓'));
    });
    ui.chainHost.appendChild(this.chainEl);
    this.updatePlayButton();
  }

  private updatePlayButton(): void {
    const p = this.sim.isPlaying;
    this.playBtn.innerHTML = `<span class="ico">${p ? '❚❚' : '▶'}</span><span class="lbl">${p ? 'Pause' : 'Play'}</span><kbd>Space</kbd>`;
  }

  togglePlay(): void {
    this.sim.isPlaying = !this.sim.isPlaying;
    this.updatePlayButton();
  }

  resetScenario(): void {
    this.sim.reset();
    this.stepper.reset();
    this.prevH = this.displayH = this.sim.waterTable;
    this.slider.value = String(this.sim.slider);
    this.updatePlayButton();
    this.syncUniforms(1);
  }

  activate(): void {
    this.controlsEl.hidden = false;
    this.panelEl.hidden = false;
    this.chainEl.hidden = false;
    this.labels.setVisible(true);
    this.sim.isPlaying = this.resumeOnActivate;
    this.updatePlayButton();
    this.ctx.requestShadowUpdate();
  }

  deactivate(): void {
    if (!this.controlsEl) return;
    this.resumeOnActivate = this.sim.isPlaying;
    this.sim.isPlaying = false;
    this.controlsEl.hidden = true;
    this.panelEl.hidden = true;
    this.chainEl.hidden = true;
    this.labels.setVisible(false);
  }

  private syncUniforms(alpha: number): void {
    this.displayH = this.prevH + (this.sim.waterTable - this.prevH) * alpha;
    this.au.uH.value = this.displayH;
    this.sim.wells.forEach((w, i) => (this.au.uWells.value[i].z = coneCoefficient(w.rate)));
  }

  update(dt: number, time: number): void {
    this.shared.uTime.value = time;
    this.au.uTime.value = time;
    const playing = this.sim.isPlaying;
    let alpha = 1;
    if (playing) {
      alpha = this.stepper.advance(dt, () => {
        this.prevH = this.sim.waterTable;
        this.sim.step();
      });
      this.rain.advance(dt);
    }
    this.syncUniforms(alpha);
    this.wells.update(this.sim.wells, time);
    const pdt = playing ? dt : 0;
    this.flowClock += pdt;
    this.updateParticles(pdt);
    const el = this.ctx.renderer.domElement;
    this.flow.commit(el.clientHeight || 1080, this.camera.fov, this.camera.aspect);
    this.rain.uniforms.uOpacity.value = 0.55;
    this.updateUI();
  }

  afterCamera(): void {
    const el = this.ctx.renderer.domElement;
    const net = this.sim.netFlow;
    const falling = net < -1 && this.sim.isPlaying;
    const rising = net > 1 && this.sim.isPlaying && this.sim.waterTable < AQUIFER.maxWaterTable - 0.01;
    this.labels.setText('wt', falling ? 'Water table ↓ falling' : rising ? 'Water table ↑ rising' : 'Water table');
    this.labels.update(this.camera, el.clientWidth, el.clientHeight);
  }

  private statusText(s: WellStatus): [string, string] {
    switch (s) {
      case 'pumping': return ['PUMPING', 'ok'];
      case 'reduced': return ['LESS WATER', 'idle'];
      case 'dry': return ['DRY', 'dry'];
      default: return ['OFF', 'idle'];
    }
  }

  private updateUI(): void {
    const sim = this.sim;
    const stage = sim.stage;
    const st = STAGES[stage];
    this.ctx.ui.setCaption({ lesson: 'LESSON 1 · WATER', badge: '2', bigQuestion: 'How can taking too much water dry up wells?', step: { mark: String(stage), text: st.step }, title: st.title, body: st.body, tone: st.tone, words: st.words, task: st.task });
    const inPct = (sim.lastRecharge / TOTAL_MAX_DEMAND) * 100;
    const outPct = (sim.extraction / TOTAL_MAX_DEMAND) * 100;
    const net = sim.netFlow;
    const full = sim.waterTable >= AQUIFER.maxWaterTable - 0.01;
    const store = Math.abs(net) < RECHARGE_M3_PER_DAY * 0.01 ? (full ? 'FULL' : 'STEADY') : net < 0 ? 'FALLING ↓' : 'RISING ↑';
    const depth = (AQUIFER.groundSurface - this.displayH).toFixed(1);
    const chips = sim.wells.map((w) => this.statusText(w.status));
    const key = `${inPct.toFixed(1)}|${outPct.toFixed(1)}|${store}|${depth}|${chips.join()}|${stage}`;
    if (key === this.lastPanelKey) return;
    this.lastPanelKey = key;
    this.barIn.style.width = `${inPct}%`;
    this.barOut.style.width = `${outPct}%`;
    this.storeEl.textContent = `Groundwater store: ${store}`;
    this.storeEl.className = `store-state ${store.startsWith('FALL') ? 'falling' : store.startsWith('RIS') ? 'rising' : 'steady'}`;
    this.depthEl.textContent = `Water table: ${depth} m below ground`;
    chips.forEach(([t, c], i) => {
      this.wellChips[i].textContent = t;
      this.wellChips[i].className = `well-status ${c}`;
    });
    const lit = stage === 1 ? 3 : stage === 2 ? 5 : 6;
    this.chainSteps.forEach((s, i) => {
      s.classList.toggle('lit', i < lit - 1);
      s.classList.toggle('now', i === lit - 1);
    });
    if (document.activeElement !== this.slider && Math.abs(parseFloat(this.slider.value) - sim.slider) > 0.01) this.slider.value = String(sim.slider);
  }

  pick(raycaster: THREE.Raycaster): CameraView | null {
    const targets: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o.name === 'cutFaces' || o.name === 'surface' || o.parent?.parent === this.wells.group || o.parent === this.wells.group)) targets.push(o);
    });
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    const p = hit.point;
    for (let i = 0; i < WELLS.length; i++) {
      const w = wellDisplay(i);
      if (Math.abs(p.x - w.x) < 7 && p.z > 50) {
        const mid = (WELLS[i].intake + surfaceHeight(w.x, 60)) / 2;
        return { target: V(w.x, mid, 58), position: V(w.x + 26, mid + 14, 60 + 62) };
      }
    }
    const dir = new THREE.Vector3().subVectors(this.camera.position, p).normalize();
    const dist = Math.min(Math.max(this.camera.position.distanceTo(p) * 0.5, 45), 160);
    return { target: p.clone(), position: p.clone().addScaledVector(dir, dist) };
  }

  getState(): Record<string, unknown> {
    const st = this.sim.getState();
    return {
      ...st,
      stage: this.sim.stage,
      displayWaterTable: this.displayH,
      wells: this.sim.wells.map((w) => ({ ...w })),
      balancedSlider: BALANCED_SLIDER,
      rechargeM3PerDay: RECHARGE_M3_PER_DAY,
      labels: this.labels.shownIds(),
      caption: (document.querySelector('.cap-title') as HTMLElement | null)?.textContent ?? '',
    };
  }

  dispose(): void {
    this.labels.dispose();
    this.wells.dispose();
    this.res.dispose();
  }
}
