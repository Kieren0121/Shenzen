import { Block, FillContext, PALETTE } from './CityTypes';

/**
 * Housing: 1990s mid-rise slab estates (south-facing rows with balconies),
 * 2000s+ high-rise tower estates around shared gardens, dense "urban
 * villages" where farming villages were rebuilt upwards, and the old town.
 */
export function fillResMid(b: Block, ctx: FillContext): void {
  const { rng } = ctx;
  const W = b.x1 - b.x0, D = b.z1 - b.z0;
  const cols = Math.max(1, Math.floor(W / 72));
  const rows = Math.max(1, Math.floor(D / 40));
  const cw = W / cols, rh = D / rows;
  const tint = rng.pick(PALETTE.residential);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = b.x0 + (c + 0.5) * cw, z = b.z0 + (r + 0.5) * rh;
      if (rng.chance(0.08)) continue;
      ctx.addBuilding(rng.pick(['resmid7', 'resmid9', 'resmid9']), x, z, 0, b.year + r * 0.5 + rng.range(0, 1.6), rng.chance(0.75) ? tint : rng.pick(PALETTE.residential));
      // trees between the rows
      if (r < rows - 1) for (let t = -24; t <= 24; t += 16) ctx.addTree(x + t + rng.range(-3, 3), z + rh / 2 + rng.range(-2, 2), b.year + 2.5, 0.75);
    }
  }
}

export function fillResTower(b: Block, ctx: FillContext): void {
  const { rng } = ctx;
  const W = b.x1 - b.x0, D = b.z1 - b.z0;
  const late = b.year > 2007;
  const floorsPool = late ? ['rest38', 'rest45', 'rest45', 'respt40', 'rest32'] : ['rest26', 'rest32', 'rest32', 'respt33', 'rest38'];
  const tint = rng.pick(PALETTE.residential);
  const step = 50;
  const nx = Math.max(2, Math.floor((W - 10) / step));
  const nz = Math.max(2, Math.floor((D - 10) / step));
  const sx = (W - 30) / Math.max(1, nx - 1), sz = (D - 30) / Math.max(1, nz - 1);
  let k = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const edge = i === 0 || j === 0 || i === nx - 1 || j === nz - 1;
      if (!edge && rng.chance(0.75)) continue; // central garden
      const x = b.x0 + 15 + i * sx, z = b.z0 + 15 + j * sz;
      const arch = rng.chance(0.12) && sx > 54 ? (late ? 'resslab24' : 'resslab18') : rng.pick(floorsPool);
      ctx.addBuilding(arch, x, z, rng.chance(0.5) ? 0 : Math.PI / 2, b.year + k * 0.25 + rng.range(0, 1.4), rng.chance(0.7) ? tint : rng.pick(PALETTE.residential));
      k++;
    }
  }
  // garden trees
  const gx0 = b.x0 + 40, gx1 = b.x1 - 40, gz0 = b.z0 + 40, gz1 = b.z1 - 40;
  for (let x = gx0; x < gx1; x += 14) for (let z = gz0; z < gz1; z += 14) if (rng.chance(0.4)) ctx.addTree(x + rng.range(-4, 4), z + rng.range(-4, 4), b.year + 3, rng.range(0.7, 1.1));
}

export function fillUrbanVillage(b: Block, ctx: FillContext): void {
  const { rng } = ctx;
  const cell = 15;
  // keep a small square and two lanes open
  const midX = Math.round((b.x0 + b.x1) / 2 / cell) * cell;
  for (let x = b.x0 + 8; x < b.x1 - 8; x += cell) {
    for (let z = b.z0 + 8; z < b.z1 - 8; z += cell) {
      if (Math.abs(x - midX) < 6) continue; // main lane
      if (rng.chance(0.14)) continue;
      ctx.addBuilding(rng.pick(['uv6', 'uv7', 'uv8', 'uv8']), x, z, 0, b.year + rng.range(0, 7), rng.pick(PALETTE.urbanVillage), { noCrane: true });
    }
  }
}

export function fillOldTownRedevelopment(b: Block, ctx: FillContext): void {
  const { rng } = ctx;
  const n = rng.int(1, 3);
  const W = b.x1 - b.x0;
  for (let i = 0; i < n; i++) {
    const x = b.x0 + (W / n) * (i + 0.5);
    const z = (b.z0 + b.z1) / 2 + rng.range(-20, 20);
    ctx.addBuilding(rng.pick(['t80_20', 't80_28', 't80_36']), x, z, 0, b.year + i * 1.5 + rng.range(0, 1.5), rng.pick(PALETTE.oldtown));
  }
}

export function fillPark(b: Block, ctx: FillContext): void {
  const { rng } = ctx;
  for (let x = b.x0 + 6; x < b.x1 - 6; x += 12) {
    for (let z = b.z0 + 6; z < b.z1 - 6; z += 12) {
      if (rng.chance(0.42)) ctx.addTree(x + rng.range(-4, 4), z + rng.range(-4, 4), b.year + rng.range(1, 4), rng.range(0.8, 1.35));
    }
  }
}
