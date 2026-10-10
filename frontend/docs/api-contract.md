# Deskmates API & Event Contract — v3

Single source of truth between the **frontend** (`src/`) and the **Bridge Server** (to be built, see `BRIDGE_SPEC.md`).
Mirrored in code by the zod schemas in `src/api/types.ts` (frontend) — the Bridge must mirror them with pydantic
(`schemas.py`) and a contract test that validates every emitted event.

* Frontend never trusts the stream: every event is zod-validated; **an invalid event is dropped with a console warning, never crashes**.
* Unknown extra payload fields are tolerated (stripped). Unknown event *types* are dropped. So the contract can grow additively.
* A tested reference implementation of this contract exists: `tools/mock-bridge/server.ts` (`npm run bridge:mock`).
  `src/tests/live-contract.test.ts` runs the real frontend live path against it. **Use it as the executable spec.**

---

## 1. Transport

| Item | Value |
|---|---|
| Base URL | `VITE_API_URL` (default `http://localhost:8000`). Frontend flag `VITE_USE_MOCK=false` selects the live path. |
| CORS | Bridge must allow the Vite dev origin (`http://localhost:5173`) for REST (`access-control-allow-origin`). |
| WebSocket | `ws://<host>/ws/events?run_id=<id>&since_seq=<n>` |
| Local-only | The Bridge binds `127.0.0.1`. No remote exposure; API keys never reach the frontend. |

### 1.1 What the frontend actually calls today
| Call | When |
|---|---|
| `GET /api/models` | app start (live mode) — fills the model dropdowns |
| `POST /api/tasks` body `{goal, model, options:{profile}}` | user presses "Open the office" |
| `WS /ws/events?run_id=&since_seq=0` | immediately after, auto-reconnect (exp. backoff 600 ms → ~19 s) resuming from last seen `seq` |
| WS client→server messages | `subscribe`, `set_speed`, `permission.respond`, `run.control` (see §3) |

Everything else in §2 is implemented in `HttpClient` but not yet used by a screen — implement it anyway (cheap, and replay/org views will use it).

### 1.2 REST

| Method | Path | Body / Query | Response |
|---|---|---|---|
| POST | `/api/tasks` | `{goal:string, model?:string, options?:{profile?:'strict'\|'assist'\|'turbo', max_workers?:number, workspace?:string}}` | `{task_id, run_id}` — **422** if `goal` missing; **403** `{error:'privacy_gate', message}` if `workspace` not in `hosted-allowed.txt` |
| GET | `/api/tasks/{id}` | — | `Task` |
| POST | `/api/tasks/{id}/cancel` | — | `{ok:true}` — must stop workers, release queue slots, emit `run.error{recoverable:false,message:'cancelled'}` |
| GET | `/api/tasks/{id}/dag` | — | `{nodes:Task[], edges:[{from,to}]}` |
| GET | `/api/tasks/{id}/result` | — | `{report_markdown, sources, artifacts, effort_logical_s, effort_real_s}` |
| GET | `/api/org` | — | `{manager, leads, workers, desks:[{id,x,z,dept}], zones}` (late joiners / replay) |
| GET | `/api/agents/{id}` , `/api/agents/{id}/outputs` | — | `Agent` / `[{task_id,ts,kind,preview,full_ref}]` |
| GET | `/api/blackboard?run_id=` , `/api/metrics?run_id=` | — | `BlackboardNote[]` / `Metrics` |
| GET | `/api/models` | — | `[{id,label,provider,context_tokens}]` — `id` is the fully-qualified `provider/model` string |
| GET / PATCH | `/api/config` | `Config` partial | `Config` |
| GET | `/api/runs` | — | `[{run_id,goal,started_at,duration_s,status}]` |
| GET | `/api/runs/{run_id}/events?since_seq=&limit=` | — | `{events:Envelope[], next_seq}` (full tape; replay + resume) |
| GET | `/api/health` | — | `{status:'ok', model_loaded:boolean, queue_depth:number}` |

---

## 2. Event envelope

