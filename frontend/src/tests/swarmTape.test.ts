import { describe, it, expect } from 'vitest';
import { buildSwarmScript } from '@/swarm/mockSwarm';
import { parseEvent } from '@/api/types';

const PHASES = ['frame', 'diverge', 'cluster', 'critique', 'vote', 'synthesize', 'done'];

describe('swarm mock tape', () => {
  const n = 20;
  const script = buildSwarmScript('How should a small team cut cloud costs by 30%?', n);
  const tape = script.map((s, i) => ({
    seq: i + 1, run_id: 't', ts_real: new Date().toISOString(), ts_sim: '09:00',
    type: s.type, agent_id: s.agent_id, task_id: undefined, payload: s.payload,
  }));

  it('every event passes zod; seq monotonic; phases in order', () => {
    let lastSeq = 0;
    const phaseIdx: number[] = [];
    const joined = new Set<string>();
    const ideas = new Set<string>();
    for (const e of tape) {
      const parsed = parseEvent(e);
      expect(parsed, `invalid event ${e.type}`).not.toBeNull();
      expect(e.seq).toBeGreaterThan(lastSeq); lastSeq = e.seq;
      if (e.type === 'swarm.agent_joined') joined.add(e.payload.agent.id);
      if (e.type === 'swarm.proposal') ideas.add(e.payload.idea_id);
      if (e.type === 'swarm.phase') {
        const idx = PHASES.indexOf(e.payload.phase);
        expect(idx).toBeGreaterThanOrEqual(phaseIdx.length ? phaseIdx[phaseIdx.length - 1] : 0);
        phaseIdx.push(idx);
      }
      if (['swarm.proposal', 'swarm.critique', 'swarm.vote'].includes(e.type))
        expect(joined.has(e.payload.agent_id), `${e.payload.agent_id} referenced before joining`).toBe(true);
      if (e.type === 'swarm.vote') expect(ideas.has(e.payload.idea_id), 'vote on unknown idea').toBe(true);
    }
    expect(phaseIdx[phaseIdx.length - 1]).toBe(PHASES.indexOf('done'));
  });

  it('reducer: final state has ideas, tally, synthesis', async () => {
    const { useStore } = await import('@/state/store');
    const { applyEvent } = await import('@/state/events');
    const { rebuildSwarmDirector } = await import('@/swarm/directorRef');
    useStore.setState({ appMode: 'swarm', swarmSize: n as any });
    rebuildSwarmDirector(n as any);
    useStore.getState().resetRun('swarm test');
    for (const e of tape) applyEvent(parseEvent(e)!, true);
    const sw = useStore.getState().swarm;
    expect(Object.keys(sw.ideas).length).toBeGreaterThan(0);
    expect(sw.tally).not.toBeNull();
    expect(sw.tally!.scores.length).toBeGreaterThan(0);
    expect(sw.synthesis).not.toBeNull();
    expect(sw.phase).toBe('done');
    useStore.setState({ appMode: 'office' });
  });

  it('appMode default is office', async () => {
    const { useStore } = await import('@/state/store');
    expect(useStore.getState().appMode).toBe('office');
  });
});
