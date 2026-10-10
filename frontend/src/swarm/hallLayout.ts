// Pure, deterministic hall geometry. No three.js. x = east, z = south, origin = centre.
export type SwarmSize = 10 | 20 | 30 | 40 | 50;

export interface Seat {
  index: number; x: number; z: number; face: number;
  ax: number; az: number; angle: number;
}
export interface CoffeeSlot { id: string; kind: 'stool' | 'chat' | 'stand'; x: number; z: number; face: number; pair?: string }
export interface HallLayout {
  n: SwarmSize; a: number; b: number; perimeter: number;
  seats: Seat[]; moderatorSeat: Seat;
  table: { outer: [number, number][]; well: [number, number][] | null; thickness: number; solid: boolean };
  hall: { width: number; depth: number; height: number };
  door: { x: number; z: number; w: number };
  lanes: { off1: number; off2: number };
  coffeeCorner: { counter: { x: number; z: number }; slots: CoffeeSlot[]; queue: { x: number; z: number }[] };
  walls: { north: number; south: number; west: number; east: number };
  cameraFit: { pos: [number, number, number]; look: [number, number, number] };
}

export const HALL_CONST = {
  CHAIR_PITCH: 1.05, MOD_EXTRA: 1.6, MIN_B: 2.6, ASPECT: 1.5,
  TABLE_INSET: 0.55, RING_W: 1.4, WELL_MIN: 0.5,
  LANE1: 1.5, LANE2: 2.3, APPROACH: 0.95, MIN_CHAIR_DIST: 0.95,
  HALL_PAD: 16, MIN_W: 26, MIN_D: 20,
};

interface ArcTable { s: Float64Array; total: number; dt: number; steps: number }

export function buildArcTable(a: number, b: number): ArcTable {
  const steps = 1440, dt = (Math.PI * 2) / steps;
  const s = new Float64Array(steps + 1);
  let px = a, pz = 0, acc = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i * dt, x = a * Math.cos(t), z = b * Math.sin(t);
    acc += Math.hypot(x - px, z - pz); s[i] = acc; px = x; pz = z;
  }
  return { s, total: acc, dt, steps };
}
export function angleAtArc(tbl: ArcTable, arc: number): number {
  const target = ((arc % tbl.total) + tbl.total) % tbl.total;
  let lo = 0, hi = tbl.steps;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (tbl.s[mid] < target) lo = mid + 1; else hi = mid; }
  const i1 = lo, i0 = Math.max(0, lo - 1);
  const f = tbl.s[i1] > tbl.s[i0] ? (target - tbl.s[i0]) / (tbl.s[i1] - tbl.s[i0]) : 0;
  return (i0 + f) * tbl.dt;
}
/** Offset the chair-line ellipse along its normal. off<0 = inward. */
export function offsetEllipse(a: number, b: number, off: number, steps = 128): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = a * Math.cos(t), z = b * Math.sin(t);
    const nx = x / (a * a), nz = z / (b * b), len = Math.hypot(nx, nz) || 1;
    pts.push([x + (nx / len) * off, z + (nz / len) * off]);
  }
  return pts;
}
export function lanePoint(a: number, b: number, off: number, t: number): { x: number; z: number } {
  return { x: (a + off) * Math.cos(t), z: (b + off) * Math.sin(t) };
}
export function laneSpeed(a: number, b: number, off: number, t: number): number {
  const A = a + off, B = b + off;
  return Math.hypot(A * Math.sin(t), B * Math.cos(t)) || 0.01;
}
/** Inward-facing rotation (Three.js rig forward = (+sin f, +cos f)). */
export function faceInward(a: number, b: number, t: number): number {
  const x = a * Math.cos(t), z = b * Math.sin(t);
  const nx = -x / (a * a), nz = -z / (b * b), len = Math.hypot(nx, nz) || 1;
  // Rig forward is +Z (sin face, cos face). Normal to ellipse center is (nx, nz).
  return Math.atan2(nx / len, nz / len);
}

function makeSeat(index: number, a: number, b: number, t: number): Seat {
  const x = a * Math.cos(t), z = b * Math.sin(t);
  const face = faceInward(a, b, t);
  const fx = Math.sin(face), fz = Math.cos(face); // forward (inward towards table)
  return { index, x, z, face, ax: x - fx * HALL_CONST.APPROACH, az: z - fz * HALL_CONST.APPROACH, angle: t };
}

