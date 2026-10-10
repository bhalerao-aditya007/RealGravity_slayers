import { DepartmentDef } from '@/api/types';
import { TaskClass, Intensity, BreakPolicy, BAY_ORDER } from '@/config/office';

export interface TriageOut {
  task_class: TaskClass; intensity: Intensity;
  est_effort_s: number; est_workers: number; rationale: string;
  break_policy: BreakPolicy; departments: DepartmentDef[];
}

const PRESETS: Record<string, Omit<DepartmentDef, 'hue'>> = {
  frontend:  { id: 'frontend',  name: 'Frontend',  bay: 'NE', capability: 'UI code, components, styles',       lead_model: 'openrouter/qwen/qwen3.8-27b:free',        worker_model: 'groq/openai/gpt-oss-20b',                    est_workers: 2 },
  backend:   { id: 'backend',   name: 'Backend',   bay: 'NW', capability: 'APIs, services, CLI, core logic',   lead_model: 'openrouter/qwen/qwen3.8-27b:free',        worker_model: 'nvidia/deepseek-ai/deepseek-v4.1-flash',    est_workers: 2 },
  research:  { id: 'research',  name: 'Research',  bay: 'NW', capability: 'SearXNG-grounded gathering',        lead_model: 'openrouter/google/gemma-4-31b-it:free',   worker_model: 'openrouter/google/gemma-4-31b-it:free',     est_workers: 2 },
  data:      { id: 'data',      name: 'Data & Evals', bay: 'SW', capability: 'benchmarks, metrics, validation', lead_model: 'openrouter/nvidia/nemotron-3.5-lightning:free', worker_model: 'openrouter/nvidia/nemotron-3.5-lightning:free', est_workers: 2 },
  qa:        { id: 'qa',        name: 'QA',        bay: 'SW', capability: 'test runs, validation gates',       lead_model: 'openrouter/nvidia/nemotron-3.5-lightning:free', worker_model: 'nvidia/deepseek-ai/deepseek-v4.1-flash',  est_workers: 1 },
  content:   { id: 'content',   name: 'Content & Docs', bay: 'SE', capability: 'synthesis, README, report',    lead_model: 'go/glm-5.3-flash',                        worker_model: 'go/glm-5.3-flash',                          est_workers: 2 },
};

// hue offsets spaced so any subset reads distinctly
const HUES: Record<string, number> = { backend: 150, frontend: 205, research: 58, data: 262, qa: 300, content: 20 };

function dept(id: string, estWorkers?: number): DepartmentDef {
  return { ...PRESETS[id], hue: HUES[id] ?? 0, ...(estWorkers != null ? { est_workers: estWorkers } : {}) };
}

/** FIX F5: several presets prefer the same wing (backend+research -> NW, data+qa -> SW).
 *  The building has exactly 4 wings, so give every department its own wing:
 *  keep the preferred bay if free, otherwise take the first free one. */
function allocateBays(defs: DepartmentDef[]): DepartmentDef[] {
  const taken = new Set<string>();
  return defs.map((d) => {
    let bay = d.bay;
    if (taken.has(bay)) bay = BAY_ORDER.find((b) => !taken.has(b)) ?? bay;
    taken.add(bay);
    return { ...d, bay };
  });
}

/** FIX F4: word-boundary matching. The v3 draft used substring matching, so 'ui'
 *  matched inside 'b-ui-ld' and every "build ..." goal became fullstack. */
function makeHas(g: string) {
  return (...words: string[]) => words.some((w) => {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(g);
  });
}

export function triage(goal: string): TriageOut {
  const g = goal.toLowerCase();
  const has = makeHas(g);

  const codeFE = has('frontend', 'ui', 'component', 'components', 'react', 'css', 'dashboard', 'website', 'dark mode', 'landing page');
  const codeBE = has('api', 'backend', 'cli', 'server', 'database', 'build', 'refactor', 'implement', 'fix', 'bug', 'tool that', 'script');
  const researchy = has('research', 'compare', 'survey', 'analysis of', 'landscape', 'top 3', 'best');
  const texty = has('write', 'summarize', 'summary', 'draft', 'explain', 'one-paragraph', 'email', 'rewrite this');

  let task_class: TaskClass;
  let deptIds: string[];
  let est_workers: number;

  if (texty && !codeFE && !codeBE) {
    task_class = 'text_gen'; deptIds = []; est_workers = 0;
  } else if (codeFE && codeBE) {
    task_class = 'code_fullstack'; deptIds = ['backend', 'frontend', 'qa', 'content']; est_workers = 7;
  } else if (researchy && codeBE) {
    task_class = 'hybrid'; deptIds = ['research', 'data', 'backend', 'content']; est_workers = 8;
  } else if (researchy && has('benchmark', 'benchmarks', 'metric', 'metrics', 'eval', 'evals')) {
    task_class = 'data_analysis'; deptIds = ['data', 'content']; est_workers = 3;
  } else if (researchy) {
    task_class = 'research'; deptIds = ['research', 'content']; est_workers = 3;
  } else if (codeFE) {
    task_class = 'code_frontend'; deptIds = ['frontend', 'qa']; est_workers = 3;
  } else if (codeBE) {
    task_class = 'code_backend'; deptIds = ['backend', 'qa']; est_workers = 3;
  } else {
    task_class = 'code_engine'; deptIds = ['backend']; est_workers = 2;
  }

  const departments = allocateBays(deptIds.map((id) => dept(id)));
  const heavy = task_class === 'code_fullstack' || task_class === 'hybrid' || est_workers > 4;
  const intensity: Intensity = est_workers === 0 ? 'light' : heavy ? 'heavy' : 'standard';

  const break_policy: BreakPolicy =
    intensity === 'light'
      ? { coffee: 'never', meals: false, chats: 'never', pace: 'sprint' }
      : intensity === 'standard'
      ? { coffee: 'on_compaction', meals: false, chats: 'on_handoff', pace: 'normal' }
      : { coffee: 'on_stage2', meals: true, chats: 'on_handoff', pace: 'workday' };

  const est_effort_s =
    intensity === 'light' ? 240 : intensity === 'standard' ? 3600 : 15000;

  const rationale =
    intensity === 'light'
      ? 'Short single-output task — I will handle this myself.'
      : intensity === 'heavy'
      ? 'Multi-team code project — hiring a full team, this will take a workday.'
      : 'Focused task — a small team, no meal breaks needed.';

  return { task_class, intensity, est_effort_s, est_workers, rationale, break_policy, departments };
}
