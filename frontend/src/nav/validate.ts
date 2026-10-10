import { LAYOUT, Item } from '@/config/layout';
import { Grid } from './grid';
import { findPath } from './astar';

function aabb(it: Item) {
  const swap = Math.abs(Math.sin(it.rot)) > 0.5;
  const w = swap ? it.d : it.w, d = swap ? it.w : it.d;
  return { x0: it.x - w / 2, z0: it.z - d / 2, x1: it.x + w / 2, z1: it.z + d / 2 };
}
const TOL = 0.05;

export function validateLayout(grid: Grid): string[] {
  const errs: string[] = [];
  const items = LAYOUT.items;
  // (a) furniture vs furniture
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = aabb(items[i]), b = aabb(items[j]);
    if (items[i].type === 'monitor' || items[j].type === 'monitor' || items[i].type === 'rug' || items[j].type === 'rug') continue;
    // the coffee machine stands ON the pantry counter by design
    const pair = [items[i].type, items[j].type];
    if (pair.includes('coffeeMachine') && pair.includes('counter')) continue;
    if (a.x0 < b.x1 - TOL && a.x1 > b.x0 + TOL && a.z0 < b.z1 - TOL && a.z1 > b.z0 + TOL)
      errs.push(`furniture overlap: ${items[i].id} <-> ${items[j].id}`);
  }
  // (b) furniture vs walls
  for (const it of items) {
    if (it.type === 'monitor' || it.type === 'rug' || it.type === 'art' || it.type === 'clock' || it.type === 'exitSign' || it.type === 'whiteboard' || it.type === 'logoWall') continue;
    const a = aabb(it);
    for (const w of LAYOUT.walls) {
      const hx = w.x0 === w.x1 ? 0.15 : 0, hz = w.z0 === w.z1 ? 0.15 : 0;
      const b = { x0: Math.min(w.x0, w.x1) - hx, z0: Math.min(w.z0, w.z1) - hz, x1: Math.max(w.x0, w.x1) + hx, z1: Math.max(w.z0, w.z1) + hz };
      if (a.x0 < b.x1 - TOL && a.x1 > b.x0 + TOL && a.z0 < b.z1 - TOL && a.z1 > b.z0 + TOL)
        errs.push(`furniture in wall: ${it.id} <-> wall ${w.x0},${w.z0}-${w.x1},${w.z1}`);
    }
  }
  // (c) seats reachable from reception + (e) aisle clearance at approaches
  for (const it of items) {
    const seats = it.seats ?? (it.seat ? [it.seat] : []);
    for (const s of seats) {
      if (grid.isBlocked(s.ax, s.az)) { errs.push(`approach blocked: ${it.id} seat approach (${s.ax},${s.az})`); continue; }
      const p = findPath(grid, LAYOUT.entrance.x, LAYOUT.entrance.z, s.ax, s.az);
      if (!p) errs.push(`approach unreachable: ${it.id}`);
      // aisle: the cell 0.6 m beyond the approach (away from chair) must also be free
      const dx = s.ax - s.x, dz = s.az - s.z, len = Math.hypot(dx, dz) || 1;
      if (grid.isBlocked(s.ax + (dx / len) * 0.6, s.az + (dz / len) * 0.6))
        errs.push(`aisle < 1.2m at approach of ${it.id}`);
    }
  }
  // (d) zones reachable
  for (const z of LAYOUT.zones) {
    const cx = (z.x0 + z.x1) / 2, cz = (z.z0 + z.z1) / 2;
    if (grid.isBlocked(cx, cz)) {
      const p = findPath(grid, LAYOUT.entrance.x, LAYOUT.entrance.z, cx, cz);
      if (!p) errs.push(`zone unreachable: ${z.name}`);
    }
  }
  return errs;
}
