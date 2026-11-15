import * as THREE from 'three';

/**
 * Tracks GPU resources created by a scene so they can be released together.
 * Both lesson scenes are built once at start-up and kept resident, so switching
 * between them allocates nothing; dispose() is used on teardown.
 */
export class ResourceManager {
  private items = new Set<{ dispose(): void }>();

  track<T extends { dispose(): void }>(item: T): T {
    this.items.add(item);
    return item;
  }

  /** Track every geometry and material found under an object. */
  trackObject(root: THREE.Object3D): void {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) this.items.add(m.geometry);
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => this.items.add(x));
      else if (mat) this.items.add(mat);
      const dm = (m as THREE.Mesh).customDepthMaterial;
      if (dm) this.items.add(dm);
    });
  }

  get size(): number {
    return this.items.size;
  }

  dispose(): void {
    for (const i of this.items) {
      try {
        i.dispose();
      } catch {
        /* ignore */
      }
    }
    this.items.clear();
  }
}
