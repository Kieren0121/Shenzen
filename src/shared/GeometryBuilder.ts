import * as THREE from 'three';

/**
 * Surface "part" identifiers. Every vertex of an architectural asset carries a
 * part id; the shared building shader (Materials.ts) turns the id plus
 * metre-based UVs into façade detail (windows, curtain walls, tiles, corrugated
 * metal, netting during construction, ...). This keeps geometry light while
 * giving buildings convincing surface detail at presentation distance.
 */
export const P = {
  WALL: 0,
  WINDOWS: 1,
  GLASS: 2,
  ROOF: 3,
  METAL: 4,
  TILE: 5,
  CORRUGATED: 6,
  DARK: 7,
  BALCONY: 8,
  ACCENT: 9,
  FOLIAGE: 10,
  TRUNK: 11,
  CONCRETE: 12,
  WHITE: 13,
  HULL: 14,
  CONTAINERS: 15,
  STONE: 16,
  CROP: 17,
  SOIL: 18,
  GLAZING: 19,
  LATTICE: 20,
} as const;

/** Façade window styles understood by the shader (aParam.z). */
export const F = {
  RESIDENTIAL: 0, // punched windows with air-conditioning units
  OFFICE: 1, // regular punched office windows
  RIBBON: 2, // factory ribbon glazing
  SMALL: 3, // small old village windows
  BALCONIES: 4, // residential tower with balcony bands
  SHOPFRONT: 5, // punched windows above dark ground-floor shopfronts
} as const;

type V3 = [number, number, number];
type V2 = [number, number];

export interface Facade {
  floorH: number;
  bayW: number;
  style: number;
}

/**
 * Accumulates indexed triangles with per-vertex attributes, then emits a
 * BufferGeometry. All assets are authored in metres with their base at y = 0.
 */
