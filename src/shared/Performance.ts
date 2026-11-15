import * as THREE from 'three';

/**
 * Measures frame time and adapts the renderer pixel ratio so that lower-end
 * classroom PCs keep interactive frame rates while capable machines get full
 * resolution. Measurements are exposed for the QA harness.
 */
export class PerformanceMonitor {
  fps = 60;
  frameMs = 16.7;
  private slowTime = 0;
  private fastTime = 0;
  pixelRatio = 1;
  private maxRatio = 1;
  private minRatio = 0.55;
  private samples: number[] = [];
  adaptive = true;

  constructor(private renderer: THREE.WebGLRenderer) {}

  /** Choose an initial pixel ratio that caps total rendered pixels (~2560x1440). */
  initialise(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    const maxPixels = 3_700_000;
    const fit = Math.sqrt(maxPixels / Math.max(1, width * height));
    this.maxRatio = Math.max(this.minRatio, Math.min(dpr, 2, fit));
    this.pixelRatio = this.maxRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
  }

  onResize(width: number, height: number): void {
    const prev = this.pixelRatio;
    this.initialise(width, height);
    this.pixelRatio = Math.min(prev, this.maxRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
  }

  /** dt in seconds of the last frame. Returns true if the pixel ratio changed. */
  tick(dt: number): boolean {
    const ms = dt * 1000;
    if (ms <= 0 || ms > 1000) return false;
    this.frameMs += (ms - this.frameMs) * 0.06;
    this.fps = 1000 / this.frameMs;
    this.samples.push(ms);
    if (this.samples.length > 600) this.samples.shift();
    if (!this.adaptive) return false;
    if (this.frameMs > 26) {
      this.slowTime += dt;
      this.fastTime = 0;
    } else if (this.frameMs < 14.5) {
      this.fastTime += dt;
      this.slowTime = 0;
    } else {
      this.slowTime = Math.max(0, this.slowTime - dt);
      this.fastTime = Math.max(0, this.fastTime - dt);
    }
    if (this.slowTime > 1.5 && this.pixelRatio > this.minRatio) {
      this.pixelRatio = Math.max(this.minRatio, this.pixelRatio * 0.85);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.slowTime = 0;
      return true;
    }
    if (this.fastTime > 4 && this.pixelRatio < this.maxRatio) {
      this.pixelRatio = Math.min(this.maxRatio, this.pixelRatio * 1.1);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.fastTime = 0;
      return true;
    }
    return false;
  }

  /** Average FPS over the stored window of frames. */
  averageFps(): number {
    if (this.samples.length === 0) return 0;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    return 1000 / avg;
  }

  resetSamples(): void {
    this.samples = [];
  }
}
