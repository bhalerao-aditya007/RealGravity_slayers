import { z } from 'zod';
import { TriageTaskClasses } from '@/config/office';

export const AgentSchema = z.object({
  id: z.string(), name: z.string(),
  role: z.enum(['manager', 'lead', 'worker']),
  department: z.string().nullable(),
  parent_id: z.string().nullable(),
  engine: z.object({ kind: z.enum(['llm', 'tool', 'code']), label: z.string() }),
  status: z.string(), energy: z.number(), context_tokens: z.number(), context_max: z.number(),
  current_task_id: z.string().nullable(), avatar_seed: z.number(),
}).passthrough();
export type Agent = z.infer<typeof AgentSchema>;

export const TaskSchema = z.object({
  id: z.string(), parent_id: z.string().nullable(), description: z.string(),
  owner_role: z.string(), assigned_agent: z.string().nullable(),
  status: z.enum(['pending', 'ready', 'running', 'waiting', 'review', 'done', 'failed']),
  priority: z.number(), depends_on: z.array(z.string()), attempts: z.number(),
  progress_pct: z.number(), est_effort_s: z.number(),
}).passthrough();
export type Task = z.infer<typeof TaskSchema>;

export const ConfigSchema = z.object({
  model_id: z.string(), concurrency_limit: z.number(), speed_factor: z.number(),
  break_policy: z.object({ enabled: z.boolean(), energy_threshold: z.number() }),
}).passthrough();
export type Config = z.infer<typeof ConfigSchema>;

export const MetricsSchema = z.object({
  llm_calls: z.number(), tool_calls: z.number(), tokens_in: z.number(), tokens_out: z.number(),
  by_role: z.record(z.string(), z.number()).optional(), by_model: z.record(z.string(), z.number()).optional(),
}).passthrough();
export type Metrics = z.infer<typeof MetricsSchema>;

export const BlackboardNoteSchema = z.object({
  id: z.string(), author_agent_id: z.string(), topic: z.string(), note: z.string(), ts: z.string(),
}).passthrough();
export type BlackboardNote = z.infer<typeof BlackboardNoteSchema>;

// ── Triage v3 ─────────────────────────────────────────────────
export const DepartmentDefSchema = z.object({
  id: z.string(), name: z.string(), bay: z.string(), hue: z.number(),
  capability: z.string(), lead_model: z.string(), worker_model: z.string(),
  est_workers: z.number(),
});
export type DepartmentDef = z.infer<typeof DepartmentDefSchema>;

export const BreakPolicySchema = z.object({
  coffee: z.enum(['never', 'on_compaction', 'on_stage2']),
  meals: z.boolean(),
  chats: z.enum(['never', 'on_handoff']),
  pace: z.enum(['sprint', 'normal', 'workday']),
});

export const TriageResultSchema = z.object({
  task_class: z.enum(TriageTaskClasses),
  intensity: z.enum(['light', 'standard', 'heavy']),
  est_effort_s: z.number(), est_workers: z.number(),
  rationale: z.string(),
  break_policy: BreakPolicySchema,
  departments: z.array(DepartmentDefSchema),
}).passthrough();
export type TriageResult = z.infer<typeof TriageResultSchema>;

export const PermissionRequestSchema = z.object({
  request_id: z.string(), agent_id: z.string(), agent_name: z.string().optional(),
  action: z.string(), resource: z.string(), effect: z.string(),
  preview: z.string().optional(),
});
export type PermissionRequest = z.infer<typeof PermissionRequestSchema>;

export const FileEditSchema = z.object({
  agent_id: z.string(), path: z.string(),
  line_ranges: z.array(z.tuple([z.number(), z.number()])),
  branch: z.string().optional(),
});

export const ArtifactSchema = z.object({ id: z.string(), task_id: z.string(), path: z.string(), kind: z.string() }).passthrough();

const envelopeBase = {
  seq: z.number(), run_id: z.string(), ts_real: z.string(), ts_sim: z.string(),
  type: z.string(), agent_id: z.string().optional(), task_id: z.string().optional(),
};
const P = z.object(envelopeBase).passthrough();

