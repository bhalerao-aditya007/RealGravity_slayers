import { describe, it, expect } from 'vitest';
import { triage } from '@/mock/triage';
import { MockSimulator } from '@/mock/simulator';
import { parseEvent } from '@/api/types';

const tapeFor = (goal: string) => {
  const sim = new MockSimulator(goal);
  const tape: any[] = [];
  sim.drain((e) => tape.push(e));
  return tape;
};

describe('triage heuristic', () => {
  it('classifies text_gen as light/solo with zero breaks', () => {
    const t = triage('Summarize this repo README in one paragraph');
    expect(t.task_class).toBe('text_gen');
    expect(t.intensity).toBe('light');
    expect(t.est_workers).toBe(0);
    expect(t.departments).toEqual([]);
    expect(t.break_policy).toEqual({ coffee: 'never', meals: false, chats: 'never', pace: 'sprint' });
  });
  it('classifies fullstack as heavy with 4 departments and meals', () => {
    const t = triage('Build a website dashboard with a React frontend and a backend API server');
    expect(t.task_class).toBe('code_fullstack');
    expect(t.intensity).toBe('heavy');
    expect(t.departments.map((d) => d.id)).toEqual(['backend', 'frontend', 'qa', 'content']);
    expect(t.break_policy.meals).toBe(true);
  });
  it('standard runs never allow meals', () => {
    const t = triage('Add dark mode to the dashboard UI');
    expect(t.intensity).toBe('standard');
    expect(t.break_policy.meals).toBe(false);
    expect(t.break_policy.coffee).toBe('on_compaction');
  });
  it('every non-light run has >=1 department with a bay', () => {
    for (const goal of ['Fix this bug in the API', 'Research solid-state batteries and compare',
      'Build a CLI tool that benchmarks a model', 'Refactor the database schema']) {
      const t = triage(goal);
      if (t.intensity !== 'light') expect(t.departments.length).toBeGreaterThan(0);
      for (const d of t.departments) expect(['NW', 'NE', 'SW', 'SE']).toContain(d.bay);
    }
  });
  it('FIX: "build" no longer matches "ui" (word-boundary matching)', () => {
    expect(triage('Build a REST API with auth and tests').task_class).toBe('code_backend');
    expect(triage('Compare the top 3 open-weight coding models and build a tiny CLI that benchmarks one').task_class).toBe('hybrid');
  });
  it('FIX: every department of a run gets its own wing', () => {
    for (const goal of ['Compare the top 3 open-weight coding models and build a tiny CLI that benchmarks one',
      'Build a website dashboard with a React frontend and a backend API server']) {
      const bays = triage(goal).departments.map((d) => d.bay);
      expect(new Set(bays).size).toBe(bays.length);
    }
  });
});

describe('simulator tapes', () => {
  it('sprint tape: manager only, no hires of others, no break/chat events', () => {
    const tape = tapeFor('Summarize this repo README in one paragraph');
    const hired = tape.filter((e) => e.type === 'worker.hired');
    expect(hired.map((e) => e.agent_id)).toEqual(['M0']);
    expect(tape.some((e) => e.type.startsWith('agent.break'))).toBe(false);
    expect(tape.some((e) => e.type === 'agent.chat')).toBe(false);
    expect(tape.some((e) => e.type === 'task.triaged')).toBe(true);
    expect(tape[tape.length - 1]?.type).toBe('result.final');
  });
  it('standard tape: no lunch, coffee only via compaction policy', () => {
    const tape = tapeFor('Add dark mode to the dashboard');
    expect(tape.filter((e) => e.type === 'agent.break_start' && e.payload.kind === 'lunch')).toHaveLength(0);
  });
  it('heavy tape: lunch + coffee + chat + reassignment + validation failure all present', () => {
    const tape = tapeFor('Compare the top 3 open-weight coding models and build a tiny CLI that benchmarks one');
    const types = new Set(tape.map((e) => e.type));
    for (const t of ['agent.break_start', 'agent.chat', 'task.reassigned', 'validation.failed', 'task.rework',
      'permission.requested', 'file.edit', 'run.checkpoint', 'context.stage_changed', 'blackboard.note'])
      expect(types.has(t), t).toBe(true);
    expect(tape.some((e) => e.type === 'agent.break_start' && e.payload.kind === 'lunch')).toBe(true);
  });
  it('seq is monotonic and every event validates against the zod contract', () => {
    for (const goal of ['Summarize this repo README in one paragraph', 'Add dark mode to the dashboard',
      'Compare the top 3 open-weight coding models and build a tiny CLI that benchmarks one']) {
      const tape = tapeFor(goal);
      tape.forEach((e, i) => {
        if (i > 0) expect(e.seq).toBeGreaterThan(tape[i - 1].seq);
        expect(parseEvent(e), `${e.type} failed schema`).not.toBeNull();
      });
    }
  });
});
