import * as THREE from 'three';
import { AQUIFER, DISPLAY, WELLS } from './AquiferModel';

/**
 * The geological cut-away block. Display units: 1 unit = 1 m vertically and
 * 5 m horizontally (horizontal compression so the section fits the screen —
 * a standard block-diagram convention, stated in the interface notes).
 * Block: x ∈ [-100, 100], z ∈ [-60, 60], base y = 0, ground ≈ 50.
 */
export const BLOCK = { x0: -100, x1: 100, z0: -60, z1: 60 };

export function surfaceHeight(x: number, z: number): number {
  return AQUIFER.groundSurface + 0.45 * Math.sin(x * 0.045 + 1.0) * Math.cos(z * 0.06) + 0.3 * Math.sin(x * 0.13 + z * 0.07) + 0.12 * Math.sin(z * 0.3 + x * 0.21);
}

/** Display x/z of a well. */
export function wellDisplay(i: number): { x: number; z: number } {
  return { x: WELLS[i].x / DISPLAY.horizontalScale, z: WELLS[i].z / DISPLAY.horizontalScale };
}

export const CASING_R = 1.25;

export interface AquiferUniforms {
  uH: { value: number };
  uBase: { value: number };
  uH0: { value: number };
  uWells: { value: THREE.Vector4[] };
  uR0: { value: number };
  uRw: { value: number };
  uHS: { value: number };
  uTime: { value: number };
  uLens: { value: THREE.Vector4 };
  uHoles: { value: THREE.Vector4[] };
}

export function createAquiferUniforms(): AquiferUniforms {
  return {
    uH: { value: AQUIFER.initialWaterTable },
    uBase: { value: AQUIFER.baseElevation },
    uH0: { value: AQUIFER.initialWaterTable },
    uWells: { value: WELLS.map((_, i) => new THREE.Vector4(wellDisplay(i).x, wellDisplay(i).z, 0, 0)) },
    uR0: { value: AQUIFER.radiusOfInfluence },
    uRw: { value: AQUIFER.wellRadius },
    uHS: { value: DISPLAY.horizontalScale },
    uTime: { value: 0 },
    uLens: { value: new THREE.Vector4(76, 38.5, 8.5, 4.0) }, // centre (x along the front face, y), radius, magnification
    uHoles: { value: WELLS.map((w, i) => new THREE.Vector4(wellDisplay(i).x, w.bottom - 0.6, CASING_R, 0)) },
  };
}

