/**
 * requestAnimationFrame loop with clamped frame deltas, plus a fixed-step
 * integrator so simulations behave identically at 30, 60 or 144 Hz.
 */
export type FrameCallback = (dt: number, time: number) => void;

export class AnimationScheduler {
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = false;
  constructor(private onFrame: FrameCallback) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.time += dt;
      this.onFrame(dt, this.time);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}

/** Fixed time-step accumulator. Returns the interpolation factor alpha in [0,1). */
export class FixedStepper {
  private acc = 0;
  constructor(public stepSeconds: number, public maxStepsPerFrame = 12) {}
  advance(dt: number, step: () => void): number {
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.stepSeconds && n < this.maxStepsPerFrame) {
      step();
      this.acc -= this.stepSeconds;
      n++;
    }
    if (n === this.maxStepsPerFrame) this.acc = 0; // avoid spiral of death after a stall
    return this.acc / this.stepSeconds;
  }
  reset(): void {
    this.acc = 0;
  }
}
