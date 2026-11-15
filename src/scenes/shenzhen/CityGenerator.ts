import * as THREE from 'three';
import { Rng, fbm, hash2 } from '../../shared/Random';
import type { Archetype } from './BuildingAssets';
import {
  Block, BlockKind, BuildingRec, buildDuration, FillContext, GROUND, NEVER, OccupancyGrid, PALETTE, TreeRec, Zone,
} from './CityTypes';
import { fillIndustrialMulti, fillIndustrialSheds } from './FactoryDistrict';
import { fillOldTownRedevelopment, fillPark, fillResMid, fillResTower, fillUrbanVillage } from './ResidentialDistrict';
import { fillPortWarehouses, fillPortYard, fillQuay } from './PortDistrict';
import { coastZ, isBuildable, landDistance, terrainHeight } from './Terrain';

/**
 * Deterministic generator for the representative Shenzhen reconstruction.
 * Development years are an illustrative sequence (early industrial zone and
 * port first, then housing, then the commercial centre), not a record of
 * when particular real buildings were completed.
 */

export const GRID = { x0: -4300, x1: 3950, z0: -2450, z1: 1550, step: 250 };
export const ARTERIAL_W = 46;
export const SECONDARY_W = 22;

export type RoadKind = 'arterial' | 'secondary';
export interface RoadSeg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  kind: RoadKind;
  year: number;
  dur: number;
  width: number;
}
export interface Junction {
  x: number;
  z: number;
  size: number;
  year: number;
}

export interface CityPlan {
  blocks: Block[];
  roads: RoadSeg[];
  junctions: Junction[];
  buildings: BuildingRec[];
  trees: TreeRec[];
  devMap: { data: Uint8Array; w: number; h: number; bounds: THREE.Vector4 };
  anchors: Record<string, THREE.Vector3>;
  berths: { x: number; z: number }[];
  railway: { x: number; z0: number; z1: number };
  migrationPaths: THREE.Vector3[][];
  stats: Record<string, number>;
}

const OLD_TOWN_ORIGIN = { x: 3150, z: 250 };
const SEZ_ORIGIN = { x: -2900, z: 250 };
const RAIL_X = 3200;

function isArterialX(x: number): boolean {
  return (((x + 300) % 1000) + 1000) % 1000 === 0;
}
function isArterialZ(z: number): boolean {
  return (((z - 300) % 1000) + 1000) % 1000 === 0;
}

export function zoneAt(x: number, z: number): Zone {
  if (x < -2800 && z > 300) return 'port';
  if (x >= 2700 && z > -700) return 'oldtown';
  if (x >= -3550 && x < -2300 && z > -700) return 'shekou';
  if (x < -1300 && z <= -700) return 'westInd';
  if (x < -2300 && z > -700) return 'shekou';
  if (x >= 1700 && z <= -1200) return 'northInd';
  if (x >= -300 && x < 1700 && z > -700) return 'cbd';
  if (x >= 1700 && x < 2700 && z > -700) return 'res90';
  if (x >= -1300 && x < -300 && z > -700) return 'res90';
  if (x >= -2300 && x < -1300 && z > -700) return 'resLate';
  return 'res00';
}

function zoneYear(zone: Zone, x: number, z: number, rng: Rng): number {
  const noise = rng.range(-1.2, 1.2);
  const dOld = Math.hypot(x - OLD_TOWN_ORIGIN.x, z - OLD_TOWN_ORIGIN.z) / 1000;
  const dSez = Math.hypot(x - SEZ_ORIGIN.x, z - SEZ_ORIGIN.z) / 1000;
  switch (zone) {
    case 'oldtown':
      return 1975;
    case 'shekou':
      return 1981 + dSez * 2.6 + noise * 0.6;
    case 'port':
      return 1985 + Math.max(0, (z - 400) / 1300) * 9 + Math.abs(x + 3600) / 1000 * 3 + noise;
    case 'westInd':
      return 1986 + Math.hypot(x + 2600, z + 700) / 1000 * 4.5 + noise;
    case 'northInd':
      return 1994 + Math.hypot(x - 2600, z + 1200) / 1000 * 4 + noise;
    case 'res90':
      return 1987 + Math.min(dOld, Math.hypot(x + 800, z - 300) / 1000 + 0.6) * 4.2 + noise;
    case 'cbd':
      return 1995 + Math.abs(x - 700) / 1000 * 5 + Math.max(0, (300 - z) / 1000) * 3 + noise;
    case 'res00':
      return 1997 + Math.hypot(x - 300, z + 700) / 1000 * 5.5 + noise;
    case 'resLate':
      return 2005 + Math.abs(x + 1300) / 1000 * 6 + noise;
  }
}

