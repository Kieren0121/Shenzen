import * as THREE from 'three';
import type { CameraLimits, CameraView } from './CameraController';
import type { PresentationUI } from './PresentationUI';
import type { SharedAssets } from './SharedAssets';

export type SceneId = 'shenzhen' | 'groundwater';

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  ui: PresentationUI;
  assets: SharedAssets;
  shadowMapSize: number;
  requestShadowUpdate(): void;
  flyTo(view: CameraView, seconds?: number): void;
  getCamera(): THREE.PerspectiveCamera;
}

export interface TeachingScene {
  readonly id: SceneId;
  readonly title: string;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly limits: CameraLimits;
  readonly openingView: CameraView;
  /** Build all geometry; `progress` receives 0..1. */
  build(ctx: SceneContext, progress: (p: number, label: string) => Promise<void>): Promise<void>;
  activate(): void;
  deactivate(): void;
  update(dt: number, time: number): void;
  togglePlay(): void;
  resetScenario(): void;
  /** Double-click focus. */
  pick(raycaster: THREE.Raycaster): CameraView | null;
  /** Serializable state for QA / automated tests. */
  getState(): Record<string, unknown>;
  dispose(): void;
}
