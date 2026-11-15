import * as THREE from 'three';
import { fbm, ridged, smoothstep, lerp, clamp } from '../../shared/Random';
import { SharedUniforms } from '../../shared/Materials';

/**
 * Representative Pearl River Delta coastal landscape (not a survey of real
 * Shenzhen): a flat coastal plain between the sea (south and west) and wooded
 * hills (north and east), a park hill inside the future city, and a distant
 * hilly shore across the bay for depth. Units are metres; +z is south.
 */

/** Mainland south coast (z of the shoreline at a given x). */
export function coastZ(x: number): number {
  let c = 860 + 110 * Math.sin(x / 820 + 0.6) + 55 * Math.sin(x / 310 + 2.1) + 70 * (fbm(x / 600, 3.3, 3, 7) - 0.5);
  // Port peninsula in the south-west (flat, later developed as a container terminal)
  const pen = smoothstep(-4700, -4350, x) * (1 - smoothstep(-2950, -2650, x));
  c = lerp(c, 1720, pen);
  // coast bends south-east beyond the eastern hills
  c += smoothstep(3600, 6500, x) * 1700;
  return c;
}

/** Western estuary shore (x of the shoreline at a given z). */
export function westShoreX(z: number): number {
  return -4900 + 140 * Math.sin(z / 520) + 90 * (fbm(z / 700, 1.7, 3, 11) - 0.5);
}

/** Positive on land (metres from shore, approx), negative at sea. */
export function landDistance(x: number, z: number): number {
  return Math.min(coastZ(x) - z, x - westShoreX(z));
}

export const PARK_HILL = { x: 250, z: -1180, r: 420, h: 105 };
const HILLS = [
  PARK_HILL,
  { x: -2950, z: -2250, r: 330, h: 80 },
  { x: 2350, z: -2050, r: 300, h: 70 },
  { x: -1250, z: 1060, r: 170, h: 38 },
];

function mountainMask(x: number, z: number): number {
  const north = smoothstep(-2350, -3350, z);
  const east = smoothstep(3650, 4700, x);
  return Math.max(north, east);
}

/** Opposite shore across the bay (distant scenery). */
function southLand(x: number, z: number): number {
  const shore = 4300 + 520 * Math.sin(x / 2600 + 1.1) + 260 * Math.sin(x / 900);
  return z - shore; // positive on the far shore
}

export function terrainHeight(x: number, z: number): number {
  const plain = 3.2 + 5.5 * fbm(x / 1400, z / 1400, 3, 3);
  const m = mountainMask(x, z);
  let h = plain;
  if (m > 0) h += m * (110 + 560 * ridged(x / 2300, z / 2300, 5, 5)) * (0.65 + 0.35 * fbm(x / 900, z / 900, 3, 9));
  for (const hl of HILLS) {
    const d = Math.hypot(x - hl.x, z - hl.z) / hl.r;
    if (d < 2.4) h += hl.h * Math.exp(-d * d * 1.6) * (0.85 + 0.3 * fbm(x / 160, z / 160, 3, 13));
  }
  // coast
  const s = landDistance(x, z);
  const sea = -13 - 9 * fbm(x / 2000, z / 2000, 3, 21);
  const beach = lerp(0.6, h, smoothstep(0, 170, s));
  let out = s > 0 ? beach : lerp(sea, 0.6, smoothstep(-160, 0, s));
  // far shore hills
  const sl = southLand(x, z);
  if (sl > -200) {
    const fh = (60 + 420 * ridged(x / 2600, z / 2600, 5, 41)) * smoothstep(0, 900, sl) + 1.5;
    out = lerp(out, fh, smoothstep(-200, 60, sl));
  }
  // far west bank of the estuary (low land, distant)
  const wb = -11500 + 600 * Math.sin(z / 1700);
  if (x < wb + 300) out = lerp(out, 4 + 160 * ridged(x / 3000, z / 3000, 4, 51) * smoothstep(wb, wb - 2500, x), smoothstep(wb + 300, wb - 100, x));
  return out;
}

