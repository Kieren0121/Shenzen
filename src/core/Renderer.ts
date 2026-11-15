import * as THREE from 'three';

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

export function createRenderer(container: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Shadows are re-rendered only when the scene state changes (see scenes).
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.className = 'gl-canvas';
  renderer.domElement.setAttribute('aria-label', '3D teaching model');
  container.appendChild(renderer.domElement);
  return renderer;
}

/** Shadow map resolution appropriate to the GPU. */
export function chooseShadowMapSize(renderer: THREE.WebGLRenderer): number {
  const max = renderer.capabilities.maxTextureSize;
  return max >= 8192 ? 4096 : 2048;
}
