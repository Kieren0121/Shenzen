import * as THREE from 'three';
import { SharedUniforms } from './Materials';

/**
 * Restrained PBR water: two scrolling layers of a procedural normal map
 * perturb the surface normal; reflections come from the sky environment map.
 */
export function createWaterMaterial(shared: SharedUniforms, normals: THREE.Texture, opts: { color: number; opacity?: number; scale?: number; strength?: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color,
    roughness: 0.06,
    metalness: 0.0,
    transparent: (opts.opacity ?? 1) < 1,
    opacity: opts.opacity ?? 1,
  });
  mat.envMapIntensity = 1.0;
  const scale = { value: opts.scale ?? 0.004 };
  const strength = { value: opts.strength ?? 0.35 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWaterNormals = { value: normals };
    shader.uniforms.uWScale = scale;
    shader.uniforms.uWStrength = strength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;\nuniform sampler2D uWaterNormals;\nuniform float uWScale;\nuniform float uWStrength;')
      .replace(
        '#include <normal_fragment_maps>',
        `{
          vec2 p = vWPos.xz * uWScale;
          vec3 n1 = texture2D(uWaterNormals, p + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uWaterNormals, p * 2.7 + vec2(-uTime * 0.009, uTime * 0.016)).xyz * 2.0 - 1.0;
          vec3 nn = normalize(vec3((n1.x + n2.x * 0.6) * uWStrength, 1.0, (n1.y + n2.y * 0.6) * uWStrength));
          normal = normalize((viewMatrix * vec4(nn, 0.0)).xyz);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'ebn-water-v1';
  return mat;
}
