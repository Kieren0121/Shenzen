import * as THREE from 'three';

/**
 * Flow indicators: oriented chevrons (and small droplets) that move with the
 * water — down through the soil as recharge, through the aquifer towards a
 * pumping well, up the pump pipe and along the surface pipes. A single
 * Points draw call; positions are updated in place each frame.
 */
export interface Particle {
  stream: number;
  t: number; // 0..1 progress along its path
  seed: number;
  ax: number; ay: number; az: number; // start
  bx: number; by: number; bz: number; // end
}

export class FlowParticles {
  readonly points: THREE.Points;
  readonly count: number;
  private pos: Float32Array;
  private dir: Float32Array;
  private col: Float32Array;
  private alpha: Float32Array;
  private size: Float32Array;
  private shape: Float32Array;
  readonly uniforms = { uScale: { value: 600 }, uAspect: { value: 16 / 9 } };

  constructor(count: number) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.dir = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.alpha = new Float32Array(count);
    this.size = new Float32Array(count);
    this.shape = new Float32Array(count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aDir', new THREE.BufferAttribute(this.dir, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aShape', new THREE.BufferAttribute(this.shape, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 40, 0), 200);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 aDir; attribute vec3 aColor; attribute float aAlpha; attribute float aSize; attribute float aShape;
        uniform float uScale; uniform float uAspect;
        varying vec3 vColor; varying float vAlpha; varying float vShape; varying vec2 vDir;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          vec4 p2 = projectionMatrix * (modelViewMatrix * vec4(position + aDir, 1.0));
          vec2 d = (p2.xy / p2.w - gl_Position.xy / gl_Position.w) * vec2(uAspect, 1.0);
          vDir = length(d) > 1e-6 ? normalize(vec2(d.x, -d.y)) : vec2(0.0, 1.0);
          vColor = aColor; vAlpha = aAlpha; vShape = aShape;
          gl_PointSize = clamp(aSize * uScale / -mv.z, 2.0, 48.0);
          if (aAlpha < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vAlpha; varying float vShape; varying vec2 vDir;
        float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float inner, outer;
          if (vShape < 0.5) {
            float r = length(c);
            inner = 1.0 - smoothstep(0.26, 0.34, r);
            outer = 1.0 - smoothstep(0.38, 0.48, r);
          } else {
            vec2 u = vDir, v = vec2(-u.y, u.x);
            vec2 p = vec2(dot(c, u), dot(c, v));
            float d = min(seg(p, vec2(0.25, 0.0), vec2(-0.13, 0.27)), seg(p, vec2(0.25, 0.0), vec2(-0.13, -0.27)));
            inner = 1.0 - smoothstep(0.06, 0.09, d);
            outer = 1.0 - smoothstep(0.11, 0.15, d);
          }
          float a = outer * vAlpha;
          if (a < 0.01) discard;
          vec3 col = mix(vColor * 0.18, vColor, inner / max(outer, 1e-3));
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  set(i: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, color: THREE.Color, alpha: number, size: number, chevron: boolean): void {
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.dir[i * 3] = dx; this.dir[i * 3 + 1] = dy; this.dir[i * 3 + 2] = dz;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.alpha[i] = alpha;
    this.size[i] = size;
    this.shape[i] = chevron ? 1 : 0;
  }

  hide(i: number): void {
    this.alpha[i] = 0;
  }

  commit(viewportH: number, fovDeg: number, aspect: number): void {
    this.uniforms.uScale.value = viewportH / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.uniforms.uAspect.value = aspect;
    const g = this.points.geometry;
    for (const n of ['position', 'aDir', 'aColor', 'aAlpha', 'aSize', 'aShape']) (g.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
  }
}
