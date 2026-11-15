import * as THREE from 'three';
import { hash2 } from './Random';

/**
 * All textures are generated in code at start-up (no image files, no fetch),
 * so the single-file build works under file:// with no network access.
 */

function periodicNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const w = (v: number) => ((v % period) + period) % period;
  const a = hash2(w(xi), w(yi), seed), b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed), d = hash2(w(xi + 1), w(yi + 1), seed);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Tileable water normal map (RGB = tangent-space normal). */
export function createWaterNormalTexture(size = 256): THREE.DataTexture {
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0, amp = 1, f = 8;
      for (let o = 0; o < 5; o++) {
        h += amp * periodicNoise((x / size) * f, (y / size) * f, f, 101 + o);
        amp *= 0.5;
        f *= 2;
      }
      hgt[y * size + x] = h;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const s = 3.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = hgt[y * size + ((x - 1 + size) % size)], r = hgt[y * size + ((x + 1) % size)];
      const d = hgt[((y - 1 + size) % size) * size + x], u = hgt[((y + 1) % size) * size + x];
      let nx = (l - r) * s, ny = (d - u) * s, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Soft round sprite (alpha falloff) for particles. */
export function createSoftDotTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = Math.max(0, 1 - r);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(Math.pow(a, 1.6) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
