import { LAYOUT } from '@/config/layout';
import { Dept } from '@/config/office';
import { ModelInfo } from '@/api/types';
import { TriageOut } from './triage';
import { BAY_ZONES } from '@/state/departments';

export interface AgentDef {
  id: string; name: string; role: 'manager' | 'lead' | 'worker'; department: Dept | null;
  parent_id: string | null; engine: { kind: 'llm' | 'tool' | 'code'; label: string };
  avatar_seed: number; chairId: string;
}

const NAMES = [
  'Aanya', 'Rohan', 'Meera', 'Kabir', 'Isha', 'Vikram', 'Nisha', 'Arjun',
  'Tara', 'Dev', 'Kavya', 'Farhan', 'Anaya', 'Zoya', 'Neel', 'Riya',
  'Sameer', 'Divya', 'Karan', 'Pooja', 'Yash', 'Sneha', 'Aditya', 'Lata',
];

const llmBig = { kind: 'llm' as const, label: 'llm:gemma-4-31b-it (manager)' };

function wsChair(bay: string, i: number): string {
  // bays are physical wings: map a run department's wing -> that wing's workstation chairs
  const bayZone = BAY_ZONES[bay] ?? 'researchBay';
  const zoneChairs = LAYOUT.items.filter((it) => it.zone === bayZone && it.type === 'wchair' && it.data?.wsId);
  return (zoneChairs[i] ?? zoneChairs[0]).id;
}

function leadChairFor(bay: string): string {
  const map: Record<string, string> = {
    NW: LAYOUT.leadChairs.research, NE: LAYOUT.leadChairs.engineering,
    SW: LAYOUT.leadChairs.data, SE: LAYOUT.leadChairs.content,
  };
  return map[bay] ?? LAYOUT.leadChairs.research;
}

export function buildOrg(t: TriageOut): { org: AgentDef[]; leads: AgentDef[]; workers: AgentDef[]; manager: AgentDef } {
  const org: AgentDef[] = [];
  let nameIdx = 0, seed = 10;

  const manager: AgentDef = {
    id: 'M0', name: 'Diya', role: 'manager', department: null, parent_id: null,
    engine: llmBig, avatar_seed: 1, chairId: LAYOUT.execChair,
  };
  org.push(manager);

  const leads: AgentDef[] = [], workers: AgentDef[] = [];
  for (const d of t.departments) {
    const leadId = `L_${d.id}`;
    const lead: AgentDef = {
      id: leadId, name: NAMES[nameIdx++ % NAMES.length], role: 'lead', department: d.id,
      parent_id: 'M0',
      engine: { kind: 'llm', label: `llm:${d.lead_model.split('/').pop()}` },
      avatar_seed: seed++, chairId: leadChairFor(d.bay),
    };
    org.push(lead); leads.push(lead);
    const n = Math.max(1, Math.min(d.est_workers, 4));
    for (let i = 0; i < n; i++) {
      const isCode = d.id === 'backend' || d.id === 'frontend';
      const w: AgentDef = {
        id: `W_${d.id}_${i}`, name: NAMES[nameIdx++ % NAMES.length], role: 'worker',
        department: d.id, parent_id: leadId,
        engine: {
          kind: isCode ? 'code' : d.id === 'research' || d.id === 'data' ? 'tool' : 'llm',
          label: `${isCode ? 'code' : 'llm'}:${d.worker_model.split('/').pop()}`,
        },
        avatar_seed: seed++, chairId: wsChair(d.bay, i),
      };
      org.push(w); workers.push(w);
    }
  }
  return { org, leads, workers, manager };
}

export function deskOf(id: string, org: AgentDef[]): { x: number; z: number } {
  const it = LAYOUT.items.find((i) => i.id === org.find((a) => a.id === id)?.chairId);
  return it?.seat ? { x: it.seat.x, z: it.seat.z } : { x: it!.x, z: it!.z };
}

