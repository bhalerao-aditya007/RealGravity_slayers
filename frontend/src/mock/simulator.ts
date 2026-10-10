import { Envelope } from '@/api/types';
import { REPORT_MD, SOLO_REPORT_MD, SOURCES, buildOrg, deskOf, modelContext } from './data';
import { triage } from './triage';
import goldenRun from './goldenRun.json';

let simTimeMin = 9 * 60;
const hhmm = () =>
  `${String(Math.floor(simTimeMin / 60)).padStart(2, '0')}:${String(Math.floor(simTimeMin % 60)).padStart(2, '0')}`;

export type RawEv = { t: number; type: string; agent_id?: string; task_id?: string | undefined; payload?: any };
function ev(t: number, type: string, agent_id?: string, task_id?: string, payload?: any): RawEv {
  return { t, type, agent_id, task_id, payload };
}

const stageOf = (frac: number) => (frac >= 0.75 ? 3 : frac >= 0.6 ? 2 : frac >= 0.4 ? 1 : 0);

/** Builds the scripted run for a goal. Every beat that depends on pace is wrapped in a break-policy
 *  guard: a sprint run's tape simply contains no break / chat / meal events. */
export function buildScript(goal: string): RawEv[] {
  const t = triage(goal);
  const { org, leads, workers } = buildOrg(t);
  const P = t.break_policy;
  const solo = workers.length === 0;
  const S: RawEv[] = [];
  const isCode = t.task_class.startsWith('code') || t.task_class === 'hybrid';
  const desk = (id: string) => deskOf(id, org);
  const agentOf = (id: string) => org.find((a) => a.id === id)!;
  const deptModel = (id: string) => {
    const d = t.departments.find((x) => x.id === agentOf(id).department);
    return d ? d.worker_model : 'groq/openai/gpt-oss-20b';
  };
  const hire = (a: (typeof org)[number], time: number) =>
    S.push(ev(time, 'worker.hired', a.id, undefined, {
      agent: { ...a, status: 'ASSIGNED', energy: 100, context_tokens: 0, context_max: 32768, current_task_id: null },
      desk: desk(a.id),
    }));

  S.push(ev(0, 'task.created', undefined, undefined, { goal }));
  S.push(ev(0.6, 'task.triaged', undefined, undefined, { ...t }));
  S.push(ev(0.8, 'sandbox.mode', undefined, undefined, { mode: 'native' }));
  // FIX F3: the manager must be hired too (the v3 draft only hired non-managers, so the solo/sprint
  // path referenced an agent that never existed). She starts the day already at her desk.
  hire(org[0], 0.9);

  // ── SPRINT: manager works solo, no hires, no breaks ──
  if (solo) {
    S.push(ev(1.2, 'task.started', 'M0', 'T1', { task_id: 'T1', agent_id: 'M0' }));
    S.push(ev(1.3, 'plan.ready', undefined, undefined, {
      nodes: [{ id: 'T1', parent_id: null, description: 'Write the requested output', owner_role: 'manager', assigned_agent: 'M0', status: 'running', priority: 2, depends_on: [], attempts: 0, progress_pct: 0, est_effort_s: 240 }],
      edges: [], plan_meta: { intensity: t.intensity, break_policy: P, est_effort_s: t.est_effort_s },
    }));
    S.push(ev(1.4, 'agent.state_changed', 'M0', undefined, { agent_id: 'M0', from: 'ASSIGNED', to: 'WORKING' }));
    S.push(ev(2.0, 'llm.call_started', 'M0', undefined, { call_id: 'c1', agent_id: 'M0', model: 'groq/openai/gpt-oss-20b', role: 'manager' }));
    S.push(ev(2.1, 'gate.state', undefined, undefined, { in_flight: 1, limit: 4, queue_depth: 0, backoff_active: false }));
    S.push(ev(4.0, 'task.progress', 'M0', 'T1', { task_id: 'T1', pct: 45 }));
    S.push(ev(6.0, 'task.progress', 'M0', 'T1', { task_id: 'T1', pct: 90 }));
    S.push(ev(6.4, 'llm.call_finished', 'M0', undefined, { call_id: 'c1', tokens_in: 640, tokens_out: 890, latency_ms: 4200 }));
    S.push(ev(6.6, 'gate.state', undefined, undefined, { in_flight: 0, limit: 4, queue_depth: 0, backoff_active: false }));
    S.push(ev(7.0, 'task.completed', 'M0', 'T1', { task_id: 'T1', result_preview: 'Draft ready.' }));
    S.push(ev(7.6, 'result.final', undefined, undefined, {
      report_markdown: generateReport(goal, [{ id: 'T1', description: goal, assigned_agent: 'M0' }]), sources: [], effort_logical_s: 260, effort_real_s: 8,
    }));
    return S;
  }

  // ── TEAM RUN ──
  const N = Math.min(12, Math.max(4, workers.length + 2));
  const nodes = Array.from({ length: N }, (_, i) => ({
    id: `T${i + 1}`, parent_id: i === 0 ? 'M0' : null, description: dagDesc(i, goal),
    owner_role: workers[i % workers.length].department ?? 'backend',
    assigned_agent: workers[i % workers.length].id,
    status: 'pending' as const, priority: 2,
    depends_on: i === 0 ? [] : i < 3 ? ['T1'] : [`T${Math.max(1, i - 2)}`],
    attempts: 0, progress_pct: 0, est_effort_s: 1800,
  }));
  const edges = nodes.slice(1).flatMap((n) => n.depends_on.map((d) => ({ from: d, to: n.id })));
  S.push(ev(1.2, 'plan.ready', undefined, undefined, {
    nodes, edges, plan_meta: { intensity: t.intensity, break_policy: P, est_effort_s: t.est_effort_s },
  }));
  S.push(ev(1.3, 'gate.state', undefined, undefined, { in_flight: 0, limit: 4, queue_depth: 0, backoff_active: false }));
  if (isCode) S.push(ev(1.4, 'run.checkpoint', undefined, undefined, {
    branch: 'agent/20261004-090000', start_commit: '3f9c2ab71d0e4c5a8b6f1234567890abcdef1234',
  }));

  // staggered hiring — brisk for sprint, natural for workday
  const stagger = P.pace === 'sprint' ? 0.6 : P.pace === 'normal' ? 1.4 : 2.4;
  org.filter((a) => a.role !== 'manager').forEach((a, i) => hire(a, 2.5 + i * stagger));
  const hireDone = 2.5 + (org.length - 1) * stagger + 1;

  leads.forEach((l, i) =>
    S.push(ev(hireDone + i * 0.3, 'message.sent', 'M0', undefined, {
      from_agent_id: 'M0', to_agent_id: l.id, kind: 'task', preview: 'Plan is on the whiteboard — take your branch.',
    })));

  // Real walking takes ~45-60 s across this floor, so the first assignments wait for the team to arrive.
  const base = hireDone + 24;
  let time = base;
  const waitingLead = leads.length > 1 ? leads[leads.length - 1] : null;
  if (waitingLead) S.push(ev(base + 2, 'agent.state_changed', waitingLead.id, undefined, {
    agent_id: waitingLead.id, from: 'WORKING', to: 'WAITING', reason: `Blocked by ${nodes[1].id}, ${nodes[2].id}`,
  }));
  const failIdx = P.pace === 'workday' ? 3 : -1; // reassignment drama only in a long workday
  const valFailIdx = N > 5 ? 5 : -1;
  const permIdx = nodes.findIndex((n) => agentOf(n.assigned_agent).engine.kind === 'code');
  let chatSeq = 0;

  nodes.forEach((n, i) => {
    let who = n.assigned_agent;
    const model = deptModel(who);
    const ctxMax = modelContext(model);
    S.push(ev(time, 'task.assigned', who, n.id, { task_id: n.id, agent_id: who, from_agent_id: agentOf(who).parent_id! }));
    S.push(ev(time + 3, 'task.started', who, n.id, { task_id: n.id, agent_id: who }));
    S.push(ev(time + 3.2, 'agent.state_changed', who, undefined, { agent_id: who, from: 'ASSIGNED', to: 'WORKING' }));

    // permission desk demo: a code worker needs approval for a risky shell command
    if (isCode && i === permIdx) {
      S.push(ev(time + 5, 'permission.requested', who, undefined, {
        request_id: `perm_${n.id}`, agent_id: who, agent_name: agentOf(who).name,
        action: 'shell', resource: 'pip install pytest', effect: 'ask',
      }));
    }

    // one failure -> reassignment to a teammate in the same department (heavy / workday only)
    if (i === failIdx) {
      const alt = workers.find((w) => w.department === agentOf(who).department && w.id !== who);
      if (alt) {
        S.push(ev(time + 7, 'task.failed', who, n.id, { task_id: n.id, reason: 'context overflow — switching model', attempt: 1, will_retry: false }));
        S.push(ev(time + 9, 'task.reassigned', alt.id, n.id, { task_id: n.id, from_agent_id: who, to_agent_id: alt.id }));
        S.push(ev(time + 9.5, 'task.rework', alt.id, n.id, { task_id: n.id, reason: 'Reassigned — summarize sources first' }));
        S.push(ev(time + 10, 'agent.state_changed', who, undefined, { agent_id: who, from: 'FAILED', to: 'IDLE' }));
        S.push(ev(time + 10.2, 'task.started', alt.id, n.id, { task_id: n.id, agent_id: alt.id }));
        S.push(ev(time + 10.4, 'agent.state_changed', alt.id, undefined, { agent_id: alt.id, from: 'ASSIGNED', to: 'WORKING' }));
        who = alt.id;
      }
    }

    S.push(ev(time + 4, 'llm.call_started', who, undefined, { call_id: `c_${n.id}`, agent_id: who, model, role: 'worker' }));
    S.push(ev(time + 4.2, 'gate.state', undefined, undefined, { in_flight: Math.min(4, (i % 4) + 1), limit: 4, queue_depth: i % 3, backoff_active: false }));
    // heavy runs hit a provider 429 once: agents visibly queue
    if (P.pace === 'workday' && i === 6) {
      S.push(ev(time + 5, 'gate.state', undefined, undefined, { in_flight: 4, limit: 4, queue_depth: 4, backoff_active: true }));
      S.push(ev(time + 11, 'gate.state', undefined, undefined, { in_flight: 2, limit: 4, queue_depth: 1, backoff_active: false }));
    }
    for (const pct of [30, 65, 90]) S.push(ev(time + 6 + pct / 25, 'task.progress', who, n.id, { task_id: n.id, pct }));

    // structured file edits + terminal stream for code workers
    if (isCode && agentOf(who).engine.kind === 'code') {
      S.push(ev(time + 7, 'runtime.stream', who, undefined, { agent_id: who, kind: 'terminal', data: 'rg -n "def run" src/' }));
      S.push(ev(time + 8, 'file.edit', who, undefined, { agent_id: who, path: `src/${agentOf(who).department}/module_${i}.py`, line_ranges: [[1, 42 + i], [88, 96]], branch: 'agent/20261004-090000' }));
      S.push(ev(time + 9, 'runtime.stream', who, undefined, { agent_id: who, kind: 'file_edit', data: `src/${agentOf(who).department}/module_${i}.py +${42 + i}` }));
      S.push(ev(time + 10, 'runtime.stream', who, undefined, { agent_id: who, kind: 'test', data: `PASS test_module_${i}.py (${5 + i} tests)` }));
    }

    // validation failure -> rework -> pass
    const valFail = i === valFailIdx;
    if (valFail) {
      S.push(ev(time + 12.3, 'validation.failed', who, n.id, { task_id: n.id, validator: 'determinism-check', reason: 'stop tokens not pinned' }));
      S.push(ev(time + 12.6, 'task.rework', who, n.id, { task_id: n.id, reason: 'Pin stop tokens and re-run' }));
    }
    const doneAt = time + (valFail ? 17 : 12.5);
    S.push(ev(doneAt - 0.5, 'llm.call_finished', who, undefined, { call_id: `c_${n.id}`, tokens_in: 12000 + i * 800, tokens_out: 3200 + i * 300, latency_ms: 21000 }));
    S.push(ev(doneAt, 'task.completed', who, n.id, { task_id: n.id, result_preview: `${n.id} findings ready.` }));
    S.push(ev(doneAt + 0.5, 'validation.passed', who, n.id, { task_id: n.id, validator: valFail ? 'determinism-check' : 'cross-check' }));
    S.push(ev(doneAt + 0.7, 'message.sent', who, undefined, { from_agent_id: who, to_agent_id: 'M0', kind: 'result', preview: `${n.id} complete.` }));

    // context pressure rises with node index (energy = 100 * (1 - frac))
    const frac = Math.min(0.9, 0.25 + i * 0.09);
    const stage = stageOf(frac);
    S.push(ev(time + 11, 'context.stage_changed', who, undefined, { agent_id: who, stage, frac }));
    S.push(ev(time + 11.1, 'agent.metrics', who, undefined, {
      agent_id: who, energy: Math.round((1 - frac) * 100),
      context_tokens: Math.round(frac * ctxMax), context_max: ctxMax,
      pending: 1, done: i, failed: i === failIdx ? 1 : 0,
    }));

    // ── BREAK POLICY GUARDS ──
    const coffeeOK =
      (P.coffee === 'on_compaction' && i > 0 && i % 3 === 0) ||
      (P.coffee === 'on_stage2' && stage >= 2);
    if (coffeeOK && i < nodes.length - 1) {
      // breaks are long because the pantry is ~60 m from the bays: walk there, sip, walk back
      S.push(ev(time + 14, 'agent.break_start', who, undefined, { agent_id: who, kind: 'coffee', duration_sim_s: 300 }));
      S.push(ev(time + 14.2, 'agent.state_changed', who, undefined, { agent_id: who, from: 'WORKING', to: 'BREAK' }));
      S.push(ev(time + 118, 'agent.break_end', who, undefined, { agent_id: who }));
      S.push(ev(time + 118.2, 'agent.state_changed', who, undefined, { agent_id: who, from: 'BREAK', to: 'WORKING' }));
    }
    if (P.chats === 'on_handoff' && i > 0 && i % 2 === 0) {
      const other = workers[(i + 1) % workers.length];
      if (other.id !== who) {
        S.push(ev(time + 15, 'agent.chat', who, undefined, {
          agent_id: who, with_agent_id: other.id, duration_ms: 5500 + (chatSeq % 3) * 700,
          line: `Handing over ${n.id} — watch the ${t.task_class.startsWith('code') ? 'test suite' : 'citation format'}.`,
        }));
        S.push(ev(time + 16.5, 'blackboard.note', who, undefined, {
          id: `note_${n.id}`, author_agent_id: who, topic: t.task_class.startsWith('code') ? 'handoff' : 'sources',
          note: `${n.id}: ${t.task_class.startsWith('code') ? 'tests must stay green; no API changes' : 'cross-check every citation before reuse'}.`,
          ts: '--:--',
        }));
        chatSeq++;
      }
    }
    // leads blocked on dependencies get unblocked halfway
    if (waitingLead && i === Math.floor(N / 2)) {
      S.push(ev(time + 13, 'agent.state_changed', waitingLead.id, undefined, { agent_id: waitingLead.id, from: 'WAITING', to: 'WORKING', reason: 'Dependencies satisfied' }));
    }
    time += 18;
  });

  // lunch: workday only, teams > 2, at ~50% completion
  if (P.meals && workers.length > 2) {
    const lunchT = base + (time - base) * 0.5;
    for (const w of workers.slice(0, 4)) {
      S.push(ev(lunchT, 'agent.break_start', w.id, undefined, { agent_id: w.id, kind: 'lunch', duration_sim_s: 600 }));
      S.push(ev(lunchT + 0.2, 'agent.state_changed', w.id, undefined, { agent_id: w.id, from: 'WORKING', to: 'BREAK' }));
      S.push(ev(lunchT + 140, 'agent.break_end', w.id, undefined, { agent_id: w.id }));
      S.push(ev(lunchT + 140.2, 'agent.state_changed', w.id, undefined, { agent_id: w.id, from: 'BREAK', to: 'WORKING' }));
    }
  }

  // review in the meeting rooms (workday only)
  if (P.pace === 'workday' && leads.length > 1) {
    const mt = base + (time - base) * 0.72;
    leads.forEach((l, i) => {
      S.push(ev(mt + i, 'agent.moved', l.id, undefined, { agent_id: l.id, purpose: 'meeting', eta_sim_s: 120 }));
      S.push(ev(mt + i + 0.2, 'agent.state_changed', l.id, undefined, { agent_id: l.id, from: 'WORKING', to: 'REVIEW' }));
      S.push(ev(mt + 70 + i, 'agent.moved', l.id, undefined, { agent_id: l.id, purpose: 'desk', eta_sim_s: 120 }));
      S.push(ev(mt + 70.2 + i, 'agent.state_changed', l.id, undefined, { agent_id: l.id, from: 'REVIEW', to: 'WORKING' }));
    });
    S.push(ev(mt + 40, 'blackboard.note', 'M0', undefined, {
      id: 'note_review', author_agent_id: 'M0', topic: 'review', note: 'Review done — structure approved, proceed to synthesis.', ts: '--:--',
    }));
  }

  // final synthesis, then everyone heads home
  S.push(ev(time + 2, 'result.final', undefined, undefined, {
    report_markdown: generateReport(goal, nodes), sources: SOURCES,
    effort_logical_s: t.est_effort_s, effort_real_s: Math.round(time + 10),
  }));
  workers.forEach((w, i) => S.push(ev(time + 4 + i * 1.2, 'worker.released', w.id, undefined, { agent_id: w.id })));
  return S;
}

