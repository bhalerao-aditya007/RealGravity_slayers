import { describe, it, expect, vi, afterAll, beforeAll } from 'vitest';
import { WebSocket as WS } from 'ws';
import { createServer } from '../../tools/mock-bridge/server';

// Frontend LIVE path (LiveEngine + HttpStream + zod + reducer) against the contract server over real HTTP/WS.
let bridge: Awaited<ReturnType<typeof createServer>>;
beforeAll(async () => { bridge = await createServer(0); });
afterAll(() => bridge?.close());

const until = async (cond: () => boolean, ms: number, label: string) => {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error(`timeout waiting for: ${label}`); await new Promise((r) => setTimeout(r, 50)); }
};
const post = (path: string, body: unknown) => fetch(`http://localhost:${bridge.port}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

describe('contract server (REST)', () => {
  it('health, models, config', async () => {
    const h = await fetch(`http://localhost:${bridge.port}/api/health`).then((r) => r.json());
    expect(h.status).toBe('ok');
    const models = await fetch(`http://localhost:${bridge.port}/api/models`).then((r) => r.json());
    expect(models.length).toBeGreaterThan(5);
    expect(models[0]).toHaveProperty('context_tokens');
  });
  it('POST /api/tasks validates goal', async () => {
    const r = await fetch(`http://localhost:${bridge.port}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(r.status).toBe(422);
  });
});

describe('contract server (WebSocket resume, B6)', () => {
  it('reconnecting with since_seq yields zero duplicate and zero missing events', async () => {
    const { run_id } = await post('/api/tasks', { goal: 'Summarize this repo README in one paragraph' });
    const got: number[] = [];
    const ws1 = new WS(`ws://localhost:${bridge.port}/ws/events?run_id=${run_id}&since_seq=0`);
    ws1.on('message', (m) => { const e = JSON.parse(String(m)); if (e.seq) got.push(e.seq); });
    await until(() => got.length >= 4, 8000, 'first 4 events');
    ws1.close();
    const last = got[got.length - 1];
    await new Promise((r) => setTimeout(r, 1500)); // events keep being produced while the client is away
    const ws2 = new WS(`ws://localhost:${bridge.port}/ws/events?run_id=${run_id}&since_seq=${last}`);
    ws2.on('message', (m) => { const e = JSON.parse(String(m)); if (e.seq) got.push(e.seq); });
    await until(() => got.length >= 12 || got.includes(15), 12000, 'resumed events');
    ws2.close();
    const sorted = [...got];
    expect(new Set(sorted).size).toBe(sorted.length);                   // no duplicates
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]).toBe(sorted[i - 1] + 1); // no gaps
  }, 30000);
});

describe('frontend LiveEngine <-> contract server', () => {
  it('runs a heavy task end to end, round-trips a permission, delivers the report', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCK', 'false');
    vi.stubEnv('VITE_API_URL', `http://localhost:${bridge.port}`);
    const { engine } = await import('@/state/engine');
    const { useStore } = await import('@/state/store');
    const goal = 'Compare the top 3 open-weight coding models and build a tiny CLI that benchmarks one';
    await engine.start(goal);
    await until(() => useStore.getState().runEvents.length > 3, 8000, 'first events over WebSocket');
    engine.setSpeed(60); // advisory pacing message
    await until(() => !!useStore.getState().triage, 8000, 'task.triaged');
    expect(useStore.getState().triage?.task_class).toBe('hybrid');
    expect(Object.keys(useStore.getState().departments).length).toBe(4);
    await until(() => useStore.getState().pendingPermissions.length > 0, 20000, 'permission.requested');
    const req = useStore.getState().pendingPermissions[0];
    engine.respondPermission(req.request_id, 'once');          // client -> server over the WS
    await until(() => useStore.getState().pendingPermissions.length === 0, 8000, 'permission.resolved round-trip');
    await until(() => !!useStore.getState().report, 30000, 'result.final');
    expect(useStore.getState().checkpoint?.branch).toMatch(/^agent\//);
    expect(useStore.getState().runEvents.length).toBeGreaterThan(200);
    engine.stop();
    vi.unstubAllEnvs();
  }, 90000);
});
