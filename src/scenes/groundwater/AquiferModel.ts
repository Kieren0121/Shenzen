/**
 * Conceptual unconfined-aquifer model for Simulation B ("Taking too much water").
 *
 * IMPORTANT: this is an illustrative teaching model, NOT a calibrated
 * hydrogeological model of northern China, Plachimada or any real place.
 * All parameter values are plausible textbook values chosen so that the
 * behaviour is physically coherent; none are measurements.
 *
 * Units: metres (m), days (d), cubic metres (m³). Elevations are measured
 * from the base of the model (datum = 0 m).
 *
 * Water balance:            ΔS = (R − Q − D) Δt, with D (other net outflows) = 0
 * Water-table change:       Δh = ΔS / (A × Sy)
 * Local cone of depression: Dupuit–Thiem steady-state approximation for an
 *                           unconfined aquifer, superposed for several wells:
 *                           h(r)² = H² − Σ (Qᵢ / (π K)) ln(R₀ / rᵢ),  rᵢ < R₀
 */

export const AQUIFER = {
  groundSurface: 50, // m, average ground level
  baseElevation: 14, // m, top of the low-permeability clay / rock (aquifer base)
  lengthX: 1000, // m, modelled aquifer length (shown horizontally compressed)
  widthZ: 600, // m, modelled aquifer width
  get area(): number {
    return this.lengthX * this.widthZ; // A = 600,000 m²
  },
  /** Specific yield of the unconsolidated sand & gravel aquifer (dimensionless).
   *  Typical published ranges: ~0.15–0.30 for sand and gravel (e.g. Johnson, 1967). */
  specificYield: 0.2,
  /** Hydraulic conductivity, m/day (medium–coarse sand). Used only for the cone approximation. */
  hydraulicConductivity: 20,
  /** Radius of influence R₀ (m) used by the Dupuit–Thiem approximation. */
  radiusOfInfluence: 300,
  /** Well radius r_w (m). */
  wellRadius: 0.15,
  initialWaterTable: 42, // m (8 m below ground)
  /** Highest modelled water table: above this, extra recharge is rejected (runs off). */
  maxWaterTable: 47.5,
  /** Lowest modelled water table (just above the aquifer base). */
  minWaterTable: 14.3,
  /** Illustrative average rainfall (m/year) and the fraction that becomes recharge. */
  rainfall: 0.6,
  rechargeFraction: 0.2,
  /** Fixed simulation step (days) and playback speed (model days per real second). */
  stepDays: 1,
  daysPerSecond: 50,
} as const;

/** Average recharge rate R in m³/day = rainfall × recharge fraction × area / 365. */
export const RECHARGE_M3_PER_DAY = (AQUIFER.rainfall * AQUIFER.rechargeFraction * AQUIFER.area) / 365;

export interface WellDefinition {
  id: 'A' | 'B';
  name: string;
  /** Position in model metres (x along the block, z across it). */
  x: number;
  z: number;
  /** Pump intake elevation (m). The well cannot yield water below this level. */
  intake: number;
  screenTop: number;
  screenBottom: number;
  bottom: number;
  /** Water demand at the HIGH end of the extraction control (m³/day). */
  maxDemand: number;
  serves: string;
}

/** Well positions are on the front cut-away plane (z = +300 m) so the section passes through them. */
export const WELLS: WellDefinition[] = [
  { id: 'A', name: 'Well A (shallow)', x: -175, z: 300, intake: 35, screenTop: 37.5, screenBottom: 34.5, bottom: 34, maxDemand: 225, serves: 'homes' },
  { id: 'B', name: 'Well B (deep)', x: 200, z: 300, intake: 18, screenTop: 21.5, screenBottom: 17.5, bottom: 17, maxDemand: 675, serves: 'farm and factory' },
];

export const TOTAL_MAX_DEMAND = WELLS.reduce((a, w) => a + w.maxDemand, 0);

/** Extraction control: slider position v in [0, 100] → fraction of maximum demand. */
export const EXTRACTION = { minFraction: 0.06, maxFraction: 1.0 };
export function demandFraction(v: number): number {
  const t = Math.min(100, Math.max(0, v)) / 100;
  return EXTRACTION.minFraction + (EXTRACTION.maxFraction - EXTRACTION.minFraction) * t;
}
export function sliderForFraction(f: number): number {
  return ((f - EXTRACTION.minFraction) / (EXTRACTION.maxFraction - EXTRACTION.minFraction)) * 100;
}
/** Slider value at which total demand equals recharge ("balanced"). */
export const BALANCED_SLIDER = sliderForFraction(RECHARGE_M3_PER_DAY / TOTAL_MAX_DEMAND);

/** Coefficient Q/(πK) in m² for a pumping rate Q (m³/day). */
export function coneCoefficient(q: number): number {
  return q / (Math.PI * AQUIFER.hydraulicConductivity);
}

/**
 * Local water-table elevation at a point, given the average (regional) water
 * table and the current pumping of each well (Dupuit–Thiem superposition).
 * `excludeWell` gives the "static" level at a well (its own pumping excluded).
 */
export function localHead(regional: number, x: number, z: number, rates: number[], excludeWell = -1): number {
  const base = AQUIFER.baseElevation;
  const H = Math.max(regional - base, 0.05);
  let s = 0;
  WELLS.forEach((w, i) => {
    if (i === excludeWell || rates[i] <= 0) return;
    const r = Math.max(Math.hypot(x - w.x, z - w.z), AQUIFER.wellRadius);
    if (r < AQUIFER.radiusOfInfluence) s += coneCoefficient(rates[i]) * Math.log(AQUIFER.radiusOfInfluence / r);
  });
  return base + Math.sqrt(Math.max(H * H - s, 0.0025));
}

/**
 * Largest pumping rate (m³/day) the well can sustain while the pumping water
 * level in the well stays at or above its intake (from the same Dupuit–Thiem
 * relation): Q = πK (H_s² − h_int²) / ln(R₀ / r_w).
 */
export function sustainableYield(staticLevel: number, intake: number): number {
  const base = AQUIFER.baseElevation;
  const Hs = staticLevel - base;
  const hi = intake - base;
  if (Hs <= hi) return 0;
  return (Math.PI * AQUIFER.hydraulicConductivity * (Hs * Hs - hi * hi)) / Math.log(AQUIFER.radiusOfInfluence / AQUIFER.wellRadius);
}

/** Pumping water level in a well (m) for a given static level and rate. */
export function pumpingLevel(staticLevel: number, q: number): number {
  const base = AQUIFER.baseElevation;
  const Hs = Math.max(staticLevel - base, 0.05);
  const s = coneCoefficient(q) * Math.log(AQUIFER.radiusOfInfluence / AQUIFER.wellRadius);
  return base + Math.sqrt(Math.max(Hs * Hs - s, 0.0025));
}

/** Storage (m³) held between the aquifer base and a water-table elevation. */
export function storageForLevel(h: number): number {
  return AQUIFER.area * AQUIFER.specificYield * (h - AQUIFER.baseElevation);
}
export function levelForStorage(s: number): number {
  return AQUIFER.baseElevation + s / (AQUIFER.area * AQUIFER.specificYield);
}

/** Display mapping: the cut-away shows the model with horizontal distances compressed 5×. */
export const DISPLAY = { horizontalScale: 5 }; // model metres per display unit (vertical is 1:1)
