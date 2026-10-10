import { Envelope } from '@/api/types';
import { useStore, pushLog, AgentUI } from './store';
import { director } from '@/sim/director';
import { sfx } from '@/sim/sound';
import { AgentDef } from '@/mock/data';
import { Task } from '@/api/types';
import { setDepartments } from './departments';
import { LAYOUT } from '@/config/layout';
import { CHAIR_TYPES } from '@/config/furnitureDefs';
import { swarmDirector } from '@/swarm/directorRef';
import { voteFx } from '@/swarm/IdeaBoard';

const name = (id?: string) => useStore.getState().agents[id ?? '']?.name ?? id ?? '';

/** FIX F2: v3 removed the static `agentDef()` lookup but worker.hired still needs an
 *  AgentDef (which chair to sit at). Build it from the event itself so the same code path
 *  works for the mock (agent.chairId present) and a real backend (only desk:{x,z} present). */
function defFromHire(p: any): AgentDef {
  const a = p.agent;
  const taken = new Set(director.runtimes.filter((r) => r.state !== 'gone').map((r) => r.def.chairId));
  let chairId: string | undefined = a.chairId && LAYOUT.items.find((i) => i.id === a.chairId) ? a.chairId : undefined;
  if (!chairId && a.role === 'manager') chairId = LAYOUT.execChair;
  if (!chairId) {
    let best: { id: string; d: number } | null = null;
    for (const it of LAYOUT.items) {
      if (!it.seat || !CHAIR_TYPES.has(it.type) || it.type !== 'wchair' || taken.has(it.id)) continue;
      const d = Math.hypot(it.x - p.desk.x, it.z - p.desk.z);
      if (!best || d < best.d) best = { id: it.id, d };
    }
    chairId = best?.id ?? LAYOUT.workstations[0].chair;
  }
  return {
    id: a.id, name: a.name, role: a.role, department: a.department, parent_id: a.parent_id,
    engine: a.engine, avatar_seed: a.avatar_seed, chairId,
  };
}

