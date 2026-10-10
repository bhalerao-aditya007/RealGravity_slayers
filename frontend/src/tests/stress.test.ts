import { describe, it, expect } from 'vitest';
import { GRID } from '@/nav/grid';
import { LAYOUT } from '@/config/layout';
import { AGENT_R } from '@/config/office';
import { Director } from '@/sim/director';

// Deterministic pseudo-random zone-to-zone trips: 24 agents, 60 s, 30 fps.
// Asserts ZERO frames with an agent inside a blocked cell or overlapping another agent.
describe('movement stress', () => {
  it('keeps all agents collision-free', () => {
    const d = new Director();
    let seed = 42;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const N = 24;
    for (let i = 0; i < N; i++) {
      d.spawn({
        id: `A${i}`, name: `A${i}`, role: 'worker', department: 'research', parent_id: 'L1',
        engine: { kind: 'llm', label: 'test' }, avatar_seed: i + 1, chairId: LAYOUT.workstations[i % 48].chair,
      } as any, true);
    }
    let trips = 0;
    const dt = 1 / 30;
    for (let step = 0; step < 60 * 30; step++) {
      if (step % 90 === 0 && trips < 6) {
        for (let i = 0; i < N; i++) {
          d.sendTo(`A${i}`, rnd() > 0.5 ? 'pantry' : 'desk', false);
          if (rnd() > 0.7) (d as any).startBreak?.(`A${i}`, 'coffee', 60, false);
          trips++;
        }
      }
      d.update(dt);
      const live = d.runtimes.filter((r) => r.state !== 'gone');
      for (const rt of live) {
        if (rt.state === 'seated' || rt.state === 'sitdown' || rt.state === 'standup') continue; // seated = inside chair by design
        expect(GRID.isBlocked(rt.x, rt.z),
          `agent ${rt.id} inside blocked cell at (${rt.x.toFixed(2)}, ${rt.z.toFixed(2)}) step ${step}`).toBe(false);
      }
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const dist = Math.hypot(live[i].x - live[j].x, live[i].z - live[j].z);
        expect(dist,
          `agents ${live[i].id}/${live[j].id} overlap (${dist.toFixed(2)}m) step ${step}`).toBeGreaterThanOrEqual(AGENT_R * 2 - 0.03);
      }
    }
  }, 120000);
});
