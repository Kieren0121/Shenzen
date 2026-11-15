/**
 * Play / pause / scrub controller for a bounded value (the Shenzhen year).
 * Playback advances with real elapsed time, so it is frame-rate independent.
 */
export class TimelineController {
  value: number;
  isPlaying = false;
  private target: number | null = null;
  private seekSpeed = 0;
  private listeners: ((v: number) => void)[] = [];

  constructor(public readonly min: number, public readonly max: number, public durationSeconds: number) {
    this.value = min;
  }

  get rate(): number {
    return (this.max - this.min) / this.durationSeconds;
  }

  onChange(fn: (v: number) => void): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.value);
  }

  play(): void {
    if (this.value >= this.max - 1e-6) this.value = this.min;
    this.target = null;
    this.isPlaying = true;
    this.emit();
  }

  pause(): void {
    this.isPlaying = false;
    this.target = null;
  }

  toggle(): void {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  /** Jump immediately (used by the slider and the 1980 / 2020 buttons). */
  set(v: number): void {
    this.target = null;
    this.value = Math.min(this.max, Math.max(this.min, v));
    this.emit();
  }

  /** Smoothly move to a value over `seconds` (used by teaching moments). */
  seek(v: number, seconds: number): void {
    this.isPlaying = false;
    this.target = Math.min(this.max, Math.max(this.min, v));
    this.seekSpeed = Math.abs(this.target - this.value) / Math.max(0.1, seconds);
  }

  get seeking(): boolean {
    return this.target !== null;
  }

  update(dt: number): boolean {
    if (this.target !== null) {
      const d = this.target - this.value;
      const step = this.seekSpeed * dt;
      if (Math.abs(d) <= step) {
        this.value = this.target;
        this.target = null;
      } else this.value += Math.sign(d) * step;
      this.emit();
      return true;
    }
    if (!this.isPlaying) return false;
    this.value += this.rate * dt;
    if (this.value >= this.max) {
      this.value = this.max;
      this.isPlaying = false;
    }
    this.emit();
    return true;
  }

  reset(): void {
    this.isPlaying = false;
    this.target = null;
    this.value = this.min;
    this.emit();
  }
}