export function applyEvent(e: Envelope, instant = false) {
  const s = useStore.getState();
  const p: any = e.payload ?? {};
  const setAgents = (id: string, patch: Partial<AgentUI>) => {
    const cur = useStore.getState().agents[id];
    if (cur) useStore.setState({ agents: { ...useStore.getState().agents, [id]: { ...cur, ...patch } } });
  };
  const setTask = (id: string, patch: Partial<Task>) => {
    const cur = useStore.getState().tasks[id];
    if (cur) useStore.setState({ tasks: { ...useStore.getState().tasks, [id]: { ...cur, ...patch } } });
  };
  const setMetrics = (id: string, m: any) => useStore.setState({
    metrics: {
      llm_calls: useStore.getState().metrics.llm_calls + (m.llm_calls ?? 0),
      tool_calls: useStore.getState().metrics.tool_calls + (m.tool_calls ?? 0),
      tokens_in: useStore.getState().metrics.tokens_in + (m.tokens_in ?? 0),
      tokens_out: useStore.getState().metrics.tokens_out + (m.tokens_out ?? 0),
    },
  });

  switch (e.type) {
    case 'task.created':
      useStore.setState({ goal: p.goal });
      pushLog(e, `Task created: "${p.goal}"`);
      break;
    case 'task.triaged': {
      setDepartments(p.departments);
      director.pace = p.break_policy.pace;
      useStore.setState({ triage: { ...p } });
      pushLog(e, `Triage: ${p.task_class.replace(/_/g, ' ')} · ${p.intensity} — ${p.rationale}`);
      break;
    }
    case 'plan.ready': {
      const nodes: Task[] = p.nodes.map((n: any) => ({ ...n }));
      useStore.setState({
        tasks: Object.fromEntries(nodes.map((n) => [n.id, n])),
        edges: p.edges,
        planOutline: nodes.map((n) => `${n.id} · ${n.description}`),
        ...(p.plan_meta && !useStore.getState().triage
          ? { triage: { ...p.plan_meta, task_class: 'hybrid', departments: [], est_workers: nodes.length, rationale: '' } }
          : {}),
      });
      pushLog(e, `Plan ready — ${nodes.length} tasks`);
      break;
    }
    case 'plan.updated': {
      const nodes: Task[] = p.nodes.map((n: any) => ({ ...n }));
      useStore.setState({ tasks: Object.fromEntries(nodes.map((n) => [n.id, n])), edges: p.edges, replanCount: s.replanCount + 1 });
      pushLog(e, `Plan updated (${p.reason})`);
      break;
    }
    case 'worker.hired': {
      const a: AgentUI = { ...p.agent, pending: 0, done: 0, failed: 0, outputs: [] };
      useStore.setState({
        agents: { ...useStore.getState().agents, [a.id]: a },
        order: [...useStore.getState().order, a.id],
      });
      // the manager is already at her desk when the day starts — she does not walk in from reception
      director.spawn(defFromHire(p), instant || a.role === 'manager');
      pushLog(e, `${a.name} joined the ${a.department ?? 'office'} team`);
      break;
    }
    case 'worker.released':
      director.release(e.agent_id!, instant);
      setAgents(e.agent_id!, { status: 'OFFLINE' });
      pushLog(e, `${name(e.agent_id)} finished for the day — heading home`);
      break;
    case 'task.assigned':
      setTask(p.task_id, { status: 'ready', assigned_agent: p.agent_id });
      setAgents(p.agent_id, { current_task_id: p.task_id, status: 'ASSIGNED' });
      director.envelopeFrom(p.from_agent_id, p.agent_id);
      pushLog(e, `${name(p.from_agent_id)} delegated ${p.task_id} to ${name(p.agent_id)}`);
      break;
    case 'task.started':
      setTask(p.task_id, { status: 'running', progress_pct: 0 });
      setAgents(p.agent_id, { status: 'WORKING', current_task_id: p.task_id });
      director.setActivityFor(p.agent_id, 'WORKING');
      pushLog(e, `${name(p.agent_id)} started ${p.task_id}`);
      break;
    case 'task.progress':
      setTask(p.task_id, { progress_pct: p.pct, status: 'running' });
      if (p.note) pushLog(e, `${name(e.agent_id)} — ${p.note} (${p.pct}%)`);
      break;
    case 'task.completed':
      setTask(p.task_id, { status: 'done', progress_pct: 100 });
      setAgents(p.agent_id, { status: 'COMPLETE', done: (useStore.getState().agents[p.agent_id]?.done ?? 0) + 1 });
      director.celebrate(e.agent_id!);
      sfx.ping();
      pushLog(e, `${name(e.agent_id)} completed ${p.task_id}: ${p.result_preview}`);
      break;
    case 'task.failed':
      setTask(p.task_id, { status: 'failed' });
      setAgents(p.agent_id, { status: 'FAILED', failed: (useStore.getState().agents[p.agent_id]?.failed ?? 0) + 1 });
      director.confuse(e.agent_id!);
      pushLog(e, `${name(e.agent_id)} failed ${p.task_id}: ${p.reason}${p.will_retry ? ' (retrying)' : ''}`);
      break;
    case 'task.rework':
      setTask(p.task_id, { status: 'running', attempts: (useStore.getState().tasks[p.task_id]?.attempts ?? 0) + 1 });
      pushLog(e, `Rework queued for ${p.task_id}: ${p.reason}`);
      break;
    case 'task.reassigned':
      setTask(p.task_id, { assigned_agent: p.to_agent_id, status: 'ready' });
      setAgents(p.to_agent_id, { current_task_id: p.task_id, status: 'ASSIGNED' });
      director.envelopeFrom(p.from_agent_id, p.to_agent_id);
      pushLog(e, `${p.task_id} reassigned from ${name(p.from_agent_id)} to ${name(p.to_agent_id)}`);
      break;
    case 'agent.state_changed':
      setAgents(p.agent_id, { status: p.to });
      director.setActivityFor(p.agent_id, p.to);
      if (p.reason) pushLog(e, `${name(p.agent_id)} → ${p.to} (${p.reason})`);
      break;
    case 'agent.metrics':
      setAgents(p.agent_id, {
        energy: p.energy, context_tokens: p.context_tokens, context_max: p.context_max,
        pending: p.pending, done: p.done, failed: p.failed,
      });
      if (useStore.getState().appMode === 'swarm') {
        const s = useStore.getState().swarm;
        if (s.agents[p.agent_id]) useStore.setState({ swarm: { ...s, agents: { ...s.agents, [p.agent_id]: { ...s.agents[p.agent_id], energy: p.energy, context_tokens: p.context_tokens, context_max: p.context_max } } } });
      }
      break;
    case 'agent.moved':
      director.sendTo(e.agent_id!, p.purpose, instant);
      pushLog(e, `${name(e.agent_id)} is heading to the ${p.purpose === 'desk' ? 'desk' : p.purpose}`);
      break;
    case 'agent.break_start':
      if (useStore.getState().appMode === 'swarm') swarmDirector.breakStart(e.agent_id!, p.kind);
      else director.startBreak(e.agent_id!, p.kind, p.duration_sim_s, instant);
      pushLog(e, breakCaption(name(e.agent_id), p.kind));
      break;
    case 'agent.chat':
      if (useStore.getState().appMode === 'swarm') swarmDirector.chat(e.agent_id!, p.with_agent_id, p.line);
      else director.startChat(e.agent_id!, p.with_agent_id, p.duration_ms, p.line, instant);
      pushLog(e, `${name(e.agent_id)} chats with ${name(p.with_agent_id)}`);
      break;
    case 'agent.break_end':
      if (useStore.getState().appMode === 'swarm') swarmDirector.breakEnd(e.agent_id!);
      else director.endBreak(e.agent_id!, instant);
      break;
    case 'message.sent':
      director.envelopeFrom(p.from_agent_id, p.to_agent_id);
      if (p.kind === 'result') sfx.tick();
      pushLog(e, `${name(p.from_agent_id)} → ${name(p.to_agent_id)}: "${p.preview}"`);
      break;
    case 'blackboard.note': {
      const notes = [...useStore.getState().notes, { id: p.id, author_agent_id: p.author_agent_id, topic: p.topic, note: p.note, ts: p.ts && p.ts !== '--:--' ? p.ts : e.ts_sim }];
      useStore.setState({ notes, notePulse: useStore.getState().notePulse + 1 });
      pushLog(e, `${name(p.author_agent_id)} pinned a note: "${p.note}"`);
      break;
    }
    case 'llm.call_started': {
      const byRole = { ...useStore.getState().llmByRole }; byRole[p.role] = (byRole[p.role] ?? 0) + 1;
      const byModel = { ...useStore.getState().llmByModel }; byModel[p.model] = (byModel[p.model] ?? 0) + 1;
      setMetrics(p.agent_id, { llm_calls: 1 });
      useStore.setState({ llmByRole: byRole, llmByModel: byModel });
      if (useStore.getState().appMode === 'swarm') swarmDirector.setThink(e.agent_id!, true);
      else director.setActivityFor(e.agent_id!, 'THINK');
      pushLog(e, `${name(e.agent_id)} is thinking (${p.model})`);
      break;
    }
    case 'llm.call_finished':
      setMetrics(e.agent_id!, { tokens_in: p.tokens_in, tokens_out: p.tokens_out });
      if (useStore.getState().appMode === 'swarm') swarmDirector.setThink(e.agent_id!, false);
      else director.setActivityFor(e.agent_id!, 'WORKING');
      break;
    case 'gate.state':
      useStore.setState({ gate: p });
      break;
    case 'validation.passed':
      director.stamp(e.task_id!, true);
      sfx.tick();
      pushLog(e, `Validation passed for ${p.task_id} (${p.validator})`);
      break;
    case 'validation.failed':
      director.stamp(e.task_id!, false);
      director.confuse(e.agent_id ?? '');
      pushLog(e, `Validation FAILED for ${p.task_id}: ${p.reason}`);
      break;
    case 'runtime.stream': {
      const term = { ...useStore.getState().terminal };
      const lines = [...(term[e.agent_id!] ?? []), `${p.kind === 'terminal' ? '$' : p.kind === 'test' ? '✓' : '~'} ${p.data}`];
      term[e.agent_id!] = lines.slice(-40);
      useStore.setState({ terminal: term });
      break;
    }
    case 'permission.requested': {
      const agent = useStore.getState().agents[p.agent_id];
      const req = { ...p, agent_name: p.agent_name ?? agent?.name ?? p.agent_id };
      useStore.setState({ pendingPermissions: [...useStore.getState().pendingPermissions, req] });
      director.sendToCabin(p.agent_id, instant);
      if (agent) pushLog(e, `${agent.name} is waiting for approval: ${p.action} ${p.resource}`);
      break;
    }
    case 'permission.resolved': {
      const req = useStore.getState().pendingPermissions.find((x) => x.request_id === p.request_id);
      useStore.setState({
        pendingPermissions: useStore.getState().pendingPermissions.filter((x) => x.request_id !== p.request_id),
      });
      director.resumeFromCabin(e.agent_id ?? req?.agent_id ?? '', instant);
      pushLog(e, `Permission ${p.decision} for ${req?.resource ?? p.request_id}`);
      break;
    }
    case 'context.stage_changed': {
      useStore.setState({
        contextStages: { ...useStore.getState().contextStages, [p.agent_id]: { stage: p.stage, frac: p.frac } },
      });
      if (p.stage >= 2) pushLog(e, `${name(p.agent_id)} context at ${(p.frac * 100).toFixed(0)}% (stage S${p.stage})`);
      break;
    }
    case 'file.edit': {
      const edits = { ...useStore.getState().fileEdits };
      const list = [...(edits[p.agent_id] ?? []), { path: p.path, line_ranges: p.line_ranges, branch: p.branch, ts: e.ts_sim }];
      edits[p.agent_id] = list.slice(-30);
      useStore.setState({ fileEdits: edits });
      break;
    }
    case 'run.checkpoint':
      useStore.setState({ checkpoint: { branch: p.branch, start_commit: p.start_commit } });
      pushLog(e, `Checkpoint branch ${p.branch} (from ${String(p.start_commit).slice(0, 7)})`);
      break;
    case 'sandbox.mode':
      useStore.setState({ sandboxMode: p.mode });
      break;
    case 'clock.tick':
      useStore.setState({ simClock: p.sim_time, realElapsed: p.real_elapsed_s });
      break;
    case 'result.final':
      useStore.setState({
        report: { report_markdown: p.report_markdown, sources: p.sources, effort_logical_s: p.effort_logical_s, effort_real_s: p.effort_real_s },
        effortLogical: p.effort_logical_s, reportOpen: true,
      });
      director.celebrate(e.agent_id ?? 'M0');
      sfx.ping();
      pushLog(e, `Final report delivered — organizational effort ${fmtEffort(p.effort_logical_s)} vs real ${(p.effort_real_s / 60).toFixed(1)} min`);
      break;
    case 'run.error':
      useStore.setState({ toast: p.message });
      pushLog(e, `Run error: ${p.message}`);
      break;
    // ── Swarm ────────────────────────────────────────────
    case 'swarm.started': {
      useStore.setState({ swarm: { ...useStore.getState().swarm, topic: p.topic, moderatorId: p.moderator_id, phase: 'frame', round: 1 } });
      pushLog(e, `Swarm of ${p.size} convened on: "${p.topic.slice(0, 60)}"`);
      break;
    }
    case 'swarm.agent_joined': {
      const a = p.agent;
      const swarm = useStore.getState().swarm;
      useStore.setState({ swarm: { ...swarm, agents: { ...swarm.agents, [a.id]: { ...a, seat_index: p.seat_index } } } });
      swarmDirector.join(a.id, a.avatar_seed, a.department ?? 'strategist', p.seat_index, a.role === 'manager', instant);
      pushLog(e, `${a.name} takes a seat${a.role === 'manager' ? ' at the moderator lectern' : ''}`);
      break;
    }
    case 'swarm.phase': {
      useStore.setState({ swarm: { ...useStore.getState().swarm, phase: p.phase, round: p.round } });
      pushLog(e, p.note ? `Phase: ${p.phase} — "${p.note.slice(0, 90)}"` : `Phase: ${p.phase} (round ${p.round})`);
      break;
    }
    case 'swarm.proposal': {
      const s = useStore.getState().swarm;
      useStore.setState({ swarm: { ...s,
        ideas: { ...s.ideas, [p.idea_id]: { id: p.idea_id, agent_id: p.agent_id, text: p.text, tags: p.tags } },
        ideaOrder: [...s.ideaOrder, p.idea_id], speakingId: p.agent_id } });
      swarmDirector.speak(p.agent_id, p.text);
      pushLog(e, `${name(p.agent_id)} proposes: "${p.text.slice(0, 80)}"`);
      break;
    }
    case 'swarm.cluster': {
      const s = useStore.getState().swarm;
      const ideas = { ...s.ideas };
      p.idea_ids.forEach((iid: string) => { if (ideas[iid]) ideas[iid] = { ...ideas[iid], cluster_id: p.cluster_id }; });
      useStore.setState({ swarm: { ...s, ideas,
        clusters: { ...s.clusters, [p.cluster_id]: { id: p.cluster_id, label: p.label, idea_ids: p.idea_ids } },
        clusterOrder: [...s.clusterOrder, p.cluster_id] } });
      pushLog(e, `Cluster "${p.label}" formed (${p.idea_ids.length} ideas)`);
      break;
    }
    case 'swarm.critique': {
      const s = useStore.getState().swarm;
      useStore.setState({ swarm: { ...s, critiques: [...s.critiques, { agent_id: p.agent_id, idea_id: p.idea_id, stance: p.stance, text: p.text }] } });
      swarmDirector.speak(p.agent_id, p.text);
      pushLog(e, `${name(p.agent_id)} ${p.stance === 'support' ? 'supports' : 'challenges'}: "${p.text.slice(0, 70)}"`);
      break;
    }
    case 'swarm.vote': {
      const s = useStore.getState().swarm;
      useStore.setState({ swarm: { ...s, votes: [...s.votes, { agent_id: p.agent_id, idea_id: p.idea_id, score: p.score }] } });
      const from = swarmDirector.pos(p.agent_id);
      if (from) voteFx.push({ from, ideaId: p.idea_id, t: 0 });
      sfx.tick();
      break;
    }
    case 'swarm.tally': {
      useStore.setState({ swarm: { ...useStore.getState().swarm, tally: { scores: p.scores, agreement: p.agreement } } });
      break;
    }
    case 'swarm.synthesis': {
      useStore.setState({ swarm: { ...useStore.getState().swarm, synthesis: { text: p.text, source_idea_ids: p.source_idea_ids } } });
      swarmDirector.speak(useStore.getState().swarm.moderatorId, p.text.split('\n')[0]);
      pushLog(e, `Synthesis ready — built from ${p.source_idea_ids.length} ideas`);
      break;
    }
  }
}

function breakCaption(n: string, kind: string) {
  const what = kind === 'coffee' ? 'compacting context over coffee'
    : kind === 'lunch' ? 'out for lunch in the cafeteria'
    : `out for ${kind}`;
  return `${n} is ${what}`;
}
export function fmtEffort(s: number) {
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
