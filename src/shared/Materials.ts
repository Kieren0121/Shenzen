import * as THREE from 'three';

/**
 * Shared uniforms (one object instance referenced by every material, so a
 * single assignment updates the whole scene).
 */
export interface SharedUniforms {
  uYear: { value: number };
  uTime: { value: number };
}

export function createSharedUniforms(): SharedUniforms {
  return { uYear: { value: 1980 }, uTime: { value: 0 } };
}

/** Lifecycle reveal modes for instanced assets. */
export const RISE = {
  FADE: 0, // dithered fade in / out (houses, trees, containers, vehicles)
  BUILD: 1, // rises floor by floor with green safety netting (buildings)
  RISE_PLAIN: 2, // rises without netting (tower cranes)
} as const;

const COMMON_DECL = /* glsl */ `
varying float vPart;
varying vec2 vFac;
varying vec4 vParam;
varying vec3 vLocal;
varying vec4 vInfo;
varying float vFade;
varying float vCut;
varying float vBuild;
uniform float uYear;
uniform float uRise;
`;

const VERT_DECL = /* glsl */ `
attribute float aPart;
attribute vec4 aParam;
attribute vec4 aLife;
attribute vec4 aInfo;
${COMMON_DECL}
`;

/**
 * Lifecycle: aLife = (buildStart, buildEnd, removeStart, removeEnd) in years.
 * BUILD mode clamps vertices to a rising construction height (the façade
 * pattern stays at fixed metres, so this reads as construction, not scaling).
 */
const VERT_BODY = /* glsl */ `
{
  float H = aParam.w;
  float bp = clamp((uYear - aLife.x) / max(aLife.y - aLife.x, 0.001), 0.0, 1.0);
  float rp = clamp((uYear - aLife.z) / max(aLife.w - aLife.z, 0.001), 0.0, 1.0);
  bool rising = uRise > 0.5;
  float cut = rising ? (bp * (H + 0.05)) : (H + 10.0);
  if (rising) transformed.y = min(transformed.y, cut);
  float vis = rising ? step(0.0001, bp) : bp;
  vFade = vis * (1.0 - rp);
  vCut = cut;
  vBuild = bp;
  vPart = aPart;
  vFac = vec2(uv.x, transformed.y);
  vParam = aParam;
  vLocal = transformed;
  vInfo = aInfo;
  if (vFade <= 0.0) transformed = vec3(0.0);
}
`;

