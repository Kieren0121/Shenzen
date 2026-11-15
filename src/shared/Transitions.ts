export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Frame-rate independent exponential approach. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** Simple value tween driven by the frame loop (seconds). */
export class Tween {
  private from = 0;
  private to = 0;
  private t = 1;
  private dur = 1;
  value = 0;
  constructor(v = 0) {
    this.value = v;
    this.to = v;
  }
  start(to: number, duration: number): void {
    this.from = this.value;
    this.to = to;
    this.t = 0;
    this.dur = Math.max(1e-3, duration);
  }
  set(v: number): void {
    this.value = this.from = this.to = v;
    this.t = 1;
  }
  get active(): boolean {
    return this.t < 1;
  }
  get target(): number {
    return this.to;
  }
  update(dt: number): number {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dur);
      this.value = this.from + (this.to - this.from) * easeInOutCubic(this.t);
    }
    return this.value;
  }
}
