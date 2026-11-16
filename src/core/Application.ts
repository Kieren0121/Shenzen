import * as THREE from 'three';
import { AnimationScheduler } from './AnimationScheduler';
import { CameraController, CameraView } from './CameraController';
import { PresentationUI } from './PresentationUI';
import { chooseShadowMapSize, createRenderer, webglAvailable } from './Renderer';
import { SceneContext, SceneId, TeachingScene } from './SceneTypes';
import { SharedAssets } from './SharedAssets';
import { PerformanceMonitor } from '../shared/Performance';

export type SceneFactory = () => TeachingScene;

/**
 * Owns the renderer, the frame loop, the teacher's input (mouse + keyboard)
 * and the switching between the two lesson scenes. Both scenes are built once
 * at start-up and kept resident, so switching is instant and allocates nothing.
 */
export class Application {
  readonly ui: PresentationUI;
  private renderer!: THREE.WebGLRenderer;
  private perf!: PerformanceMonitor;
  private camCtl!: CameraController;
  private scenes = new Map<SceneId, TeachingScene>();
  private savedViews = new Map<SceneId, CameraView>();
  private active: TeachingScene | null = null;
  private scheduler: AnimationScheduler;
  private assets!: SharedAssets;
  private shadowDirty = true;
  private presenting = false;
  private fullscreenActive = false;
  private width = 1;
  private height = 1;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private frameCount = 0;
  private switchCount = 0;
  /** Main-thread cost of a frame (scene update + labels + render submission), ms. */
  private cpuMs: number[] = [];

  constructor(root: HTMLElement, private factories: SceneFactory[]) {
    this.ui = new PresentationUI(root);
    this.scheduler = new AnimationScheduler((dt, t) => this.frame(dt, t));
  }

