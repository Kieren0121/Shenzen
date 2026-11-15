// TEMPORARY development stub (replaced in Gate 4). Not part of any delivery.
import * as THREE from 'three';
import type { SceneContext, TeachingScene } from '../../core/SceneTypes';
export class GroundwaterScene implements TeachingScene {
  readonly id = 'groundwater' as const; readonly title = 'Groundwater';
  readonly scene = new THREE.Scene(); readonly camera = new THREE.PerspectiveCamera(40, 1, 1, 1000);
  readonly limits = { minDistance: 1, maxDistance: 500, minPolar: 0, maxPolar: 1.5, targetMin: new THREE.Vector3(-100,-100,-100), targetMax: new THREE.Vector3(100,100,100), minClearance: 0 };
  readonly openingView = { position: new THREE.Vector3(0, 50, 100), target: new THREE.Vector3() };
  async build(_c: SceneContext, p: (v: number, l: string) => Promise<void>) { await p(1, 'stub'); }
  activate() {} deactivate() {} update() {} togglePlay() {} resetScenario() {}
  pick() { return null; } getState() { return {}; } dispose() {}
}