// Dynamic task description driven directly by user goal:
function dagDesc(i: number, goal: string): string {
  const clean = goal.replace(/^(build|create|make|develop|implement|add|write)\s+/i, '').trim();
  const title = clean.length > 28 ? clean.slice(0, 27) + '..' : clean;
  const list = [
    `Architecture & spec for ${title}`,
    `Configure environment for ${title}`,
    `Implement core logic for ${title}`,
    `Build primary component for ${title}`,
    `Wire APIs & integration handlers`,
    `Write unit tests & assertions`,
    `Security audit & error handling`,
    `Performance tuning & caching`,
    `Compile technical documentation`,
    `Lead code review & verification`,
    `Package release bundle & artifacts`,
    `Final deployment verification`,
  ];
  return list[i % list.length];
}

export class MockSimulator {
  private script: RawEv[] = [];
  private seq = 0;
  private vt = 0;
  private idx = 0;
  private speed = 1;
  private running = false;
  private onEvent: ((e: Envelope) => void) | null = null;
  private lastReal = 0;
  runId = 'run_local';
  recorded: Envelope[] = [];

  constructor(goal: string, script?: RawEv[]) { this.script = script ?? buildScript(goal); }

  start(onEvent: (e: Envelope) => void) {
    this.onEvent = onEvent; this.running = true; this.lastReal = performance.now();
  }
  stop() { this.running = false; this.onEvent = null; }
  setSpeed(f: number) { this.speed = f; }
  get done() { return this.idx >= this.script.length; }
  get progress() { return this.idx / this.script.length; }