const payloadFor: Record<string, z.ZodTypeAny> = {
  'task.created': z.object({ goal: z.string() }),
  'task.triaged': TriageResultSchema,
  'plan.ready': z.object({
    nodes: z.array(z.any()), edges: z.array(z.any()),
    plan_meta: z.object({
      intensity: z.enum(['light', 'standard', 'heavy']),
      break_policy: BreakPolicySchema, est_effort_s: z.number(),
    }).optional(),
  }),
  'permission.requested': PermissionRequestSchema,
  'permission.resolved': z.object({ request_id: z.string(), decision: z.enum(['once', 'always', 'reject']) }),
  'context.stage_changed': z.object({ agent_id: z.string(), stage: z.number(), frac: z.number() }),
  'file.edit': FileEditSchema,
  'run.checkpoint': z.object({ branch: z.string(), start_commit: z.string(), summary_path: z.string().optional() }),
  'sandbox.mode': z.object({ agent_id: z.string().optional(), mode: z.enum(['native', 'docker']) }),
  'plan.updated': z.object({ reason: z.string(), nodes: z.array(z.any()), edges: z.array(z.any()) }),
  'worker.hired': z.object({ agent: AgentSchema, desk: z.object({ x: z.number(), z: z.number() }) }),
  'worker.released': z.object({ agent_id: z.string() }),
  'task.assigned': z.object({ task_id: z.string(), agent_id: z.string(), from_agent_id: z.string() }),
  'task.started': z.object({ task_id: z.string(), agent_id: z.string() }),
  'task.progress': z.object({ task_id: z.string(), pct: z.number(), note: z.string().optional() }),
  'task.completed': z.object({ task_id: z.string(), result_preview: z.string() }),
  'task.failed': z.object({ task_id: z.string(), reason: z.string(), attempt: z.number(), will_retry: z.boolean() }),
  'task.rework': z.object({ task_id: z.string(), reason: z.string() }),
  'task.reassigned': z.object({ task_id: z.string(), from_agent_id: z.string(), to_agent_id: z.string() }),
  'agent.state_changed': z.object({ agent_id: z.string(), from: z.string(), to: z.string(), reason: z.string().optional() }),
  'agent.metrics': z.object({ agent_id: z.string(), energy: z.number(), context_tokens: z.number(), context_max: z.number(), pending: z.number(), done: z.number(), failed: z.number() }),
  'agent.moved': z.object({
    agent_id: z.string(),
    to: z.object({ x: z.number(), z: z.number() }).optional(),
    purpose: z.enum(['desk', 'pantry', 'cafeteria', 'lounge', 'meeting', 'handoff', 'exit']),
    eta_sim_s: z.number().optional(),
  }),
  'agent.break_start': z.object({ agent_id: z.string(), kind: z.enum(['coffee', 'breakfast', 'lunch', 'dinner', 'chill']), duration_sim_s: z.number(), reason: z.string().optional() }),
  'agent.chat': z.object({ agent_id: z.string(), with_agent_id: z.string(), duration_ms: z.number(), line: z.string() }),
  'agent.break_end': z.object({ agent_id: z.string() }),
  'message.sent': z.object({ from_agent_id: z.string(), to_agent_id: z.string(), kind: z.enum(['task', 'result', 'note']), preview: z.string() }),
  'blackboard.note': z.object({ id: z.string(), author_agent_id: z.string(), topic: z.string(), note: z.string(), ts: z.string() }),
  'llm.call_started': z.object({ call_id: z.string(), agent_id: z.string(), model: z.string(), role: z.string() }),
  'llm.call_finished': z.object({ call_id: z.string(), tokens_in: z.number(), tokens_out: z.number(), latency_ms: z.number() }),
  'gate.state': z.object({ in_flight: z.number(), limit: z.number(), queue_depth: z.number(), backoff_active: z.boolean() }),
  'validation.passed': z.object({ task_id: z.string(), validator: z.string() }),
  'validation.failed': z.object({ task_id: z.string(), validator: z.string(), reason: z.string() }),
  'runtime.stream': z.object({ agent_id: z.string(), kind: z.enum(['file_edit', 'terminal', 'test']), data: z.string() }),
  'clock.tick': z.object({ sim_time: z.string(), real_elapsed_s: z.number() }),
  'result.final': z.object({
    report_markdown: z.string(),
    sources: z.array(z.object({ title: z.string(), url: z.string(), verified: z.boolean() })),
    effort_logical_s: z.number(), effort_real_s: z.number(),
  }),
  'run.error': z.object({ message: z.string(), recoverable: z.boolean() }),
  'system.halted': z.object({ reason: z.string().optional() }),
  // ── Swarm v4 (additive) ──
  'swarm.started': z.object({ size: z.number(), topic: z.string(), moderator_id: z.string() }),
  'swarm.agent_joined': z.object({ agent: AgentSchema, seat_index: z.number() }),
  'swarm.phase': z.object({ phase: z.enum(['frame', 'diverge', 'cluster', 'critique', 'vote', 'synthesize', 'done']), round: z.number(), note: z.string().optional() }),
  'swarm.proposal': z.object({ agent_id: z.string(), idea_id: z.string(), text: z.string(), tags: z.array(z.string()).optional() }),
  'swarm.cluster': z.object({ cluster_id: z.string(), label: z.string(), idea_ids: z.array(z.string()) }),
  'swarm.critique': z.object({ agent_id: z.string(), idea_id: z.string(), stance: z.enum(['support', 'challenge']), text: z.string() }),
  'swarm.vote': z.object({ agent_id: z.string(), idea_id: z.string(), score: z.number() }),
  'swarm.tally': z.object({ scores: z.array(z.object({ idea_id: z.string(), score: z.number(), votes: z.number() })), agreement: z.number() }),
  'swarm.synthesis': z.object({ text: z.string(), source_idea_ids: z.array(z.string()) }),
};

export const EventSchema = P.superRefine((v, ctx) => {
  const ps = payloadFor[v.type as string];
  if (!ps) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown event type ${v.type}` }); return; }
  const r = ps.safeParse((v as any).payload ?? {});
  if (!r.success) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `bad payload for ${v.type}: ${r.error.message}` });
});
export type Envelope = z.infer<typeof EventSchema>;

export interface ModelInfo { id: string; label: string; provider: string; context_tokens: number }
export interface OutputRec { task_id: string; ts: string; kind: string; preview: string }
export interface FinalResult {
  report_markdown: string; sources: { title: string; url: string; verified: boolean }[];
  effort_logical_s: number; effort_real_s: number;
}
export interface SwarmIdea { id: string; agent_id: string; text: string; tags?: string[]; cluster_id?: string }
export interface SwarmCluster { id: string; label: string; idea_ids: string[] }
export interface SwarmCritique { agent_id: string; idea_id: string; stance: 'support' | 'challenge'; text: string }
export interface SwarmAgentRec { id: string; name: string; role: string; department: string; engine_label: string; seat_index: number; energy: number; avatar_seed: number }
export function parseEvent(raw: unknown): Envelope | null {
  const r = EventSchema.safeParse(raw);
  return r.success ? r.data : null;
}
