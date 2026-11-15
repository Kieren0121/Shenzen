import * as THREE from 'three';
import { BuildingMaterialHandle, createInstancedAsset, InstanceRecord } from '../../shared/Materials';
import type { TreeRec } from './CityTypes';
import { terrainHeight } from './Terrain';

/**
 * Trees are split into spatial chunks. Each chunk owns a detailed and a
 * low-poly InstancedMesh that share the same per-instance data; every frame
 * the nearer chunks show the detailed trees and the far chunks the cheap ones
 * (level of detail), and whole chunks outside the view are frustum-culled.
 */
export class Vegetation {
  readonly group = new THREE.Group();
  private chunks: { center: THREE.Vector3; near: THREE.InstancedMesh; far: THREE.InstancedMesh }[] = [];
  nearDistance = 1700;

  constructor(trees: TreeRec[], nearGeo: THREE.BufferGeometry, farGeo: THREE.BufferGeometry, handle: BuildingMaterialHandle, chunkSize = 1200) {
    const buckets = new Map<string, TreeRec[]>();
    for (const t of trees) {
      const k = `${Math.floor(t.x / chunkSize)},${Math.floor(t.z / chunkSize)}`;
      let arr = buckets.get(k);
      if (!arr) buckets.set(k, (arr = []));
      arr.push(t);
    }
    for (const arr of buckets.values()) {
      const recs: InstanceRecord[] = arr.map((t) => ({ x: t.x, y: terrainHeight(t.x, t.z) - 0.3, z: t.z, rot: t.rot, scale: t.scale, life: t.life, tint: t.tint, seed: t.seed }));
      const near = createInstancedAsset(nearGeo, handle, recs, true, false);
      const far = createInstancedAsset(farGeo, handle, recs, true, false);
      far.instanceMatrix = near.instanceMatrix;
      far.geometry.setAttribute('aLife', near.geometry.getAttribute('aLife'));
      far.geometry.setAttribute('aInfo', near.geometry.getAttribute('aInfo'));
      far.computeBoundingSphere();
      const c = new THREE.Vector3();
      arr.forEach((t) => c.add(new THREE.Vector3(t.x, 0, t.z)));
      c.multiplyScalar(1 / arr.length);
      this.group.add(near, far);
      this.chunks.push({ center: c, near, far });
    }
  }

  update(camera: THREE.Camera): void {
    const p = camera.position;
    for (const ch of this.chunks) {
      const d = Math.hypot(ch.center.x - p.x, ch.center.z - p.z, p.y * 0.6);
      const isNear = d < this.nearDistance;
      ch.near.visible = isNear;
      ch.far.visible = !isNear;
    }
  }

  /** Force one LOD for both passes (used when refreshing the shadow map). */
  get chunkCount(): number {
    return this.chunks.length;
  }
}
