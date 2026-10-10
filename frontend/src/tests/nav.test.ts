import { describe, it, expect } from 'vitest';
import { GRID } from '@/nav/grid';
import { findPath } from '@/nav/astar';
import { LAYOUT } from '@/config/layout';

describe('A* navigation', () => {
  it('never returns a path through a blocked cell', () => {
    const targets = [
      { x: 22.3, z: 9.4 }, { x: -34, z: 4.3 }, { x: -31, z: -7.6 },
      { x: 31, z: 29 }, { x: 1, z: -23 }, { x: -9.5, z: -9.5 },
    ];
    for (const t of targets) {
      const p = findPath(GRID, LAYOUT.entrance.x, LAYOUT.entrance.z, t.x, t.z);
      expect(p, `no path to ${t.x},${t.z}`).not.toBeNull();
      for (const pt of p!) {
        expect(GRID.isBlocked(pt.x, pt.z), `path through blocked cell at ${pt.x.toFixed(2)},${pt.z.toFixed(2)}`).toBe(false);
      }
    }
  });
  it('all zones are reachable', () => {
    for (const z of LAYOUT.zones) {
      const p = findPath(GRID, LAYOUT.entrance.x, LAYOUT.entrance.z, z.jump![0], z.jump![1]);
      expect(p, `zone ${z.name} unreachable`).not.toBeNull();
    }
  });
  it('path is smoothed to few waypoints', () => {
    const p = findPath(GRID, -31, -7.6, 22.3, 9.4)!;
    expect(p.length).toBeLessThan(60);
  });
});
