import * as THREE from 'three';
import { SharedUniforms } from '../../shared/Materials';
import type { Junction, RoadSeg } from './CityGenerator';
import { terrainHeight } from './Terrain';

/**
 * Road network mesh. Each segment carries its construction year; the shader
 * reveals it progressively along its length (from the end nearer the older
 * network) so the network grows coherently. Lane markings, a planted central
 * reservation on arterials, pavements and zebra crossings are drawn in the
 * shader at metre scale with distance anti-aliasing.
 */
const KIND = { arterial: 0, secondary: 1, junction: 2, rail: 3 } as const;

const ROAD_VERT_DECL = /* glsl */ `
attribute vec4 aRoad; // year, duration, along (m), length (m)
attribute vec2 aCross; // cross offset (m), kind
uniform float uYear;
varying vec4 vRoad;
varying vec2 vCross;
`;
const ROAD_VERT = /* glsl */ `
vRoad = aRoad;
vCross = aCross;
if (uYear < aRoad.x) transformed = vec3(0.0);
`;
const ROAD_FRAG_DECL = /* glsl */ `
uniform float uYear;
varying vec4 vRoad;
varying vec2 vCross;
float rh(vec2 p) { p = fract(p * vec2(443.8, 441.4)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
float rn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rh(i), rh(i + vec2(1, 0)), u.x), mix(rh(i + vec2(0, 1)), rh(i + vec2(1, 1)), u.x), u.y); }
float lineAA(float x, float w, float fw) { fw = max(fw, 1e-4); return 1.0 - smoothstep(w - fw, w + fw, abs(x)); }
void roadSurface(out vec3 col, out float rough) {
  float fwc = fwidth(vCross.x);
  float fwa = fwidth(vRoad.z);
  float prog = clamp((uYear - vRoad.x) / max(vRoad.y, 0.01), 0.0, 1.0);
  if (vRoad.z > prog * vRoad.w + 0.5) discard;
  float along = vRoad.z;
  float c = vCross.x;
  float ac = abs(c);
  int kind = int(vCross.y + 0.5);
  float n = rn(vec2(along, c) * 0.35);
  vec3 asphalt = vec3(0.13, 0.135, 0.14) * (0.88 + 0.2 * n);
  vec3 pave = vec3(0.52, 0.5, 0.47) * (0.9 + 0.12 * n);
  vec3 white = vec3(0.82, 0.82, 0.78);
  // markings fade out with distance to avoid shimmer
  float fade = 1.0 - smoothstep(0.25, 0.9, fwa);
  col = asphalt; rough = 0.82;
  float fresh = 1.0 - smoothstep(0.0, 0.4, (uYear - vRoad.x - vRoad.y));
  if (kind == 0) { // arterial with planted median
    if (ac < 4.0) { col = mix(vec3(0.16, 0.27, 0.09), vec3(0.22, 0.33, 0.12), n); rough = 0.95; if (ac > 3.5) col = vec3(0.6); }
    else if (ac < 19.0) {
      float dash = step(fract(along / 12.0), 0.5);
      float m = max(lineAA(ac - 9.0, 0.12, fwc) * dash, lineAA(ac - 14.0, 0.12, fwc) * dash);
      m = max(m, lineAA(ac - 18.4, 0.12, fwc));
      col = mix(col, white, m * fade);
      float endZ = min(along, vRoad.w - along);
      if (endZ < 6.0 && endZ > 1.0) col = mix(col, white, step(0.5, fract(c / 1.2)) * fade * 0.9);
    } else { col = pave; rough = 0.9; if (ac < 19.4) col = vec3(0.62); }
  } else if (kind == 1) { // secondary road
    if (ac < 7.5) {
      float m = max(lineAA(c - 0.2, 0.08, fwc), lineAA(c + 0.2, 0.08, fwc));
      col = mix(col, vec3(0.85, 0.68, 0.18), m * fade);
      float endZ = min(along, vRoad.w - along);
      if (endZ < 5.0 && endZ > 1.0) col = mix(col, white, step(0.5, fract(c / 1.1)) * fade * 0.9);
    } else { col = pave; rough = 0.9; if (ac < 7.9) col = vec3(0.62); }
  } else if (kind == 2) { // junction box
    col = asphalt * 0.97;
  } else { // railway: ballast, sleepers, rails
    if (ac < 2.6) {
      col = vec3(0.36, 0.33, 0.29) * (0.85 + 0.25 * rn(vec2(along, c) * 3.0));
      float sl = step(fract(along / 0.65), 0.38) * step(ac, 1.35);
      col = mix(col, vec3(0.28, 0.22, 0.17), sl * fade);
      float rail = step(0.66, ac) * step(ac, 0.78);
      col = mix(col, vec3(0.55, 0.55, 0.56), rail);
      rough = 0.9;
    } else { col = vec3(0.3, 0.32, 0.22) * (0.9 + 0.2 * n); rough = 0.95; }
  }
  col = mix(col, vec3(0.35, 0.33, 0.3), fresh * 0.5);
}
`;

