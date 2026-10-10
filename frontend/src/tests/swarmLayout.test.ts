import { describe, it, expect } from 'vitest';
import { buildHallLayout } from '@/swarm/hallLayout';
import { validateHall } from '@/swarm/validateHall';

const EXPECT: Record<number, [number, number]> = { 10: [2.6, 3.9], 20: [2.85, 4.3], 30: [4.2, 6.3], 40: [5.5, 8.2], 50: [6.8, 10.2] };

describe('swarm hall layout', () => {
  for (const n of [10, 20, 30, 40, 50] as const) {
    it(`n=${n}: sizes within ±5%, valid hall`, () => {
      const L = buildHallLayout(n);
      const [eb, ea] = EXPECT[n];
      expect(Math.abs(L.b - eb) / eb).toBeLessThan(0.05);
      expect(Math.abs(L.a - ea) / ea).toBeLessThan(0.05);
      expect(L.seats.length).toBe(n);
      const all = [...L.seats, L.moderatorSeat];
      expect(all.length).toBe(n + 1);
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++)
        expect(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z)).toBeGreaterThanOrEqual(0.95);
      expect(L.hall.width).toBeGreaterThanOrEqual(2 * L.a + 15.9);
      expect(validateHall(L)).toEqual([]);
    });
    it(`n=${n}: arc spacing >= 0.95`, () => {
      const L = buildHallLayout(n);
      expect(L.perimeter / (n + 1)).toBeGreaterThanOrEqual(0.95);
    });
  }
});
