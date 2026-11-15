import { Block, FillContext, PALETTE } from './CityTypes';
import { coastZ } from './Terrain';

/**
 * Container port: stacked container yards, warehouses, quay-side
 * ship-to-shore gantry cranes and berthed container ships. Represents how
 * goods made in factories are shipped overseas.
 */
export function fillPortYard(b: Block, ctx: FillContext): void {
  const { rng } = ctx;
  for (let z = b.z0 + 10; z < b.z1 - 10; z += 15) {
    for (let x = b.x0 + 22; x < b.x1 - 22; x += 42) {
      if (rng.chance(0.12)) continue;
      ctx.addBuilding(rng.pick(['cblock2', 'cblock3', 'cblock3', 'cblock4']), x, z, 0, b.year + rng.range(0, 5), [0.5, 0.5, 0.5]);
    }
  }
}

export function fillPortWarehouses(b: Block, ctx: FillContext): void {
  const { rng } = ctx;
  const W = b.x1 - b.x0, D = b.z1 - b.z0;
  const cols = Math.max(1, Math.floor(W / 100)), rows = Math.max(1, Math.floor(D / 60));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = b.x0 + (i + 0.5) * (W / cols), z = b.z0 + (j + 0.5) * (D / rows);
      const a = ctx.addBuilding('warehouse', x, z - 4, 0, b.year + rng.range(0, 3), rng.pick(PALETTE.factory));
      if (a) for (let k = 0; k < 3; k++) if (rng.chance(0.6)) ctx.addBuilding('truck', x - 30 + k * 21, z - 4 + 32, Math.PI / 2, a.life[1] + rng.range(0, 3), [0.8, 0.8, 0.8]);
    }
  }
}

/** Quay cranes and ships along the port's straight south quay. */
export function fillQuay(ctx: FillContext, x0: number, x1: number, startYear: number): { x: number; z: number }[] {
  const { rng } = ctx;
  const berths: { x: number; z: number }[] = [];
  let i = 0;
  for (let x = x0; x < x1; x += 72) {
    const zc = coastZ(x);
    const year = startYear + i * 0.9 + rng.range(0, 1.2);
    ctx.addBuilding('sts', x, zc - 40, 0, year, rng.pick(PALETTE.craneSTS), { noCrane: true, y: 4.5 });
    i++;
  }
  // berthed ships (appear as the terminal grows)
  let k = 0;
  for (let x = x0 + 140; x < x1 - 120; x += 330) {
    const zc = coastZ(x);
    ctx.addBuilding(k % 2 ? 'ship300' : 'ship230', x, zc + 30, Math.PI, startYear + 3 + k * 2.2, rng.pick(PALETTE.hull), { noCrane: true, y: 0 });
    berths.push({ x, z: zc + 30 });
    k++;
  }
  return berths;
}
