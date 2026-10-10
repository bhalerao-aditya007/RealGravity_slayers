import { LAYOUT } from '@/config/layout';
import { BLOCKED } from '@/config/furnitureDefs';
import { AGENT_R, HALF_D, HALF_W, NAV_CELL } from '@/config/office';

export interface Grid {
  cols: number; rows: number; x0: number; z0: number; cell: number;
  blocked: Uint8Array;
  cx(x: number): number; cz(z: number): number;
  isBlocked(x: number, z: number): boolean;
  isBlockedCell(cx: number, cz: number): boolean;
  worldX(cx: number): number; worldZ(cz: number): number;
}

export function buildGrid(): Grid {
  const cols = Math.ceil(OFFICE_W_ / NAV_CELL), rows = Math.ceil(OFFICE_D_ / NAV_CELL);
  const x0 = -HALF_W, z0 = -HALF_D;
  const blocked = new Uint8Array(cols * rows);
  const g: Grid = {
    cols, rows, x0, z0, cell: NAV_CELL, blocked,
    cx: (x) => Math.floor((x - x0) / NAV_CELL),
    cz: (z) => Math.floor((z - z0) / NAV_CELL),
    isBlocked: (x, z) => {
      const cx = Math.floor((x - x0) / NAV_CELL), cz = Math.floor((z - z0) / NAV_CELL);
      if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) return true;
      return blocked[cz * cols + cx] === 1;
    },
    isBlockedCell: (cx, cz) => cx < 0 || cz < 0 || cx >= cols || cz >= rows || blocked[cz * cols + cx] === 1,
    worldX: (cx) => x0 + (cx + 0.5) * NAV_CELL,
    worldZ: (cz) => z0 + (cz + 0.5) * NAV_CELL,
  };
  const blockRect = (rx0: number, rz0: number, rx1: number, rz1: number, inflate = AGENT_R) => {
    const c0 = Math.max(0, g.cx(rx0 - inflate)), r0 = Math.max(0, g.cz(rz0 - inflate));
    const c1 = Math.min(cols - 1, g.cx(rx1 + inflate)), r1 = Math.min(rows - 1, g.cz(rz1 + inflate));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) blocked[r * cols + c] = 1;
  };
  // Walls (thickness 0.3)
  for (const w of LAYOUT.walls) {
    const hx = w.x0 === w.x1 ? 0.15 : 0;
    const hz = w.z0 === w.z1 ? 0.15 : 0;
    blockRect(Math.min(w.x0, w.x1) - hx, Math.min(w.z0, w.z1) - hz,
      Math.max(w.x0, w.x1) + hx, Math.max(w.z0, w.z1) + hz, AGENT_R);
  }
  // Furniture (axis-aligned rotations only)
  for (const it of LAYOUT.items) {
    if (!BLOCKED.has(it.type)) continue;
    const swap = Math.abs(Math.sin(it.rot)) > 0.5;
    const w = swap ? it.d : it.w, d = swap ? it.w : it.d;
    blockRect(it.x - w / 2, it.z - d / 2, it.x + w / 2, it.z + d / 2);
  }
  // Rugs are walkable — unblock them (blocked above? no: rug not in BLOCKED)
  return g;
}
const OFFICE_W_ = 96, OFFICE_D_ = 70;

export const GRID = buildGrid();

export function nearestFree(g: Grid, x: number, z: number): { x: number; z: number } {
  if (!g.isBlocked(x, z)) return { x, z };
  const cx = g.cx(x), cz = g.cz(z);
  for (let r = 1; r < 30; r++) {
    for (let dr = -r; dr <= r; dr++) for (let dc = -r; dc <= r; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue;
      if (!g.isBlockedCell(cx + dc, cz + dr)) return { x: g.worldX(cx + dc), z: g.worldZ(cz + dr) };
    }
  }
  return { x: LAYOUT.entrance.x, z: LAYOUT.entrance.z };
}

// supercover line-of-sight on the grid (no corner cutting)
export function los(g: Grid, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax, dz = bz - az;
  const dist = Math.hypot(dx, dz);
  const steps = Math.ceil(dist / (NAV_CELL * 0.5));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (g.isBlocked(ax + dx * t, az + dz * t)) return false;
  }
  return true;
}
