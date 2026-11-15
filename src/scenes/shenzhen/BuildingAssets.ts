import * as THREE from 'three';
import { F, GeometryBuilder, P } from '../../shared/GeometryBuilder';
import { RISE } from '../../shared/Materials';

/**
 * Architectural asset library for the Shenzhen reconstruction. Every asset is
 * authored in metres, centred on the origin, base at y = 0 with a 1.5 m
 * foundation below ground so buildings never float on gentle slopes.
 * Façade detail comes from the part ids + metre UVs (see Materials.ts).
 */

export type AssetGroup = 'village' | 'old' | 'industrial' | 'residential' | 'commercial' | 'port' | 'vehicle' | 'tree' | 'crane';

export interface Archetype {
  key: string;
  geometry: THREE.BufferGeometry;
  w: number; // footprint along local x
  d: number; // footprint along local z
  h: number;
  rise: number;
  group: AssetGroup;
  castShadow: boolean;
}

const FOUND = -1.5;
type V2 = [number, number];

function parapet(b: GeometryBuilder, x0: number, z0: number, x1: number, z1: number, y: number, hgt = 1.0, t = 0.35, part: number = P.WALL): void {
  b.box(x0, y, z0, x1, y + hgt, z0 + t, part, P.CONCRETE);
  b.box(x0, y, z1 - t, x1, y + hgt, z1, part, P.CONCRETE);
  b.box(x0, y, z0 + t, x0 + t, y + hgt, z1 - t, part, P.CONCRETE);
  b.box(x1 - t, y, z0 + t, x1, y + hgt, z1 - t, part, P.CONCRETE);
}

function waterTank(b: GeometryBuilder, x: number, z: number, y: number, r = 1.3): void {
  for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as V2[]) b.boxC(x + dx * r, z + dz * r, 0.25, 0.25, y, y + 1.4, P.METAL);
  b.cylinder(x, z, r, y + 1.4, y + 3.4, 8, P.METAL);
}

function chamferRect(w: number, d: number, c: number): V2[] {
  const x = w / 2, z = d / 2;
  return [[-x + c, -z], [x - c, -z], [x, -z + c], [x, z - c], [x - c, z], [-x + c, z], [-x, z - c], [-x, -z + c]];
}

function plusShape(a: number, b: number): V2[] {
  // union of an a x b and a b x a rectangle (a > b)
  const A = a / 2, B = b / 2;
  return [[-B, -A], [B, -A], [B, -B], [A, -B], [A, B], [B, B], [B, A], [-B, A], [-B, B], [-A, B], [-A, -B], [-B, -B]];
}