/** Land suitable for urban development in the model. */
export function isBuildable(x: number, z: number, margin = 60): boolean {
  if (landDistance(x, z) < margin) return false;
  if (mountainMask(x, z) > 0.02) return false;
  for (const hl of HILLS) {
    if (Math.hypot(x - hl.x, z - hl.z) < hl.r * 1.05) return false;
  }
  const h = terrainHeight(x, z);
  return h < 22 && h > 1.0;
}

function axis(min: number, max: number, coreMin: number, coreMax: number, step: number, maxStep: number): number[] {
  const out: number[] = [];
  for (let v = coreMin; v <= coreMax + 1e-6; v += step) out.push(v);
  let v = coreMin, s = step;
  while (v > min) {
    s = Math.min(maxStep, s * 1.06);
    v = Math.max(min, v - s);
    out.unshift(v);
  }
  v = out[out.length - 1];
  s = step;
  while (v < max) {
    s = Math.min(maxStep, s * 1.06);
    v = Math.min(max, v + s);
    out.push(v);
  }
  return out;
}

export interface DevMap {
  texture: THREE.DataTexture;
  bounds: THREE.Vector4; // xMin, zMin, width, depth
}

const GROUND_FRAG = /* glsl */ `
uniform sampler2D uDevMap;
uniform vec4 uDevBounds;
uniform float uYear;
varying vec3 vWPos;
varying vec3 vWNrm;
float gh(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float gn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), u.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), u.x), u.y);
}
float pAAg(float t, float w) { w = max(w, 1e-4); float a = t + 0.5 * w, b = t - 0.5 * w;
  return ((floor(a) * 0.5 + clamp(fract(a), 0.5, 1.0) - 0.5) - (floor(b) * 0.5 + clamp(fract(b), 0.5, 1.0) - 0.5)) / w; }
float gfbm(vec2 p) { return 0.5 * gn(p) + 0.3 * gn(p * 2.1 + 3.1) + 0.2 * gn(p * 4.3 + 7.7); }
float gaa(vec2 fw, vec2 cell) { vec2 w = fw / cell; return 1.0 - smoothstep(0.03, 0.12, max(w.x, w.y)); }
float gaaCell(vec2 fw, vec2 cell) { vec2 w = fw / cell; return 1.0 - smoothstep(0.35, 0.8, max(w.x, w.y)); }

void groundSurface(out vec3 col, out float rough) {
  vec2 p = vWPos.xz;
  vec2 fwp = fwidth(p);
  float h = vWPos.y;
  float slope = 1.0 - clamp(vWNrm.y, 0.0, 1.0);
  float n1 = gfbm(p * 0.0035), n2 = gn(p * 0.045), n3 = gn(p * 0.35);
  vec3 grass = mix(vec3(0.15, 0.23, 0.08), vec3(0.23, 0.31, 0.11), n1);
  vec3 forest = mix(vec3(0.055, 0.11, 0.045), vec3(0.10, 0.17, 0.06), n2) * (0.82 + 0.3 * n3);
  vec3 rock = vec3(0.30, 0.29, 0.26) * (0.8 + 0.3 * n2);
  vec3 sand = vec3(0.42, 0.38, 0.30) * (0.9 + 0.15 * n3);
  vec3 mud = vec3(0.27, 0.26, 0.21);

  // farmland patchwork: rice paddies, vegetable plots, fish ponds, orchards (irregular subdivision)
  vec2 fp = vec2(p.x * 0.994 + p.y * 0.11, p.y * 0.994 - p.x * 0.11);
  vec2 base = fp / vec2(150.0, 96.0);
  vec2 bid = floor(base), ff = fract(base);
  vec2 sub = vec2(0.0);
  float s1 = gh(bid + 0.71);
  if (s1 < 0.5) { sub.x = floor(ff.x * 2.0); ff.x = fract(ff.x * 2.0); } else { sub.y = floor(ff.y * 2.0); ff.y = fract(ff.y * 2.0); }
  float s2 = gh(bid * 1.37 + sub + 0.19);
  if (s2 < 0.5) { sub.x += 3.0 * floor(ff.x * 2.0); ff.x = fract(ff.x * 2.0); } else if (s2 < 0.8) { sub.y += 3.0 * floor(ff.y * 3.0); ff.y = fract(ff.y * 3.0); }
  vec2 fid = bid * 11.0 + sub;
  // large-scale land use: some districts are mostly fish ponds, others mostly rice
  float zoneN = gn(p * 0.0011 + 4.0);
  float r = gh(fid + 0.37);
  if (zoneN > 0.62) r = r < 0.6 ? 0.75 : r;
  else if (zoneN < 0.35) r = r > 0.68 && r < 0.82 ? 0.2 : r;
  float tex = 0.86 + 0.28 * gn(p * 0.09 + fid * 3.1);
  vec3 field; float pond = 0.0;
  if (r < 0.28) field = vec3(0.15, 0.27, 0.06) * tex;
  else if (r < 0.44) field = vec3(0.25, 0.32, 0.08) * tex;
  else if (r < 0.56) field = vec3(0.29, 0.25, 0.14) * tex;
  else if (r < 0.68) field = vec3(0.19, 0.25, 0.09) * (0.82 + 0.25 * pAAg(ff.x * 9.0, fwp.x * 9.0 / 40.0)) * tex;
  else if (r < 0.82) { field = vec3(0.06, 0.12, 0.12) * (0.9 + 0.2 * n3); pond = 1.0; }
  else field = vec3(0.11, 0.2, 0.07) * tex;
  float dikeAA = gaa(fwp, vec2(40.0, 26.0));
  float cellAA = gaaCell(fwp, vec2(40.0, 26.0));
  float inside = step(0.04, ff.x) * step(ff.x, 0.96) * step(0.05, ff.y) * step(ff.y, 0.95);
  field = mix(field, mix(vec3(0.25, 0.26, 0.16), field, inside), dikeAA);
  field = mix(vec3(0.17, 0.24, 0.09), field, cellAA);
  float faa = cellAA;
  pond *= mix(1.0, inside, dikeAA) * cellAA;

  float farm = (1.0 - smoothstep(9.0, 15.0, h)) * (1.0 - smoothstep(0.05, 0.12, slope)) * smoothstep(1.4, 2.6, h);
  vec3 nat = mix(grass, field, farm);
  float fo = clamp(smoothstep(11.0, 26.0, h) * (1.0 - farm) + smoothstep(0.1, 0.22, slope), 0.0, 1.0);
  nat = mix(nat, forest, fo);
  nat = mix(nat, rock, smoothstep(0.5, 0.75, slope));
  nat = mix(nat, sand, 1.0 - smoothstep(0.9, 2.2, h));
  nat = mix(nat, mud, 1.0 - smoothstep(-1.5, 0.7, h));
  rough = mix(0.96, 0.3, pond * farm);

  col = nat;
  vec2 duv = (p - uDevBounds.xy) / uDevBounds.zw;
  if (duv.x > 0.0 && duv.y > 0.0 && duv.x < 1.0 && duv.y < 1.0) {
    vec4 d = texture2D(uDevMap, duv);
    float dy = d.r * 50.0 + 1975.0;
    int code = int(d.g * 255.0 + 0.5);
    if (d.b > 0.5) {
      // village ground: packed earth and courtyards with a ragged edge
      float vEdge = smoothstep(0.35, 0.6, gn(p * 0.03 + 9.0) * 0.6 + n3 * 0.4);
      vec3 vil = vec3(0.30, 0.28, 0.22) * (0.82 + 0.3 * n3);
      col = mix(col, vil, 0.55 * vEdge);
    }
    if (code > 0) {
      float prep = smoothstep(dy - 1.9, dy - 1.3, uYear);
      float done = smoothstep(dy - 0.3, dy + 0.5, uYear);
      vec3 dirt = vec3(0.40, 0.29, 0.19) * (0.82 + 0.3 * n3) * (0.9 + 0.15 * n2);
      vec3 dev = vec3(0.29, 0.285, 0.275) * (0.86 + 0.22 * n3);
      float devRough = 0.92;
      if (code == 2) { // industrial yards
        dev = vec3(0.37, 0.365, 0.345) * (0.8 + 0.25 * n2) * (0.92 + 0.1 * n3);
        vec2 q = fract(p / vec2(5.0, 18.0));
        dev = mix(dev, vec3(0.75, 0.74, 0.7), gaa(fwp, vec2(5.0, 18.0)) * step(0.92, q.x) * step(0.3, q.y) * 0.5);
      } else if (code == 3) { // port yard asphalt with lane markings
        dev = vec3(0.21, 0.21, 0.22) * (0.9 + 0.15 * n3);
        vec2 q = fract(p / vec2(42.0, 14.0));
        dev = mix(dev, vec3(0.8, 0.78, 0.7), gaa(fwp, vec2(42.0, 14.0)) * max(step(0.985, q.x), step(0.96, q.y)) * 0.7);
        devRough = 0.85;
      } else if (code == 4) { // park
        dev = mix(vec3(0.16, 0.29, 0.09), vec3(0.22, 0.35, 0.11), n2);
        float path = smoothstep(0.47, 0.5, gn(p * 0.012)) * (1.0 - smoothstep(0.5, 0.53, gn(p * 0.012)));
        dev = mix(dev, vec3(0.62, 0.58, 0.5), path * 0.9);
      } else if (code == 5) { // residential compounds: gardens + paving
        float g = step(0.48, gn(p * 0.025 + 3.0));
        dev = mix(vec3(0.32, 0.315, 0.3) * (0.9 + 0.15 * n3), mix(vec3(0.13, 0.24, 0.07), vec3(0.19, 0.3, 0.09), n3), g);
      } else if (code == 6) { // plazas
        vec2 q = fract(p / 6.0);
        dev = vec3(0.42, 0.41, 0.385) * (0.92 + 0.1 * n3);
        dev *= 1.0 - 0.12 * gaa(fwp, vec2(6.0)) * max(step(0.95, q.x), step(0.95, q.y));
      }
      col = mix(col, dirt, prep);
      col = mix(col, dev, done);
      rough = mix(rough, devRough, prep);
    }
  }
}
`;

/** Continuous terrain mesh with fine spacing in the city and coarse spacing far away. */
export function createTerrain(shared: SharedUniforms, dev: DevMap): THREE.Mesh {
  const xs = axis(-17000, 17000, -4700, 4200, 26, 420);
  const zs = axis(-16000, 16000, -3000, 2100, 26, 420);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      pos[k] = xs[i];
      pos[k + 1] = terrainHeight(xs[i], zs[j]);
      pos[k + 2] = zs[j];
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let t = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[t++] = a; idx[t++] = c; idx[t++] = b;
      idx[t++] = b; idx[t++] = c; idx[t++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  mat.envMapIntensity = 0.6;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDevMap = { value: dev.texture };
    shader.uniforms.uDevBounds = { value: dev.bounds };
    shader.uniforms.uYear = shared.uYear;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n vWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GROUND_FRAG}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec3 gCol; float gRough; groundSurface(gCol, gRough);\n vec4 diffuseColor = vec4(gCol, opacity);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = gRough;');
  };
  mat.customProgramCacheKey = () => 'ebn-ground-v1';
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'terrain';
  return mesh;
}

export function clampToLand(x: number, z: number): number {
  return clamp(landDistance(x, z), -1e9, 1e9);
}