const FRAG_DECL = /* glsl */ `
${COMMON_DECL}
uniform float uHighlight;
uniform vec3 uHighlightColor;
uniform float uTime;

float bh21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float bnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(bh21(i), bh21(i + vec2(1.0, 0.0)), u.x), mix(bh21(i + vec2(0.0, 1.0)), bh21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float ditherThreshold() {
  return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
}
// Box-filtered periodic pulse: exact pixel-footprint average of a 0/1 stripe
// that is 1 on [lo, hi] of every unit cell. Converges to (hi - lo) far away,
// so façades never shimmer or alias. w = filter width in cell units.
float pInt(float t, float lo, float hi) { return floor(t) * (hi - lo) + clamp(fract(t), lo, hi) - lo; }
float pAA(float t, float lo, float hi, float w) {
  w = max(w, 1e-4);
  return (pInt(t + 0.5 * w, lo, hi) - pInt(t - 0.5 * w, lo, hi)) / w;
}
float aaW(vec2 fw, vec2 cell) {
  vec2 w = fw / cell;
  return 1.0 - smoothstep(0.22, 0.55, max(w.x, w.y));
}
float boxMask(vec2 c, vec2 lo, vec2 hi) {
  return step(lo.x, c.x) * step(c.x, hi.x) * step(lo.y, c.y) * step(c.y, hi.y);
}

void buildingSurface(out vec3 col, out float rough, out float metal, out vec3 emis) {
  vec3 tint = vInfo.rgb;
  float seed = vInfo.w;
  int part = int(vPart + 0.5);
  float floorH = vParam.x;
  float bayW = vParam.y;
  int style = int(vParam.z + 0.5);
  col = tint; rough = 0.85; metal = 0.0; emis = vec3(0.0);
  // derivatives are taken once, in uniform control flow (safe on all GPUs)
  vec2 fw = fwidth(vFac);
  float ao = mix(0.6, 1.0, smoothstep(-0.5, 4.5, vLocal.y));

  if (part == 0) { // painted / tiled wall
    float n = bnoise(vFac * 0.35 + seed * 11.0);
    col = tint * (0.9 + 0.14 * n);
    col *= 1.0 - 0.1 * pAA(vFac.y / floorH, 0.93, 1.0, fw.y / floorH);
    rough = 0.88;
  } else if (part == 1) { // punched windows of several styles
    vec2 cu = vec2(vFac.x / bayW, vFac.y / floorH);
    vec2 cw = fw / vec2(bayW, floorH);
    float far = clamp(max(cw.x, cw.y) * 1.5, 0.0, 1.0);
    vec2 cid = floor(cu), cf = fract(cu);
    vec2 lo = vec2(0.22, 0.28), hi = vec2(0.78, 0.86);
    if (style == 1) { lo = vec2(0.1, 0.2); hi = vec2(0.9, 0.86); }
    else if (style == 2) { lo = vec2(0.02, 0.36); hi = vec2(0.98, 0.82); }
    else if (style == 3) { lo = vec2(0.33, 0.36); hi = vec2(0.67, 0.74); }
    else if (style == 4) { lo = vec2(0.1, 0.34); hi = vec2(0.9, 0.94); }
    else if (style == 5) { lo = vec2(0.18, 0.26); hi = vec2(0.82, 0.84); }
    float inWin = pAA(cu.x, lo.x, hi.x, cw.x) * pAA(cu.y, lo.y, hi.y, cw.y);
    if (style == 2) inWin *= pAA(cu.x * 3.0, 0.07, 1.0, cw.x * 3.0);
    if (style == 5 && vFac.y < floorH) inWin = pAA(cu.x, 0.04, 0.96, cw.x) * step(0.3, vFac.y) * step(vFac.y, floorH * 0.88);
    if (vFac.y < 0.2) inWin = 0.0;
    float r = mix(bh21(cid + seed * 13.1), 0.45, far);
    vec3 glass = mix(vec3(0.05, 0.07, 0.09), vec3(0.17, 0.2, 0.23), r);
    glass = mix(glass, vec3(0.40, 0.38, 0.33), step(0.88, r) * (1.0 - far));
    if (style == 5 && vFac.y < floorH) glass = vec3(0.10, 0.11, 0.12);
    vec3 wall = tint * (0.93 + 0.1 * mix(bh21(floor(cu * 0.5) + seed), 0.5, far));
    // reveal shadow: the band just above each opening is slightly darker
    float reveal = pAA(cu.y, hi.y, min(hi.y + 0.08, 1.0), cw.y) * pAA(cu.x, lo.x, hi.x, cw.x);
    vec3 c = mix(wall * (1.0 - 0.25 * reveal), glass, inWin);
    if (style == 0 || style == 4) {
      float rr = bh21(cid * 1.7 + seed * 3.3);
      float ac = mix(step(0.42, rr), 0.58, far) * pAA(cu.x, 0.58, 0.86, cw.x) * pAA(cu.y, 0.05, 0.21, cw.y);
      c = mix(c, vec3(0.8, 0.8, 0.78), ac);
    }
    if (style == 4) {
      float isBal = mix(step(0.5, fract(cid.x * 0.5 + 0.25)), 0.5, far);
      float bal = isBal * pAA(cu.y, 0.0, 0.3, cw.y);
      vec3 rail = mix(vec3(0.82, 0.83, 0.82), vec3(0.35, 0.37, 0.38), 0.45 * pAA(vFac.x * 4.0, 0.55, 1.0, fw.x * 4.0));
      c = mix(c, rail, bal);
    }
    col = c;
    rough = mix(0.86, 0.12, inWin);
  } else if (part == 2) { // glass curtain wall
    vec2 g = vec2(vFac.x / 1.5, vFac.y / floorH);
    vec2 gw = fw / vec2(1.5, floorH);
    float far = clamp(max(gw.x, gw.y) * 1.5, 0.0, 1.0);
    float pane = pAA(g.x, 0.0, 0.92, gw.x) * pAA(g.y, 0.0, 0.86, gw.y);
    float mull = 1.0 - pane;
    float pr = mix(bh21(vec2(floor(g.x) * 0.13, floor(g.y)) + seed * 5.0), 0.5, far);
    vec3 gl = tint * (0.95 + 0.4 * pr) * 1.2;
    col = mix(gl, vec3(0.6, 0.63, 0.66), mull * 0.8);
    rough = mix(0.1, 0.38, mull);
    metal = mix(0.62, 0.5, mull);
  } else if (part == 3) { // flat roof
    float n = bnoise(vFac * 0.15 + seed * 3.0);
    col = vec3(0.43, 0.42, 0.40) * (0.78 + 0.32 * n);
    rough = 0.95;
  } else if (part == 4) { // metal plant / equipment
    col = vec3(0.62, 0.64, 0.66);
    rough = 0.42; metal = 0.55;
  } else if (part == 5) { // tiled pitched roof
    vec3 tc = style == 1 ? vec3(0.52, 0.25, 0.17) : vec3(0.30, 0.30, 0.31);
    col = tc * (0.8 + 0.25 * pAA(vFac.y * 3.0, 0.5, 1.0, fw.y * 3.0)) * (0.9 + 0.15 * bnoise(vFac * 0.6 + seed));
    rough = 0.9;
  } else if (part == 6) { // corrugated metal cladding / roofing
    float aa = aaW(fw, vec2(0.25, 0.25));
    col = tint * mix(0.92, 0.84 + 0.16 * sin(vFac.x * 6.2831 * 3.0), aa) * (0.94 + 0.08 * bnoise(vFac * 0.1 + seed));
    rough = 0.48; metal = 0.35;
  } else if (part == 7) {
    col = vec3(0.07, 0.075, 0.08); rough = 0.75;
  } else if (part == 8) { // balcony slab with railing
    float gap = pAA(vFac.x * 4.0, 0.5, 1.0, fw.x * 4.0) * pAA(vFac.y / floorH, 0.15, 1.0, fw.y / floorH);
    col = mix(vec3(0.84, 0.84, 0.82), vec3(0.3, 0.32, 0.33), gap * 0.6);
    rough = 0.7;
  } else if (part == 9) { // painted accent (cranes, containers, signage)
    col = tint; rough = 0.55; metal = 0.15;
  } else if (part == 10) { // foliage
    float n = bnoise(vLocal.xz * 0.6 + vLocal.y * 0.4 + seed * 9.0);
    col = tint * (0.78 + 0.4 * n) * mix(0.75, 1.1, smoothstep(0.0, 8.0, vLocal.y));
    rough = 0.92;
  } else if (part == 11) {
    col = vec3(0.30, 0.23, 0.17); rough = 0.95;
  } else if (part == 12) {
    float n = bnoise(vFac * 0.4 + seed);
    col = vec3(0.6, 0.59, 0.56) * (0.88 + 0.16 * n); rough = 0.9;
  } else if (part == 13) {
    col = vec3(0.88, 0.88, 0.86); rough = 0.5;
  } else if (part == 14) { // ship hull: antifouling red below the waterline
    col = vLocal.y < 3.5 ? vec3(0.45, 0.12, 0.09) : tint;
    rough = 0.6; metal = 0.2;
  } else if (part == 15) { // stacked containers
    vec2 g = vec2(vFac.x / 6.1, vFac.y / 2.6);
    vec2 gc = floor(g), gf = fract(g);
    float r = bh21(gc + seed * 2.0);
    vec3 pal = r < 0.2 ? vec3(0.55, 0.12, 0.09) : r < 0.38 ? vec3(0.12, 0.25, 0.5) : r < 0.52 ? vec3(0.7, 0.7, 0.68)
      : r < 0.64 ? vec3(0.15, 0.38, 0.25) : r < 0.76 ? vec3(0.62, 0.38, 0.12) : r < 0.88 ? vec3(0.36, 0.1, 0.12) : vec3(0.85, 0.85, 0.82);
    float aa = aaW(fw, vec2(6.1, 2.6));
    float seam = 1.0 - pAA(g.x, 0.0, 0.96, fw.x / 6.1) * pAA(g.y, 0.0, 0.94, fw.y / 2.6);
    vec3 c = pal * (0.88 + 0.12 * sin(vFac.x * 6.2831 * 3.0) * aa);
    col = mix(vec3(0.42, 0.33, 0.3), mix(c, vec3(0.08), seam), aa);
    rough = 0.6; metal = 0.25;
  } else if (part == 16) { // pale stone cladding with vertical ribs
    float rib = pAA(vFac.x / 2.0, 0.8, 1.0, fw.x / 2.0);
    float band = pAA(vFac.y / floorH, 0.9, 1.0, fw.y / floorH);
    float stone = clamp(rib + band - rib * band, 0.0, 1.0);
    vec3 glassC = vec3(0.24, 0.31, 0.36);
    col = mix(glassC, vec3(0.8, 0.78, 0.74), stone);
    rough = mix(0.08, 0.6, stone);
    metal = mix(0.6, 0.0, stone);
  } else if (part == 17) {
    col = tint * (0.85 + 0.25 * bnoise(vLocal.xz * 2.0 + seed)); rough = 0.95;
  } else if (part == 18) {
    col = vec3(0.36, 0.26, 0.18); rough = 1.0;
  } else if (part == 19) { // industrial glazing (sawtooth roof lights, loading doors)
    float m = pAA(vFac.x / 1.6, 0.9, 1.0, fw.x / 1.6);
    col = mix(vec3(0.13, 0.17, 0.21), vec3(0.5, 0.52, 0.54), m);
    rough = 0.15; metal = 0.5;
  } else if (part == 20) { // steel lattice (tower cranes): open bracing
    vec2 q = fract(vec2(vFac.x, vFac.y) / 2.4);
    float d1 = abs(q.x - q.y), d2 = abs(q.x + q.y - 1.0);
    float bar = max(max(step(q.x, 0.12), step(0.88, q.x)), max(step(q.y, 0.1), max(step(d1, 0.07), step(d2, 0.07))));
    float aa = aaW(fw, vec2(2.4, 2.4));
    if (bar < 0.5 && aa > 0.5) discard;
    col = tint; rough = 0.5; metal = 0.3;
  }

  col *= ao;

  // Construction: rising frame wrapped in green safety netting, fresh concrete at the top.
  if (uRise > 0.5 && uRise < 1.5 && vBuild < 0.999) {
    float band = min(9.0, vParam.w * 0.34);
    float d = vCut - vLocal.y;
    if (d < band) {
      float stripe = step(0.5, fract(vFac.x * 0.4));
      col = vec3(0.17, 0.36, 0.25) * (0.85 + 0.2 * stripe);
      rough = 0.9; metal = 0.0;
      if (d < 0.7) col = vec3(0.58, 0.57, 0.53);
    } else if (part == 2 || part == 16) {
      float clad = step(0.6, vBuild);
      col = mix(vec3(0.5, 0.5, 0.48), col, clad);
    }
  }

  if (uHighlight > 0.001 && part != 10 && part != 11) {
    float pulse = 0.55 + 0.45 * sin(uTime * 3.2);
    col = mix(col, uHighlightColor, 0.5 * uHighlight);
    emis = uHighlightColor * uHighlight * (0.18 + 0.32 * pulse);
  }
}
`;