  private emit(s: RawEv) {
    const env: Envelope = {
      seq: ++this.seq, run_id: this.runId, ts_real: new Date().toISOString(),
      ts_sim: hhmm(), type: s.type, agent_id: s.agent_id, task_id: s.task_id, payload: s.payload,
    } as Envelope;
    this.recorded.push(env);
    this.onEvent?.(env);
  }

  poll() {
    if (!this.running) return;
    const now = performance.now();
    this.vt += ((now - this.lastReal) / 1000) * this.speed;
    this.lastReal = now;
    simTimeMin = 9 * 60 + (this.vt * 30) / 60;
    while (this.idx < this.script.length && this.script[this.idx].t <= this.vt) this.emit(this.script[this.idx++]);
  }

  /** Emit the whole tape immediately in virtual time (tests, tape recording, the mock bridge). */
  drain(onEvent: (e: Envelope) => void) {
    this.onEvent = onEvent; this.running = true;
    while (this.idx < this.script.length) {
      const s = this.script[this.idx++];
      this.vt = s.t;
      simTimeMin = 9 * 60 + (this.vt * 30) / 60;
      this.emit(s);
    }
    this.running = false;
  }
}

// FIX F7: the original polled the real clock in a busy loop (~4 real minutes); drain() is instant.
export function goldenRunEvents(goal: string): Envelope[] {
  const sim = new MockSimulator(goal);
  const out: Envelope[] = [];
  sim.drain((e) => out.push(e));
  return out;
}
export { goldenRun };


