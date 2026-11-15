import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export interface SkyOptions {
  elevation: number; // degrees above horizon
  azimuth: number; // degrees, 0 = +z (south in our scenes), 90 = +x (east)
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  cubeSize?: number;
}

export interface SkyEnvironment {
  background: THREE.Texture;
  environment: THREE.Texture;
  sunDirection: THREE.Vector3;
  dispose(): void;
}

/**
 * Physically based atmospheric sky (Preetham model from three/examples Sky),
 * rendered once into a cube map for the background and pre-filtered (PMREM)
 * for image-based lighting. Nothing is fetched: it is computed on the GPU.
 */
export function createSkyEnvironment(renderer: THREE.WebGLRenderer, o: SkyOptions): SkyEnvironment {
  const skyScene = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(1000);
  skyScene.add(sky);
  const u = sky.material.uniforms;
  u.turbidity.value = o.turbidity;
  u.rayleigh.value = o.rayleigh;
  u.mieCoefficient.value = o.mieCoefficient;
  u.mieDirectionalG.value = o.mieDirectionalG;
  const sun = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(90 - o.elevation);
  const theta = THREE.MathUtils.degToRad(o.azimuth);
  sun.setFromSphericalCoords(1, phi, theta);
  u.sunPosition.value.copy(sun);

  // A soft ground hemisphere below the horizon so reflections of the "ground" are not black.
  const groundGeo = new THREE.SphereGeometry(900, 32, 16, 0, Math.PI * 2, Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  const groundMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.17, 0.15), side: THREE.BackSide });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  skyScene.add(ground);

  const size = o.cubeSize ?? 256;
  const cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(1, 5000, cubeRT);
  cubeCam.update(renderer, skyScene);

  // Background excludes the dark ground hemisphere (looks better behind distant terrain).
  ground.visible = false;
  const bgRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const bgCam = new THREE.CubeCamera(1, 5000, bgRT);
  bgCam.update(renderer, skyScene);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromCubemap(cubeRT.texture);
  pmrem.dispose();
  sky.geometry.dispose();
  sky.material.dispose();
  groundGeo.dispose();
  groundMat.dispose();
  cubeRT.dispose();

  return {
    background: bgRT.texture,
    environment: envRT.texture,
    sunDirection: sun.clone(),
    dispose() {
      bgRT.dispose();
      envRT.dispose();
    },
  };
}

export interface SunRig {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
}

/** Directional sun with a bounded shadow frustum + soft sky/ground fill. */
export function createSunRig(
  scene: THREE.Scene,
  dir: THREE.Vector3,
  distance: number,
  shadowHalfExtent: number,
  shadowMapSize: number,
  intensity = 2.6,
): SunRig {
  const sun = new THREE.DirectionalLight(0xfff1dc, intensity);
  sun.position.copy(dir).multiplyScalar(distance);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  const c = sun.shadow.camera as THREE.OrthographicCamera;
  c.left = -shadowHalfExtent;
  c.right = shadowHalfExtent;
  c.top = shadowHalfExtent;
  c.bottom = -shadowHalfExtent;
  c.near = distance * 0.2;
  c.far = distance * 2.2;
  c.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xd8e6f2, 0x5b5a4a, 0.55);
  scene.add(hemi);
  return { sun, hemi };
}
