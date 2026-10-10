import { RawEv } from '@/mock/simulator';
import { ROLES, roleAt } from './roles';

const NAMES = ['Aanya','Rohan','Meera','Kabir','Isha','Vikram','Nisha','Arjun','Tara','Dev','Kavya','Farhan','Anaya','Zoya','Neel','Riya','Sameer','Divya','Karan','Pooja','Yash','Sneha','Aditya','Lata','Omar','Tara2','Ines','Milan','Sara','Ravi','Nadia','Felix','Anya','Kiran','Maya','Jonas','Leah','Arnav','Diya2','Rhea','Ojas','Naina','Veer','Sana','Peter','Alia'];

const STOP = new Set(['the','a','an','and','or','for','of','to','in','on','with','how','should','what','is','are','best','my','our','we','i','you','it','that','this','by','from','at','as','be','can','do','does','will']);
function topicWords(goal: string, k = 3): string[] {
  const ws = goal.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  return ws.slice(0, k).length ? ws.slice(0, k) : ['the goal'];
}

const PROPOSE = [
  (w: string) => `Run the cheapest possible pilot of ${w} for two weeks with one cohort before committing budget.`,
  (w: string) => `Anchor ${w} to a single 90-day metric — pick the one number that proves it works.`,
  (w: string) => `Flip the order: do ${w} manually for ten users first, automate only the painful parts.`,
  (w: string) => `Partner instead of building: ${w} could ride on an existing platform's distribution.`,
  (w: string) => `Time-box ${w} to a one-week prototype; kill criteria written before we start.`,
  (w: string) => `For ${w}, copy the boring proven playbook from an adjacent industry and adapt it.`,
  (w: string) => `Price ${w} as a loss-leader for the real revenue line; free tier does the marketing.`,
  (w: string) => `Make ${w} opt-in and measurable — small surface area, fast feedback, easy rollback.`,
  (w: string) => `Bundle ${w} with what users already do daily; adoption follows habit, not features.`,
  (w: string) => `Cut scope of ${w} by 70% and ship the one slice users would pay for tomorrow.`,
  (w: string) => `For ${w}, instrument everything from day one — you cannot improve what you don't see.`,
  (w: string) => `Recruit ten power users as co-designers of ${w}; they bring the next hundred.`,
];
const SUPPORT = [
  (w: string) => `Strong: this de-risks ${w} fast and the cost ceiling is obvious.`,
  (_w: string) => `I support it — the rollback path is clean and the learning-per-dollar is high.`,
  (_w: string) => `Agreed; this matches what worked for us last year on a similar effort.`,
  (_w: string) => `Backing this. The measurement plan makes the outcome hard to fake.`,
];
const CHALLENGE = [
  (w: string) => `Challenge: who owns ${w} when it breaks at 2am? This plan has no owner.`,
  (w: string) => `I'd push back — ${w} assumes demand we haven't validated with a single user.`,
  (w: string) => `The failure mode is silent: ${w} can look fine on dashboards while users churn.`,
  (w: string) => `Hidden cost: maintenance of ${w} compounds; budget the second year, not the first.`,
  (w: string) => `This optimizes the happy path. What happens to ${w} at 10x load or 0.1x budget?`,
];
const FRAME = (goal: string) =>
  `Today's question: "${goal}". We diverge first — one proposal each. Then we cluster, critique, vote, and synthesize.`;