function generateReport(goal: string, nodes: any[]): string {
  const taskList = nodes.map((n) => `- **${n.id}: ${n.description}** (Assigned: ${n.assigned_agent ?? 'Worker'}, Status: DONE)`).join('\n');
  return `# Project Report: ${goal}

## Executive Summary
The engineering team assembled and successfully completed the user objective:
> **"${goal}"**

All deliverables have been synthesized, peer-reviewed by department leads, and validated through automated test gates.

## Key Delivered Milestones
${taskList}

## Architecture & Code Quality
- **Specification:** Implementation meets all user constraints without scope creep.
- **Validation:** Type-checks and unit tests executed with 100% passing assertions.
- **Handoff:** Lead approved the pull requests and merged all worktrees into the main branch.

## Status
Ready for deployment and execution.
`;
}

function generateTasksForGoal(goal: string, count: number): string[] {
  const clean = goal.replace(/^(build|create|make|develop|implement|add|write)\s+/i, '').trim();
  const title = clean.length > 32 ? clean.slice(0, 31) + '..' : clean;

  const templates = [
    `Architecture & design for ${title}`,
    `Setup dependencies & environment for ${title}`,
    `Implement core service logic for ${title}`,
    `Build interface & controllers for ${title}`,
    `Wire endpoints & client integration`,
    `Write unit tests & validation assertions`,
    `Security review & error handling pass`,
    `Performance tuning & state caching`,
    `Build documentation & usage guide`,
    `Lead code review & final compilation`,
  ];
  return templates.slice(0, count);
}
