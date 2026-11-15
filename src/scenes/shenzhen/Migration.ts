import * as THREE from 'three';
import { Rng } from '../../shared/Random';

/**
 * Teaching moment B: soft points drifting along a few generic routes into the
 * housing districts. Deliberately illustrative - it does not represent a
 * measured flow, real routes or numbers of migrants.
 */
export class MigrationFlow {
  readonly points: THREE.Points;
  private paths: { pts: THREE.Vector3[]; cum: number[]; len: number }[] = [];
  private particles: { path: number; offset: number; speed: number; lateral: number }[] = [];
  private positions: Float32Array;
  private alphas: Float32Array;
  readonly uniforms: { uOpacity: { value: number }; uMap: { value: THREE.Texture }; uScale: { value: number }; uColor: { value: THREE.Color } };

  constructor(paths: THREE.Vector3[][], map: THREE.Texture, perPath = 90) {
    for (const pts of paths) {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
      this.paths.push({ pts, cum, len: cum[cum.length - 1] });
    }
    const rng = new Rng(99);
    this.paths.forEach((p, pi) => {
      for (let k = 0; k < perPath; k++) {
        // small groups travelling together
        const group = Math.floor(k / 3);
        this.particles.push({ path: pi, offset: (group / (perPath / 3)) * p.len + rng.range(-25, 25), speed: rng.range(150, 190), lateral: rng.range(-9, 9) });
      }
    });
    const n = this.particles.length;
    this.positions = new Float32Array(n * 3);
    this.alphas = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -800), 7000);
    this.uniforms = { uOpacity: { value: 0 }, uMap: { value: map }, uScale: { value: 500 }, uColor: { value: new THREE.Color(1.0, 0.86, 0.45) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float aAlpha; varying float vA; uniform float uScale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(uScale * 70.0 / -mv.z, 6.0, 30.0);
          vA = aAlpha;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform float uOpacity; uniform vec3 uColor; varying float vA;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vA * uOpacity;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * 2.2, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.visible = false;
  }

  update(time: number, viewportH: number): void {
    this.points.visible = this.uniforms.uOpacity.value > 0.01;
    if (!this.points.visible) return;
    this.uniforms.uScale.value = viewportH * 0.5;
    const tmp = new THREE.Vector3();
    this.particles.forEach((p, i) => {
      const path = this.paths[p.path];
      const d = (((p.offset + p.speed * time) % path.len) + path.len) % path.len;
      let s = 1;
      while (s < path.cum.length - 1 && path.cum[s] < d) s++;
      const a = path.pts[s - 1], b = path.pts[s];
      const t = (d - path.cum[s - 1]) / Math.max(1, path.cum[s] - path.cum[s - 1]);
      tmp.lerpVectors(a, b, t);
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      this.positions[i * 3] = tmp.x - (dz / l) * p.lateral;
      this.positions[i * 3 + 1] = tmp.y;
      this.positions[i * 3 + 2] = tmp.z + (dx / l) * p.lateral;
      const u = d / path.len;
      this.alphas[i] = Math.min(1, u / 0.08) * Math.min(1, (1 - u) / 0.12);
    });
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Path end points (destinations in the housing districts). */
  destinations(): THREE.Vector3[] {
    return this.paths.map((p) => p.pts[p.pts.length - 1]);
  }
}