function mulberry(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function buildSwarmScript(goal: string, n: number): RawEv[] {
  const S: RawEv[] = [];
  const rnd = mulberry(n * 7919 + goal.length);
  const ev = (t: number, type: string, agent_id?: string, payload?: any) => S.push({ t, type, agent_id, task_id: undefined, payload });
  const words = topicWords(goal);
  const W = () => words[Math.floor(rnd() * words.length)];

  ev(0, 'swarm.started', undefined, { size: n, topic: goal, moderator_id: 'M0' });
  ev(0.2, 'swarm.agent_joined', 'M0', {
    agent: { id: 'M0', name: 'Diya', role: 'manager', department: 'moderator', parent_id: null, engine: { kind: 'llm', label: 'llm:gemma-4-31b' }, status: 'SEATED', energy: 100, context_tokens: 0, context_max: 128000, current_task_id: null, avatar_seed: 1 },
    seat_index: n,
  });

  // join staggered 0.5s
  const agents: { id: string; name: string; role: string }[] = [];
  for (let i = 0; i < n; i++) {
    const id = `S${i}`, name = NAMES[i % NAMES.length].replace('2', 'a'), role = roleAt(i);
    agents.push({ id, name, role: role.id });
    ev(0.5 + i * 0.5, 'swarm.agent_joined', id, {
      agent: { id, name, role: 'worker', department: role.id, parent_id: 'M0', engine: { kind: 'llm', label: `llm:${role.label.toLowerCase()}` }, status: 'IDLE', energy: 100, context_tokens: 0, context_max: 128000, current_task_id: null, avatar_seed: 10 + i },
      seat_index: i,
    });
  }
  const joinDone = 0.5 + n * 0.5 + 2;

  // FRAME
  ev(joinDone, 'swarm.phase', undefined, { phase: 'frame', round: 1, note: FRAME(goal) });
  ev(joinDone + 0.5, 'llm.call_started', 'M0', { call_id: 'fc0', agent_id: 'M0', model: 'groq/openai/gpt-oss-20b', role: 'moderator' });
  ev(joinDone + 2, 'llm.call_finished', 'M0', { call_id: 'fc0', tokens_in: 420, tokens_out: 180, latency_ms: 1500 });

  // DIVERGE in waves of 4, with a rate-limit episode
  let t = joinDone + 4;
  ev(t, 'swarm.phase', undefined, { phase: 'diverge', round: 1 });
  t += 1;
  const ideaIds: { id: string; agent: string; text: string }[] = [];
  const waves = Math.ceil(n / 4);
  const rlWave = n >= 20 ? Math.min(2, waves - 1) : -1;
  let cid = 0;
  for (let w = 0; w < waves; w++) {
    const wave = agents.slice(w * 4, w * 4 + 4);
    for (const a of wave) ev(t + 0.3, 'llm.call_started', a.id, { call_id: `c${cid}`, agent_id: a.id, model: 'openrouter/qwen/qwen3.8-27b:free', role: a.role });
    for (let k = 0; k < wave.length; k++) {
      const a = wave[k], iid = `I${w * 4 + k}`;
      const text = PROPOSE[(w * 4 + k) % PROPOSE.length](W());
      ideaIds.push({ id: iid, agent: a.id, text });
      ev(t + 3 + k * 0.4, 'swarm.proposal', a.id, { agent_id: a.id, idea_id: iid, text, tags: [roleLabelOf(a.role)] });
    }
    for (let k = 0; k < wave.length; k++) ev(t + 5 + k * 0.2, 'llm.call_finished', wave[k].id, { call_id: `c${cid + k}`, tokens_in: 2100, tokens_out: 640, latency_ms: 3400 });
    cid += wave.length;
    t += 7;
    if (w === rlWave) {
      // rate-limit episode
      ev(t, 'gate.state', undefined, { in_flight: 4, limit: 4, queue_depth: 6, backoff_active: true });
      const breaking = agents.slice(0, Math.min(5, Math.max(3, Math.floor(n / 10)))).filter((a) => a.id !== 'M0');
      for (const b of breaking) {
        ev(t + 1, 'agent.break_start', b.id, { agent_id: b.id, kind: rnd() > 0.5 ? 'coffee' : 'chill', reason: 'rate_limit', duration_sim_s: 420 });
        ev(t + 1.1, 'agent.state_changed', b.id, { agent_id: b.id, from: 'WORKING', to: 'BREAK' });
      }
      ev(t + 6, 'agent.chat', breaking[0].id, { agent_id: breaking[0].id, with_agent_id: breaking[1]?.id ?? breaking[0].id, duration_ms: 5500, line: `Gateway is backing off — good moment to sanity-check my ${W()} angle with you.` });
      for (const b of breaking) {
        ev(t + 33, 'agent.break_end', b.id, { agent_id: b.id });
        ev(t + 33.1, 'agent.state_changed', b.id, { agent_id: b.id, from: 'BREAK', to: 'WORKING' });
      }
      ev(t + 34, 'gate.state', undefined, { in_flight: 2, limit: 4, queue_depth: 0, backoff_active: false });
      t += 36;
    }
  }
  t += 1;
  ev(t, 'gate.state', undefined, { in_flight: 0, limit: 4, queue_depth: 0, backoff_active: false });

  // CLUSTER
  ev(t + 1, 'swarm.phase', undefined, { phase: 'cluster', round: 1 });
  const clusterCount = Math.max(3, Math.min(6, Math.round(ideaIds.length / 4)));
  const clusters: { id: string; label: string; idea_ids: string[] }[] = [];
  for (let c = 0; c < clusterCount; c++) {
    const members = ideaIds.filter((_, i) => i % clusterCount === c).map((x) => x.id);
    const label = ['Validate cheaply', 'Cut scope', 'Distribution & partners', 'Measure everything', 'Risk & ownership', 'Money & pricing'][c % 6];
    clusters.push({ id: `CL${c}`, label, idea_ids: members });
    ev(t + 2 + c * 1.2, 'swarm.cluster', undefined, { cluster_id: `CL${c}`, label, idea_ids: members });
  }
  t += 2 + clusterCount * 1.2 + 2;

  // CRITIQUE: ~60% of agents critique one top idea
  ev(t, 'swarm.phase', undefined, { phase: 'critique', round: 1 });
  const critics = agents.filter((_, i) => i % 5 < 3); // 60%
  for (let b = 0; b < critics.length; b += 3) {
    const batch = critics.slice(b, b + 3);
    for (const a of batch) ev(t + 0.2, 'llm.call_started', a.id, { call_id: `cc${b}-${a.id}`, agent_id: a.id, model: 'openrouter/qwen/qwen3.8-27b:free', role: a.role });
    for (let k = 0; k < batch.length; k++) {
      const a = batch[k];
      const target = ideaIds[Math.floor(rnd() * ideaIds.length)];
      const stance = rnd() > 0.45 ? 'challenge' : 'support';
      ev(t + 1.6 + k * 0.4, 'swarm.critique', a.id, {
        agent_id: a.id, idea_id: target.id, stance,
        text: (stance === 'support' ? SUPPORT : CHALLENGE)[Math.floor(rnd() * 4)](W()),
      });
    }
    for (const a of batch) ev(t + 2.6, 'llm.call_finished', a.id, { call_id: `cc${b}-${a.id}`, tokens_in: 1600, tokens_out: 380, latency_ms: 2200 });
    t += 3;
  }
  t += 1;

  // VOTE: everyone votes on top K ideas; tally after each batch of 5
  ev(t, 'swarm.phase', undefined, { phase: 'vote', round: 1 });
  const K = Math.min(6, ideaIds.length);
  const top = ideaIds.slice(0, K);
  const votes: { agent_id: string; idea_id: string; score: number }[] = [];
  const scoresAgg = new Map<string, { sum: number; votes: number }>();
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const pick = top[Math.floor(rnd() * top.length)];
    const score = 1 + Math.floor(rnd() * 5);
    votes.push({ agent_id: a.id, idea_id: pick.id, score });
    const agg = scoresAgg.get(pick.id) ?? { sum: 0, votes: 0 };
    scoresAgg.set(pick.id, { sum: agg.sum + score, votes: agg.votes + 1 });
    ev(t + 0.5 + i * 0.35, 'swarm.vote', a.id, { agent_id: a.id, idea_id: pick.id, score });
    if (votes.length % 5 === 0 || i === agents.length - 1) {
      const sc = [...scoresAgg.entries()].map(([idea_id, v]) => ({ idea_id, score: +(v.sum / v.votes).toFixed(2), votes: v.votes }));
      const mean = sc.reduce((s2, x) => s2 + x.score, 0) / sc.length;
      const std = Math.sqrt(sc.reduce((s2, x) => s2 + (x.score - mean) ** 2, 0) / sc.length);
      const agreement = Math.round(Math.max(0, Math.min(100, 100 * (1 - std / 2.2))));
      ev(t + 0.8 + i * 0.35, 'swarm.tally', undefined, { scores: sc, agreement });
    }
  }
  t += agents.length * 0.35 + 2;

  // SYNTHESIZE
  ev(t, 'swarm.phase', undefined, { phase: 'synthesize', round: 1 });
  ev(t + 0.5, 'llm.call_started', 'M0', { call_id: 'sc0', agent_id: 'M0', model: 'openrouter/google/gemma-4-31b-it:free', role: 'moderator' });
  const ranked = [...scoresAgg.entries()].sort((x, y) => y[1].sum - x[1].sum).map(([id]) => id);
  const topIdeas = ideaIds.filter((x) => ranked.slice(0, 3).includes(x.id));
  ev(t + 4, 'swarm.synthesis', 'M0', {
    text:
      `## Recommendation\nRun a two-week, single-cohort pilot of the cheapest viable version of "${goal}", instrumented from day one, with written kill criteria.\n\n` +
      `## Why\nThe strongest-voted ideas share one theme: validate demand before building. The top cluster ("${clusters[0]?.label}") carried ${ranked.length > 0 ? 'the most votes' : 'consensus'}, and the critiques converged on ownership and hidden maintenance cost as the two risks to pre-empt.\n\n` +
      `## Next steps\n1. Pick the 90-day metric and write kill criteria. 2. Recruit ten power users as co-designers. 3. Ship the 30% slice and measure weekly.`,
    source_idea_ids: topIdeas.map((x) => x.id),
  });
  ev(t + 6, 'llm.call_finished', 'M0', { call_id: 'sc0', tokens_in: 8400, tokens_out: 1200, latency_ms: 5200 });
  ev(t + 7, 'swarm.phase', undefined, { phase: 'done', round: 1 });
  const total = t + 9;
  ev(total, 'result.final', undefined, {
    report_markdown:
      `# Swarm Synthesis\n\n**Topic:** ${goal}\n**Participants:** ${n} + moderator\n\n## Consensus\nValidate cheaply before committing budget: pilot, measure, and keep an explicit rollback path.\n\n## Top ideas\n${topIdeas.map((x) => `- ${x.text}`).join('\n')}\n\n## Dissent noted\nOwnership at 2am, unvalidated demand, and compounding maintenance cost were the standing challenges.`,
    sources: [], effort_logical_s: n * 240, effort_real_s: Math.round(total),
  });
  return S;
}
function roleLabelOf(id: string) { return ROLES.find((r) => r.id === id)?.label ?? id; }
