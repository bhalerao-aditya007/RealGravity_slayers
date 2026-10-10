import { HallLayout, HALL_CONST } from './hallLayout';

function distToPoly(x: number, z: number, pts: [number, number][]): number {
  let min = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
    const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
    let t = ((x - x0) * dx + (z - z0) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    min = Math.min(min, Math.hypot(x - (x0 + t * dx), z - (z0 + t * dz)));
  }
  return min;
}

export function validateHall(L: HallLayout): string[] {
  const errs: string[] = [];
  const all = [...L.seats, L.moderatorSeat];
  const C = HALL_CONST;

  if (all.length !== L.n + 1) errs.push(`seat count ${all.length} != n+1 = ${L.n + 1}`);

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const d = Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z);
      if (d < C.MIN_CHAIR_DIST) errs.push(`chairs ${i}/${j} overlap: ${d.toFixed(2)}m apart`);
    }
  }
  for (const s of all) {
    if (distToPoly(s.x, s.z, L.table.outer) < 0.5)
      errs.push(`seat ${s.index} too close to table (${distToPoly(s.x, s.z, L.table.outer).toFixed(2)}m)`);
    // walls.west is negative, walls.east positive
    if (s.x > L.walls.east - 1 || s.x < L.walls.west + 1) errs.push(`seat ${s.index} in wall (x)`);
    if (Math.abs(s.z) > L.hall.depth / 2 - 1) errs.push(`seat ${s.index} in wall (z)`);
    // approach reachable: near a lane point, and outside the chair line
    let nearLane = Infinity;
    for (let k = 0; k < 180; k++) {
      const t = (k / 180) * Math.PI * 2;
      for (const off of [L.lanes.off1, L.lanes.off2]) {
        const d = Math.hypot(s.ax - (L.a + off) * Math.cos(t), s.az - (L.b + off) * Math.sin(t));
        nearLane = Math.min(nearLane, d);
      }
    }
    if (nearLane > 3.6) errs.push(`seat ${s.index} approach not lane-reachable (${nearLane.toFixed(2)}m)`);
  }
  // lanes clear of chairs
  for (let k = 0; k < 180; k++) {
    const t = (k / 180) * Math.PI * 2;
    for (const off of [L.lanes.off1, L.lanes.off2]) {
      const lx = (L.a + off) * Math.cos(t), lz = (L.b + off) * Math.sin(t);
      for (const s of all) {
        const d = Math.hypot(lx - s.x, lz - s.z);
        if (d < 1.0) errs.push(`lane(off ${off}) within 1.0m of chair ${s.index} (${d.toFixed(2)}m)`);
      }
    }
  }
  // coffee corner reachable + clear of chairs/lanes
  for (const s of L.coffeeCorner.slots) {
    if (Math.abs(s.x) > L.walls.east || Math.abs(s.z) > L.hall.depth / 2) errs.push(`coffee slot ${s.id} outside hall`);
    let nearChair = Infinity;
    for (const c of all) nearChair = Math.min(nearChair, Math.hypot(s.x - c.x, s.z - c.z));
    if (nearChair < 1.0) errs.push(`coffee slot ${s.id} too close to a chair`);
    const west = { x: -(L.a + L.lanes.off2), z: 0 };
    if (Math.hypot(s.x - west.x, s.z - west.z) > 8) errs.push(`coffee slot ${s.id} not lane-reachable`);
  }
  return errs;
}