export function createRoadMaterial(shared: SharedUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  mat.envMapIntensity = 0.5;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uYear = shared.uYear;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ROAD_VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${ROAD_VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ROAD_FRAG_DECL}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec3 rCol; float rRough; roadSurface(rCol, rRough);\n vec4 diffuseColor = vec4(rCol, opacity);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = rRough;');
  };
  mat.customProgramCacheKey = () => 'ebn-road-v1';
  return mat;
}

class StripBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  road: number[] = [];
  cross: number[] = [];
  idx: number[] = [];
  /** Straight strip from a to b, offset `lift` above the terrain. */
  strip(ax: number, az: number, bx: number, bz: number, halfW: number, kind: number, year: number, dur: number, lift: number, alongStart = 0, totalLen?: number): void {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1) return;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const px = -dz, pz = dx;
    const n = Math.max(1, Math.ceil(len / 40));
    const base = this.pos.length / 3;
    const L = totalLen ?? len;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * len;
      const cx = ax + dx * t, cz = az + dz * t;
      for (const s of [-1, 1]) {
        const x = cx + px * halfW * s, z = cz + pz * halfW * s;
        const y = Math.max(terrainHeight(x, z), terrainHeight(cx, cz)) + lift;
        this.pos.push(x, y, z);
        this.nrm.push(0, 1, 0);
        this.road.push(year, dur, alongStart + t, L);
        this.cross.push(halfW * s, kind);
      }
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      // (a, b, c) and (b, d, c) are counter-clockwise seen from above (normal +y)
      this.idx.push(a, b, c, b, d, c);
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aRoad', new THREE.Float32BufferAttribute(this.road, 4));
    g.setAttribute('aCross', new THREE.Float32BufferAttribute(this.cross, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export function createRoadMesh(roads: RoadSeg[], junctions: Junction[], railway: { x: number; z0: number; z1: number }, material: THREE.Material): THREE.Mesh {
  const sb = new StripBuilder();
  const jSize = new Map<string, number>();
  for (const j of junctions) jSize.set(`${j.x},${j.z}`, j.size);
  for (const r of roads) {
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
    const dx = (r.bx - r.ax) / len, dz = (r.bz - r.az) / len;
    const sa = (jSize.get(`${r.ax},${r.az}`) ?? 0) / 2, sbb = (jSize.get(`${r.bx},${r.bz}`) ?? 0) / 2;
    sb.strip(r.ax + dx * sa, r.az + dz * sa, r.bx - dx * sbb, r.bz - dz * sbb, r.width / 2, r.kind === 'arterial' ? KIND.arterial : KIND.secondary, r.year, r.dur, 0.45, 0, len - sa - sbb);
  }
  for (const j of junctions) {
    const h = j.size / 2;
    sb.strip(j.x, j.z - h, j.x, j.z + h, h, KIND.junction, j.year, 0.1, 0.47);
  }
  sb.strip(railway.x, railway.z0, railway.x, railway.z1, 4.2, KIND.rail, 1960, 0.1, 0.6);
  const mesh = new THREE.Mesh(sb.build(), material);
  mesh.receiveShadow = true;
  mesh.name = 'roads';
  return mesh;
}
