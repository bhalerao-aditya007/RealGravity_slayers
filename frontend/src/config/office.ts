export const OFFICE_W = 96;
export const OFFICE_D = 70;
export const HALF_W = OFFICE_W / 2;
export const HALF_D = OFFICE_D / 2;
export const WALL_H = 3;
export const NAV_CELL = 0.25;
export const AGENT_R = 0.3;
export const WALK_SPEED = 1.4;
export const CARRY_SPEED = 0.5;
export const ACCEL = 3.0;
export const TURN_RATE = Math.PI * 2; // rad/s
export const MAX_AGENTS = 40;
export const SIM_RATE = 30; // sim seconds per real second (animation clock)
export const DAY_START_MIN = 9 * 60;

// ── Departments: dynamic per-run (Triage v3) ──────────────────
// Dept is now a run-scoped string id (e.g. 'backend', 'frontend', 'research').
// The static four-dept map is kept ONLY as a fallback for legacy tapes/demo.
export type Dept = string;
export const DEPTS: Dept[] = ['research', 'engineering', 'data', 'content'];
export const DEPT_NAME: Record<string, string> = {
  research: 'Research', engineering: 'Engineering', data: 'Data', content: 'Content',
};
export const DEPT_HUE_OFF: Record<string, number> = {
  research: 58, engineering: 150, data: 205, content: 262,
};
// Standard presets the bridge/mock can instantiate (see mock/triage.ts).
export const BAY_ORDER = ['NW', 'NE', 'SW', 'SE'] as const;
export type Bay = (typeof BAY_ORDER)[number];

export const TriageTaskClasses = [
  'code_fullstack', 'code_frontend', 'code_backend', 'code_engine',
  'text_gen', 'research', 'data_analysis', 'hybrid',
] as const;
export type TaskClass = (typeof TriageTaskClasses)[number];
export type Intensity = 'light' | 'standard' | 'heavy';
export type BreakPolicy = {
  coffee: 'never' | 'on_compaction' | 'on_stage2';
  meals: boolean;
  chats: 'never' | 'on_handoff';
  pace: 'sprint' | 'normal' | 'workday';
};

export const STATUS_COLORS: Record<string, string> = {
  IDLE: '#8a8a8f', ASSIGNED: '#c9a227', WORKING: '#2f9e6e', WAITING: '#e0a13a',
  REVIEW: '#7c5cd6', BREAK: '#4a8fbf', COMPLETE: '#2B2B2E', FAILED: '#d64545', OFFLINE: '#b9b3aa',
};
export const TASK_STATUS_COLORS: Record<string, string> = {
  pending: '#b9b3aa', ready: '#c9a227', running: '#2f9e6e', waiting: '#e0a13a',
  review: '#7c5cd6', done: '#2B2B2E', failed: '#d64545',
};

export const DEFAULT_ACCENT = '#E4572E';