const STRATA_DECL = /* glsl */ `
uniform float uH; uniform float uBase; uniform float uH0;
uniform vec4 uWells[2];
uniform float uR0; uniform float uRw; uniform float uHS; uniform float uTime;
uniform vec4 uLens; uniform vec4 uHoles[2];
varying vec3 vW; varying float vSurf; varying float vFace;
float sh(vec2 p) { p = fract(p * vec2(127.13, 311.77)); p += dot(p, p + 34.17); return fract(p.x * p.y); }
float sn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sh(i), sh(i + vec2(1, 0)), u.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), u.x), u.y); }
vec3 voro(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float F1 = 8.0, F2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(sh(i + g), sh(i + g + 17.3)) * 0.76 + 0.12;
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < F1) { F2 = F1; F1 = d; id = sh(i + g + 5.1); } else if (d < F2) F2 = d;
  }
  return vec3(sqrt(F1), sqrt(F2), id);
}
/** Same Dupuit–Thiem superposition as AquiferModel.localHead (display -> model metres via uHS). */
float headAt(vec2 xz) {
  float H = max(uH - uBase, 0.05);
  float S = 0.0;
  for (int i = 0; i < 2; i++) {
    float r = max(distance(xz, uWells[i].xy) * uHS, uRw);
    if (uWells[i].z > 0.0 && r < uR0) S += uWells[i].z * log(uR0 / r);
  }
  return uBase + sqrt(max(H * H - S, 0.0025));
}
void strata(vec2 fwq, out vec3 col, out float rough, out vec3 emis) {
  float face = vFace;
  bool alongX = face < 0.5 || (face > 1.5 && face < 2.5);
  float along = alongX ? vW.x : vW.z;
  float y = vW.y;
  // magnifier lens on the front face
  vec2 lp = vec2(along, y) - uLens.xy;
  float lr = length(lp);
  bool inLens = face < 0.5 && lr < uLens.z;
  float mag = inLens ? uLens.w : 1.0;
  vec2 q = inLens ? uLens.xy + lp / mag : vec2(along, y);
  float yT = q.y, aT = q.x;
  vec2 xz = alongX ? vec2(aT, vW.z) : vec2(vW.x, aT);
  float h = headAt(xz);
  float soilB = vSurf - 1.5 - 0.45 * sn(vec2(aT * 0.2, 1.0));
  float siltB = 37.2 + 1.2 * sn(vec2(aT * 0.025, 3.0)) + 0.4 * sn(vec2(aT * 0.15, 5.0));
  float baseB = uBase - 0.25 + 0.5 * sn(vec2(aT * 0.04, 7.0));
  float wet = 1.0 - smoothstep(h - 0.05, h + 0.75, yT); // saturated below the water table, thin capillary fringe
  vec3 water = vec3(0.07, 0.46, 0.68);
  float sparkle = pow(sh(floor(q * 9.0) + floor(uTime * 1.5)), 40.0);
  rough = 0.95;
  emis = vec3(0.0);
  float pore = 0.0;
  vec3 sed;
  if (yT > soilB) { // topsoil with roots
    sed = vec3(0.16, 0.10, 0.06) * (0.75 + 0.5 * sn(q * 2.5));
    float root = 1.0 - smoothstep(0.02, 0.07, abs(sin(aT * 1.7 + sn(q * 0.9) * 5.0)) * 0.5);
    sed = mix(sed, vec3(0.08, 0.05, 0.03), root * step(soilB + 0.3, yT) * 0.7);
  } else if (yT > siltB) { // sandy silt: fine grains + faint laminations
    vec3 v = voro(q * 1.5);
    float lam = 0.92 + 0.08 * sin(yT * 9.0 + sn(q * 0.4) * 4.0);
    sed = vec3(0.52, 0.42, 0.29) * lam * (0.85 + 0.25 * v.z);
    pore = (1.0 - smoothstep(0.03, 0.09, v.y - v.x)) * 0.7;
  } else if (yT > baseB) { // sand & gravel aquifer: rounded pebbles with pore spaces
    // inside the close-up lens, show more (smaller-looking) grains with wider gaps
    vec3 v = inLens ? voro(lp * 0.62 + 40.0) : voro(q * 0.48);
    float edge = v.y - v.x;
    float id = v.z;
    vec3 peb = id < 0.25 ? vec3(0.50, 0.47, 0.42) : id < 0.5 ? vec3(0.60, 0.53, 0.40) : id < 0.75 ? vec3(0.40, 0.38, 0.36) : vec3(0.66, 0.60, 0.48);
    peb *= 0.7 + 0.45 * smoothstep(0.0, 0.5, edge); // domed shading
    vec3 fine = vec3(0.55, 0.48, 0.36) * (0.85 + 0.3 * sh(floor(q * 12.0)));
    float isPeb = inLens ? smoothstep(0.13, 0.2, edge) : smoothstep(0.1, 0.17, edge);
    sed = mix(fine, peb, isPeb);
    pore = inLens ? (1.0 - smoothstep(0.09, 0.15, edge)) : (1.0 - smoothstep(0.035, 0.1, edge));
  } else { // clay / rock: low permeability
    float lam = 0.9 + 0.1 * sin(yT * 6.0 + sn(q * 0.3) * 3.0);
    sed = vec3(0.21, 0.205, 0.215) * lam * (0.88 + 0.2 * sn(q * 0.6));
    wet = 0.0;
  }
  // saturation: darker, cooler sediment; pores filled with water (or air above the water table)
  sed *= mix(1.0, 0.72, wet);
  sed = mix(sed, vec3(0.13, 0.36, 0.52), wet * 0.42); // translucent blue wash shows where the ground is saturated
  // layer boundaries drawn as fine lines for legibility
  float bl = 1.0 - smoothstep(0.06, 0.06 + fwq.y * 1.5, min(abs(yT - siltB), abs(yT - baseB)) * mag);
  sed *= 1.0 - 0.45 * bl;
  vec3 poreCol = mix(vec3(0.05, 0.045, 0.04), water * (1.15 + 0.8 * sparkle), wet);
  col = mix(sed, poreCol, pore);
  emis += water * (0.45 * pore + 0.06) * wet;
  rough = mix(0.95, 0.45, wet * 0.6);
  // water table line (the boundary between saturated and unsaturated ground)
  float lw = 0.16 / mag;
  float d = abs(yT - h);
  float fw = max(fwq.y / mag, 1e-4);
  float line = 1.0 - smoothstep(lw, lw + fw * 1.5, d);
  col = mix(col, vec3(0.45, 0.95, 1.0), line);
  emis += vec3(0.2, 0.75, 0.9) * line * 0.9;
  // the starting water table, dashed, once the table has fallen
  if (uH < uH0 - 0.3 && yT > baseB) {
    float dd = abs(yT - uH0);
    float dash = step(0.5, fract(aT / 2.6));
    float sl = (1.0 - smoothstep(0.1 / mag, 0.1 / mag + fw * 1.5, dd)) * dash;
    col = mix(col, vec3(0.95), sl * 0.85);
  }
  if (inLens) {
    col *= 1.08;
    float ring = smoothstep(uLens.z - 0.55, uLens.z - 0.4, lr);
    col = mix(col, vec3(0.96), ring);
    emis += vec3(0.25) * ring;
  } else if (face < 0.5 && lr < uLens.z + 0.5) {
    col *= 0.45; // soft shadow around the lens rim
  }
}
`;