export function buildHallLayout(n: SwarmSize): HallLayout {
  const C = HALL_CONST;
  const P = n * C.CHAIR_PITCH + C.MOD_EXTRA;
  let b = P / 7.9327;                       // Ramanujan inverse for a = 1.5b
  if (b < C.MIN_B) b = C.MIN_B;
  const a = C.ASPECT * b;
  const tbl = buildArcTable(a, b);
  const spacing = tbl.total / (n + 1);

  const moderatorSeat = makeSeat(n, a, b, 0); // east tip (+x)
  const seats: Seat[] = [];
  for (let i = 0; i < n; i++) seats.push(makeSeat(i, a, b, angleAtArc(tbl, (i + 1) * spacing)));

  const outer = offsetEllipse(a, b, -C.TABLE_INSET);
  const wellPts = offsetEllipse(a, b, -C.TABLE_INSET - C.RING_W);
  const exts = wellPts.reduce((m, [x, z]) => [Math.max(m[0], Math.abs(x)), Math.max(m[1], Math.abs(z))] as [number, number], [0, 0] as [number, number]);
  const solid = Math.min(exts[0], exts[1]) < C.WELL_MIN;
  const table = { outer, well: solid ? null : wellPts, thickness: C.RING_W, solid };

  const width = Math.max(C.MIN_W, 2 * a + C.HALL_PAD);
  const depth = Math.max(C.MIN_D, 2 * b + C.HALL_PAD);
  const height = n >= 40 ? 6 : 5;

  const counterX = -(width / 2) + 1.4;
  const coffeeCorner = {
    counter: { x: counterX, z: 0 },
    slots: [
      { id: 'cs_stool0', kind: 'stool' as const, x: counterX + 1.25, z: -0.8, face: Math.PI / 2 },
      { id: 'cs_stool1', kind: 'stool' as const, x: counterX + 1.25, z: 0.8, face: -Math.PI / 2 },
      { id: 'cs_chatA', kind: 'chat' as const, x: counterX + 2.7, z: -0.45, face: -Math.PI / 2, pair: 'cs_chatB' },
      { id: 'cs_chatB', kind: 'chat' as const, x: counterX + 2.7, z: 0.45, face: Math.PI / 2, pair: 'cs_chatA' },
      { id: 'cs_stand', kind: 'stand' as const, x: counterX + 1.25, z: 2.3, face: Math.PI / 2 },
    ],
    queue: [{ x: counterX + 2.1, z: 3.0 }, { x: counterX + 2.1, z: -3.0 }],
  };

  return {
    n, a, b, perimeter: tbl.total, seats, moderatorSeat, table,
    hall: { width, depth, height },
    door: { x: 0, z: depth / 2, w: 2.4 },
    lanes: { off1: C.LANE1, off2: C.LANE2 },
    coffeeCorner, walls: { north: -depth / 2, south: depth / 2, west: -width / 2, east: width / 2 },
    cameraFit: {
      pos: [width * 0.55, Math.max(width, depth) * 0.6, depth * 0.72],
      look: [0, 0.8, 0],
    },
  };
}

/** Deterministic idea-card position on the board (used by renderer AND vote-token fx). */
export function cardPos(
  ideaIdx: number, clusterIdx: number, clusterCount: number, memberIdx: number, memberCount: number,
): { x: number; z: number } {
  if (clusterCount <= 1) { // unclustered: spiral-ish grid
    const ring = Math.floor(ideaIdx / 6), k = ideaIdx % 6, r = 0.55 + ring * 0.62;
    const ang = (k / 6) * Math.PI * 2 + ring * 0.5;
    return { x: Math.cos(ang) * r * 1.4, z: Math.sin(ang) * r };
  }
  const gAng = (clusterIdx / clusterCount) * Math.PI * 2;
  const gR = 1.15;
  const cx = Math.cos(gAng) * gR, cz = Math.sin(gAng) * gR;
  const mAng = (memberIdx / Math.max(1, memberCount)) * Math.PI * 2;
  const mR = 0.24 + memberCount * 0.035;
  return { x: cx + Math.cos(mAng) * mR, z: cz + Math.sin(mAng) * mR };
}
