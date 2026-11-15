import * as THREE from 'three';
import type { CameraLimits, CameraView } from '../../core/CameraController';
import { dom } from '../../core/PresentationUI';
import { ResourceManager } from '../../core/ResourceManager';
import type { SceneContext, TeachingScene } from '../../core/SceneTypes';
import { LabelLayer } from '../../shared/Labels';
import { createSkyEnvironment, createSunRig, SkyEnvironment, SunRig } from '../../shared/Lighting';
import { BuildingMaterialHandle, createBuildingMaterial, createInstancedAsset, createSharedUniforms, InstanceRecord, RISE, SharedUniforms } from '../../shared/Materials';
import { Tween } from '../../shared/Transitions';
import { createWaterMaterial } from '../../shared/Water';
import { Archetype, AssetGroup, createArchetypes } from './BuildingAssets';
import { CityPlan, generateCity } from './CityGenerator';
import { MigrationFlow } from './Migration';
import { createRoadMaterial, createRoadMesh } from './Roads';
import { BIG_QUESTION, CHAIN, CHINA_FACT, MOMENTS, overviewBody, POPULATION, PresetId } from './ShenzhenData';
import { createTerrain, terrainHeight } from './Terrain';
import { Shipping, Traffic } from './Traffic';
import { UrbanTimeline, YEAR_MAX, YEAR_MIN } from './UrbanTimeline';
import { Vegetation } from './Vegetation';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export class ShenzhenScene implements TeachingScene {
  readonly id = 'shenzhen' as const;
  readonly title = 'Shenzhen';
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 16 / 9, 4, 70000);
  readonly limits: CameraLimits = {
    minDistance: 90,
    maxDistance: 10500,
    minPolar: 0.1,
    maxPolar: 1.45,
    targetMin: V(-5200, -20, -3800),
    targetMax: V(4600, 700, 3200),
    ground: terrainHeight,
    minClearance: 18,
  };
  readonly openingView: CameraView = { position: V(-450, 3950, 6550), target: V(-300, 0, -430) };
  readonly views: Record<PresetId, CameraView> = {
    overview: this.openingView,
    factories: { position: V(-1950, 520, 820), target: V(-2900, 30, -260) },
    housing: { position: V(950, 620, 50), target: V(-250, 40, -1050) },
    skyline: { position: V(-150, 140, 2650), target: V(800, 230, 0) },
  };

  readonly timeline = new UrbanTimeline();
  preset: PresetId = 'overview';
  private ctx!: SceneContext;
  private shared: SharedUniforms = createSharedUniforms();
  private res = new ResourceManager();
  private plan!: CityPlan;
  private sky!: SkyEnvironment;
  private rig!: SunRig;
  private handles = new Map<string, BuildingMaterialHandle>();
  private highlightTweens = { industrial: new Tween(0), residential: new Tween(0) };
  private vegetation!: Vegetation;
  private traffic!: Traffic;
  private shipping!: Shipping;
  private migration!: MigrationFlow;
  private migrationTween = new Tween(0);
  private labels!: LabelLayer;
  private lastShadowYear = -1;
  private shadowTimer = 0;
  private time = 0;

  // UI
  private controlsEl!: HTMLDivElement;
  private panelEl!: HTMLDivElement;
  private chainEl!: HTMLDivElement;
  private playBtn!: HTMLButtonElement;
  private slider!: HTMLInputElement;
  private yearEl!: HTMLElement;
  private phaseEl!: HTMLElement;
  private refStart!: HTMLButtonElement;
  private refEnd!: HTMLButtonElement;
  private presetBtns = new Map<PresetId, HTMLButtonElement>();
  private chainSteps: HTMLElement[] = [];
  private lastUiYear = -1;

  async build(ctx: SceneContext, progress: (p: number, label: string) => Promise<void>): Promise<void> {
    this.ctx = ctx;
    await progress(0.02, 'Shenzhen: sky and light');
    this.sky = createSkyEnvironment(ctx.renderer, { elevation: 34, azimuth: -38, turbidity: 7.5, rayleigh: 1.6, mieCoefficient: 0.006, mieDirectionalG: 0.82 });
    this.res.track(this.sky);
    this.scene.background = this.sky.background;
    this.scene.environment = this.sky.environment;
    this.scene.backgroundIntensity = 1.0;
    this.scene.environmentIntensity = 0.5;
    this.scene.fog = new THREE.FogExp2(new THREE.Color(0.55, 0.63, 0.71), 0.000048);
    this.rig = createSunRig(this.scene, this.sky.sunDirection, 14000, 5400, ctx.shadowMapSize, 4.2);
    this.rig.sun.target.position.set(-300, 0, -450);
    this.rig.sun.position.copy(this.sky.sunDirection).multiplyScalar(14000).add(this.rig.sun.target.position);
    this.rig.sun.shadow.normalBias = 2.5;
    this.rig.sun.shadow.bias = -0.0003;
    this.rig.hemi.intensity = 0.3;

    await progress(0.08, 'Shenzhen: planning the city');
    const archetypes = createArchetypes();
    for (const a of archetypes.values()) this.res.track(a.geometry);
    this.plan = generateCity(archetypes);

    await progress(0.3, 'Shenzhen: terrain and coastline');
    const devTex = new THREE.DataTexture(this.plan.devMap.data, this.plan.devMap.w, this.plan.devMap.h, THREE.RGBAFormat);
    devTex.magFilter = THREE.NearestFilter;
    devTex.minFilter = THREE.NearestFilter;
    devTex.needsUpdate = true;
    this.res.track(devTex);
    const terrain = createTerrain(this.shared, { texture: devTex, bounds: this.plan.devMap.bounds });
    this.scene.add(terrain);
    const seaMat = createWaterMaterial(this.shared, ctx.assets.waterNormals, { color: 0x1e4a52, opacity: 0.9, scale: 0.0045, strength: 0.32 });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(90000, 90000, 1, 1), seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = 0;
    sea.receiveShadow = true;
    sea.renderOrder = 1;
    sea.name = 'sea';
    this.scene.add(sea);

    await progress(0.45, 'Shenzhen: roads');
    const roads = createRoadMesh(this.plan.roads, this.plan.junctions, this.plan.railway, createRoadMaterial(this.shared));
    this.scene.add(roads);

    await progress(0.55, 'Shenzhen: buildings');
    this.buildBuildings(archetypes);

    await progress(0.72, 'Shenzhen: trees and parks');
    const treeHandle = this.handleFor('tree', RISE.FADE);
    this.vegetation = new Vegetation(this.plan.trees, archetypes.get('treeNear')!.geometry, archetypes.get('treeFar')!.geometry, treeHandle);
    this.scene.add(this.vegetation.group);

    await progress(0.82, 'Shenzhen: traffic and shipping');
    const vh = this.handleFor('vehicle', RISE.FADE);
    this.traffic = new Traffic(this.plan.roads, { car: archetypes.get('car')!.geometry, truck: archetypes.get('truck')!.geometry, bus: archetypes.get('bus')!.geometry }, vh);
    this.scene.add(this.traffic.group);
    this.shipping = new Shipping(archetypes.get('ship300')!.geometry, this.handleFor('port', RISE.FADE));
    this.scene.add(this.shipping.mesh);
    this.migration = new MigrationFlow(this.plan.migrationPaths, ctx.assets.softDot);
    this.scene.add(this.migration.points);

    this.res.trackObject(this.scene);

    await progress(0.9, 'Shenzhen: labels and controls');
    this.buildLabels();
    this.buildUI();
    this.timeline.onChange(() => this.applyYear());
    this.applyYear();
    this.deactivate();
    await progress(1, 'Shenzhen ready');
  }

  private handleFor(group: AssetGroup, rise: number): BuildingMaterialHandle {
    const key = `${group}:${rise}`;
    let h = this.handles.get(key);
    if (!h) {
      h = createBuildingMaterial({
        rise,
        shared: this.shared,
        envIntensity: group === 'commercial' ? 1.5 : 0.85,
        // residential highlight is a cool tint so it reads differently from the amber factories
        highlightColor: group === 'residential' ? new THREE.Color(0.45, 0.8, 1.0) : undefined,
      });
      this.handles.set(key, h);
    }
    return h;
  }

  private buildBuildings(archetypes: Map<string, Archetype>): void {
    const byArch = new Map<string, InstanceRecord[]>();
    for (const b of this.plan.buildings) {
      let arr = byArch.get(b.arch);
      if (!arr) byArch.set(b.arch, (arr = []));
      arr.push({ x: b.x, y: b.y ?? 0, z: b.z, rot: b.rot, scale: b.scale, life: b.life, tint: b.tint, seed: b.seed });
    }
    for (const [key, recs] of byArch) {
      const a = archetypes.get(key)!;
      const handle = this.handleFor(a.group, a.rise);
      const mesh = createInstancedAsset(a.geometry, handle, recs, a.castShadow, true);
      mesh.name = `bld-${key}`;
      this.scene.add(mesh);
    }
  }

  // ------------------------------------------------------------------ labels
  private buildLabels(): void {
    this.labels = new LabelLayer(this.ctx.ui.overlay);
    this.labels.setExclusions(() => this.ctx.ui.occupiedRects());
    const A = this.plan.anchors;
    const y = () => this.timeline.value;
    this.labels.add({ id: 'oldtown', text: 'Small town', anchor: () => A.oldtown, priority: 6 });
    this.labels.add({ id: 'farmland', text: 'Farms & fishing villages', kind: 'muted', anchor: () => A.farmland, visible: () => y() < 1991, priority: 4 });
    this.labels.add({ id: 'factories', text: 'Factories', sub: 'jobs making goods', anchor: () => A.industry, visible: () => y() >= 1983.5, priority: 8 });
    this.labels.add({ id: 'factories2', text: 'Factories & warehouses', anchor: () => A.industryWest, visible: () => y() >= 1991, priority: 5 });
    this.labels.add({ id: 'port', text: 'Port', sub: 'goods shipped overseas', anchor: () => A.port, visible: () => y() >= 1989, priority: 7 });
    this.labels.add({ id: 'homes90', text: 'New homes', anchor: () => A.housing90, visible: () => y() >= 1990, priority: 6 });
    this.labels.add({ id: 'homes', text: 'Tower blocks of flats', anchor: () => A.housing, visible: () => y() >= 2003, priority: 6 });
    this.labels.add({ id: 'cbd', text: 'Offices & shops', anchor: () => A.cbd, visible: () => y() >= 2002, priority: 7 });
    this.labels.add({ id: 'sea', text: 'Sea', sub: 'Pearl River Delta coast', kind: 'muted', anchor: () => A.sea, priority: 1 });
    const dest = this.migration.destinations();
    this.labels.add({ id: 'migration', text: 'People arrive for work', sub: 'illustrative, not real routes', kind: 'pump', anchor: () => dest[0], visible: () => this.preset === 'housing', priority: 10, stem: 60 });
    this.labels.setVisible(false);
  }

  // -------------------------------------------------------------------- UI
  private buildUI(): void {
    const ui = this.ctx.ui;
    const { el, button } = dom;
    // control strip (two rows)
    this.controlsEl = el('div', 'scene-controls shenzhen-controls');
    this.controlsEl.style.flexDirection = 'column';
    this.controlsEl.style.alignItems = 'stretch';
    const row1 = el('div', 'ctl-group');
    this.playBtn = button('<span class="ico">▶</span><span class="lbl">Play</span>', { cls: 'primary', title: 'Play / pause (Space)', kbd: 'Space', onClick: () => this.togglePlay() });
    const mkRef = (which: 'start' | 'end') => {
      const p = POPULATION[which];
      const b = el('button', 'pop-ref');
      b.type = 'button';
      b.title = `Jump to ${p.year}`;
      b.append(el('span', 'pr-year', String(p.year)), el('span', 'pr-val', p.label));
      b.addEventListener('click', () => {
        b.blur();
        this.timeline.pause();
        this.timeline.set(p.year);
      });
      return b;
    };
    this.refStart = mkRef('start');
    this.refEnd = mkRef('end');
    const tl = el('div', 'timeline');
    this.slider = el('input');
    this.slider.type = 'range';
    this.slider.min = String(YEAR_MIN);
    this.slider.max = String(YEAR_MAX);
    this.slider.step = '0.05';
    this.slider.value = String(YEAR_MIN);
    this.slider.setAttribute('aria-label', 'Year');
    this.slider.addEventListener('input', () => {
      this.timeline.pause();
      this.timeline.set(parseFloat(this.slider.value));
    });
    const ticks = el('div', 'tl-ticks');
    for (const yv of [1990, 2000, 2010]) {
      const s = el('span', '', String(yv));
      s.style.left = `${((yv - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100}%`;
      ticks.appendChild(s);
    }
    const note = el('div', 'illustrative', 'Between 1980 and 2020 the model is an illustration, not measured data');
    tl.append(this.slider, ticks, note);
    const yr = el('div', 'year-readout');
    this.yearEl = el('div', 'year-big', '1980');
    this.phaseEl = el('div', 'year-phase', '');
    yr.append(this.yearEl, this.phaseEl);
    row1.append(this.playBtn, this.refStart, tl, this.refEnd, yr);

    const row2 = el('div', 'ctl-group preset-group');
    row2.style.justifyContent = 'center';
    row2.append(el('span', 'ctl-label', 'Views'));
    const mkPreset = (id: PresetId, label: string) => {
      const b = button(label, { onClick: () => this.setPreset(id) });
      this.presetBtns.set(id, b);
      row2.appendChild(b);
    };
    mkPreset('overview', 'Overview');
    mkPreset('factories', `A · ${MOMENTS.factories.button}`);
    mkPreset('housing', `B · ${MOMENTS.housing.button}`);
    mkPreset('skyline', `C · ${MOMENTS.skyline.button}`);
    row2.append(el('div', 'ctl-sep'), button('<span class="ico">⟲</span><span>Reset view</span>', { cls: 'ghost', title: 'Return to the opening view', onClick: () => this.setPreset('overview') }));
    this.controlsEl.append(row1, row2);
    ui.controlsHost.appendChild(this.controlsEl);

    // side panel: population change + China-wide fact (teaching moment C)
    this.panelEl = el('div', 'scene-panel');
    this.panelEl.style.display = 'flex';
    this.panelEl.style.flexDirection = 'column';
    this.panelEl.style.gap = 'calc(var(--u) * 1)';
    this.panelEl.style.alignItems = 'flex-end';
    const pop = el('div', 'panel');
    pop.append(el('div', 'panel-title', 'Shenzhen’s population'));
    const bs = el('div', 'big-stat');
    const f = el('div', 'bs-from');
    f.append(el('div', 'bs-num', '330,000'), el('div', 'bs-lab', 'about, in 1980'));
    const t = el('div', 'bs-to');
    t.append(el('div', 'bs-num', '17 million+'), el('div', 'bs-lab', 'over, by 2020'));
    bs.append(f, el('div', 'bs-arrow', '→'), t);
    pop.append(bs, el('div', 'panel-note', POPULATION.source));
    const fact = el('div', 'panel china-fact');
    fact.append(el('div', 'panel-title', CHINA_FACT.scope));
    const grid = el('div', 'goods-grid');
    for (let i = 0; i < CHINA_FACT.of; i++) grid.appendChild(el('i', i < CHINA_FACT.filled ? 'on' : ''));
    fact.append(grid, el('div', 'fact-text', CHINA_FACT.text), el('div', 'panel-note', `${CHINA_FACT.source} This is for all of China, not just Shenzhen.`));
    this.panelEl.append(pop, fact);
    ui.panelHost.appendChild(this.panelEl);

    // cause -> effect chain
    this.chainEl = el('div', 'scene-chain chain');
    this.chainEl.append(el('div', 'chain-title', 'Cause and effect'));
    CHAIN.forEach((c, i) => {
      const s = el('div', 'chain-step');
      s.append(el('span', 'dot'), el('span', '', c.text));
      this.chainEl.appendChild(s);
      this.chainSteps.push(s);
      if (i < CHAIN.length - 1) this.chainEl.appendChild(el('div', 'chain-arrow', '↓'));
    });
    ui.chainHost.appendChild(this.chainEl);
  }

  // ----------------------------------------------------------- interaction
  setPreset(id: PresetId): void {
    this.preset = id;
    for (const [k, b] of this.presetBtns) b.classList.toggle('on', k === id);
    this.ctx.flyTo(this.views[id], id === 'overview' ? 2.4 : 2.6);
    if (id !== 'overview') {
      const m = MOMENTS[id];
      if (this.timeline.value < m.minYear - 0.01) this.timeline.seek(m.minYear, 2.4);
      else this.timeline.pause();
    }
    this.highlightTweens.industrial.start(id === 'factories' ? 1 : 0, 0.8);
    this.highlightTweens.residential.start(id === 'housing' ? 0.55 : 0, 0.8);
    this.migrationTween.start(id === 'housing' ? 1 : 0, 0.8);
    this.updatePlayButton();
  }

  togglePlay(): void {
    this.timeline.toggle();
    this.updatePlayButton();
  }

  resetScenario(): void {
    this.timeline.reset();
    this.preset = 'overview';
    for (const [k, b] of this.presetBtns) b.classList.toggle('on', k === 'overview');
    this.highlightTweens.industrial.start(0, 0.4);
    this.highlightTweens.residential.start(0, 0.4);
    this.migrationTween.start(0, 0.4);
    this.updatePlayButton();
  }

  private updatePlayButton(): void {
    const playing = this.timeline.isPlaying;
    this.playBtn.innerHTML = `<span class="ico">${playing ? '❚❚' : '▶'}</span><span class="lbl">${playing ? 'Pause' : this.timeline.value >= YEAR_MAX - 1e-6 ? 'Replay' : 'Play'}</span><kbd>Space</kbd>`;
  }

  private applyYear(): void {
    this.shared.uYear.value = this.timeline.value;
  }

  activate(): void {
    this.controlsEl.hidden = false;
    this.panelEl.hidden = false;
    this.chainEl.hidden = false;
    this.labels.setVisible(true);
    this.ctx.requestShadowUpdate();
    this.lastUiYear = -1;
    this.updatePlayButton();
    for (const [k, b] of this.presetBtns) b.classList.toggle('on', k === this.preset);
  }

  deactivate(): void {
    this.timeline.pause();
    if (this.controlsEl) {
      this.controlsEl.hidden = true;
      this.panelEl.hidden = true;
      this.chainEl.hidden = true;
      this.labels.setVisible(false);
    }
  }

  update(dt: number, time: number): void {
    this.time = time;
    this.shared.uTime.value = time;
    const wasPlaying = this.timeline.isPlaying;
    this.timeline.update(dt);
    if (wasPlaying && !this.timeline.isPlaying) this.updatePlayButton();
    // shadows follow construction, throttled while animating
    this.shadowTimer -= dt;
    if (Math.abs(this.timeline.value - this.lastShadowYear) > 1e-4 && (this.shadowTimer <= 0 || (!this.timeline.isPlaying && !this.timeline.seeking))) {
      this.ctx.requestShadowUpdate();
      this.lastShadowYear = this.timeline.value;
      this.shadowTimer = 1 / 12;
    }
    const hi = this.highlightTweens.industrial.update(dt);
    const hr = this.highlightTweens.residential.update(dt);
    const ind = this.handles.get(`industrial:${RISE.BUILD}`);
    if (ind) ind.highlight.value = hi;
    const res = this.handles.get(`residential:${RISE.BUILD}`);
    if (res) res.highlight.value = hr;
    this.migration.uniforms.uOpacity.value = this.migrationTween.update(dt);
    this.traffic.update(time);
    this.shipping.update(time);
    this.migration.update(time, this.ctx.renderer.domElement.clientHeight || 1080);
    this.updateUI();
  }

  afterCamera(): void {
    this.vegetation.update(this.camera);
    const w = this.ctx.renderer.domElement.clientWidth, h = this.ctx.renderer.domElement.clientHeight;
    this.labels.setText('oldtown', this.timeline.value < 1990 ? 'Small town' : 'Old town');
    this.labels.update(this.camera, w, h);
  }

  private updateUI(): void {
    const y = this.timeline.value;
    if (Math.abs(y - this.lastUiYear) > 1e-3) {
      this.lastUiYear = y;
      if (document.activeElement !== this.slider) this.slider.value = String(y);
      else if (this.timeline.isPlaying || this.timeline.seeking) this.slider.value = String(y);
      this.yearEl.textContent = String(this.timeline.displayYear);
      this.phaseEl.textContent = this.timeline.phase;
      const ref = this.timeline.populationReference;
      this.refStart.classList.toggle('active', ref === 'start');
      this.refEnd.classList.toggle('active', ref === 'end');
      const ci = this.timeline.chainIndex;
      this.chainSteps.forEach((s, i) => {
        s.classList.toggle('lit', i < ci);
        s.classList.toggle('now', i === ci);
      });
      this.slider.style.setProperty('--track', `linear-gradient(90deg, #ffd166 ${((y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100}%, rgba(255,255,255,0.18) 0)`);
      if (!this.timeline.isPlaying && this.playBtn.textContent?.includes('Pause')) this.updatePlayButton();
    }
    this.panelEl.style.display = this.preset === 'skyline' && y >= YEAR_MAX - 0.5 ? 'flex' : 'none';
    // teaching caption
    if (this.preset === 'overview') {
      this.ctx.ui.setCaption({ kicker: 'Big question', title: BIG_QUESTION, body: overviewBody(y) });
    } else {
      const m = MOMENTS[this.preset];
      this.ctx.ui.setCaption({ kicker: m.kicker, title: m.title, body: m.body, words: m.words, tone: this.preset === 'factories' ? 'pump' : 'default' });
    }
  }

  pick(raycaster: THREE.Raycaster): CameraView | null {
    const terrain = this.scene.getObjectByName('terrain') as THREE.Mesh;
    const hits = raycaster.intersectObject(terrain, false);
    if (!hits.length) return null;
    const p = hits[0].point;
    const cam = this.camera.position;
    const dir = new THREE.Vector3().subVectors(cam, p);
    const dist = Math.min(Math.max(dir.length() * 0.45, 380), 2200);
    dir.normalize();
    if (dir.y < 0.35) {
      dir.y = 0.35;
      dir.normalize();
    }
    const target = p.clone();
    target.y += 20;
    return { position: target.clone().addScaledVector(dir, dist), target };
  }

  getState(): Record<string, unknown> {
    return {
      yearPosition: this.timeline.value,
      displayYear: this.timeline.displayYear,
      isPlaying: this.timeline.isPlaying,
      cameraPreset: this.preset,
      phase: this.timeline.phase,
      populationReference: this.timeline.populationReference,
      chainIndex: this.timeline.chainIndex,
      labels: this.labels.shownIds(),
      highlightFactories: this.handles.get(`industrial:${RISE.BUILD}`)?.highlight.value ?? 0,
      migrationOpacity: this.migration.uniforms.uOpacity.value,
      stats: this.plan.stats,
      traffic: this.traffic.count,
      treeChunks: this.vegetation.chunkCount,
      caption: (document.querySelector('.cap-title') as HTMLElement | null)?.textContent ?? '',
    };
  }

  dispose(): void {
    this.labels.dispose();
    this.res.dispose();
  }
}