function stadium(w: number, d: number, seg: number): V2[] {
  const r = d / 2, cx = w / 2 - r;
  const pts: V2[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = -Math.PI / 2 + (i / seg) * Math.PI;
    pts.push([cx + Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI / 2 + (i / seg) * Math.PI;
    pts.push([-cx + Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

// ------------------------------------------------------------------ villages
function villageHouse(kind: 0 | 1 | 2): GeometryBuilder {
  const b = new GeometryBuilder();
  if (kind === 0) {
    b.setFacade(3.2, 2.6, F.SMALL);
    b.box(-3.5, FOUND, -5, 3.5, 3.2, 5, P.WINDOWS, null);
    b.setFacade(3.2, 2.6, 0);
    b.gable(-3.5, -5, 3.5, 5, 3.2, 5.3, P.TILE, P.WALL, false);
    b.boxC(5.2, 0, 3.0, 6.0, FOUND, 2.4, P.WALL, P.TILE); // lean-to kitchen
  } else if (kind === 1) {
    b.setFacade(3.1, 2.8, F.SMALL);
    b.box(-4, FOUND, -5, 4, 6.2, 5, P.WINDOWS, P.ROOF);
    parapet(b, -4, -5, 4, 5, 6.2, 0.9, 0.3);
    b.boxC(1.8, 2.5, 2.8, 2.8, 6.2, 8.6, P.WALL, P.ROOF);
  } else {
    b.setFacade(3.1, 2.8, F.SMALL);
    b.box(-4, FOUND, -5.5, 4, 6.2, 5.5, P.WINDOWS, null);
    b.setFacade(3.1, 2.8, 1);
    b.gable(-4, -5.5, 4, 5.5, 6.2, 8.4, P.TILE, P.WALL, true);
  }
  return b;
}

// --------------------------------------------------------- old town (1980)
function oldLowrise(floors: number): GeometryBuilder {
  const b = new GeometryBuilder();
  const fh = 3.3, H = floors * fh;
  b.setFacade(fh, 3.2, F.SHOPFRONT);
  b.box(-9, FOUND, -6.5, 9, H, 6.5, P.WINDOWS, P.ROOF);
  // arcade canopy over the shopfronts
  b.box(-9, 3.1, 6.5, 9, 3.45, 8.2, P.CONCRETE, P.CONCRETE);
  parapet(b, -9, -6.5, 9, 6.5, H, 1.0, 0.3);
  waterTank(b, 4.5, -2.5, H);
  b.boxC(-5, 2, 3, 3, H, H + 2.6, P.WALL, P.ROOF);
  return b;
}

function tower80s(floors: number): GeometryBuilder {
  const b = new GeometryBuilder();
  const fh = 3.1, H = floors * fh;
  b.setFacade(fh, 3.0, F.OFFICE);
  b.prism(chamferRect(30, 22, 4), FOUND, H, P.WINDOWS, P.ROOF);
  b.setFacade(fh, 3.0, F.SHOPFRONT);
  b.prism(chamferRect(40, 30, 3), FOUND, 8, P.WINDOWS, P.ROOF);
  b.setFacade(fh, 3.0, F.OFFICE);
  b.prism(chamferRect(20, 14, 3), H, H + 6, P.WALL, P.ROOF);
  b.boxC(5, 0, 6, 5, H + 6, H + 8.5, P.METAL);
  b.boxC(-4, 0, 0.6, 0.6, H + 6, H + 22, P.METAL);
  return b;
}

// --------------------------------------------------------------- industry
/** Multi-storey "standard factory building", typical of early SEZ industry. */
function industrialMulti(floors: number): GeometryBuilder {
  const b = new GeometryBuilder();
  const fh = 4.5, H = floors * fh;
  b.setFacade(fh, 3.6, F.RIBBON);
  b.box(-30, FOUND, -9, 30, H, 9, P.WINDOWS, P.ROOF);
  b.setFacade(3.0, 3.0, F.SMALL);
  b.box(-34, FOUND, -4, -30, H + 3, 4, P.WALL, P.ROOF); // stair towers
  b.box(30, FOUND, -4, 34, H + 3, 4, P.WALL, P.ROOF);
  parapet(b, -30, -9, 30, 9, H, 1.1, 0.35);
  b.box(-26, 4.3, 9, 26, 4.7, 12.5, P.CONCRETE, P.CONCRETE); // loading canopy
  for (let i = -3; i <= 3; i++) b.box(i * 7.5 - 1.8, FOUND, 9, i * 7.5 + 1.8, 3.8, 9.15, P.GLAZING, null);
  waterTank(b, 20, 0, H, 1.6);
  b.boxC(-12, 0, 8, 5, H, H + 2.2, P.METAL);
  return b;
}

/** Large single-storey production shed with a north-light sawtooth roof. */
function industrialShed(): GeometryBuilder {
  const b = new GeometryBuilder();
  const x0 = -36, x1 = 36, z0 = -22, z1 = 22, eave = 9;
  b.setFacade(4.5, 3.0, F.RIBBON);
  b.box(x0, FOUND, z0, x1, 1.2, z1, P.CONCRETE, null);
  b.box(x0, 1.2, z0, x1, eave, z1, P.CORRUGATED, null);
  const teeth = 6, tw = (x1 - x0) / teeth, rise = 3.6;
  for (let i = 0; i < teeth; i++) {
    const a = x0 + i * tw, c = a + tw;
    const len = Math.hypot(tw, rise);
    b.quad([a, eave, z0], [a, eave, z1], [c, eave + rise, z1], [c, eave + rise, z0], [-rise / len, tw / len, 0], [z0, 0], [z1, 0], [z1, len], [z0, len], P.CORRUGATED);
    b.quad([c, eave, z0], [c, eave, z1], [c, eave + rise, z1], [c, eave + rise, z0], [1, 0, 0], [z0, eave], [z1, eave], [z1, eave + rise], [z0, eave + rise], P.GLAZING);
    b.tri([a, eave, z0], [c, eave, z0], [c, eave + rise, z0], [0, 0, -1], [a, eave], [c, eave], [c, eave + rise], P.CORRUGATED);
    b.tri([a, eave, z1], [c, eave, z1], [c, eave + rise, z1], [0, 0, 1], [a, eave], [c, eave], [c, eave + rise], P.CORRUGATED);
    b.cylinder(a + tw * 0.45, -8, 0.9, eave + rise * 0.45, eave + rise * 0.45 + 1.8, 6, P.METAL);
    b.cylinder(a + tw * 0.45, 8, 0.9, eave + rise * 0.45, eave + rise * 0.45 + 1.8, 6, P.METAL);
  }
  // loading bays + canopy on the south side
  for (let i = 0; i < 5; i++) {
    const cx = x0 + 10 + i * 12;
    b.box(cx - 2.4, FOUND, z1, cx + 2.4, 5.0, z1 + 0.15, P.GLAZING, null);
    b.box(cx - 3, FOUND, z1, cx + 3, 1.2, z1 + 3, P.CONCRETE, P.CONCRETE);
  }
  b.box(x0 + 4, 6.2, z1, x1 - 4, 6.6, z1 + 5, P.METAL, P.METAL);
  // two-storey office annex
  b.setFacade(3.4, 3.0, F.OFFICE);
  b.box(x0 - 10, FOUND, z0 + 6, x0, 7, z0 + 24, P.WINDOWS, P.ROOF);
  parapet(b, x0 - 10, z0 + 6, x0, z0 + 24, 7, 0.8, 0.3);
  return b;
}

function warehouse(): GeometryBuilder {
  const b = new GeometryBuilder();
  const x0 = -45, x1 = 45, z0 = -20, z1 = 20;
  b.box(x0, FOUND, z0, x1, 1.0, z1, P.CONCRETE, null);
  b.box(x0, 1.0, z0, x1, 11, z1, P.CORRUGATED, null);
  b.gable(x0, z0, x1, z1, 11, 13.5, P.CORRUGATED, P.CORRUGATED, true, 0.6);
  for (let i = 0; i < 8; i++) {
    const cx = x0 + 8 + i * 10.6;
    b.box(cx - 2, FOUND, z1, cx + 2, 4.6, z1 + 0.15, P.DARK, null);
  }
  b.box(x0 + 3, 1.0, z1, x1 - 3, 1.4, z1 + 3.5, P.CONCRETE, P.CONCRETE);
  b.box(x0 + 3, 5.6, z1, x1 - 3, 6.0, z1 + 4.5, P.METAL, P.METAL);
  for (let i = 0; i < 4; i++) b.box(x0 + 10 + i * 22, 12.2, -1, x0 + 16 + i * 22, 13.8, 1, P.GLAZING, P.GLAZING);
  return b;
}

// ------------------------------------------------------------- residential
function resMid(floors: number): GeometryBuilder {
  const b = new GeometryBuilder();
  const fh = 2.9, H = floors * fh;
  b.setFacade(fh, 3.0, F.RESIDENTIAL);
  b.box(-30, FOUND, -6, 30, H, 6, P.WINDOWS, P.ROOF);
  b.setFacade(fh, 3.0, F.RESIDENTIAL);
  for (let f = 1; f < floors; f++) {
    for (let k = 0; k < 6; k++) {
      const cx = -25 + k * 10;
      b.box(cx - 3, f * fh - 0.15, 6, cx + 3, f * fh + 1.05, 7.3, P.BALCONY, P.CONCRETE);
    }
  }
  for (const cx of [-15, 0, 15]) b.box(cx - 1.6, FOUND, -8.4, cx + 1.6, H + 2.6, -6, P.WALL, P.ROOF);
  parapet(b, -30, -6, 30, 6, H, 1.0, 0.3);
  waterTank(b, -22, -1, H, 1.2);
  waterTank(b, 22, -1, H, 1.2);
  return b;
}

function resTower(floors: number): GeometryBuilder {
  const b = new GeometryBuilder();
  const fh = 2.95, H = floors * fh;
  b.setFacade(fh, 3.0, F.BALCONIES);
  b.prism(plusShape(27, 14), FOUND, H, P.WINDOWS, P.ROOF);
  // lobby base
  b.setFacade(4.0, 3.0, F.SHOPFRONT);
  b.prism(plusShape(29, 16), FOUND, 4.5, P.WINDOWS, P.CONCRETE);
  // crown: screen walls and frame on the top two floors
  b.setFacade(fh, 3.0, F.OFFICE);
  b.prism(plusShape(14, 8), H, H + 5.5, P.WALL, P.ROOF);
  for (const [x, z] of [[-7, -13.5], [7, -13.5], [-7, 13.5], [7, 13.5], [-13.5, -7], [-13.5, 7], [13.5, -7], [13.5, 7]] as V2[]) {
    b.boxC(x, z, 0.6, 0.6, H - fh * 2, H + 4, P.WHITE);
  }
  b.box(-7.2, H + 3.4, -13.8, 7.2, H + 4.2, -13.2, P.WHITE);
  b.box(-7.2, H + 3.4, 13.2, 7.2, H + 4.2, 13.8, P.WHITE);
  b.box(-13.8, H + 3.4, -7.2, -13.2, H + 4.2, 7.2, P.WHITE);
  b.box(13.2, H + 3.4, -7.2, 13.8, H + 4.2, 7.2, P.WHITE);
  waterTank(b, 0, 0, H + 5.5, 1.5);
  return b;
}

function resSlabHigh(floors: number): GeometryBuilder {
  const b = new GeometryBuilder();
  const fh = 2.95, H = floors * fh;
  b.setFacade(fh, 3.0, F.BALCONIES);
  b.box(-26, FOUND, -7.5, 26, H, 7.5, P.WINDOWS, P.ROOF);
  b.setFacade(fh, 3.0, F.RESIDENTIAL);
  for (const cx of [-13, 13]) b.box(cx - 3, FOUND, -10, cx + 3, H + 4, -7.5, P.WINDOWS, P.ROOF);
  b.box(-26.3, H, -7.8, 26.3, H + 3.2, 7.8, P.WHITE, null);
  b.box(-20, H, -5, 20, H + 2.5, 5, P.ROOF, P.ROOF);
  return b;
}

function resPoint(floors: number): GeometryBuilder {
  const b = new GeometryBuilder();
  const fh = 2.95, H = floors * fh;
  b.setFacade(fh, 3.0, F.RESIDENTIAL);
  b.prism(chamferRect(26, 26, 6), FOUND, H, P.WINDOWS, P.ROOF);
  for (const [x, z] of [[-10, -13], [10, -13], [-10, 13], [10, 13], [-13, -10], [-13, 10], [13, -10], [13, 10]] as V2[]) {
    b.boxC(x, z, 0.8, 0.8, 4, H + 3, P.WHITE);
  }
  b.prism(chamferRect(16, 16, 4), H, H + 4.5, P.WALL, P.ROOF);
  return b;
}

/** "Handshake" building of an urban village: narrow, dense, 6-8 storeys. */
function urbanVillage(floors: number, variant: number): GeometryBuilder {
  const b = new GeometryBuilder();
  const fh = 2.9, H = floors * fh;
  b.setFacade(fh, 2.7, F.RESIDENTIAL);
  b.box(-5.5, FOUND, -5.5, 5.5, H, 5.5, P.WINDOWS, P.ROOF);
  // upper floors cantilever slightly over the lane (typical of these buildings)
  b.box(-5.9, fh * 2, -5.9, 5.9, H, -5.5, P.WINDOWS, null);
  parapet(b, -5.5, -5.5, 5.5, 5.5, H, 1.0, 0.25);
  if (variant === 0) b.boxC(-2.5, 2.5, 3, 3, H, H + 2.6, P.WALL, P.ROOF);
  else waterTank(b, 2.5, 2.5, H, 1.0);
  return b;
}

// -------------------------------------------------------------- commercial
function officeA(H: number): GeometryBuilder {
  const b = new GeometryBuilder();
  const fh = 4.0;
  b.setFacade(fh, 3.0, F.SHOPFRONT);
  b.box(-30, FOUND, -28, 30, 22, 28, P.GLASS, P.ROOF);
  const h1 = H * 0.68, h2 = H * 0.88;
  b.setFacade(fh, 1.5, 0);
  b.box(-19, 22, -19, 19, h1, 19, P.GLASS, P.ROOF);
  b.box(-16, h1, -16, 16, h2, 16, P.GLASS, P.ROOF);
  b.box(-12.5, h2, -12.5, 12.5, H, 12.5, P.GLASS, P.ROOF);
  for (const [x, z] of [[-12.5, 0], [12.5, 0], [0, -12.5], [0, 12.5]] as V2[]) {
    b.boxC(x, z, x === 0 ? 18 : 0.8, z === 0 ? 18 : 0.8, H - 6, H + 10, P.METAL);
  }
  b.boxC(0, 0, 14, 14, H, H + 4, P.METAL);
  return b;
}

function officeB(H: number): GeometryBuilder {
  const b = new GeometryBuilder();
  b.setFacade(4.0, 3.0, F.SHOPFRONT);
  b.box(-32, FOUND, -30, 32, 20, 30, P.WINDOWS, P.ROOF);
  b.setFacade(4.0, 1.5, 0);
  b.prism(chamferRect(42, 42, 9), 20, H, P.GLASS, null, 0.72);
  const top = chamferRect(42 * 0.72, 42 * 0.72, 9 * 0.72);
  b.prism(top, H, H + 4, P.METAL, P.ROOF);
  b.prism(chamferRect(18, 18, 4), H + 4, H + 18, P.GLASS, P.ROOF, 0.6);
  b.cylinder(0, 0, 1.4, H + 18, H + 48, 6, P.METAL, P.METAL, 0.25);
  return b;
}

function officeRound(H: number): GeometryBuilder {
  const b = new GeometryBuilder();
  b.setFacade(4.0, 3.0, F.SHOPFRONT);
  b.box(-26, FOUND, -24, 26, 18, 24, P.WINDOWS, P.ROOF);
  b.setFacade(4.0, 1.5, 0);
  b.cylinder(0, 0, 21, 18, H, 22, P.GLASS, null, 18);
  b.cylinder(0, 0, 18, H, H + 3, 22, P.METAL, P.ROOF, 18);
  b.cylinder(0, 0, 12, H + 3, H + 14, 16, P.GLASS, P.ROOF, 9);
  return b;
}

function officeSlab(H: number): GeometryBuilder {
  const b = new GeometryBuilder();
  b.setFacade(4.0, 3.0, F.SHOPFRONT);
  b.box(-32, FOUND, -18, 32, 13, 18, P.WINDOWS, P.ROOF);
  b.setFacade(3.6, 2.4, F.OFFICE);
  b.box(-24, 13, -11, 24, H, 11, P.WINDOWS, P.ROOF);
  b.box(-24.3, H - 3.6, -11.3, 24.3, H + 2, 11.3, P.WHITE, P.ROOF);
  b.boxC(6, 0, 12, 8, H + 2, H + 6, P.METAL);
  return b;
}

/** Supertall inspired by (but not modelling) recent Pearl River Delta landmarks. */
function landmarkSpire(): GeometryBuilder {
  const b = new GeometryBuilder();
  b.setFacade(4.0, 3.0, F.SHOPFRONT);
  b.box(-48, FOUND, -42, 48, 30, 42, P.GLASS, P.ROOF);
  b.setFacade(4.4, 2.0, 0);
  b.prism(chamferRect(58, 58, 12), 30, 520, P.STONE, null, 0.6);
  const t = chamferRect(58 * 0.6, 58 * 0.6, 12 * 0.6);
  b.prism(t, 520, 548, P.STONE, null, 0.62);
  b.prism(chamferRect(58 * 0.6 * 0.62, 58 * 0.6 * 0.62, 12 * 0.37), 548, 552, P.METAL, P.METAL);
  b.cylinder(0, 0, 3.2, 552, 600, 8, P.METAL, P.METAL, 0.4);
  return b;
}

function landmarkB(): GeometryBuilder {
  const b = new GeometryBuilder();
  b.setFacade(4.0, 3.0, F.SHOPFRONT);
  b.box(-45, FOUND, -38, 45, 26, 38, P.GLASS, P.ROOF);
  b.setFacade(4.2, 1.5, 0);
  b.prism(stadium(62, 40, 8), 26, 395, P.GLASS, null, 0.86);
  const s2 = stadium(62 * 0.86, 40 * 0.86, 8);
  b.prism(s2, 395, 430, P.GLASS, null, 0.55);
  b.prism(stadium(62 * 0.86 * 0.55, 40 * 0.86 * 0.55, 8), 430, 432, P.METAL, P.METAL);
  return b;
}

function mall(): GeometryBuilder {
  const b = new GeometryBuilder();
  b.setFacade(5.0, 3.0, F.SHOPFRONT);
  b.box(-45, FOUND, -32, 45, 10, 32, P.WINDOWS, P.ROOF);
  b.setFacade(5.0, 1.5, 0);
  b.box(-40, 10, -28, 40, 26, 28, P.GLASS, P.ROOF);
  for (let i = 0; i < 4; i++) b.boxC(-25 + i * 16, 0, 9, 7, 26, 28.5, P.METAL);
  return b;
}

// -------------------------------------------------------------------- port
function containerBlock(tiers: number): GeometryBuilder {
  const b = new GeometryBuilder();
  b.setFacade(2.6, 6.1, 0);
  b.box(-18.3, 0, -4.9, 18.3, tiers * 2.6, 4.9, P.CONTAINERS, P.CONTAINERS);
  return b;
}

/** Ship-to-shore gantry crane; water side is +z. */
function stsCrane(): GeometryBuilder {
  const b = new GeometryBuilder();
  const legH = 46;
  for (const x of [-9, 9]) {
    for (const z of [-15, 15]) b.boxC(x, z, 1.8, 1.8, 0, legH, P.ACCENT);
    b.box(x - 0.9, 11, -15, x + 0.9, 13, 15, P.ACCENT); // sill beam
  }
  b.box(-9.9, legH - 3, -16, 9.9, legH, -14, P.ACCENT);
  b.box(-9.9, legH - 3, 14, 9.9, legH, 16, P.ACCENT);
  b.box(-3.2, legH, -42, 3.2, legH + 3.5, 78, P.ACCENT); // boom + back-reach
  b.box(-4.5, legH + 3.5, -40, 4.5, legH + 9, -28, P.WHITE, P.ROOF); // machinery house
  for (const x of [-2.6, 2.6]) b.box(x - 0.6, legH + 3.5, 6, x + 0.6, legH + 26, 7.2, P.ACCENT);
  b.pipe([0, legH + 26, 6.6], [0, legH + 3.5, 76], 0.25, 4, P.METAL);
  b.pipe([0, legH + 26, 6.6], [0, legH + 3.5, -40], 0.25, 4, P.METAL);
  b.box(-2.2, legH - 3.5, 28, 2.2, legH, 33, P.DARK, P.DARK); // trolley + cab
  return b;
}

function ship(len: number, stacks: number): GeometryBuilder {
  const b = new GeometryBuilder();
  const L = len / 2, B = 16;
  b.prism([[-L, -B], [L - 22, -B], [L, 0], [L - 22, B], [-L, B]], -9, 10, P.HULL, P.CONCRETE);
  b.setFacade(2.6, 6.1, 0);
  b.box(-L + 40, 10, -B + 2.5, L - 26, 10 + stacks * 2.6, B - 2.5, P.CONTAINERS, P.CONTAINERS);
  b.setFacade(2.8, 2.2, F.OFFICE);
  b.box(-L + 14, 10, -B + 1, -L + 26, 34, B - 1, P.WINDOWS, P.WHITE);
  b.box(-L + 14, 30, -B - 2, -L + 18, 33, B + 2, P.WHITE, P.WHITE);
  b.box(-L + 4, 10, -3, -L + 11, 30, 3, P.ACCENT, P.DARK);
  return b;
}

// ---------------------------------------------------------------- vehicles
function truck(): GeometryBuilder {
  const b = new GeometryBuilder();
  b.box(5.4, 0.4, -1.25, 8.0, 3.3, 1.25, P.WHITE, P.WHITE);
  b.box(7.95, 1.8, -1.0, 8.05, 2.9, 1.0, P.DARK, null);
  b.setFacade(2.6, 6.1, 0);
  b.box(-7.0, 1.2, -1.25, 5.0, 3.9, 1.25, P.CONTAINERS, P.CONTAINERS);
  b.box(-7.0, 0.3, -1.1, 8.0, 1.2, 1.1, P.DARK, null);
  return b;
}

function car(): GeometryBuilder {
  const b = new GeometryBuilder();
  b.box(-2.2, 0.25, -0.9, 2.2, 0.95, 0.9, P.ACCENT, P.ACCENT);
  b.box(-1.2, 0.95, -0.8, 1.0, 1.45, 0.8, P.GLAZING, P.ACCENT);
  return b;
}

function bus(): GeometryBuilder {
  const b = new GeometryBuilder();
  b.box(-6, 0.3, -1.25, 6, 3.1, 1.25, P.ACCENT, P.WHITE);
  b.box(-5.6, 1.4, -1.27, 5.6, 2.5, 1.27, P.GLAZING, null);
  return b;
}

// -------------------------------------------------------------------- trees
function treeNear(): GeometryBuilder {
  const b = new GeometryBuilder();
  b.cylinder(0, 0, 0.28, -0.5, 3.4, 5, P.TRUNK, null, 0.2);
  b.blob(0, 4.9, 0, 3.1, 2.4, 3.1, P.FOLIAGE, 0, 1);
  b.blob(0.9, 6.6, -0.5, 2.2, 1.9, 2.2, P.FOLIAGE, 0, 2);
  return b;
}

function treeFar(): GeometryBuilder {
  const b = new GeometryBuilder();
  b.blob(0, 5.4, 0, 3.3, 3.1, 3.3, P.FOLIAGE, 0, 3, true);
  return b;
}

function towerCrane(): GeometryBuilder {
  const b = new GeometryBuilder();
  const Hc = 100;
  b.box(-1.2, 0, -1.2, 1.2, Hc, 1.2, P.LATTICE, null);
  b.box(-16, Hc, -0.9, 52, Hc + 2.2, 0.9, P.LATTICE, null);
  b.box(-15.5, Hc - 1, -1.6, -10, Hc + 2.6, 1.6, P.CONCRETE, P.CONCRETE);
  b.box(1.2, Hc - 3, -1.3, 3.6, Hc, 1.3, P.GLAZING, P.ACCENT);
  b.cylinder(0, 0, 1.0, Hc + 2.2, Hc + 9, 4, P.ACCENT, null, 0.2);
  b.pipe([0, Hc + 9, 0], [50, Hc + 2.2, 0], 0.12, 3, P.METAL);
  b.pipe([0, Hc + 9, 0], [-15, Hc + 2.2, 0], 0.12, 3, P.METAL);
  b.box(-3, -1, -3, 3, 1.5, 3, P.CONCRETE, P.CONCRETE);
  return b;
}

// ----------------------------------------------------------------- registry
function make(key: string, b: GeometryBuilder, w: number, d: number, rise: number, group: AssetGroup, castShadow = true): Archetype {
  const geometry = b.build();
  return { key, geometry, w, d, h: geometry.userData.height as number, rise, group, castShadow };
}

export function createArchetypes(): Map<string, Archetype> {
  const A = new Map<string, Archetype>();
  const add = (a: Archetype) => A.set(a.key, a);
  add(make('village0', villageHouse(0), 13.4, 10, RISE.FADE, 'village'));
  add(make('village1', villageHouse(1), 8, 10, RISE.FADE, 'village'));
  add(make('village2', villageHouse(2), 9, 12, RISE.FADE, 'village'));
  for (const f of [3, 4, 5]) add(make(`old${f}`, oldLowrise(f), 18, 16, RISE.BUILD, 'old'));
  for (const f of [20, 28, 36]) add(make(`t80_${f}`, tower80s(f), 40, 30, RISE.BUILD, 'old'));
  for (const f of [4, 5, 6]) add(make(`indm${f}`, industrialMulti(f), 68, 25, RISE.BUILD, 'industrial'));
  add(make('shed', industrialShed(), 82, 50, RISE.BUILD, 'industrial'));
  add(make('warehouse', warehouse(), 92, 46, RISE.BUILD, 'industrial'));
  for (const f of [7, 9]) add(make(`resmid${f}`, resMid(f), 60, 16, RISE.BUILD, 'residential'));
  for (const f of [26, 32, 38, 45]) add(make(`rest${f}`, resTower(f), 29, 29, RISE.BUILD, 'residential'));
  for (const f of [18, 24]) add(make(`resslab${f}`, resSlabHigh(f), 53, 20, RISE.BUILD, 'residential'));
  for (const f of [33, 40]) add(make(`respt${f}`, resPoint(f), 27, 27, RISE.BUILD, 'residential'));
  for (const f of [6, 7, 8]) add(make(`uv${f}`, urbanVillage(f, f % 2), 12, 12, RISE.BUILD, 'residential'));
  for (const H of [150, 210, 270]) add(make(`offa${H}`, officeA(H), 60, 56, RISE.BUILD, 'commercial'));
  for (const H of [200, 300]) add(make(`offb${H}`, officeB(H), 64, 60, RISE.BUILD, 'commercial'));
  for (const H of [180, 240]) add(make(`offr${H}`, officeRound(H), 52, 48, RISE.BUILD, 'commercial'));
  for (const H of [100, 130]) add(make(`offs${H}`, officeSlab(H), 64, 36, RISE.BUILD, 'commercial'));
  add(make('landmarkA', landmarkSpire(), 96, 84, RISE.BUILD, 'commercial'));
  add(make('landmarkB', landmarkB(), 90, 76, RISE.BUILD, 'commercial'));
  add(make('mall', mall(), 90, 64, RISE.BUILD, 'commercial'));
  for (const t of [2, 3, 4]) add(make(`cblock${t}`, containerBlock(t), 37, 10, RISE.FADE, 'port'));
  add(make('sts', stsCrane(), 22, 34, RISE.BUILD, 'port')); // footprint = legs; the boom passes overhead
  add(make('ship230', ship(230, 5), 230, 32, RISE.FADE, 'port'));
  add(make('ship300', ship(300, 7), 300, 32, RISE.FADE, 'port'));
  add(make('truck', truck(), 16, 2.6, RISE.FADE, 'vehicle'));
  add(make('car', car(), 4.4, 1.8, RISE.FADE, 'vehicle', false));
  add(make('bus', bus(), 12, 2.5, RISE.FADE, 'vehicle', false));
  add(make('treeNear', treeNear(), 6, 6, RISE.FADE, 'tree'));
  add(make('treeFar', treeFar(), 6, 6, RISE.FADE, 'tree'));
  add(make('crane', towerCrane(), 70, 4, RISE.RISE_PLAIN, 'crane', false));
  return A;
}
