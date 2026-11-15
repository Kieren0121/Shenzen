import * as THREE from 'three';
import { Rng } from '../../shared/Random';
import { BuildingMaterialHandle, createInstancedAsset, InstanceRecord } from '../../shared/Materials';
import type { RoadSeg } from './CityGenerator';
import { PALETTE } from './CityTypes';
import { terrainHeight } from './Terrain';

interface Agent {
  ax: number; az: number; ay: number; by: number;
  dx: number; dz: number; len: number;
  lane: number; dir: number; speed: number; phase: number;
}

/**
 * Ambient vehicles that drive along roads once they are built. The number on
 * each road grows over the years (illustrative), giving a sense of a busier
 * city. Matrices are written directly into the instance buffer each frame.
 */
export class Traffic {
  readonly group = new THREE.Group();
  private sets: { mesh: THREE.InstancedMesh; agents: Agent[] }[] = [];

  constructor(roads: RoadSeg[], geos: { car: THREE.BufferGeometry; truck: THREE.BufferGeometry; bus: THREE.BufferGeometry }, handle: BuildingMaterialHandle) {
    const rng = new Rng(777);
    const lists: Record<'car' | 'truck' | 'bus', { agents: Agent[]; recs: InstanceRecord[] }> = {
      car: { agents: [], recs: [] }, truck: { agents: [], recs: [] }, bus: { agents: [], recs: [] },
    };
    for (const r of roads) {
      const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
      if (len < 60) continue;
      const lanes = r.kind === 'arterial' ? [6.5, 11.5, 16, -6.5, -11.5, -16] : [3.6, -3.6];
      const n = r.kind === 'arterial' ? 7 : rng.chance(0.55) ? 2 : 1;
      const open = r.year + r.dur + 0.4;
      const industrial = r.ax < -1300;
      for (let k = 0; k < n; k++) {
        const lane = lanes[k % lanes.length];
        const type: 'car' | 'truck' | 'bus' = industrial && rng.chance(0.35) ? 'truck' : r.kind === 'arterial' && rng.chance(0.06) ? 'bus' : 'car';
        const frac = (k + rng.next()) / n;
        const appear = open + frac * Math.max(0, 2019 - open) * 0.92;
        const agent: Agent = {
          ax: r.ax, az: r.az, ay: terrainHeight(r.ax, r.az) + 0.5, by: terrainHeight(r.bx, r.bz) + 0.5,
          dx: (r.bx - r.ax) / len, dz: (r.bz - r.az) / len, len,
          lane, dir: lane > 0 ? 1 : -1, speed: (r.kind === 'arterial' ? 15 : 9) * rng.range(0.8, 1.2), phase: rng.range(0, len),
        };
        const tint = type === 'bus' ? rng.pick(PALETTE.bus) : type === 'truck' ? [0.8, 0.8, 0.8] as [number, number, number] : rng.pick(PALETTE.car);
        lists[type].agents.push(agent);
        lists[type].recs.push({ x: r.ax, y: agent.ay, z: r.az, rot: 0, life: [appear, appear + 0.5, 9999, 10000], tint, seed: rng.next() });
      }
    }
    for (const type of ['car', 'truck', 'bus'] as const) {
      const L = lists[type];
      if (L.agents.length === 0) continue;
      const mesh = createInstancedAsset(geos[type], handle, L.recs, false, true);
      mesh.frustumCulled = false;
      mesh.name = `traffic-${type}`;
      this.group.add(mesh);
      this.sets.push({ mesh, agents: L.agents });
    }
  }

  get count(): number {
    return this.sets.reduce((a, s) => a + s.agents.length, 0);
  }

  update(time: number): void {
    for (const set of this.sets) {
      const arr = set.mesh.instanceMatrix.array as Float32Array;
      const ag = set.agents;
      for (let i = 0; i < ag.length; i++) {
        const a = ag[i];
        let s = (a.phase + a.speed * time) % a.len;
        if (a.dir < 0) s = a.len - s;
        const t = s / a.len;
        // lane offset to the right of the direction of travel
        const px = -a.dz, pz = a.dx;
        const x = a.ax + a.dx * s + px * a.lane;
        const z = a.az + a.dz * s + pz * a.lane;
        const y = a.ay + (a.by - a.ay) * t;
        const hx = a.dx * a.dir, hz = a.dz * a.dir;
        const o = i * 16;
        arr[o] = hx; arr[o + 1] = 0; arr[o + 2] = hz; arr[o + 3] = 0;
        arr[o + 4] = 0; arr[o + 5] = 1; arr[o + 6] = 0; arr[o + 7] = 0;
        arr[o + 8] = -hz; arr[o + 9] = 0; arr[o + 10] = hx; arr[o + 11] = 0;
        arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
      }
      set.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

/** A few container ships sailing slowly across the bay (appear as the port grows). */
export class Shipping {
  readonly mesh: THREE.InstancedMesh;
  private routes: { x0: number; x1: number; z: number; speed: number; phase: number }[] = [];
  constructor(geo: THREE.BufferGeometry, handle: BuildingMaterialHandle) {
    const rng = new Rng(4242);
    const recs: InstanceRecord[] = [];
    const years = [1987, 1993, 1998, 2004, 2010];
    for (let i = 0; i < years.length; i++) {
      const z = 2100 + i * 330 + rng.range(-60, 60);
      this.routes.push({ x0: -7000, x1: 6000, z, speed: rng.range(5, 8), phase: rng.range(0, 13000) });
      recs.push({ x: 0, y: 0, z, rot: 0, life: [years[i], years[i] + 0.6, 9999, 10000], tint: rng.pick(PALETTE.hull), seed: rng.next() });
    }
    this.mesh = createInstancedAsset(geo, handle, recs, false, false);
    this.mesh.frustumCulled = false;
  }
  update(time: number): void {
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    this.routes.forEach((r, i) => {
      const span = r.x1 - r.x0;
      const dir = i % 2 === 0 ? 1 : -1;
      let s = (r.phase + r.speed * time) % span;
      const x = dir > 0 ? r.x0 + s : r.x1 - s;
      s = 0;
      const o = i * 16;
      arr.set([dir, 0, 0, 0, 0, 1, 0, 0, 0, 0, dir, 0, x, 0, r.z, 1], o);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