export function generateCity(archetypes: Map<string, Archetype>): CityPlan {
  const rng = new Rng(19800820);
  const occ = new OccupancyGrid(60);
  const buildings: BuildingRec[] = [];
  const trees: TreeRec[] = [];
  const blocks: Block[] = [];
  const stats: Record<string, number> = {};

  const size = (arch: string) => {
    const a = archetypes.get(arch);
    if (!a) throw new Error(`Unknown archetype ${arch}`);
    return { w: a.w, d: a.d, h: a.h };
  };

  // ------------------------------------------------------------ blocks
  const xs: number[] = [];
  for (let x = GRID.x0; x <= GRID.x1; x += GRID.step) xs.push(x);
  const zs: number[] = [];
  for (let z = GRID.z0; z <= GRID.z1; z += GRID.step) zs.push(z);
  const cellValid: boolean[][] = [];
  const cellBlock: (Block | null)[][] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    cellValid.push([]);
    cellBlock.push([]);
    for (let j = 0; j < zs.length - 1; j++) {
      const ax = xs[i], bx = xs[i + 1], az = zs[j], bz = zs[j + 1];
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      let ok = isBuildable(cx, cz, 70);
      for (const [px, pz] of [[ax + 25, az + 25], [bx - 25, az + 25], [ax + 25, bz - 25], [bx - 25, bz - 25]]) ok = ok && isBuildable(px, pz, 40);
      if (Math.abs(cx - RAIL_X) < 140) ok = false; // railway corridor
      cellValid[i].push(ok);
      cellBlock[i].push(null);
    }
  }
  let blockId = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      if (!cellValid[i][j]) continue;
      const ax = xs[i], bx = xs[i + 1], az = zs[j], bz = zs[j + 1];
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      const zone = zoneAt(cx, cz);
      const brng = new Rng(Math.floor(hash2(i, j, 77) * 1e9));
      const hw = (x: number) => (isArterialX(x) ? ARTERIAL_W : SECONDARY_W) / 2 + 9;
      const hzw = (z: number) => (isArterialZ(z) ? ARTERIAL_W : SECONDARY_W) / 2 + 9;
      const blk: Block = {
        id: blockId++,
        cx, cz,
        x0: ax + hw(ax), x1: bx - hw(bx), z0: az + hzw(az), z1: bz - hzw(bz),
        zone,
        kind: 'resMid',
        year: Math.max(1975, zoneYear(zone, cx, cz, brng)),
        seed: brng.next(),
        ground: GROUND.URBAN,
        groundYear: 0,
      };
      blocks.push(blk);
      cellBlock[i][j] = blk;
    }
  }

  // ------------------------------------------------------------ villages (existing in 1980)
  type Village = { x: number; z: number; r: number; fishing: boolean };
  const villages: Village[] = [];
  const vr = new Rng(1980);
  let tries = 0;
  while (villages.length < 34 && tries++ < 4000) {
    const x = vr.range(-4400, 3500), z = vr.range(-2500, 1600);
    const ld = landDistance(x, z);
    const fishing = ld > 70 && ld < 190 && villages.filter((v) => v.fishing).length < 6;
    if (!fishing && !isBuildable(x, z, 120)) continue;
    if (x > 2600 && z > -800 && z < 900) continue; // old town itself
    if (villages.some((v) => Math.hypot(v.x - x, v.z - z) < 520)) continue;
    villages.push({ x, z, r: vr.range(70, 130), fishing });
  }

  // ------------------------------------------------------------ block kinds
  const villageInBlock = (b: Block) => villages.some((v) => v.x > b.x0 - 30 && v.x < b.x1 + 30 && v.z > b.z0 - 30 && v.z < b.z1 + 30);
  const landmarkCell = { x: 825, z: 175 };
  for (const b of blocks) {
    const r = new Rng(Math.floor(b.seed * 1e9));
    switch (b.zone) {
      case 'port':
        b.kind = 'port';
        b.ground = GROUND.PORT;
        break;
      case 'shekou':
        b.kind = r.chance(0.8) ? 'industrialMulti' : 'industrialSheds';
        b.ground = GROUND.INDUSTRIAL;
        if (b.kind === 'industrialMulti' && r.chance(0.22)) b.kind = 'redevelop';
        break;
      case 'westInd':
      case 'northInd':
        b.kind = r.chance(0.72) ? 'industrialSheds' : 'industrialMulti';
        b.ground = GROUND.INDUSTRIAL;
        if (villageInBlock(b) && r.chance(0.6)) {
          b.kind = 'urbanVillage';
          b.ground = GROUND.URBAN;
        }
        break;
      case 'cbd':
        if (Math.abs(b.cx - 575) < 10 || Math.abs(b.cx - 825) < 10 && b.cz < 0) {
          b.kind = 'park';
          b.ground = GROUND.PARK;
        } else if (Math.abs(b.cx - landmarkCell.x) < 10 && Math.abs(b.cz - landmarkCell.z) < 10) {
          b.kind = 'landmark';
          b.ground = GROUND.PLAZA;
        } else {
          b.kind = 'cbd';
          b.ground = GROUND.PLAZA;
        }
        break;
      case 'oldtown':
        b.kind = 'oldtown';
        b.ground = GROUND.URBAN;
        break;
      case 'res90':
        b.kind = villageInBlock(b) && r.chance(0.7) ? 'urbanVillage' : r.chance(0.9) ? 'resMid' : 'park';
        b.ground = b.kind === 'park' ? GROUND.PARK : b.kind === 'urbanVillage' ? GROUND.URBAN : GROUND.RES;
        break;
      case 'res00':
        b.kind = villageInBlock(b) && r.chance(0.6) ? 'urbanVillage' : r.chance(0.08) ? 'park' : r.chance(0.12) ? 'resMid' : 'resTower';
        b.ground = b.kind === 'park' ? GROUND.PARK : b.kind === 'urbanVillage' ? GROUND.URBAN : GROUND.RES;
        break;
      case 'resLate':
        b.kind = villageInBlock(b) && r.chance(0.5) ? 'urbanVillage' : 'resTower';
        b.ground = b.kind === 'urbanVillage' ? GROUND.URBAN : GROUND.RES;
        break;
    }
    if (b.kind === 'urbanVillage') b.year = Math.max(1986, Math.min(b.year, 1992 + r.range(0, 4)));
    if (b.kind === 'resMid') b.year = Math.min(b.year, 2002);
    b.groundYear = b.year;
  }

  // ------------------------------------------------------------ fill context
  const addBuilding: FillContext['addBuilding'] = (arch, x, z, rot, start, tint, opts) => {
    const s = size(arch);
    const sc = opts?.scale ?? 1;
    const across = Math.abs(Math.sin(rot)) > 0.5;
    const hx = ((across ? s.d : s.w) / 2) * sc, hz = ((across ? s.w : s.d) / 2) * sc;
    const dur = buildDuration(s.h * sc);
    const end = opts?.end ?? NEVER;
    const rec: BuildingRec = {
      arch, x, z, rot,
      y: opts?.y ?? terrainHeight(x, z) - 0.2,
      scale: sc,
      life: [start, start + dur, end, end + 0.6],
      tint,
      seed: rng.next(),
      hx, hz,
    };
    buildings.push(rec);
    occ.add(x - hx, z - hz, x + hx, z + hz, start);
    stats[arch] = (stats[arch] ?? 0) + 1;
    const a = archetypes.get(arch)!;
    if (!opts?.noCrane && (a.group === 'residential' || a.group === 'commercial' || a.group === 'old') && s.h > 40) {
      // tower crane beside the building while it is under construction
      const cs = Math.min(6.5, Math.max(0.7, (s.h + 25) / 100));
      const side = rng.chance(0.5) ? 1 : -1;
      const cx = x + side * (hx + 6);
      buildings.push({
        arch: 'crane', x: cx, z: z + rng.range(-hz * 0.5, hz * 0.5), rot: side > 0 ? Math.PI : 0,
        y: terrainHeight(cx, z) - 0.2, scale: cs,
        life: [start - 0.15, start + 0.2, start + dur - 0.1, start + dur + 0.25],
        tint: rng.pick(PALETTE.craneTower), seed: rng.next(), hx: 2, hz: 2,
      });
      occ.add(cx - 3, z - hz * 0.5 - 3, cx + 3, z + hz * 0.5 + 3, start - 0.15);
      stats.crane = (stats.crane ?? 0) + 1;
    }
    return rec;
  };
  const addTree: FillContext['addTree'] = (x, z, start, scale = 1) => {
    trees.push({ x, z, scale: scale * rng.range(0.85, 1.15), rot: rng.range(0, Math.PI * 2), life: [start, start + 0.8, NEVER, NEVER + 1], tint: rng.pick(PALETTE.foliage), seed: rng.next() });
  };
  const ctx: FillContext = { rng, addBuilding, addTree, archSize: size };

  // ------------------------------------------------------------ fill blocks
  const oldTownBlocks: Block[] = [];
  for (const b of blocks) {
    const r = new Rng(Math.floor(b.seed * 1e9) + 5);
    const local: FillContext = { ...ctx, rng: r };
    switch (b.kind) {
      case 'port':
        if (b.z0 > coastZ(b.cx) - 420) fillPortYard(b, local);
        else fillPortWarehouses(b, local);
        break;
      case 'industrialMulti':
        fillIndustrialMulti(b, local);
        break;
      case 'industrialSheds':
        fillIndustrialSheds(b, local);
        break;
      case 'redevelop': {
        // early factories later replaced by apartments and offices (industrial upgrading)
        const until = 2009 + r.range(0, 3);
        const before = buildings.length;
        fillIndustrialMulti(b, local);
        for (let k = before; k < buildings.length; k++) {
          const rec = buildings[k];
          if (rec.arch === 'crane') continue;
          rec.life[2] = until;
          rec.life[3] = until + 0.7;
        }
        const nb: Block = { ...b, year: until + 1.2 };
        fillResTower(nb, local);
        b.groundYear = b.year;
        break;
      }
      case 'resMid':
        fillResMid(b, local);
        break;
      case 'resTower':
        fillResTower(b, local);
        break;
      case 'urbanVillage':
        fillUrbanVillage(b, local);
        break;
      case 'park':
        fillPark(b, local);
        break;
      case 'oldtown':
        oldTownBlocks.push(b);
        if (r.chance(0.6)) fillOldTownRedevelopment({ ...b, year: 1982 + r.range(0, 13) }, local);
        break;
      case 'cbd': {
        const W = b.x1 - b.x0, D = b.z1 - b.z0;
        const nx = W > 170 ? 2 : 1, nz = D > 170 ? 2 : 1;
        let k = 0;
        for (let i = 0; i < nx; i++) {
          for (let j = 0; j < nz; j++) {
            const x = b.x0 + (i + 0.5) * (W / nx), z = b.z0 + (j + 0.5) * (D / nz);
            const yr = b.year + k * 1.6 + r.range(0, 2);
            let arch: string;
            if (yr < 2001) arch = r.pick(['offs100', 'offs130', 'offa150', 'mall']);
            else if (yr < 2010) arch = r.pick(['offa150', 'offa210', 'offr180', 'offb200', 'mall']);
            else arch = r.pick(['offa210', 'offa270', 'offb300', 'offr240', 'offb200']);
            const tintPool = arch.startsWith('offs') || arch === 'mall' ? PALETTE.office : PALETTE.glass;
            addBuilding(arch, x, z, r.chance(0.5) ? 0 : Math.PI / 2, yr, r.pick(tintPool));
            k++;
          }
        }
        for (let x = b.x0 + 5; x < b.x1; x += 18) {
          addTree(x, b.z0 + 2, b.year + 2, 0.8);
          addTree(x, b.z1 - 2, b.year + 2, 0.8);
        }
        break;
      }
      case 'landmark': {
        addBuilding('landmarkA', (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2 + 10, 0, 2009.5, [0.6, 0.6, 0.6]);
        for (let x = b.x0 + 5; x < b.x1; x += 16) addTree(x, b.z0 + 4, 2014, 0.8);
        break;
      }
    }
  }
  // a second landmark tower near the old town (inspired, not a model of a real building)
  {
    const lb = blocks.find((b) => b.zone === 'oldtown' && Math.abs(b.cx - 2825) < 10 && Math.abs(b.cz - 175) < 10)
      ?? blocks.find((b) => b.zone === 'oldtown');
    if (lb) {
      lb.kind = 'landmark';
      const lm = addBuilding('landmarkB', (lb.x0 + lb.x1) / 2, (lb.z0 + lb.z1) / 2, 0, 2007, PALETTE.glass[1]);
      // earlier towers on this plot are demolished first (urban redevelopment)
      for (const r of buildings) {
        if (r === lm || r.life[0] >= 2007) continue;
        if (r.x < lb.x0 - 10 || r.x > lb.x1 + 10 || r.z < lb.z0 - 10 || r.z > lb.z1 + 10) continue;
        r.life[2] = Math.min(r.life[2], 2005.4);
        r.life[3] = Math.min(r.life[3], 2006.0);
      }
    }
  }

  // ------------------------------------------------------------ roads
  const roads: RoadSeg[] = [];
  const nodeSegs = new Map<string, RoadSeg[]>();
  const nodeKey = (x: number, z: number) => `${x},${z}`;
  const blockAt = (i: number, j: number) => (i >= 0 && j >= 0 && i < xs.length - 1 && j < zs.length - 1 ? cellBlock[i][j] : null);
  const roadOk = (x: number, z: number) => isBuildable(x, z, 30) && Math.abs(x - RAIL_X) > 30;
  const addSeg = (ax: number, az: number, bx: number, bz: number, arterial: boolean, adj: (Block | null)[]) => {
    if (!roadOk(ax, az) || !roadOk(bx, bz) || !roadOk((ax + bx) / 2, (az + bz) / 2)) return;
    const adjB = adj.filter((b): b is Block => !!b);
    if (adjB.length === 0 && !arterial) return;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    let year: number;
    if (adjB.length) year = Math.min(...adjB.map((b) => Math.min(b.year, b.groundYear || b.year))) - (arterial ? 2.2 : 1.3);
    else year = zoneYear(zoneAt(mx, mz), mx, mz, new Rng(Math.floor(hash2(mx, mz, 3) * 1e9))) - 2;
    if (arterial && az === 300 && bz === 300 && Math.min(ax, bx) >= 700) year = Math.min(year, 1976);
    year = Math.max(1972, year);
    // grow from the end nearer the area that developed first
    const origin = zoneAt(mx, mz) === 'port' || mx < -1300 ? SEZ_ORIGIN : OLD_TOWN_ORIGIN;
    const da = Math.hypot(ax - origin.x, az - origin.z), db = Math.hypot(bx - origin.x, bz - origin.z);
    const seg: RoadSeg = da <= db
      ? { ax, az, bx, bz, kind: arterial ? 'arterial' : 'secondary', year, dur: arterial ? 2.2 : 1.1, width: arterial ? ARTERIAL_W : SECONDARY_W }
      : { ax: bx, az: bz, bx: ax, bz: az, kind: arterial ? 'arterial' : 'secondary', year, dur: arterial ? 2.2 : 1.1, width: arterial ? ARTERIAL_W : SECONDARY_W };
    roads.push(seg);
    for (const k of [nodeKey(ax, az), nodeKey(bx, bz)]) {
      let arr = nodeSegs.get(k);
      if (!arr) nodeSegs.set(k, (arr = []));
      arr.push(seg);
    }
    const hw = seg.width / 2;
    occ.add(Math.min(ax, bx) - hw, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, Math.max(az, bz) + hw, year);
  };
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      addSeg(xs[i], zs[j], xs[i], zs[j + 1], isArterialX(xs[i]), [blockAt(i - 1, j), blockAt(i, j)]);
    }
  }
  for (let j = 0; j < zs.length; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      addSeg(xs[i], zs[j], xs[i + 1], zs[j], isArterialZ(zs[j]), [blockAt(i, j - 1), blockAt(i, j)]);
    }
  }
  const junctions: Junction[] = [];
  for (const [k, segs] of nodeSegs) {
    const [x, z] = k.split(',').map(Number);
    junctions.push({ x, z, size: Math.max(...segs.map((s) => s.width)), year: Math.min(...segs.map((s) => s.year)) });
  }

  // street trees on the pavements
  for (const s of roads) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const dx = (s.bx - s.ax) / len, dz = (s.bz - s.az) / len;
    const off = s.width / 2 - 2.2;
    for (let t = 30; t < len - 30; t += s.kind === 'arterial' ? 20 : 30) {
      for (const side of [-1, 1]) {
        addTree(s.ax + dx * t - dz * off * side, s.az + dz * t + dx * off * side, s.year + s.dur + 1.2 + rng.range(0, 1), s.kind === 'arterial' ? 0.75 : 0.6);
      }
      if (s.kind === 'arterial' && Math.round(t / 20) % 2 === 0) addTree(s.ax + dx * t, s.az + dz * t, s.year + s.dur + 1.5, 0.65);
    }
  }

  // ------------------------------------------------------------ quay
  const quayStart = 1988;
  const berths = fillQuay(ctx, -4250, -3000, quayStart);

  // ------------------------------------------------------------ OLD structures (removed only when something new needs the space)
  const clearYearFor = (x: number, z: number, hx: number, hz: number): number => {
    let t = occ.earliest(x - hx - 2, z - hz - 2, x + hx + 2, z + hz + 2) - 0.7;
    if (!Number.isFinite(t)) t = NEVER; // never redeveloped (Infinity would become NaN on the GPU)
    // site clearance: whole block is cleared before development (except organically rebuilt areas)
    for (const b of blocks) {
      if (x < b.x0 - 8 || x > b.x1 + 8 || z < b.z0 - 8 || z > b.z1 + 8) continue;
      if (b.kind === 'urbanVillage' || b.kind === 'oldtown' || b.kind === 'landmark') continue;
      t = Math.min(t, b.year - 1.6);
    }
    return t;
  };
  // villages
  const villageMask: { x: number; z: number; r: number }[] = [];
  for (const v of villages) {
    villageMask.push(v);
    const rot = vr.chance(0.5) ? 0 : 0.12;
    for (let gx = -v.r; gx <= v.r; gx += 18) {
      for (let gz = -v.r; gz <= v.r; gz += 16) {
        if (Math.hypot(gx, gz) > v.r * (0.75 + 0.25 * fbm(gx * 0.02, gz * 0.02, 2, 9))) continue;
        if (!vr.chance(0.72)) continue;
        const x = v.x + gx + vr.range(-1.5, 1.5), z = v.z + gz + vr.range(-1.5, 1.5);
        if (landDistance(x, z) < 30) continue;
        const arch = vr.pick(['village0', 'village0', 'village1', 'village2']);
        const s = size(arch);
        const rr = rot + (vr.chance(0.85) ? 0 : Math.PI);
        const rem = clearYearFor(x, z, s.w / 2, s.d / 2);
        buildings.push({ arch, x, z, rot: rr, y: terrainHeight(x, z) - 0.2, scale: 1, life: [1960, 1960.5, rem, rem + 0.6], tint: vr.pick(PALETTE.village), seed: vr.next(), hx: s.w / 2, hz: s.d / 2 });
        stats[arch] = (stats[arch] ?? 0) + 1;
      }
    }
    // village groves / lychee orchard trees
    for (let k = 0; k < 26; k++) {
      const a = vr.range(0, Math.PI * 2), d = v.r * vr.range(0.9, 1.7);
      const x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d;
      if (landDistance(x, z) < 20) continue;
      const rem = Math.min(NEVER, clearYearFor(x, z, 3, 3));
      trees.push({ x, z, scale: vr.range(0.9, 1.3), rot: vr.range(0, 6.28), life: [1960, 1960.5, rem, rem + 0.6], tint: vr.pick(PALETTE.foliage), seed: vr.next() });
    }
  }
  // old town low-rise fabric (1980)
  for (const b of oldTownBlocks) {
    const r = new Rng(Math.floor(b.seed * 1e9) + 99);
    for (let x = b.x0 + 12; x < b.x1 - 10; x += 24) {
      for (let z = b.z0 + 10; z < b.z1 - 8; z += 21) {
        if (r.chance(0.12)) continue;
        const arch = r.pick(['old3', 'old3', 'old4', 'old5']);
        const s = size(arch);
        const rem = clearYearFor(x, z, s.w / 2, s.d / 2);
        buildings.push({ arch, x, z, rot: r.chance(0.5) ? 0 : Math.PI, y: terrainHeight(x, z) - 0.2, scale: 1, life: [1960, 1960.5, rem, rem + 0.6], tint: r.pick(PALETTE.oldtown), seed: r.next(), hx: s.w / 2, hz: s.d / 2 });
        stats[arch] = (stats[arch] ?? 0) + 1;
      }
    }
  }
  // farmland trees and hillside forest
  const fr = new Rng(42);
  for (let x = -5600; x <= 5600; x += 34) {
    for (let z = -4200; z <= 1500; z += 34) {
      const px = x + fr.range(-14, 14), pz = z + fr.range(-14, 14);
      const h = terrainHeight(px, pz);
      if (h < 2.5) continue;
      const ld = landDistance(px, pz);
      if (ld < 25) continue;
      const hill = h > 16;
      const dens = hill ? 0.55 * Math.min(1, (h - 16) / 25 + 0.4) : 0.035;
      if (Math.hypot(px - 500, pz + 600) > 5600) continue;
      if (!fr.chance(dens)) continue;
      // keep the 3D forest to the hills nearer the city (the ground shader paints the rest)
      if (hill && (pz < -3600 || Math.abs(px) > 5000)) continue;
      const rem = hill ? NEVER : Math.min(NEVER, clearYearFor(px, pz, 3, 3));
      if (Math.abs(px - RAIL_X) < 20) continue;
      trees.push({ x: px, z: pz, scale: hill ? fr.range(1.0, 1.6) : fr.range(0.8, 1.2), rot: fr.range(0, 6.28), life: [1960, 1960.5, rem, rem + 0.6], tint: fr.pick(PALETTE.foliage), seed: fr.next() });
    }
  }

  // ------------------------------------------------------------ development map (ground shader)
  const bounds = new THREE.Vector4(-4700, -2900, 8800, 4900);
  const W = 640, H = 356;
  const data = new Uint8Array(W * H * 4);
  const toTex = (x: number, z: number) => [Math.floor(((x - bounds.x) / bounds.z) * W), Math.floor(((z - bounds.y) / bounds.w) * H)];
  const writeRect = (x0: number, z0: number, x1: number, z1: number, year: number, code: number) => {
    const [i0, j0] = toTex(x0, z0), [i1, j1] = toTex(x1, z1);
    const yv = Math.max(0, Math.min(255, Math.round(((year - 1975) / 50) * 255)));
    for (let j = Math.max(0, j0); j <= Math.min(H - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(W - 1, i1); i++) {
        const k = (j * W + i) * 4;
        data[k] = yv;
        data[k + 1] = code;
      }
    }
  };
  for (const v of villageMask) {
    const [ci, cj] = toTex(v.x, v.z);
    const rr = Math.ceil((v.r / bounds.z) * W) + 1;
    for (let j = cj - rr; j <= cj + rr; j++) for (let i = ci - rr; i <= ci + rr; i++) {
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const wx = bounds.x + ((i + 0.5) / W) * bounds.z, wz = bounds.y + ((j + 0.5) / H) * bounds.w;
      if (Math.hypot(wx - v.x, wz - v.z) < v.r * 0.95) data[(j * W + i) * 4 + 2] = 255;
    }
  }
  for (const b of blocks) {
    const yr = b.kind === 'urbanVillage' ? b.year + 2 : b.kind === 'oldtown' ? 1975 : b.groundYear || b.year;
    writeRect(b.x0 - 6, b.z0 - 6, b.x1 + 6, b.z1 + 6, yr, b.ground);
  }
  // quay apron
  for (let x = -4300; x < -2980; x += 20) {
    const zc = coastZ(x);
    writeRect(x, zc - 75, x + 20, zc - 4, quayStart - 0.5, GROUND.PORT);
  }

  // ------------------------------------------------------------ anchors for labels / camera
  const centroid = (pred: (b: Block) => boolean, y = 40) => {
    const bs = blocks.filter(pred);
    const v = new THREE.Vector3();
    bs.forEach((b) => v.add(new THREE.Vector3(b.cx, 0, b.cz)));
    if (bs.length) v.multiplyScalar(1 / bs.length);
    v.y = terrainHeight(v.x, v.z) + y;
    return v;
  };
  const anchors: Record<string, THREE.Vector3> = {
    industry: centroid((b) => b.zone === 'shekou' && b.kind !== 'redevelop', 60),
    industryWest: centroid((b) => b.zone === 'westInd', 50),
    housing: centroid((b) => b.zone === 'res00' && b.kind === 'resTower', 160),
    housing90: centroid((b) => b.zone === 'res90' && b.kind === 'resMid' && b.cx < 0, 50),
    cbd: centroid((b) => b.zone === 'cbd', 320),
    oldtown: centroid((b) => b.zone === 'oldtown', 60),
    port: centroid((b) => b.zone === 'port', 70),
    farmland: new THREE.Vector3(-700, terrainHeight(-700, -300) + 30, -300),
    sea: new THREE.Vector3(500, 30, 2300),
    park: new THREE.Vector3(250, terrainHeight(250, -1180) + 40, -1180),
  };

  // ------------------------------------------------------------ migration paths (illustrative only)
  const path = (pts: [number, number][]) => pts.map(([x, z]) => new THREE.Vector3(x, terrainHeight(x, z) + 14, z));
  const migrationPaths = [
    path([[-5200, -1700], [-3300, -1700], [-1300, -1700], [-300, -1700], [-300, -1450]]),
    path([[-4800, -700], [-2300, -700], [-1300, -700], [-800, -700], [-800, -200]]),
    path([[700, -3400], [700, -2400], [700, -1700], [1200, -1700], [1200, -1450]]),
    path([[3700, -3200], [3700, -1700], [1700, -1700], [1700, -1100], [1300, -1100]]),
    path([[5200, 300], [3700, 300], [2700, 300], [2200, 300], [2200, -200]]),
    path([[-300, -3400], [-300, -2450], [-800, -2200], [-800, -1450]]),
  ];

  stats.blocks = blocks.length;
  stats.roads = roads.length;
  stats.trees = trees.length;
  stats.buildings = buildings.length;
  stats.villages = villages.length;

  return { blocks, roads, junctions, buildings, trees, devMap: { data, w: W, h: H, bounds }, anchors, berths, railway: { x: RAIL_X, z0: -3600, z1: coastZ(RAIL_X) - 120 }, migrationPaths, stats };
}

export type { BlockKind };