const FRAG_MAIN = /* glsl */ `
  if (vFade < 0.999 && vFade < ditherThreshold()) discard;
  vec3 bCol; float bRough; float bMetal; vec3 bEmis;
  buildingSurface(bCol, bRough, bMetal, bEmis);
  vec4 diffuseColor = vec4(bCol, opacity);
`;

export interface BuildingMaterialOptions {
  rise: number;
  shared: SharedUniforms;
  envIntensity?: number;
  highlightColor?: THREE.Color;
}

export interface BuildingMaterialHandle {
  material: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
  highlight: { value: number };
}

/**
 * Creates the PBR building material (MeshStandardMaterial extended through
 * onBeforeCompile so lighting, shadows, fog and environment reflections stay
 * standard) and the matching shadow-depth material.
 */
export function createBuildingMaterial(opts: BuildingMaterialOptions): BuildingMaterialHandle {
  const highlight = { value: 0 };
  const rise = { value: opts.rise };
  const hlColor = { value: opts.highlightColor ?? new THREE.Color(1.0, 0.62, 0.12) };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
  material.envMapIntensity = opts.envIntensity ?? 0.9;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uYear = opts.shared.uYear;
    shader.uniforms.uTime = opts.shared.uTime;
    shader.uniforms.uRise = rise;
    shader.uniforms.uHighlight = highlight;
    shader.uniforms.uHighlightColor = hlColor;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', FRAG_MAIN)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n roughnessFactor = bRough; metalnessFactor = bMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += bEmis;');
  };
  material.customProgramCacheKey = () => 'ebn-building-v1';

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uYear = opts.shared.uYear;
    shader.uniforms.uRise = rise;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_DECL}\nfloat ditherThreshold() { return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); }`)
      .replace('vec4 diffuseColor = vec4( 1.0 );', 'if (vFade < 0.999 && vFade < ditherThreshold()) discard;\n vec4 diffuseColor = vec4( 1.0 );');
  };
  depth.customProgramCacheKey = () => 'ebn-building-depth-v1';
  return { material, depth, highlight };
}

/**
 * Builds an InstancedMesh for one archetype geometry with per-instance
 * lifecycle (aLife) and appearance (aInfo = tint rgb + seed) attributes.
 */
export interface InstanceRecord {
  x: number;
  y: number;
  z: number;
  rot: number;
  scale?: number;
  life: [number, number, number, number];
  tint: [number, number, number];
  seed: number;
}

export function createInstancedAsset(
  geometry: THREE.BufferGeometry,
  handle: BuildingMaterialHandle,
  records: InstanceRecord[],
  castShadow = true,
  receiveShadow = true,
): THREE.InstancedMesh {
  const count = Math.max(records.length, 1);
  const geo = geometry.clone();
  const life = new Float32Array(count * 4);
  const info = new Float32Array(count * 4);
  const mesh = new THREE.InstancedMesh(geo, handle.material, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  if (records.length === 0) {
    life.set([9999, 10000, 10001, 10002]);
    mesh.setMatrixAt(0, m.identity());
  }
  records.forEach((r, i) => {
    q.setFromAxisAngle(yAxis, r.rot);
    const sc = r.scale ?? 1;
    s.set(sc, sc, sc);
    p.set(r.x, r.y, r.z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    life.set(r.life, i * 4);
    info[i * 4] = r.tint[0];
    info[i * 4 + 1] = r.tint[1];
    info[i * 4 + 2] = r.tint[2];
    info[i * 4 + 3] = r.seed;
  });
  geo.setAttribute('aLife', new THREE.InstancedBufferAttribute(life, 4));
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.customDepthMaterial = handle.depth;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.computeBoundingSphere();
  mesh.frustumCulled = true;
  return mesh;
}

/** Hex string -> linear-space RGB triple (the shader works in linear space). */
export function lin(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
