import { describe, it, expect } from 'vitest';
import { validateLayout } from '@/nav/validate';
import { GRID } from '@/nav/grid';
import { LAYOUT } from '@/config/layout';

describe('layout validator', () => {
  it('passes with zero errors', () => {
    const errs = validateLayout(GRID);
    expect(errs).toEqual([]);
  });
  it('has 4 department bays with 10+ workstations each', () => {
    for (const dept of ['research', 'engineering', 'data', 'content'] as const) {
      expect(LAYOUT.workstations.filter((w) => w.dept === dept).length).toBeGreaterThanOrEqual(10);
    }
  });
  it('every seat approach point is on a free cell', () => {
    for (const it of LAYOUT.items) {
      for (const s of it.seats ?? (it.seat ? [it.seat] : [])) {
        expect(GRID.isBlocked(s.ax, s.az), `${it.id} approach blocked`).toBe(false);
      }
    }
  });
});
