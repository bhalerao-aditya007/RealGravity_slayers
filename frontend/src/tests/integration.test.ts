import { describe, it, expect } from 'vitest';
import { buildScript } from '@/mock/simulator';
import { parseEvent } from '@/api/types';
import { applyEvent } from '@/state/events';
import { useStore } from '@/state/store';
import { director } from '@/sim/director';
import { GRID } from '@/nav/grid';
import { AGENT_R } from '@/config/office';
import { triage } from '@/mock/triage';
import { LAYOUT } from '@/config/layout';
import { BLOCKED } from '@/config/furnitureDefs';

// The nav grid inflates every obstacle by AGENT_R (a safety margin). A walking agent may cut a corner into that
// margin, but must never put its BODY (radius ~0.3 m) into real furniture or a wall. 0.2 = body radius minus 0.1 tolerance.
const BODY = 0.2;
const solids = [
  ...LAYOUT.items.filter((i) => BLOCKED.has(i.type)).map((it) => {
    const swap = Math.abs(Math.sin(it.rot)) > 0.5; const w = swap ? it.d : it.w, d = swap ? it.w : it.d;
    return { id: it.id, x0: it.x - w / 2, x1: it.x + w / 2, z0: it.z - d / 2, z1: it.z + d / 2 };
  }),
  ...LAYOUT.walls.map((w, k) => {
    const hx = w.x0 === w.x1 ? 0.15 : 0, hz = w.z0 === w.z1 ? 0.15 : 0;
    return { id: `wall${k}`, x0: Math.min(w.x0, w.x1) - hx, x1: Math.max(w.x0, w.x1) + hx, z0: Math.min(w.z0, w.z1) - hz, z1: Math.max(w.z0, w.z1) + hz };
  }),
];
const clipped = (x: number, z: number) =>
  solids.find((b) => x > b.x0 - BODY && x < b.x1 + BODY && z > b.z0 - BODY && z < b.z1 + BODY);

// tape -> zod -> reducer -> director -> physics. This is the whole frontend pipeline, headless.
function runGoal(goal: string, opts: { approvePermissions: boolean }) {
  director.reset();
  useStore.getState().resetRun(goal);
  director.pace = triage(goal).break_policy.pace;
  const script = buildScript(goal);
  let t = 0, seq = 0, steps = 0, minSep = Infinity;
  const problems: string[] = [];
  const pendingPerm: string[] = [];
  const advance = (to: number) => {
    while (t < to) {
      director.update(1 / 30); t += 1 / 30; steps++; // same substep as AgentsLayer (<= 0.033 s)
      const live = director.runtimes.filter((r) => r.state !== 'gone');
      for (const rt of live) {
        if (rt.state === 'seated' || rt.state === 'sitdown' || rt.state === 'standup') continue;
        const hit = clipped(rt.x, rt.z);
        if (hit) problems.push(`${rt.id} CLIPS ${hit.id} at (${rt.x.toFixed(2)},${rt.z.toFixed(2)}) t=${t.toFixed(1)} state=${rt.state}`);
      }
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        if (a.state === 'seated' && b.state === 'seated') continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z); minSep = Math.min(minSep, d);
        if (d < AGENT_R * 2 - 0.05 && a.state !== 'sitdown' && b.state !== 'sitdown' && a.state !== 'standup' && b.state !== 'standup')
          problems.push(`${a.id}/${b.id} overlap ${d.toFixed(2)}m t=${t.toFixed(1)}`);
      }
    }
  };
  for (const raw of script) {
    advance(raw.t);
    const env = parseEvent({ seq: ++seq, run_id: 't', ts_real: new Date().toISOString(), ts_sim: '09:00',
      type: raw.type, agent_id: raw.agent_id, task_id: raw.task_id, payload: raw.payload });
    if (!env) throw new Error(`schema rejected ${raw.type}`);
    applyEvent(env, false);
    if (raw.type === 'permission.requested' && opts.approvePermissions) pendingPerm.push(raw.payload.request_id);
    if (pendingPerm.length && raw.t > 0) {
      // the user clicks "approve once" ~2 s later
      advance(raw.t + 2);
      const id = pendingPerm.shift()!;
      const req = useStore.getState().pendingPermissions.find((p) => p.request_id === id);
      if (req) applyEvent({ seq: ++seq, run_id: 't', ts_real: '', ts_sim: '09:00', type: 'permission.resolved', agent_id: req.agent_id, payload: { request_id: id, decision: 'once' } } as any);
    }
  }
  advance(t + 150); // let everyone finish walking / sitting
  return { problems, minSep, steps };
}

describe('integration: tape -> reducer -> director', () => {
  it('sprint run: only the manager exists, she is seated at her own desk, no breaks happened', () => {
    const r = runGoal('Summarize this repo README in one paragraph', { approvePermissions: true });
    expect(r.problems).toEqual([]);
    const live = director.runtimes.filter((x) => x.state !== 'gone');
    expect(live.map((x) => x.id)).toEqual(['M0']);
    expect(live[0].state).toBe('seated');
    expect(useStore.getState().report?.sources).toEqual([]);
    expect(useStore.getState().triage?.intensity).toBe('light');
  });

  it('standard run: dynamic departments, everyone ends at their own desk, collision-free', () => {
    const r = runGoal('Add dark mode to the dashboard', { approvePermissions: true });
    expect(r.problems).toEqual([]);
    const st = useStore.getState();
    expect(Object.keys(st.departments).sort()).toEqual(['frontend', 'qa']);
    for (const rt of director.runtimes.filter((x) => x.state !== 'gone')) {
      expect(rt.state, `${rt.id} should be seated`).toBe('seated');
      expect(rt.seatChair?.id, `${rt.id} should be at own desk`).toBe(rt.def.chairId);
    }
    expect(st.report).not.toBeNull();
  });

  it('heavy hybrid run: 4 departments in 4 distinct wings, breaks/chats/meetings/permission all collision-free', () => {
    const r = runGoal('Compare the top 3 open-weight coding models and build a tiny CLI that benchmarks one', { approvePermissions: true });
    expect(r.problems).toEqual([]);
    const st = useStore.getState();
    const bays = Object.values(st.departments).map((d) => d.bay);
    expect(new Set(bays).size).toBe(4);
    expect(st.pendingPermissions).toEqual([]);
    expect(st.checkpoint?.branch).toMatch(/^agent\//);
    expect(Object.keys(st.fileEdits).length).toBeGreaterThan(0);
    // released workers walked out; leads + manager remain seated at their own chairs
    for (const rt of director.runtimes.filter((x) => x.state !== 'gone')) {
      expect(rt.state, `${rt.id} (${rt.def.role}) state`).toBe('seated');
      expect(rt.seatChair?.id, `${rt.id} chair`).toBe(rt.def.chairId);
    }
  });

  it('unapproved permission keeps the agent waiting in the cabin (no silent auto-approve)', () => {
    const r = runGoal('Compare the top 3 open-weight coding models and build a tiny CLI that benchmarks one', { approvePermissions: false });
    expect(r.problems).toEqual([]);
    expect(useStore.getState().pendingPermissions.length).toBe(1);
  });
});