```json
{ "seq": 17, "run_id": "run_ab12", "ts_real": "2026-10-04T09:00:03.120Z", "ts_sim": "09:03",
  "type": "task.started", "agent_id": "W_backend_0", "task_id": "T3", "payload": { } }
```

| Rule | Detail |
|---|---|
| `seq` | **Strictly monotonic per run, starting at 1, no gaps.** The tape (`/events`) and the WS stream must contain identical seqs. |
| `ts_sim` | `"HH:MM"` office clock. Recommended: `09:00 + real_elapsed_s × 30 s` (1 real minute = 30 sim minutes). Cosmetic only. |
| `agent_id` / `task_id` | optional top-level convenience copies; the payload is authoritative. |
| `heartbeat` | `{"type":"heartbeat"}` every 15 s (not an envelope, no seq). |
| `clock.tick` | **The backend must emit it** (~every 5 s). Only the mock engine fakes it; in live mode the toolbar clock updates only from this event. |
| Resume | On connect with `since_seq=n`, first replay every stored event with `seq>n`, then stream live. |

## 3. WebSocket client → server messages

```json
{"type":"subscribe","run_id":"run_ab12"}                                   // sent on every (re)connect
{"type":"set_speed","factor":1|10|60}                                       // ADVISORY: animation pacing only. Never slow or speed real execution.
{"type":"permission.respond","request_id":"perm_1","decision":"once|always|reject"}
{"type":"run.control","action":"merge_branch|discard_branch","branch":"agent/20261004-090000"}
{"type":"ping"}
```
`triage.override` (user veto of department set / intensity) is **specified but not yet sent by any UI**; implement server-side tolerance only.

## 4. Event types and payloads (all 36)

### Run & planning
| type | payload |
|---|---|
| `task.created` | `{goal}` |
| `task.triaged` | `{task_class, intensity, est_effort_s, est_workers, rationale, break_policy:{coffee,meals,chats,pace}, departments:[DepartmentDef]}` — **must precede every `worker.hired` except the manager's** |
| `plan.ready` / `plan.updated` | `{nodes:Task[], edges:[{from,to}], plan_meta?:{intensity,break_policy,est_effort_s}}` / `{reason, nodes, edges}` |
| `result.final` | `{report_markdown, sources:[{title,url,verified}], effort_logical_s, effort_real_s}` — opens the report view |
| `run.checkpoint` | `{branch, start_commit, summary_path?}` — enables Merge/Discard buttons |
| `run.error` | `{message, recoverable}` — shown as a toast |
| `sandbox.mode` | `{agent_id?, mode:'native'\|'docker'}` |

`task_class ∈ code_fullstack, code_frontend, code_backend, code_engine, text_gen, research, data_analysis, hybrid` · `intensity ∈ light, standard, heavy` ·
`break_policy.coffee ∈ never, on_compaction, on_stage2` · `chats ∈ never, on_handoff` · `pace ∈ sprint, normal, workday`.

`DepartmentDef = {id, name, bay:'NW'|'NE'|'SW'|'SE', hue:number, capability, lead_model, worker_model, est_workers}` — **each department must have a UNIQUE `bay`** (the building has exactly 4 wings).

### People
| type | payload |
|---|---|
| `worker.hired` | `{agent:Agent, desk:{x,z}}` — agent walks in from reception to `desk`. Manager is hired first and is **seated instantly** (already at her desk). |
| `worker.released` | `{agent_id}` — stands up, walks out through reception, disappears. |
| `agent.state_changed` | `{agent_id, from, to, reason?}` states: `IDLE ASSIGNED WORKING WAITING REVIEW BREAK COMPLETE FAILED OFFLINE` |
| `agent.metrics` | `{agent_id, energy(0-100), context_tokens, context_max, pending, done, failed}` |
| `context.stage_changed` | `{agent_id, stage(0-3), frac(0-1)}` |
| `agent.moved` | `{agent_id, purpose:'desk'\|'pantry'\|'cafeteria'\|'lounge'\|'meeting'\|'handoff'\|'exit', to?:{x,z}, eta_sim_s?}` |
| `agent.break_start` | `{agent_id, kind:'coffee'\|'breakfast'\|'lunch'\|'dinner', duration_sim_s}` — agent walks to pantry (coffee) / cafeteria (meals). Coffee returns to the desk by itself ~10 s after arrival; meals stay until `agent.break_end`. |
| `agent.chat` | `{agent_id, with_agent_id, duration_ms(5000-7000), line}` — **ONE event per chat** (it moves both agents to a chat spot, then back to their desks). |
| `agent.break_end` | `{agent_id}` — forces the agent back to its desk now. |
| `message.sent` | `{from_agent_id, to_agent_id, kind:'task'\|'result'\|'note', preview}` — envelope flies / courier walks the corridors. |
| `blackboard.note` | `{id, author_agent_id, topic, note, ts}` |