export class GeometryBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uv: number[] = [];
  private part: number[] = [];
  private param: number[] = [];
  private idx: number[] = [];
  facade: Facade = { floorH: 3, bayW: 3, style: F.RESIDENTIAL };

  setFacade(floorH: number, bayW: number, style: number): this {
    this.facade = { floorH, bayW, style };
    return this;
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  private vert(p: V3, n: V3, uv: V2, part: number): number {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
    this.part.push(part);
    this.param.push(this.facade.floorH, this.facade.bayW, this.facade.style);
    return this.pos.length / 3 - 1;
  }

  /** Quad a-b-c-d (any winding). Winding is corrected to face `n`. */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, uva: V2, uvb: V2, uvc: V2, uvd: V2, part: number): void {
    const i0 = this.vert(a, n, uva, part);
    const i1 = this.vert(b, n, uvb, part);
    const i2 = this.vert(c, n, uvc, part);
    const i3 = this.vert(d, n, uvd, part);
    // geometric normal of (a,b,c)
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    if (gx * n[0] + gy * n[1] + gz * n[2] >= 0) this.idx.push(i0, i1, i2, i0, i2, i3);
    else this.idx.push(i0, i2, i1, i0, i3, i2);
  }

  tri(a: V3, b: V3, c: V3, n: V3, uva: V2, uvb: V2, uvc: V2, part: number): void {
    const i0 = this.vert(a, n, uva, part);
    const i1 = this.vert(b, n, uvb, part);
    const i2 = this.vert(c, n, uvc, part);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    if (gx * n[0] + gy * n[1] + gz * n[2] >= 0) this.idx.push(i0, i1, i2);
    else this.idx.push(i0, i2, i1);
  }

  /**
   * Vertical prism from a polygon footprint (x,z points, either winding).
   * `taper` scales the top ring about the centroid (1 = straight walls).
   * Walls get UVs in metres (u = distance around perimeter, v = height).
   */
  prism(points: V2[], y0: number, y1: number, wallPart: number, topPart: number | null, taper = 1, uOffset = 0): void {
    const n = points.length;
    let area = 0, cx = 0, cz = 0;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = points[i];
      const [x1, z1] = points[(i + 1) % n];
      area += x0 * z1 - x1 * z0;
      cx += x0;
      cz += z0;
    }
    cx /= n;
    cz /= n;
    const sign = area > 0 ? 1 : -1;
    const top = points.map(([x, z]) => [cx + (x - cx) * taper, cz + (z - cz) * taper] as V2);
    let u = uOffset;
    const h = y1 - y0;
    for (let i = 0; i < n; i++) {
      const a = points[i], b = points[(i + 1) % n];
      const ta = top[i], tb = top[(i + 1) % n];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      // outward normal (with a vertical component when tapered)
      let nx = (sign * dz) / len, nz = (-sign * dx) / len;
      const inset = Math.hypot(ta[0] - a[0], ta[1] - a[1]) * (taper < 1 ? 1 : taper > 1 ? -1 : 0);
      const ny = h > 0 ? inset / Math.hypot(h, inset) : 0;
      const s = Math.sqrt(Math.max(0, 1 - ny * ny));
      nx *= s;
      nz *= s;
      const nrm: V3 = [nx, ny, nz];
      this.quad(
        [a[0], y0, a[1]], [b[0], y0, b[1]], [tb[0], y1, tb[1]], [ta[0], y1, ta[1]], nrm,
        [u, y0], [u + len, y0], [u + len, y1], [u, y1], wallPart,
      );
      u += len;
    }
    if (topPart !== null) this.cap(top, y1, topPart, true);
  }

  /** Horizontal polygon cap (triangulated, supports concave shapes). */
  cap(points: V2[], y: number, part: number, up: boolean): void {
    const contour = points.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const n: V3 = [0, up ? 1 : -1, 0];
    for (const t of tris) {
      const a = points[t[0]], b = points[t[1]], c = points[t[2]];
      this.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], n, [a[0], a[1]], [b[0], b[1]], [c[0], c[1]], part);
    }
  }

  /** Axis-aligned box. bottom face omitted unless requested. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, wallPart: number, topPart: number | null = wallPart, bottom = false): void {
    this.prism([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y0, y1, wallPart, topPart);
    if (bottom) this.cap([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y0, wallPart, false);
  }

  /** Box centred at (cx, cz) with size w x d. */
  boxC(cx: number, cz: number, w: number, d: number, y0: number, y1: number, wallPart: number, topPart: number | null = wallPart, bottom = false): void {
    this.box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y1, cz + d / 2, wallPart, topPart, bottom);
  }

  /** Box that is rotated about Y around its own centre. */
  boxR(cx: number, cz: number, w: number, d: number, y0: number, y1: number, rot: number, wallPart: number, topPart: number | null = wallPart): void {
    const c = Math.cos(rot), s = Math.sin(rot);
    const pts: V2[] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(
      ([x, z]) => [cx + x * c + z * s, cz - x * s + z * c] as V2,
    );
    this.prism(pts, y0, y1, wallPart, topPart);
  }

  /** Polygonal cylinder / cone frustum. */
  cylinder(cx: number, cz: number, r: number, y0: number, y1: number, seg: number, wallPart: number, topPart: number | null = wallPart, rTop = r): void {
    const pts: V2[] = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    this.prism(pts, y0, y1, wallPart, topPart, r > 0 ? rTop / r : 1);
  }

  /** Horizontal cylinder (pipe) between two points; low poly. */
  pipe(a: V3, b: V3, r: number, seg: number, part: number): void {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    dir.normalize();
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const s1 = new THREE.Vector3().crossVectors(dir, up).normalize();
    const s2 = new THREE.Vector3().crossVectors(s1, dir).normalize();
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const o0 = s1.clone().multiplyScalar(Math.cos(a0) * r).addScaledVector(s2, Math.sin(a0) * r);
      const o1 = s1.clone().multiplyScalar(Math.cos(a1) * r).addScaledVector(s2, Math.sin(a1) * r);
      const nm = s1.clone().multiplyScalar(Math.cos((a0 + a1) / 2)).addScaledVector(s2, Math.sin((a0 + a1) / 2));
      const p0: V3 = [a[0] + o0.x, a[1] + o0.y, a[2] + o0.z];
      const p1: V3 = [a[0] + o1.x, a[1] + o1.y, a[2] + o1.z];
      const p2: V3 = [b[0] + o1.x, b[1] + o1.y, b[2] + o1.z];
      const p3: V3 = [b[0] + o0.x, b[1] + o0.y, b[2] + o0.z];
      this.quad(p0, p1, p2, p3, [nm.x, nm.y, nm.z], [0, 0], [r, 0], [r, len], [0, len], part);
    }
  }

  /**
   * Gable (pitched) roof over rectangle x0..x1, z0..z1, ridge parallel to X
   * when alongX, else parallel to Z. Includes overhang and gable end walls.
   */
  gable(x0: number, z0: number, x1: number, z1: number, yEave: number, yRidge: number, roofPart: number, gablePart: number, alongX: boolean, overhang = 0.4): void {
    if (alongX) {
      const zm = (z0 + z1) / 2;
      const ox0 = x0 - overhang, ox1 = x1 + overhang, oz0 = z0 - overhang, oz1 = z1 + overhang;
      const slopeLen = Math.hypot(zm - oz0, yRidge - yEave);
      const ny = (zm - z0) / Math.hypot(zm - z0, yRidge - yEave);
      const nz = (yRidge - yEave) / Math.hypot(zm - z0, yRidge - yEave);
      this.quad([ox0, yEave, oz0], [ox1, yEave, oz0], [ox1, yRidge, zm], [ox0, yRidge, zm], [0, ny, -nz], [ox0, 0], [ox1, 0], [ox1, slopeLen], [ox0, slopeLen], roofPart);
      this.quad([ox0, yEave, oz1], [ox1, yEave, oz1], [ox1, yRidge, zm], [ox0, yRidge, zm], [0, ny, nz], [ox0, 0], [ox1, 0], [ox1, slopeLen], [ox0, slopeLen], roofPart);
      this.tri([x0, yEave, z0], [x0, yEave, z1], [x0, yRidge, zm], [-1, 0, 0], [z0, yEave], [z1, yEave], [zm, yRidge], gablePart);
      this.tri([x1, yEave, z0], [x1, yEave, z1], [x1, yRidge, zm], [1, 0, 0], [z0, yEave], [z1, yEave], [zm, yRidge], gablePart);
    } else {
      const xm = (x0 + x1) / 2;
      const ox0 = x0 - overhang, ox1 = x1 + overhang, oz0 = z0 - overhang, oz1 = z1 + overhang;
      const slopeLen = Math.hypot(xm - ox0, yRidge - yEave);
      const ny = (xm - x0) / Math.hypot(xm - x0, yRidge - yEave);
      const nx = (yRidge - yEave) / Math.hypot(xm - x0, yRidge - yEave);
      this.quad([ox0, yEave, oz0], [ox0, yEave, oz1], [xm, yRidge, oz1], [xm, yRidge, oz0], [-nx, ny, 0], [oz0, 0], [oz1, 0], [oz1, slopeLen], [oz0, slopeLen], roofPart);
      this.quad([ox1, yEave, oz0], [ox1, yEave, oz1], [xm, yRidge, oz1], [xm, yRidge, oz0], [nx, ny, 0], [oz0, 0], [oz1, 0], [oz1, slopeLen], [oz0, slopeLen], roofPart);
      this.tri([x0, yEave, z0], [x1, yEave, z0], [xm, yRidge, z0], [0, 0, -1], [x0, yEave], [x1, yEave], [xm, yRidge], gablePart);
      this.tri([x0, yEave, z1], [x1, yEave, z1], [xm, yRidge, z1], [0, 0, 1], [x0, yEave], [x1, yEave], [xm, yRidge], gablePart);
    }
  }

  /** Low-poly blob (icosahedron) used for tree canopies, clouds and boulders. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, part: number, detail = 0, jitterSeed = 0, octa = false): void {
    const ico = octa ? new THREE.OctahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, detail);
    const p = ico.getAttribute('position') as THREE.BufferAttribute;
    const nonIndexed = ico.index ? ico.toNonIndexed() : ico;
    const pp = nonIndexed.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i += 3) {
      const tri: V3[] = [];
      for (let k = 0; k < 3; k++) {
        const x = pp.getX(i + k), y = pp.getY(i + k), z = pp.getZ(i + k);
        const j = 1 + 0.12 * Math.sin(x * 5.1 + jitterSeed) * Math.cos(z * 4.3 + y * 3.7 + jitterSeed);
        tri.push([cx + x * rx * j, cy + y * ry * j, cz + z * rz * j]);
      }
      // smooth-ish normals: use averaged sphere direction for each vertex
      const ns: V3[] = tri.map(([x, y, z]) => {
        const nx = (x - cx) / rx, ny = (y - cy) / ry, nz = (z - cz) / rz;
        const l = Math.hypot(nx, ny, nz) || 1;
        return [nx / l, ny / l, nz / l];
      });
      const i0 = this.vert(tri[0], ns[0], [tri[0][0], tri[0][1]], part);
      const i1 = this.vert(tri[1], ns[1], [tri[1][0], tri[1][1]], part);
      const i2 = this.vert(tri[2], ns[2], [tri[2][0], tri[2][1]], part);
      this.idx.push(i0, i1, i2);
    }
    ico.dispose();
    if (nonIndexed !== ico) nonIndexed.dispose();
    void p;
  }

  /** Append another builder, rotated about Y by `rot` and translated. */
  merge(other: GeometryBuilder, tx = 0, ty = 0, tz = 0, rot = 0, scale = 1): void {
    const base = this.vertexCount;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < other.pos.length; i += 3) {
      const x = other.pos[i] * scale, y = other.pos[i + 1] * scale, z = other.pos[i + 2] * scale;
      this.pos.push(tx + x * c + z * s, ty + y, tz - x * s + z * c);
      const nx = other.nrm[i], ny = other.nrm[i + 1], nz = other.nrm[i + 2];
      this.nrm.push(nx * c + nz * s, ny, -nx * s + nz * c);
    }
    this.uv.push(...other.uv);
    this.part.push(...other.part);
    this.param.push(...other.param);
    for (const k of other.idx) this.idx.push(base + k);
  }

  build(heightOverride?: number): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    let maxY = 0;
    for (let i = 1; i < this.pos.length; i += 3) maxY = Math.max(maxY, this.pos[i]);
    const H = heightOverride ?? maxY;
    const n = this.pos.length / 3;
    const param4 = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      param4[i * 4] = this.param[i * 3];
      param4[i * 4 + 1] = this.param[i * 3 + 1];
      param4[i * 4 + 2] = this.param[i * 3 + 2];
      param4[i * 4 + 3] = H;
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aParam', new THREE.BufferAttribute(param4, 4));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.userData.height = H;
    return g;
  }
}
