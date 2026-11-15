import * as THREE from 'three';
import { createSoftDotTexture, createWaterNormalTexture } from '../shared/ProceduralTextures';

/** Procedural textures shared by both scenes (generated once, no files). */
export class SharedAssets {
  readonly waterNormals: THREE.DataTexture;
  readonly softDot: THREE.DataTexture;
  constructor() {
    this.waterNormals = createWaterNormalTexture(256);
    this.softDot = createSoftDotTexture(64);
  }
  dispose(): void {
    this.waterNormals.dispose();
    this.softDot.dispose();
  }
}
