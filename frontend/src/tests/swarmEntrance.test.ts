import { describe, it, expect } from 'vitest';
import { buildHallLayout } from '@/swarm/hallLayout';
import { SwarmDirector } from '@/swarm/swarmDirector';

function runEntrance(n: 10 | 50) {
  const L = buildHallLayout(n);
  const d = new SwarmDirector(L);
  d.join('M0', 1, 'strategist', n, true, true); // moderator seated instantly
  for (let i = 0; i < n; i++) d.join(`S${i}`, 10 + i, 'strategist', i, false, false);
  const dt = 1 / 30;
  for (let step = 0; step < 30 * 120; step++) {
    d.update(dt);
    const walkers = d.runtimes.filter((r) => ['door', 'lane', 'radial', 'walkSlot'].includes(r.state));
    for (let i = 0; i < walkers.length; i++) for (let j = i + 1; j < walkers.length; j++) {
      const dist = Math.hypot(walkers[i].x - walkers[j].x, walkers[i].z - walkers[j].z);
      expect(dist, `walkers ${walkers[i].id}/${walkers[j].id} at ${dist.toFixed(2)}m, step ${step}`).toBeGreaterThanOrEqual(0.55 - 0.005);
    }
    for (const r of walkers) {
      // not inside any chair footprint (0.45m) other than en-route radial to own seat
      for (const s of [...L.seats, L.moderatorSeat]) {
        if (r.state === 'radial' && s.index === r.seatIdx) continue;
        const dist = Math.hypot(r.x - s.x, r.z - s.z);
        expect(dist, `${r.id} inside chair ${s.index}`).toBeGreaterThanOrEqual(0.44);
      }
      // not inside the table ring
      const rr = Math.hypot(r.x, r.z);
      const t = Math.atan2(r.z / L.b, r.x / L.a);
      const o = L.table.outer[Math.floor(((t / (Math.PI * 2)) + 1) % 1 * L.table.outer.length) % L.table.outer.length];
      const dOut = Math.hypot(o[0], o[1]);
      if (L.table.solid) expect(rr, `${r.id} inside solid table`).toBeGreaterThanOrEqual(dOut - 0.05);
      else if (rr < dOut - 0.05) {
        const w = L.table.well![0];
        expect(rr, `${r.id} inside table ring`).toBeLessThanOrEqual(Math.hypot(w[0], w[1]) + 0.45);
      }
    }
  }
  // everybody seated facing the table
  for (const r of d.runtimes) {
    expect(r.state, `${r.id} not seated`).toBe('seated');
    const s = r.seatIdx >= n ? L.moderatorSeat : L.seats[r.seatIdx];
    expect(r.x).toBeCloseTo(s.x, 1);
    expect(r.z).toBeCloseTo(s.z, 1);
    expect(Math.abs(r.heading - s.face) % (Math.PI * 2)).toBeLessThan(0.15);
  }
}

describe('swarm entrance simulation', () => {
  it('n=10: collision-free entrance, all seated', () => runEntrance(10), 60000);
  it('n=50: collision-free entrance, all seated', () => runEntrance(50), 120000);
});
