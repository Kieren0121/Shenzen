import { Rng } from '../../shared/Random';

export type Zone = 'port' | 'shekou' | 'westInd' | 'northInd' | 'cbd' | 'oldtown' | 'res90' | 'res00' | 'resLate';

export type BlockKind =
  | 'port'
  | 'industrialSheds'
  | 'industrialMulti'
  | 'resMid'
  | 'resTower'
  | 'urbanVillage'
  | 'cbd'
  | 'park'
  | 'oldtown'
  | 'landmark'
  | 'redevelop';

export interface Block {
  id: number;
  cx: number;
  cz: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  zone: Zone;
  kind: BlockKind;
  /** Year the site starts being developed (illustrative). */
  year: number;
  seed: number;
  ground: number;
  groundYear: number;
}

/** Ground codes written into the development map (see Terrain.ts shader). */
export const GROUND = { NONE: 0, URBAN: 1, INDUSTRIAL: 2, PORT: 3, PARK: 4, RES: 5, PLAZA: 6 } as const;

export interface BuildingRec {
  arch: string;
  x: number;
  z: number;
  y?: number;
  rot: number;
  scale?: number;
  life: [number, number, number, number];
  tint: [number, number, number];
  seed: number;
  /** footprint half extents in world axes, for overlap tests */
  hx: number;
  hz: number;
}

export interface TreeRec {
  x: number;
  z: number;
  scale: number;
  rot: number;
  life: [number, number, number, number];
  tint: [number, number, number];
  seed: number;
}

export const NEVER = 9999;

/** Spatial hash of "new" structures, used to time the removal of old ones. */
export class OccupancyGrid {
  private cells = new Map<number, { x0: number; z0: number; x1: number; z1: number; start: number }[]>();
  constructor(private size = 60) {}
  private key(i: number, j: number): number {
    return (i + 4000) * 10000 + (j + 4000);
  }
  add(x0: number, z0: number, x1: number, z1: number, start: number): void {
    const s = this.size;
    for (let i = Math.floor(x0 / s); i <= Math.floor(x1 / s); i++) {
      for (let j = Math.floor(z0 / s); j <= Math.floor(z1 / s); j++) {
        const k = this.key(i, j);
        let arr = this.cells.get(k);
        if (!arr) this.cells.set(k, (arr = []));
        arr.push({ x0, z0, x1, z1, start });
      }
    }
  }
  /** Earliest start year of any new structure overlapping the box (Infinity if none). */
  earliest(x0: number, z0: number, x1: number, z1: number): number {
    const s = this.size;
    let best = Infinity;
    for (let i = Math.floor(x0 / s); i <= Math.floor(x1 / s); i++) {
      for (let j = Math.floor(z0 / s); j <= Math.floor(z1 / s); j++) {
        const arr = this.cells.get(this.key(i, j));
        if (!arr) continue;
        for (const r of arr) {
          if (r.x1 < x0 || r.x0 > x1 || r.z1 < z0 || r.z0 > z1) continue;
          if (r.start < best) best = r.start;
        }
      }
    }
    return best;
  }
}

/** Shared context passed to the district fillers. */
export interface FillContext {
  rng: Rng;
  addBuilding(arch: string, x: number, z: number, rot: number, start: number, tint: [number, number, number], opts?: { end?: number; scale?: number; y?: number; noCrane?: boolean }): BuildingRec | null;
  addTree(x: number, z: number, start: number, scale?: number): void;
  archSize(arch: string): { w: number; d: number; h: number };
}

/** Build duration in years for a structure of height h (metres). */
export function buildDuration(h: number): number {
  return 0.55 + h / 160;
}

/** Linear-space tint palettes. */
import { lin } from '../../shared/Materials';
export const PALETTE = {
  residential: ['#d9d4c9', '#c9b99a', '#bfc1be', '#d3b5aa', '#c4ad86', '#aebcc4', '#dccfb0', '#c8c4bc', '#b99c86', '#9fa6a8', '#e2ddd2'].map(lin),
  urbanVillage: ['#d8d3ca', '#c9a594', '#cbb57a', '#aaa79f', '#a9b9bf', '#bfb196', '#9c8f80'].map(lin),
  village: ['#d7d0c1', '#9a958c', '#bba283', '#c9bfa9'].map(lin),
  oldtown: ['#d9d2c2', '#c8c0ac', '#b9b4a8', '#d8c8a8', '#a9b2b4'].map(lin),
  factory: ['#c9cdd1', '#5b80ac', '#e2e4e4', '#6aa3a0', '#ddd6c2', '#9fb0bf'].map(lin),
  factoryTile: ['#e0ded7', '#cfd3cf', '#d7e0d6', '#e6dfcf'].map(lin),
  glass: ['#3f6874', '#5d7489', '#2b3f55', '#5b5242', '#33605a', '#4b5f70'].map(lin),
  office: ['#d8d6d0', '#c7c3ba', '#b6bcc2'].map(lin),
  craneSTS: ['#2e5d98', '#b5392c', '#d8d8d4'].map(lin),
  craneTower: ['#e2b324', '#d9a21b'].map(lin),
  hull: ['#1f2c40', '#1b1b1d', '#5f2a22', '#2a4f80'].map(lin),
  car: ['#e8e8e6', '#1c1c1e', '#9aa0a6', '#b42a24', '#2b4c7e', '#d9d2c0', '#4a4f55'].map(lin),
  bus: ['#2f8a4e', '#d2a52b', '#2c6fb3'].map(lin),
  foliage: ['#3f6a2c', '#4d7a32', '#355c2a', '#5a8a3a', '#2f5426', '#456f30'].map(lin),
};