/** Material for the four cut faces (lighting, shadows and fog stay standard). */
export function createStrataMaterial(u: AquiferUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  mat.envMapIntensity = 0.7;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSurf; attribute float aFace; varying vec3 vW; varying float vSurf; varying float vFace;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vSurf = aSurf; vFace = aFace;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${STRATA_DECL}`)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec2 fwq = fwidth(vec2(vFace < 0.5 || (vFace > 1.5 && vFace < 2.5) ? vW.x : vW.z, vW.y));
         if (vFace < 0.5) { for (int i = 0; i < 2; i++) { if (abs(vW.x - uHoles[i].x) < uHoles[i].z && vW.y > uHoles[i].y) discard; } }
         vec3 sCol; float sRough; vec3 sEmis; strata(fwq, sCol, sRough, sEmis);
         vec4 diffuseColor = vec4(sCol, opacity);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = sRough;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += sEmis;');
  };
  mat.customProgramCacheKey = () => 'ebn-strata-v1';
  return mat;
}

/** The four vertical cut faces, with the ground profile along their top edge. */
export function createCutFaces(material: THREE.Material): THREE.Mesh {
  const pos: number[] = [], nrm: number[] = [], surf: number[] = [], fc: number[] = [], idx: number[] = [];
  const addFace = (face: number, n: [number, number, number], pts: (t: number) => [number, number], len: number) => {
    const cols = Math.ceil(len / 0.8), rows = 10;
    const base = pos.length / 3;
    for (let i = 0; i <= cols; i++) {
      const [x, z] = pts(i / cols);
      const top = surfaceHeight(x, z);
      for (let j = 0; j <= rows; j++) {
        const y = (top * j) / rows;
        pos.push(x, y, z);
        nrm.push(...n);
        surf.push(top);
        fc.push(face);
      }
    }
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const a = base + i * (rows + 1) + j, b = a + rows + 1, c = a + 1, d = b + 1;
        // choose winding so the face is front-facing along its outward normal
        const ax = pos[a * 3], az = pos[a * 3 + 2], bx = pos[b * 3], bz = pos[b * 3 + 2];
        const ux = bx - ax, uz = bz - az; // along the face; v = +y
        const gx = -uz, gz = ux; // (u x up) projected
        // (a, b, c) has geometric normal (gx, 0, gz); keep it if it matches the outward normal
        if (gx * n[0] + gz * n[2] > 0) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
  };
  const { x0, x1, z0, z1 } = BLOCK;
  addFace(0, [0, 0, 1], (t) => [x0 + (x1 - x0) * t, z1], x1 - x0); // front
  addFace(1, [1, 0, 0], (t) => [x1, z1 - (z1 - z0) * t], z1 - z0); // right
  addFace(2, [0, 0, -1], (t) => [x1 - (x1 - x0) * t, z0], x1 - x0); // back
  addFace(3, [-1, 0, 0], (t) => [x0, z0 + (z1 - z0) * t], z1 - z0); // left
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aSurf', new THREE.Float32BufferAttribute(surf, 1));
  g.setAttribute('aFace', new THREE.Float32BufferAttribute(fc, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  m.name = 'cutFaces';
  return m;
}

const GROUND_DECL = /* glsl */ `
varying vec3 vW;
uniform float uWet;
float th(vec2 p) { p = fract(p * vec2(213.1, 97.3)); p += dot(p, p + 21.7); return fract(p.x * p.y); }
float tn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(th(i), th(i + vec2(1, 0)), u.x), mix(th(i + vec2(0, 1)), th(i + vec2(1, 1)), u.x), u.y); }
float inRect(vec2 p, vec4 r) { return step(r.x, p.x) * step(p.x, r.z) * step(r.y, p.y) * step(p.y, r.w); }
void groundTop(vec2 fw, out vec3 col, out float rough) {
  vec2 p = vW.xz;
  float n = tn(p * 0.35), n2 = tn(p * 2.0);
  col = mix(vec3(0.17, 0.27, 0.08), vec3(0.24, 0.34, 0.11), n) * (0.85 + 0.25 * n2); // grass
  rough = 0.95;
  // wheat field with rows (farm)
  float field = inRect(p, vec4(-96.0, -56.0, 30.0, 4.0));
  float row = 0.5 + 0.5 * sin(p.y * 6.2831 / 1.6);
  vec3 soil = vec3(0.30, 0.22, 0.14) * (0.85 + 0.2 * n2);
  vec3 crop = vec3(0.42, 0.45, 0.16) * (0.85 + 0.25 * n);
  float rowAA = 1.0 - smoothstep(0.3, 0.8, fw.y / 1.6);
  col = mix(col, mix(mix(soil, crop, 0.55), mix(soil, crop, smoothstep(0.35, 0.65, row)), rowAA), field);
  // irrigation channel
  float ch = inRect(p, vec4(-96.0, 5.0, 36.0, 6.2));
  col = mix(col, vec3(0.08, 0.2, 0.24), ch);
  rough = mix(rough, 0.2, ch);
  // farm track / road
  float road = inRect(p, vec4(-100.0, 9.0, 100.0, 14.0));
  col = mix(col, vec3(0.36, 0.33, 0.29) * (0.9 + 0.15 * n2), road);
  // factory yard (concrete)
  float yard = inRect(p, vec4(46.0, -58.0, 98.0, 6.0));
  col = mix(col, vec3(0.45, 0.44, 0.41) * (0.88 + 0.15 * n2), yard);
  // village yards (packed earth)
  float vil = inRect(p, vec4(-94.0, 16.0, -14.0, 52.0)) * step(0.35, tn(p * 0.12));
  col = mix(col, vec3(0.38, 0.33, 0.25) * (0.88 + 0.2 * n2), vil * 0.8);
  // well aprons (concrete)
  float ap = inRect(p, vec4(-39.0, 54.0, -31.0, 60.0)) + inRect(p, vec4(36.0, 54.0, 44.0, 60.0));
  col = mix(col, vec3(0.55, 0.54, 0.51), clamp(ap, 0.0, 1.0));
  col *= mix(1.0, 0.82, uWet); // rain-darkened ground
}
`;

export function createTopSurface(wet: { value: number }): THREE.Mesh {
  const { x0, x1, z0, z1 } = BLOCK;
  const nx = 200, nz = 120;
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, surfaceHeight(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  mat.envMapIntensity = 0.6;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = wet;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GROUND_DECL}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec2 gfw = fwidth(vW.xz); vec3 tCol; float tRough; groundTop(gfw, tCol, tRough);\n vec4 diffuseColor = vec4(tCol, opacity);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = tRough;');
  };
  mat.customProgramCacheKey = () => 'ebn-gw-ground-v1';
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  m.name = 'surface';
  return m;
}

/** Dark exhibit plinth under the block, plus a soft studio backdrop. */
export function createPlinth(): THREE.Group {
  const grp = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(214, 3, 134), new THREE.MeshStandardMaterial({ color: 0x1b2129, roughness: 0.7, metalness: 0.1 }));
  base.position.y = -1.55;
  base.receiveShadow = true;
  grp.add(base);
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 1 }));
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = 0.01;
  grp.add(bottom);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1400, 64), new THREE.MeshStandardMaterial({ color: 0x252b33, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3.05;
  floor.receiveShadow = true;
  grp.add(floor);
  return grp;
}

export function createBackdrop(): THREE.Mesh {
  const g = new THREE.SphereGeometry(3000, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(0.38, 0.47, 0.57) }, mid: { value: new THREE.Color(0.62, 0.68, 0.74) }, bottom: { value: new THREE.Color(0.09, 0.11, 0.14) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
      void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, y)) : mix(mid, bottom, smoothstep(0.0, 0.12, -y));
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = -10;
  return mesh;
}