`Agent = {id, name, role:'manager'|'lead'|'worker', department:string|null, parent_id:string|null, engine:{kind:'llm'|'tool'|'code', label}, status, energy, context_tokens, context_max, current_task_id, avatar_seed:number, chairId?}`.
`department` is a run-dynamic id (matches a `DepartmentDef.id`). `chairId` is optional — if absent the frontend seats the agent at the free workstation nearest `desk`.

### Work
| type | payload |
|---|---|
| `task.assigned` | `{task_id, agent_id, from_agent_id}` |
| `task.started` / `task.progress` / `task.completed` | `{task_id, agent_id}` / `{task_id, pct, note?}` / `{task_id, result_preview}` |
| `task.failed` | `{task_id, reason, attempt, will_retry}` |
| `task.rework` / `task.reassigned` | `{task_id, reason}` / `{task_id, from_agent_id, to_agent_id}` |
| `validation.passed` / `validation.failed` | `{task_id, validator}` / `{task_id, validator, reason}` |
| `file.edit` | `{agent_id, path, line_ranges:[[start,end],…], branch?}` |
| `runtime.stream` | `{agent_id, kind:'file_edit'\|'terminal'\|'test', data:string}` |

`Task = {id, parent_id, description, owner_role, assigned_agent, status:'pending'|'ready'|'running'|'waiting'|'review'|'done'|'failed', priority, depends_on:string[], attempts, progress_pct, est_effort_s}`.

### Compute & permissions
| type | payload |
|---|---|
| `llm.call_started` / `llm.call_finished` | `{call_id, agent_id, model, role}` / `{call_id, tokens_in, tokens_out, latency_ms}` — emitted by the **Gateway** (it sees every call) |
| `gate.state` | `{in_flight, limit, queue_depth, backoff_active}` (extra fields such as `by_provider` are tolerated and ignored today) |
| `permission.requested` | `{request_id, agent_id, agent_name?, action, resource, effect, preview?}` — agent walks to the manager's cabin and waits |
| `permission.resolved` | `{request_id, decision}` — agent walks back and resumes |

## 5. Behavioural rules the renderer relies on (the Bridge MUST honour these)

1. **Order:** `task.created` → `task.triaged` → manager `worker.hired` → `plan.ready` → other `worker.hired` → work events. Any event naming an agent that was never hired is silently ignored by the UI.
2. **Desks** come from `docs/layout-slots.json` (4 bays × 12 worker desks + 1 lead desk each, plus the manager desk). Never reuse a desk for two live agents. Never exceed 12 workers per bay.
3. **One bay per department.** A solo task has `departments:[]` and **no `worker.hired` other than the manager** — that is what makes it a quiet one-person sprint.
4. **Breaks and chats are real or absent.** Emit `agent.break_start` only for a real trigger (see `BRIDGE_SPEC.md §7`) and only if `break_policy` allows it. A sprint run's tape contains zero break/chat/meal events.
5. **Never invent progress.** The UI is a pure renderer; it will happily show nothing rather than lie. `task.progress.pct` must come from a measurable (steps done / total, bytes, tests passed), never a timer.
6. **`set_speed` is advisory.** Never throttle real work; it may only pace event emission if you buffer.
7. **Coordinates** are metres, `x` east, `z` south, origin at the centre of the 96 × 70 m floor.
8. **Secrets:** no API key, token, `.env` content or absolute home path may appear in any event payload or log line.
