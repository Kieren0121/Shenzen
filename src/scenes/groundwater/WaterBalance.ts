import {
  AQUIFER, demandFraction, levelForStorage, localHead, pumpingLevel, RECHARGE_M3_PER_DAY, storageForLevel, sustainableYield, WELLS,
} from './AquiferModel';

export type WellStatus = 'pumping' | 'reduced' | 'dry' | 'off';
export type TeachingStage = 1 | 2 | 3;

export interface WellState {
  status: WellStatus;
  demand: number; // m³/day requested
  rate: number; // m³/day actually pumped
  staticLevel: number; // m, local water level at the well without its own pumping
  pumpingLevel: number; // m, water level inside the well while pumping
  dry: boolean;
}

export interface GroundwaterState {
  simulationTime: number; // days
  rechargeRate: number; // m³/day entering the aquifer (after any rejection)
  extractionRate: number; // m³/day actually pumped (all wells)
  extractionSlider: number; // 0..100
  aquiferStorage: number; // m³ above the aquifer base
  waterTableElevation: number; // m (average / regional)
  shallowWellStatus: WellStatus;
  deepWellStatus: WellStatus;
  isPlaying: boolean;
}

/**
 * Fixed-step water-balance integrator (explicit Euler, Δt = 1 day).
 * Separate from all rendering: the 3D scene only reads its state.
 */
export class GroundwaterSimulation {
  time = 0;
  storage = storageForLevel(AQUIFER.initialWaterTable);
  slider: number;
  wells: WellState[];
  isPlaying = true;
  // diagnostics for mass-balance testing
  cumulativeRecharge = 0;
  cumulativeExtraction = 0;
  cumulativeRejected = 0;
  lastRecharge = RECHARGE_M3_PER_DAY;
  private readonly initialSlider: number;

  constructor(initialSlider: number) {
    this.initialSlider = initialSlider;
    this.slider = initialSlider;
    this.wells = WELLS.map(() => ({ status: 'pumping', demand: 0, rate: 0, staticLevel: AQUIFER.initialWaterTable, pumpingLevel: AQUIFER.initialWaterTable, dry: false }));
    this.updateWells();
  }

  get waterTable(): number {
    return levelForStorage(this.storage);
  }

  get rates(): number[] {
    return this.wells.map((w) => w.rate);
  }

  get extraction(): number {
    return this.wells.reduce((a, w) => a + w.rate, 0);
  }

  get demand(): number {
    return this.wells.reduce((a, w) => a + w.demand, 0);
  }

  setExtraction(slider: number): void {
    this.slider = Math.min(100, Math.max(0, slider));
    this.updateWells();
  }

  /** Recompute well yields from the current water table (no time advance). */
  updateWells(): void {
    const h = this.waterTable;
    const f = demandFraction(this.slider);
    const prevRates = this.rates;
    WELLS.forEach((def, i) => {
      const w = this.wells[i];
      w.demand = def.maxDemand * f;
      // static local level: regional table plus interference from the OTHER wells
      w.staticLevel = localHead(h, def.x, def.z, prevRates, i);
      const qMax = sustainableYield(w.staticLevel, def.intake);
      if (w.demand <= 1e-9) {
        w.status = 'off';
        w.rate = 0;
        w.dry = false;
      } else if (w.dry) {
        // restart only when the well could again supply a useful share (hysteresis)
        if (qMax >= 0.3 * w.demand) w.dry = false;
      } else if (qMax < 0.1 * w.demand) {
        w.dry = true;
      }
      if (w.status !== 'off' || w.demand > 0) {
        if (w.dry) {
          w.rate = 0;
          w.status = 'dry';
        } else {
          w.rate = Math.min(w.demand, qMax);
          w.status = w.rate < w.demand * 0.999 ? 'reduced' : 'pumping';
        }
      }
      w.pumpingLevel = pumpingLevel(w.staticLevel, w.rate);
    });
  }

  /** Advance one fixed step (AQUIFER.stepDays). */
  step(): void {
    const dt = AQUIFER.stepDays;
    this.updateWells();
    const q = this.extraction;
    let r = RECHARGE_M3_PER_DAY;
    // When the aquifer is full to its highest modelled level, surplus recharge cannot enter.
    const sMax = storageForLevel(AQUIFER.maxWaterTable);
    const sMin = storageForLevel(AQUIFER.minWaterTable);
    let next = this.storage + (r - q) * dt;
    if (next > sMax) {
      const rejected = next - sMax;
      this.cumulativeRejected += rejected;
      r -= rejected / dt;
      next = sMax;
    }
    if (next < sMin) next = sMin; // cannot happen while wells stop at their intakes; kept as a guard
    this.cumulativeRecharge += r * dt;
    this.cumulativeExtraction += q * dt;
    this.lastRecharge = r;
    this.storage = next;
    this.time += dt;
  }

  /** Net change in storage per day at the current state (m³/day). */
  get netFlow(): number {
    return this.lastRecharge - this.extraction;
  }

  get stage(): TeachingStage {
    if (this.wells[0].dry) return 3;
    if (this.demand > RECHARGE_M3_PER_DAY * 1.005) return 2;
    return 1;
  }

  reset(): void {
    this.time = 0;
    this.storage = storageForLevel(AQUIFER.initialWaterTable);
    this.slider = this.initialSlider;
    this.cumulativeRecharge = this.cumulativeExtraction = this.cumulativeRejected = 0;
    this.lastRecharge = RECHARGE_M3_PER_DAY;
    this.wells.forEach((w) => {
      w.dry = false;
      w.status = 'pumping';
    });
    this.updateWells();
    this.isPlaying = true;
  }

  getState(): GroundwaterState {
    return {
      simulationTime: this.time,
      rechargeRate: this.lastRecharge,
      extractionRate: this.extraction,
      extractionSlider: this.slider,
      aquiferStorage: this.storage,
      waterTableElevation: this.waterTable,
      shallowWellStatus: this.wells[0].status,
      deepWellStatus: this.wells[1].status,
      isPlaying: this.isPlaying,
    };
  }
}
