import { Block, FillContext, PALETTE } from './CityTypes';

/**
 * Industrial districts. Early Special Economic Zone industry is represented by
 * multi-storey "standard factory buildings" with worker dormitories; later
 * districts add large single-storey production sheds, warehouses, delivery
 * yards and parked lorries.
 */
export function fillIndustrialMulti(b: Block, ctx: FillContext): void {
  const { rng } = ctx;
  const W = b.x1 - b.x0, D = b.z1 - b.z0;
  const cols = Math.max(1, Math.floor(W / 78));
  const rows = Math.max(1, Math.floor(D / 46));
  const cw = W / cols, rh = D / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = b.x0 + (c + 0.5) * cw;
      const z = b.z0 + (r + 0.5) * rh;
      const start = b.year + rng.range(0, 2.6) + r * 0.35;
      const roll = rng.next();
      if (roll < 0.22 && W > 60) {
        // worker dormitory
        ctx.addBuilding(rng.pick(['resmid7', 'resmid9']), x, z - 2, 0, start + 0.4, rng.pick(PALETTE.residential));
      } else if (roll < 0.94) {
        const a = ctx.addBuilding(rng.pick(['indm4', 'indm5', 'indm5', 'indm6']), x, z - 3, 0, start, rng.pick(PALETTE.factoryTile));
        if (a) {
          const n = rng.int(0, 2);
          for (let k = 0; k < n; k++) ctx.addBuilding('truck', x - 18 + k * 20 + rng.range(-3, 3), z + 13.5, 0, a.life[1] + rng.range(0, 3), [0.8, 0.8, 0.8]);
        }
      }
    }
  }
  // perimeter trees
  for (let x = b.x0 + 8; x < b.x1 - 8; x += 22) ctx.addTree(x, b.z1 - 3, b.year + 2.5, 0.8);
}

export function fillIndustrialSheds(b: Block, ctx: FillContext): void {
  const { rng } = ctx;
  const W = b.x1 - b.x0, D = b.z1 - b.z0;
  const cols = Math.max(1, Math.floor(W / 96));
  const rows = Math.max(1, Math.floor(D / 64));
  const cw = W / cols, rh = D / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = b.x0 + (c + 0.5) * cw;
      const z = b.z0 + (r + 0.5) * rh;
      const start = b.year + rng.range(0, 3.2);
      const roll = rng.next();
      if (roll < 0.58) {
        const a = ctx.addBuilding('shed', x + 4, z - 6, 0, start, rng.pick(PALETTE.factory));
        if (a) {
          for (let k = 0; k < 5; k++) {
            if (rng.chance(0.45)) ctx.addBuilding('truck', x + 4 - 26 + k * 12, z - 6 + 22 + 11, Math.PI / 2, a.life[1] + rng.range(0, 4), [0.8, 0.8, 0.8]);
          }
        }
      } else if (roll < 0.9) {
        const a = ctx.addBuilding('warehouse', x, z - 5, 0, start, rng.pick(PALETTE.factory));
        if (a) {
          for (let k = 0; k < 4; k++) {
            if (rng.chance(0.5)) ctx.addBuilding('truck', x - 37 + k * 21.2, z - 5 + 20 + 12, Math.PI / 2, a.life[1] + rng.range(0, 4), [0.8, 0.8, 0.8]);
          }
        }
      } else {
        // open storage yard with containers
        for (let k = 0; k < 3; k++) ctx.addBuilding(rng.pick(['cblock2', 'cblock3']), x, z - 16 + k * 13, 0, start + rng.range(0, 3), [0.5, 0.5, 0.5]);
      }
    }
  }
  for (let x = b.x0 + 8; x < b.x1 - 8; x += 24) ctx.addTree(x, b.z0 + 3, b.year + 3, 0.85);
}
