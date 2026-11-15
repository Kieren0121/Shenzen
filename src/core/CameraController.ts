import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { easeInOutCubic } from '../shared/Transitions';

export interface CameraView {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export interface CameraLimits {
  minDistance: number;
  maxDistance: number;
  minPolar: number;
  maxPolar: number;
  targetMin: THREE.Vector3;
  targetMax: THREE.Vector3;
  /** Ground height under a point; the camera is kept above it. */
  ground?: (x: number, z: number) => number;
  minClearance: number;
}

interface Flight {
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromSph: THREE.Spherical;
  toSph: THREE.Spherical;
  t: number;
  duration: number;
  arc: number;
}

/**
 * Teacher camera: OrbitControls (left-drag orbit, right-drag pan, wheel zoom)
 * with angle / zoom / pan limits, ground clearance, and smooth eased flights
 * between composed views. A flight arcs slightly outward so it never cuts
 * through tall buildings, and any mouse press cancels it.
 */
export class CameraController {
  readonly controls: OrbitControls;
  private camera: THREE.PerspectiveCamera;
  private limits: CameraLimits | null = null;
  private flight: Flight | null = null;
  private tmp = new THREE.Vector3();
  onUserInteract: (() => void) | null = null;

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.9;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.addEventListener('start', () => {
      this.flight = null;
      this.controls.enabled = true;
      this.onUserInteract?.();
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Switch to another scene's camera and limits. */
  attach(camera: THREE.PerspectiveCamera, limits: CameraLimits, target: THREE.Vector3): void {
    this.flight = null;
    this.camera = camera;
    (this.controls as unknown as { object: THREE.Camera }).object = camera;
    this.limits = limits;
    this.controls.minDistance = limits.minDistance;
    this.controls.maxDistance = limits.maxDistance;
    this.controls.minPolarAngle = limits.minPolar;
    this.controls.maxPolarAngle = limits.maxPolar;
    this.controls.target.copy(target);
    this.controls.enabled = true;
    this.controls.update();
  }

  get flying(): boolean {
    return this.flight !== null;
  }

  setView(v: CameraView): void {
    this.flight = null;
    this.camera.position.copy(v.position);
    this.controls.target.copy(v.target);
    this.controls.enabled = true;
    this.controls.update();
  }

  getView(): CameraView {
    return { position: this.camera.position.clone(), target: this.controls.target.clone() };
  }

  flyTo(v: CameraView, duration = 2.4): void {
    const fromTarget = this.controls.target.clone();
    const fromSph = new THREE.Spherical().setFromVector3(this.tmp.copy(this.camera.position).sub(fromTarget));
    const toSph = new THREE.Spherical().setFromVector3(this.tmp.copy(v.position).sub(v.target));
    // take the shortest way round
    let dTheta = toSph.theta - fromSph.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    toSph.theta = fromSph.theta + dTheta;
    const travel = fromTarget.distanceTo(v.target);
    const arc = Math.min(0.35, travel / Math.max(fromSph.radius, toSph.radius, 1) * 0.25);
    this.flight = { fromTarget, toTarget: v.target.clone(), fromSph, toSph, t: 0, duration: Math.max(0.2, duration), arc };
    this.controls.enabled = false;
  }

  cancelFlight(): void {
    this.flight = null;
    this.controls.enabled = true;
  }

  update(dt: number): void {
    const f = this.flight;
    if (f) {
      f.t = Math.min(1, f.t + dt / f.duration);
      const e = easeInOutCubic(f.t);
      const target = this.tmp.copy(f.fromTarget).lerp(f.toTarget, e);
      const r = Math.exp(Math.log(f.fromSph.radius) + (Math.log(f.toSph.radius) - Math.log(f.fromSph.radius)) * e) * (1 + f.arc * Math.sin(Math.PI * e));
      const phi = f.fromSph.phi + (f.toSph.phi - f.fromSph.phi) * e - f.arc * 0.25 * Math.sin(Math.PI * e);
      const theta = f.fromSph.theta + (f.toSph.theta - f.fromSph.theta) * e;
      const off = new THREE.Vector3().setFromSphericalCoords(r, Math.max(0.05, phi), theta);
      this.controls.target.copy(target);
      this.camera.position.copy(target).add(off);
      this.camera.lookAt(target);
      this.keepAboveGround();
      if (f.t >= 1) {
        this.flight = null;
        this.controls.enabled = true;
        this.controls.update();
      }
      return;
    }
    this.controls.update(dt);
    this.applyLimits();
  }

  private applyLimits(): void {
    const L = this.limits;
    if (!L) return;
    const t = this.controls.target;
    const before = this.tmp.copy(t);
    t.clamp(L.targetMin, L.targetMax);
    if (!before.equals(t)) {
      this.camera.position.add(new THREE.Vector3().subVectors(t, before));
    }
    this.keepAboveGround();
  }

  private keepAboveGround(): void {
    const L = this.limits;
    if (!L || !L.ground) return;
    const g = L.ground(this.camera.position.x, this.camera.position.z) + L.minClearance;
    if (this.camera.position.y < g) this.camera.position.y = g;
  }

  dispose(): void {
    this.controls.dispose();
  }
}