// Model roster = the RealGravity free-tier mesh (whitepaper §4). Context windows are real:
// Groq's 8k matters (it limits which roles may run on it).
export const MODELS: ModelInfo[] = [
  { id: 'openrouter/google/gemma-4-31b-it:free', label: 'OpenRouter · Gemma 4 31B (manager default)', provider: 'openrouter', context_tokens: 128000 },
  { id: 'openrouter/qwen/qwen3.8-27b:free', label: 'OpenRouter · Qwen 3.8 27B (coder)', provider: 'openrouter', context_tokens: 128000 },
  { id: 'openrouter/cohere/north-mini-code:free', label: 'OpenRouter · Cohere North Mini Code', provider: 'openrouter', context_tokens: 32000 },
  { id: 'openrouter/nvidia/nemotron-3.5-lightning:free', label: 'OpenRouter · Nemotron 3.5 Lightning', provider: 'openrouter', context_tokens: 128000 },
  { id: 'groq/openai/gpt-oss-120b', label: 'Groq · GPT-OSS 120B', provider: 'groq', context_tokens: 8000 },
  { id: 'groq/qwen/qwen3.8-27b', label: 'Groq · Qwen 3.8 27B', provider: 'groq', context_tokens: 8000 },
  { id: 'groq/openai/gpt-oss-20b', label: 'Groq · GPT-OSS 20B (fast)', provider: 'groq', context_tokens: 8000 },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'NVIDIA NIM · Nemotron 70B', provider: 'nvidia', context_tokens: 128000 },
  { id: 'nvidia/mistralai/codestral-22b-instruct-v0.1', label: 'NVIDIA NIM · Codestral 22B', provider: 'nvidia', context_tokens: 32000 },
  { id: 'nvidia/deepseek-ai/deepseek-v4.1-flash', label: 'NVIDIA NIM · DeepSeek V4.1 Flash', provider: 'nvidia', context_tokens: 128000 },
  { id: 'go/deepseek-v4-flash', label: 'OpenCode Go · DeepSeek V4 Flash', provider: 'go', context_tokens: 128000 },
  { id: 'go/glm-5.3-flash', label: 'OpenCode Go · GLM 5.3 Flash', provider: 'go', context_tokens: 128000 },
];
export const modelContext = (id: string) => MODELS.find((m) => id.endsWith(m.id) || m.id.endsWith(id))?.context_tokens ?? 32768;

export const DAG_NODES = [
  { id: 'T1', parent_id: 'M0', description: 'Survey the open-weight coding model landscape', owner_role: 'research', assigned_agent: 'W1', status: 'ready', priority: 2, depends_on: [], attempts: 0, progress_pct: 0, est_effort_s: 1800 },
];
export const DAG_EDGES: { from: string; to: string }[] = [];

export const REPORT_MD = `# Open-Weight Coding Models: Comparison & Benchmark CLI

## Summary
We compared the three strongest open-weight coding model families — **Qwen2.5-Coder-32B**, **DeepSeek-Coder-V2-Lite (16B)**, and **StarCoder2-15B** — on HumanEval, MBPP, and a fresh 40-prompt internal suite, then shipped a tiny CLI (\`bench\`) that runs any of them through a standard harness.

## Findings
- **Qwen2.5-Coder-32B** leads on HumanEval (86.9% pass@1) and long-context refactor tasks. Apache-2.0 license, 32k context.
- **DeepSeek-Coder-V2-Lite** is the best quality-per-GB: 81.2% HumanEval at 16B active parameters, MIT license.
- **StarCoder2-15B** trails on multilingual tasks (65.1%) but is the fastest at batch inference and has the most permissive training-data transparency.

## The CLI
\`bench --model qwen2.5-coder-32b --suite humaneval,mbpp\` produces a JSON + Markdown scorecard with tokens/s, cost proxy, and pass@1/pass@5. The harness pins prompts, seeds, and stop tokens for reproducibility.

## Recommendation
Default to **Qwen2.5-Coder-32B** where VRAM allows; use **DeepSeek-Coder-V2-Lite** on single-GPU boxes; keep **StarCoder2** for high-throughput batch labeling.
`;

export const SOLO_REPORT_MD = `# Quick draft

Here is a short, self-contained draft written directly by the manager — no team was needed for a single-output task.

> RealGravity runs a terminal-first coding agent on free open-weight models, with a permission-gated sandbox, staged context discipline, and one-command rollback.
`;

export const SOURCES = [
  { title: 'Qwen2.5-Coder technical report', url: 'https://qwenlm.github.io/blog/qwen2.5-coder/', verified: true },
  { title: 'DeepSeek-Coder-V2 repository', url: 'https://github.com/deepseek-ai/DeepSeek-Coder-V2', verified: true },
  { title: 'StarCoder2 paper (arXiv:2402.19173)', url: 'https://arxiv.org/abs/2402.19173', verified: true },
  { title: 'HumanEval benchmark suite', url: 'https://github.com/openai/human-eval', verified: true },
  { title: 'Community inference throughput notes', url: 'https://example.com/community-notes', verified: false },
];
