import * as THREE from 'three';
import { Rng } from '../../shared/Random';
import { GeometryBuilder, P } from '../../shared/GeometryBuilder';
import { createBuildingMaterial, createInstancedAsset, InstanceRecord, lin, RISE, SharedUniforms } from '../../shared/Materials';
import { createArchetypes } from '../shenzhen/BuildingAssets';
import { surfaceHeight, wellDisplay } from './GroundwaterVisuals';

/**
 * Surface land uses that compete for groundwater: a small group of homes
 * (served by shallow Well A), a wheat farm with sprinklers and a factory
 * (served by deep Well B). Not a reconstruction of any particular settlement.
 */
export interface PipeRoute {
  points: THREE.Vector3[];
  well: number;
  share: number; // fraction of that well's pumped water shown on this route
}

export class GroundwaterSurface {
  readonly group = new THREE.Group();
  readonly routes: PipeRoute[] = [];
  readonly sprinklers: THREE.Vector3[] = [];
  readonly anchors: Record<string, THREE.Vector3> = {};

  constructor(shared: SharedUniforms) {
    shared.uYear.value = 2000; // all assets present (FADE lifecycle 0 → 9999)
    const arch = createArchetypes();
    const handle = createBuildingMaterial({ rise: RISE.FADE, shared, envIntensity: 0.8 });
    const rng = new Rng(55);
    const always: [number, number, number, number] = [0, 0.5, 9999, 10000];
    const add = (key: string, recs: InstanceRecord[], cast = true) => {
      const a = arch.get(key)!;
      const m = createInstancedAsset(a.geometry, handle, recs, cast, true);
      m.name = `gw-${key}`;
      this.group.add(m);
    };
    const at = (x: number, z: number, rot: number, scale: number, tint: [number, number, number]): InstanceRecord => ({ x, y: surfaceHeight(x, z) - 0.15, z, rot, scale, life: always, tint, seed: rng.next() });

    // homes (Well A)
    const vill = ['#d7d0c1', '#c9bfa9', '#bba283', '#ddd6c8'].map(lin);
    const homes: [string, number, number, number][] = [
      ['village0', -78, 40, 0], ['village2', -62, 44, 0], ['village1', -47, 41, Math.PI], ['village0', -26, 44, Math.PI],
      ['village2', -82, 24, Math.PI / 2], ['village1', -64, 24, 0], ['village0', -46, 25, 0], ['village2', -29, 27, Math.PI],
    ];
    const byKey = new Map<string, InstanceRecord[]>();
    for (const [k, x, z, r] of homes) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(at(x, z, r, 0.85, rng.pick(vill)));
    }
    for (const [k, recs] of byKey) add(k, recs);

