import * as THREE from 'three';
import { Rng } from '../../shared/Random';
import { GeometryBuilder, P } from '../../shared/GeometryBuilder';
import { BLOCK } from './GroundwaterVisuals';

/**
 * Rain falling from clouds onto the model surface. Streak positions are
 * computed on the GPU from a rain clock that only advances while the
 * simulation plays (pausing freezes the rain).
 */
export class RainfallSystem {
  readonly group = new THREE.Group();
  readonly uniforms = { uT: { value: 0 }, uTop: { value: 98 }, uBottom: { value: 50.5 }, uOpacity: { value: 0.6 } };

  constructor() {
    const rng = new Rng(2024);
    const n = 2600;
    const pos = new Float32Array(n * 2 * 3);
    const seed = new Float32Array(n * 2 * 2);
    for (let i = 0; i < n; i++) {
      const x = rng.range(BLOCK.x0 + 1, BLOCK.x1 - 1), z = rng.range(BLOCK.z0 + 1, BLOCK.z1 - 1);
      const ph = rng.next(), sp = rng.range(0.85, 1.15);
      for (let k = 0; k < 2; k++) {
        pos.set([x, k, z], (i * 2 + k) * 3);
        seed.set([ph, sp], (i * 2 + k) * 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 75, 0), 140);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec2 aSeed; uniform float uT; uniform float uTop; uniform float uBottom; varying float vA;
        void main() {
          float range = uTop - uBottom;
          float y = uTop - mod(aSeed.x * range + uT * 38.0 * aSeed.y, range);
          vec3 p = vec3(position.x, y + position.y * 2.2, position.z);
          vA = position.y > 0.5 ? 0.0 : 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying float vA;
        void main() { gl_FragColor = vec4(0.78, 0.87, 0.96, uOpacity * (0.25 + 0.75 * vA));
          #include <colorspace_fragment>
        }`,
    });
    const rain = new THREE.LineSegments(g, mat);
    rain.frustumCulled = false;
    rain.renderOrder = 8;
    this.group.add(rain);

    // clouds
    const b = new GeometryBuilder();
    const clouds: [number, number, number, number][] = [[-55, 104, -10, 1.2], [5, 108, 15, 1.0], [60, 102, -18, 1.1], [-15, 112, -40, 0.9]];
    for (const [cx, cy, cz, s] of clouds) {
      for (let k = 0; k < 9; k++) {
        const ox = rng.range(-22, 22) * s, oz = rng.range(-12, 12) * s, oy = rng.range(-2, 4) * s;
        const r = rng.range(7, 12) * s;
        b.blob(cx + ox, cy + oy, cz + oz, r * 1.3, r * 0.75, r, P.WHITE, 1, k);
      }
    }
    const cg = b.build();
    const cm = new THREE.MeshStandardMaterial({ color: 0xdfe5ea, roughness: 1, metalness: 0, transparent: true, opacity: 0.93, flatShading: false });
    cm.envMapIntensity = 1.2;
    const cloudMesh = new THREE.Mesh(cg, cm);
    cloudMesh.name = 'clouds';
    this.group.add(cloudMesh);
  }

  advance(dt: number): void {
    this.uniforms.uT.value += dt;
  }
}
