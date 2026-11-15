import { TimelineController } from '../../core/TimelineController';
import { CHAIN, phaseName, POPULATION } from './ShenzhenData';

/**
 * Shenzhen model state (Section 14): yearPosition, isPlaying, cameraPreset,
 * presentationMode is held by the Application. The visual progression between
 * the two endpoint years is illustrative only.
 */
export const YEAR_MIN = 1980;
export const YEAR_MAX = 2020;
/** Full automated transformation length (spec: about 20 seconds). */
export const PLAY_SECONDS = 20;

export class UrbanTimeline extends TimelineController {
  constructor() {
    super(YEAR_MIN, YEAR_MAX, PLAY_SECONDS);
  }
  get displayYear(): number {
    return Math.floor(this.value + 1e-6);
  }
  get phase(): string {
    return phaseName(this.value);
  }
  /** Which endpoint population value applies (null in between: no invented data). */
  get populationReference(): 'start' | 'end' | null {
    if (this.value <= POPULATION.start.year + 0.5) return 'start';
    if (this.value >= POPULATION.end.year - 0.25) return 'end';
    return null;
  }
  /** Index of the latest cause→effect step reached. */
  get chainIndex(): number {
    let i = 0;
    CHAIN.forEach((c, k) => {
      if (this.value >= c.at) i = k;
    });
    return i;
  }
}