    // factory (Well B): production shed, chimney, water tower
    add('shed', [at(74, -30, 0, 0.42, lin('#c6ccd1'))]);
    add('warehouse', [at(74, -6, 0, 0.3, lin('#5b80ac'))]);
    const fb = new GeometryBuilder();
    fb.cylinder(88, -44, 1.6, surfaceHeight(88, -44) - 0.5, surfaceHeight(88, -44) + 22, 12, P.CONCRETE, P.DARK, 1.1);
    const tx = 56, tz = -46, ty = surfaceHeight(tx, tz);
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) fb.boxC(tx + dx, tz + dz, 0.4, 0.4, ty - 0.3, ty + 9, P.METAL);
    fb.cylinder(tx, tz, 3.2, ty + 9, ty + 13.5, 12, P.METAL, P.METAL);
    const fg = fb.build();
    const fm = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: 0x9fa4a8, roughness: 0.6, metalness: 0.3 }));
    fm.castShadow = true;
    fm.receiveShadow = true;
    this.group.add(fm);

    // wheat crop: instanced tufts in rows
    const cb = new GeometryBuilder();
    cb.cylinder(0, 0, 0.42, -0.2, 1.3, 5, P.CROP, P.CROP, 0.12);
    const crop = cb.build();
    const cropRecs: InstanceRecord[] = [];
    for (let z = -55; z < 3.5; z += 1.6) {
      for (let x = -95; x < 29.5; x += 1.25) {
        if ([-60, -25, 10].some((sx) => Math.abs(x - sx) < 2.2 && Math.abs(z + 20) < 2.2)) continue;
        cropRecs.push({ x: x + rng.range(-0.25, 0.25), y: surfaceHeight(x, z), z: z + rng.range(-0.15, 0.15), rot: rng.range(0, 6.28), scale: rng.range(0.8, 1.15), life: always, tint: lin(rng.chance(0.5) ? '#8f9a3b' : '#a5a645'), seed: rng.next() });
      }
    }
    const cropMesh = createInstancedAsset(crop, handle, cropRecs, false, true);
    cropMesh.name = 'gw-crops';
    this.group.add(cropMesh);

    // trees
    const treeRecs: InstanceRecord[] = [];
    const trees: [number, number][] = [[-92, 52], [-86, 32], [-70, 52], [-55, 33], [-37, 51], [-18, 36], [-93, 14], [-12, 52], [-8, 22], [46, 22], [58, 26], [92, 22], [97, 36], [80, 45], [62, 44], [20, 44], [5, 30], [28, 30], [-98, -10], [-98, -40], [34, -50], [36, -20], [96, -55], [98, 2]];
    for (const [x, z] of trees) treeRecs.push(at(x, z, rng.range(0, 6.28), rng.range(0.6, 0.9), rng.pick(['#3f6a2c', '#4d7a32', '#355c2a', '#5a8a3a'].map(lin))));
    add('treeNear', treeRecs);

    // pipes from the wells (above ground, for clarity)
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3f6f9a, roughness: 0.35, metalness: 0.4 });
    const pb = new GeometryBuilder();
    const y = (x: number, z: number) => surfaceHeight(x, z) + 0.55;
    const A = wellDisplay(0), B = wellDisplay(1);
    const route = (pts: [number, number][], well: number, share: number) => {
      const v = pts.map(([x, z]) => new THREE.Vector3(x, y(x, z), z));
      for (let k = 0; k < v.length - 1; k++) pb.pipe([v[k].x, v[k].y, v[k].z], [v[k + 1].x, v[k + 1].y, v[k + 1].z], 0.32, 8, P.METAL);
      this.routes.push({ points: v, well, share });
    };
    route([[A.x, 56], [A.x, 34], [-55, 34], [-55, 31]], 0, 0.55);
    route([[A.x, 34], [-30, 34], [-30, 32]], 0, 0.45);
    route([[B.x, 54], [B.x, 7.5], [-60, 7.5], [-60, -18]], 1, 0.4);
    route([[-25, 7.5], [-25, -18]], 1, 0.15);
    route([[10, 7.5], [10, -18]], 1, 0.15);
    route([[B.x, 7.5], [64, 7.5], [64, -10]], 1, 0.3);
    for (const sx of [-60, -25, 10]) {
      const sy = surfaceHeight(sx, -20);
      pb.cylinder(sx, -20, 0.22, sy, sy + 2.4, 6, P.METAL, P.METAL);
      this.sprinklers.push(new THREE.Vector3(sx, sy + 2.5, -20));
    }
    const pipes = new THREE.Mesh(pb.build(), pipeMat);
    pipes.castShadow = true;
    pipes.receiveShadow = true;
    this.group.add(pipes);

    this.anchors.homes = new THREE.Vector3(-55, surfaceHeight(-55, 34) + 9, 34);
    this.anchors.farm = new THREE.Vector3(-45, surfaceHeight(-45, -35) + 3, -35);
    this.anchors.factory = new THREE.Vector3(74, surfaceHeight(74, -30) + 9, -30);
    for (const a of arch.values()) a.geometry.dispose();
  }
}
