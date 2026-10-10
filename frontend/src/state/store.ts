import { create } from 'zustand';
import { Agent, BlackboardNote, DepartmentDef, Envelope, FinalResult, Metrics, ModelInfo, PermissionRequest, Task, TriageResult, SwarmIdea, SwarmCluster, SwarmCritique } from '@/api/types';
import { DEFAULT_ACCENT } from '@/config/office';

export interface AgentUI extends Agent {
  pending: number; done: number; failed: number;
  outputs: { task_id: string; ts: string; kind: string; preview: string }[];
}
export interface LogEntry { id: number; ts_sim: string; type: string; text: string; agentId?: string; taskId?: string }
export interface GateState { in_flight: number; limit: number; queue_depth: number; backoff_active: boolean }
export interface Settings {
  shadows: 'low' | 'med' | 'high'; post: boolean; lodDist: number; sound: boolean;
  reducedMotion: boolean; concurrency: number; pricePerM: number; showPaidCost: boolean;
}

interface Store {
  phase: 'landing' | 'workspace';
  goal: string; modelId: string; models: ModelInfo[]; mode: 'live' | 'replay';
  view: '3d' | 'blueprint'; night: boolean; flows: boolean; dev: boolean;
  speed: number; paused: boolean; accent: string;
  simClock: string; realElapsed: number; effortLogical: number;
  agents: Record<string, AgentUI>; order: string[];
  tasks: Record<string, Task>; edges: { from: string; to: string }[];
  notes: BlackboardNote[]; log: LogEntry[]; runEvents: Envelope[];
  metrics: Metrics; gate: GateState; llmByRole: Record<string, number>; llmByModel: Record<string, number>;
  terminal: Record<string, string[]>;
  report: FinalResult | null; replanCount: number; planOutline: string[];
  selected: string | null; inspectorOpen: boolean; drawerOpen: boolean; settingsOpen: boolean; reportOpen: boolean;
  followId: string | null; toast: string | null; offline: boolean; demoMode: boolean;
  replayIdx: number; replayPlaying: boolean; notePulse: number;
  appMode: 'office' | 'swarm';
  swarmSize: 10 | 20 | 30 | 40 | 50;
  swarmPhaseTick: number;
  swarm: {
    phase: string; round: number; topic: string; moderatorId: string;
    agents: Record<string, any>;
    ideas: Record<string, SwarmIdea>; ideaOrder: string[];
    clusters: Record<string, SwarmCluster>; clusterOrder: string[];
    critiques: SwarmCritique[];
    votes: { agent_id: string; idea_id: string; score: number }[];
    tally: { scores: { idea_id: string; score: number; votes: number }[]; agreement: number } | null;
    speakingId: string | null;
    synthesis: { text: string; source_idea_ids: string[] } | null;
  };
  triage: TriageResult | null;
  departments: Record<string, DepartmentDef>;
  pendingPermissions: PermissionRequest[];
  profile: 'strict' | 'assist' | 'turbo';
  sandboxMode: 'native' | 'docker';
  contextStages: Record<string, { stage: number; frac: number }>;
  fileEdits: Record<string, { path: string; line_ranges: [number, number][]; branch?: string; ts: string }[]>;
  checkpoint: { branch: string; start_commit: string } | null;
  settings: Settings;
  set: (p: Partial<Store>) => void;
  resetRun: (goal: string) => void;
}

let logId = 0;
export const useStore = create<Store>((set) => ({
  phase: 'landing',
  goal: '', modelId: 'openrouter/google/gemma-4-31b-it:free', models: [], mode: 'live',
  view: '3d', night: false, flows: false, dev: false,
  speed: 1, paused: false, accent: DEFAULT_ACCENT,
  simClock: '09:00', realElapsed: 0, effortLogical: 0,
  agents: {}, order: [], tasks: {}, edges: [], notes: [], log: [], runEvents: [],
  metrics: { llm_calls: 0, tool_calls: 0, tokens_in: 0, tokens_out: 0 }, gate: { in_flight: 0, limit: 4, queue_depth: 0, backoff_active: false },
  llmByRole: {}, llmByModel: {}, terminal: {},
  report: null, replanCount: 0, planOutline: [],
  selected: null, inspectorOpen: false, drawerOpen: false, settingsOpen: false, reportOpen: false,
  followId: null, toast: null, offline: false, demoMode: true,
  replayIdx: 0, replayPlaying: true, notePulse: 0,
  appMode: 'office',
  swarmSize: 20,
  swarmPhaseTick: 0,
  swarm: {
    phase: '', round: 0, topic: '', moderatorId: '',
    agents: {}, ideas: {}, ideaOrder: [], clusters: {}, clusterOrder: [],
    critiques: [], votes: [], tally: null, speakingId: null, synthesis: null,
  },
  triage: null,
  departments: {},
  pendingPermissions: [],
  profile: 'assist',
  sandboxMode: 'native',
  contextStages: {},
  fileEdits: {},
  checkpoint: null,
  settings: { shadows: 'med', post: true, lodDist: 26, sound: true, reducedMotion: false, concurrency: 4, pricePerM: 0.6, showPaidCost: false },
  set: (p) => set(p),
  resetRun: (goal) => set({
    goal, agents: {}, order: [], tasks: {}, edges: [], notes: [], log: [], runEvents: [],
    metrics: { llm_calls: 0, tool_calls: 0, tokens_in: 0, tokens_out: 0 },
    gate: { in_flight: 0, limit: 4, queue_depth: 0, backoff_active: false },
    llmByRole: {}, llmByModel: {}, terminal: {}, report: null, replanCount: 0,
    planOutline: [], selected: null, inspectorOpen: false, followId: null,
    triage: null, departments: {}, pendingPermissions: [], contextStages: {}, fileEdits: {}, checkpoint: null,
    simClock: '09:00', realElapsed: 0, effortLogical: 0, replayIdx: 0, replayPlaying: true, mode: 'live',
    swarm: {
      phase: '', round: 0, topic: '', moderatorId: '',
      agents: {}, ideas: {}, ideaOrder: [], clusters: {}, clusterOrder: [],
      critiques: [], votes: [], tally: null, speakingId: null, synthesis: null,
    },
  }),
}));

export const pushLog = (e: Envelope, text: string) => {
  const s = useStore.getState();
  const log = [...s.log, { id: ++logId, ts_sim: e.ts_sim, type: e.type, text, agentId: e.agent_id, taskId: e.task_id }];
  useStore.setState({ log: log.length > 600 ? log.slice(log.length - 600) : log });
};