  async start(): Promise<void> {
    if (!webglAvailable()) {
      this.ui.showError(
        '3D graphics are not available on this computer',
        'This lesson needs WebGL 2 with hardware acceleration. Please open the file in a recent version of Google Chrome or Microsoft Edge. If it still does not work, turn on "Use graphics acceleration when available" in the browser settings (Settings → System) and restart the browser.',
      );
      return;
    }
    try {
      this.renderer = createRenderer(this.ui.viewport);
    } catch (e) {
      this.ui.showError('3D graphics could not start', `The browser refused to create a WebGL context (${(e as Error).message}). Try Chrome or Edge with hardware acceleration enabled.`);
      return;
    }
    this.renderer.domElement.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault();
      this.ui.toast('The graphics card reset. Please reload the page (Ctrl + R).', 8000);
    });
    this.assets = new SharedAssets();
    this.perf = new PerformanceMonitor(this.renderer);
    this.resize();
    this.perf.initialise(this.width, this.height);
    window.addEventListener('resize', () => this.resize());

    const ctx: SceneContext = {
      renderer: this.renderer,
      ui: this.ui,
      assets: this.assets,
      shadowMapSize: chooseShadowMapSize(this.renderer),
      requestShadowUpdate: () => {
        this.shadowDirty = true;
      },
      flyTo: (v, s) => this.camCtl.flyTo(v, s),
      getCamera: () => (this.active ? this.active.camera : this.factoriesFirstCamera()),
    };

    const total = this.factories.length;
    let idx = 0;
    for (const f of this.factories) {
      const s = f();
      const base = idx / total;
      await s.build(ctx, async (p, label) => {
        this.ui.setLoading(base + p / total, label);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      });
      this.scenes.set(s.id, s);
      idx++;
    }
    const first = this.scenes.get('shenzhen') ?? [...this.scenes.values()][0];
    this.camCtl = new CameraController(first.camera, this.renderer.domElement);
    // Pre-compile all shader programs so the first switch does not stall.
    this.ui.setLoading(0.98, 'Compiling shaders');
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    for (const s of this.scenes.values()) {
      this.resizeCamera(s.camera);
      this.renderer.compile(s.scene, s.camera);
    }
    this.ui.onSceneSelect = (id) => this.switchTo(id);
    this.ui.onPresentToggle = () => this.togglePresentation();
    this.switchTo(first.id);
    this.installInput();
    this.ui.hideLoading();
    this.scheduler.start();
    this.exposeTestHooks();
  }

  private factoriesFirstCamera(): THREE.PerspectiveCamera {
    return [...this.scenes.values()][0]?.camera ?? new THREE.PerspectiveCamera();
  }

  switchTo(id: SceneId): void {
    const next = this.scenes.get(id);
    if (!next || next === this.active) return;
    if (this.active) {
      this.savedViews.set(this.active.id, this.camCtl.getView());
      this.active.deactivate();
    }
    this.active = next;
    this.switchCount++;
    this.resizeCamera(next.camera);
    const view = this.savedViews.get(id) ?? next.openingView;
    this.camCtl.attach(next.camera, next.limits, view.target);
    this.camCtl.setView(view);
    next.activate();
    this.ui.setActiveTab(id);
    this.shadowDirty = true;
  }

  resetView(): void {
    if (!this.active) return;
    this.camCtl.flyTo(this.active.openingView, 2.0);
  }

  private frame(dt: number, time: number): void {
    const s = this.active;
    if (!s) return;
    const t0 = performance.now();
    this.perf.tick(dt);
    s.update(dt, time);
    this.camCtl.update(dt);
    (s as TeachingScene & { afterCamera?: () => void }).afterCamera?.();
    if (this.shadowDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
    this.renderer.render(s.scene, s.camera);
    this.frameCount++;
    this.cpuMs.push(performance.now() - t0);
    if (this.cpuMs.length > 300) this.cpuMs.shift();
  }

  private resize(): void {
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.renderer.setSize(this.width, this.height, false);
    this.perf?.onResize(this.width, this.height);
    for (const s of this.scenes.values()) this.resizeCamera(s.camera);
  }

  private resizeCamera(c: THREE.PerspectiveCamera): void {
    c.aspect = this.width / this.height;
    c.updateProjectionMatrix();
  }

  get viewportSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  // ------------------------------------------------------------------ input
  private installInput(): void {
    window.addEventListener('keydown', (e) => this.onKey(e));
    const canvas = this.renderer.domElement;
    canvas.addEventListener('dblclick', (e) => {
      if (!this.active) return;
      const r = canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.active.camera);
      const v = this.active.pick(this.raycaster);
      if (v) this.camCtl.flyTo(v, 1.6);
    });
    document.addEventListener('fullscreenchange', () => {
      this.fullscreenActive = !!document.fullscreenElement;
      if (!this.fullscreenActive && this.presenting) this.setPresenting(false);
      // a full-screen request that completes after presentation was cancelled is undone
      if (this.fullscreenActive && !this.presenting) document.exitFullscreen().catch(() => undefined);
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'TEXTAREA' || t.isContentEditable || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range'))) return;
    const k = e.key;
    switch (k) {
      case ' ':
      case 'Spacebar':
        e.preventDefault();
        this.active?.togglePlay();
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        this.active?.resetScenario();
        this.resetView();
        break;
      case '1':
        this.switchTo('shenzhen');
        break;
      case '2':
        this.switchTo('groundwater');
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        this.togglePresentation();
        break;
      case 'Escape':
        if (this.presenting) this.setPresenting(false);
        break;
      case 'h':
      case 'H':
        document.body.classList.toggle('controls-hidden');
        break;
      default:
        break;
    }
  }

  togglePresentation(): void {
    this.setPresenting(!this.presenting);
  }

  private setPresenting(on: boolean): void {
    this.presenting = on;
    document.body.classList.toggle('presenting', on);
    this.ui.presentBtn.classList.toggle('on', on);
    if (on) {
      const req = document.documentElement.requestFullscreen?.bind(document.documentElement);
      if (!req) {
        this.ui.toast('Presentation mode on. Press F11 for full screen.');
        return;
      }
      req({ navigationUI: 'hide' }).then(() => {
        if (!this.presenting && document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      }).catch(() => {
        this.ui.toast('The browser blocked full screen. Presentation mode is on: press F11 for full screen.', 5000);
      });
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
  }

  // ------------------------------------------------------------- QA hooks
  private exposeTestHooks(): void {
    const app = this;
    (window as unknown as { __ebn: unknown }).__ebn = {
      ready: true,
      get scene() {
        return app.active?.id;
      },
      switchTo: (id: SceneId) => app.switchTo(id),
      state: (id?: SceneId) => (id ? app.scenes.get(id) : app.active)?.getState(),
      scenes: () => [...app.scenes.keys()],
      camera: () => {
        const v = app.camCtl.getView();
        return { position: v.position.toArray(), target: v.target.toArray(), flying: app.camCtl.flying };
      },
      setView: (p: number[], t: number[]) => app.camCtl.setView({ position: new THREE.Vector3().fromArray(p), target: new THREE.Vector3().fromArray(t) }),
      perf: () => ({
        fps: app.perf.fps,
        averageFps: app.perf.averageFps(),
        pixelRatio: app.perf.pixelRatio,
        frames: app.frameCount,
        switches: app.switchCount,
        memory: app.renderer.info.memory,
        render: app.renderer.info.render,
        programs: app.renderer.info.programs?.length ?? 0,
        jsHeap: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
        cpuFrameMs: app.cpuMs.length ? [...app.cpuMs].sort((a, b) => a - b)[Math.floor(app.cpuMs.length / 2)] : null,
      }),
      resetPerf: () => app.perf.resetSamples(),
      setAdaptive: (on: boolean) => {
        app.perf.adaptive = on;
      },
      presenting: () => app.presenting,
      /** QA only: call a public method on a scene, e.g. call('shenzhen','setPreset','skyline'). */
      call: (id: SceneId, method: string, ...args: unknown[]) => {
        const s = app.scenes.get(id) as unknown as Record<string, unknown>;
        const target = method.includes('.') ? (s[method.split('.')[0]] as Record<string, unknown>) : s;
        const name = method.includes('.') ? method.split('.')[1] : method;
        const fn = target?.[name];
        return typeof fn === 'function' ? (fn as (...a: unknown[]) => unknown).apply(target, args) : undefined;
      },
      tune: (k: string, v: number) => {
        const r = app.renderer as unknown as Record<string, number>;
        r[k] = v;
      },
    };
  }
}
