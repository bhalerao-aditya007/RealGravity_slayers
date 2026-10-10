import { Grid, los } from './grid';
import { LAYOUT } from '@/config/layout';

export interface Pt { x: number; z: number }

class Heap {
  private a: number[] = []; private f: Float64Array;
  constructor(size: number) { this.f = new Float64Array(size); }
  push(node: number, f: number) {
    this.f[node] = f; this.a.push(node);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[this.a[p]] <= this.f[this.a[i]]) break;
      [this.a[p], this.a[i]] = [this.a[i], this.a[p]]; i = p;
    }
  }
  pop(): number {
    const top = this.a[0]; const last = this.a.pop()!;
    if (this.a.length) {
      this.a[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < this.a.length && this.f[this.a[l]] < this.f[this.a[m]]) m = l;
        if (r < this.a.length && this.f[this.a[r]] < this.f[this.a[m]]) m = r;
        if (m === i) break;
        [this.a[m], this.a[i]] = [this.a[i], this.a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

const cache = new Map<string, Pt[] | null>();
const CACHE_MAX = 600;

export function findPath(g: Grid, ax: number, az: number, bx: number, bz: number): Pt[] | null {
  if (g.isBlocked(bx, bz)) {
    const nf = nearestFreeExport(g, bx, bz);
    bx = nf.x; bz = nf.z;
  }
  const key = `${Math.round(ax * 4)},${Math.round(az * 4)},${Math.round(bx * 4)},${Math.round(bz * 4)}`;
  if (cache.has(key)) return cache.get(key)! ? [...cache.get(key)!] : null;
  const path = astar(g, ax, az, bx, bz);
  if (cache.size > CACHE_MAX) cache.clear();
  cache.set(key, path);
  return path ? [...path] : null;
}

function astar(g: Grid, ax: number, az: number, bx: number, bz: number): Pt[] | null {
  const { cols, rows } = g;
  const sx = g.cx(ax), sz = g.cz(az), tx = g.cx(bx), tz = g.cz(bz);
  if (g.isBlockedCell(sx, sz) || g.isBlockedCell(tx, tz)) return null;
  const N = cols * rows;
  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const start = sz * cols + sx, target = tz * cols + tx;
  const h = (c: number, r: number) => {
    const dx = Math.abs(c - tx), dz = Math.abs(r - tz);
    return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
  };
  const heap = new Heap(N);
  gScore[start] = 0;
  heap.push(start, h(sx, sz));
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.size) {
    const cur = heap.pop();
    if (cur === target) return reconstruct(g, came, cur);
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % cols, cr = (cur - cc) / cols;
    for (const [dc, dr, cost] of DIRS) {
      const nc = cc + dc, nr = cr + dr;
      if (g.isBlockedCell(nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && (g.isBlockedCell(cc + dc, cr) || g.isBlockedCell(cc, cr + dr))) continue; // no diagonal corner cutting
      const ni = nr * cols + nc;
      if (closed[ni]) continue;
      const ng = gScore[cur] + cost;
      if (ng < gScore[ni]) {
        gScore[ni] = ng; came[ni] = cur;
        heap.push(ni, ng + h(nc, nr));
      }
    }
  }
  return null;
}

function reconstruct(g: Grid, came: Int32Array, end: number): Pt[] {
  const pts: Pt[] = [];
  let cur = end;
  while (cur !== -1) {
    const c = cur % g.cols;
    pts.push({ x: g.worldX(c), z: g.worldZ((cur - c) / g.cols) });
    cur = came[cur];
  }
  pts.reverse();
  return smooth(g, pts);
}

function smooth(g: Grid, pts: Pt[]): Pt[] {
  if (pts.length <= 2) return pts;
  const out: Pt[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    for (; j > i + 1; j--) if (los(g, pts[i].x, pts[i].z, pts[j].x, pts[j].z)) break;
    out.push(pts[j]); i = j;
  }
  return out;
}

import { nearestFree as nearestFreeExport } from './grid';

// Frequently used routes: desks <-> pantry / cafeteria
export function primeCache() {
  const targets: Pt[] = [
    { x: 22.3, z: 9.4 }, { x: -34, z: 4.3 }, { x: -34, z: 8.8 }, { x: LAYOUT.entrance.x, z: LAYOUT.entrance.z },
  ];
  for (const ws of LAYOUT.workstations) {
    for (const t of targets) findPath(GRID as Grid, ws.x, ws.z + 1.35, t.x, t.z);
  }
}
import { GRID } from './grid';
