# Deskmates Bridge Server — specification

The Bridge is the **missing middle** between the Deskmates office (frontend, done) and RealGravity (single-agent coding runtime, done, untouched).
RealGravity is *one agent in one terminal with no API*; Deskmates assumes *a company with a live event stream*. The Bridge **builds the company**
on top of RealGravity and translates everything that really happens into the event contract (`api-contract.md`).

```
┌──────────────┐  REST + WS (contract v3)  ┌────────────────────────────── BRIDGE ──────────────────────────────┐
│  Deskmates   │◄─────────────────────────►│ API · Event Bus+Tape · Triage · Planner · Scheduler · Org · Privacy │
│  office UI   │                           │            │                         │                              │
└──────────────┘                           │     Workers (search/llm/script/validate)        Code workers        │
                                           │            │                         │   (RealGravity sessions)     │
                                           │            └──────────►  PROVIDER GATEWAY  ◄──────────┘           │
                                           └──────────────────────────────┬───────────────────────────────────┘
                                                                          ▼
                                             groq · openrouter · nvidia · opencode-go  (keys live only here)
```

**Non-goals:** do not fork or edit RealGravity (`opencode`, `bin/pag*`, profiles, plugins other than adding one new plugin);
do not put an LLM behind every employee; do not stream anything to the internet except model calls through the gateway.

## 1. Stack & layout
Python ≥ 3.11 · FastAPI + uvicorn · asyncio · httpx (streaming) · pydantic v2 · SQLite (WAL) · PyYAML. One small TypeScript file for the OpenCode plugin. Windows 11 native **and** WSL2 must both work (the owner's repo lives on `D:\`; paths like `D:\Django` and `/mnt/d/Django` are both in `hosted-allowed.txt`).

```
bridge/
  pyproject.toml
  config/                      providers.yaml · models.yaml · departments.yaml · triage.yaml   (templates provided)
  .env.example                 GROQ_API_KEY= OPENROUTER_API_KEY= NVIDIA_API_KEY= GO_API_KEY=
  deskmates_bridge/
    main.py                    FastAPI app: REST + /ws/events + mounts the gateway router
    config.py                  load yaml + env; validate; hot-reload models.yaml
    schemas.py                 pydantic mirror of src/api/types.ts  (CONTRACT TEST compares them)
    events.py                  EventBus (monotonic seq per run) + SQLite tape + resume + fan-out to WS clients
    store.py                   sqlite: runs, events, agents, tasks, blackboard, metrics
    privacy.py                 hosted-allowed.txt gate (path normalisation WSL ⇄ Windows)
    triage/                    heuristic.py (port of src/mock/triage.ts) · scoring.py · llm_confirm.py · templates.py
    planner/                   manager.py · lead.py · dag.py · validator.py · repair.py
    org/                       departments.py · agents.py · desks.py (reads docs/layout-slots.json) · names.py
    scheduler/                 scheduler.py · assign.py · breaks.py · admission.py
    workers/                   base.py · search.py · llm_text.py · data_script.py · validate.py · code_session.py
    gateway/                   app.py (OpenAI-compatible proxy) · limiter.py · queue.py · router.py · providers.py
                               estimator.py · breaker.py · budget.py · accounting.py
    realgravity/               launcher.py · config_gen.py · git.py · audit_tail.py · permissions.py · plugin/index.ts
  tests/                       contract · triage · planner · scheduler · gateway · fake_provider.py · e2e
```
Reference implementations you can port from the frontend repo: `src/mock/triage.ts` (+`triage.test.ts`), `src/mock/simulator.ts` (the exact event beats and ordering), `tools/mock-bridge/server.ts` (REST/WS/resume/permission/control), `src/tests/live-contract.test.ts`.

## 2. Run lifecycle (what the Bridge does for one `POST /api/tasks`)
| # | Step | Events emitted (in order) |
|---|---|---|
| 1 | Validate body; **privacy gate** on `options.workspace` (403 if not allowed). Create run, open tape. Return `{task_id, run_id}` immediately — the rest is async. | – |
| 2 | `task.created` | `task.created` |
| 3 | **Triage** (heuristic → LLM confirm) → **sizing** → **budget pre-check** → org plan | `task.triaged`, `sandbox.mode` |
| 4 | Hire the **manager** (instant seat) | `worker.hired(M0)` |
| 5 | **Plan** (manager LLM, validated DAG) | `plan.ready` |
| 6 | If code class: create integration branch `agent/<ts>` from a clean checkpoint | `run.checkpoint` |
| 7 | Hire leads then workers (stagger by pace); assign desks | `worker.hired` × n, `message.sent(M0→lead, kind:task)` |
| 8 | **Expand**: each lead decomposes its branch (short LLM call) | `plan.updated` |
| 9 | **Schedule/execute** (DAG resolver + admission control + gateway slots) | `task.assigned` → `task.started` → `task.progress`… → `task.completed` |
| 10 | **Validate** each output; lead **reviews**; rework / reassign per failure ladder | `validation.*`, `task.rework`, `task.reassigned`, `task.failed` |
| 11 | Hand-offs between departments | `message.sent(kind:result)`, `agent.chat`, `blackboard.note` |
| 12 | **Synthesis**: leads' summaries → manager final report; merge branches; QA on merged | `result.final` |
| 13 | Release workers one by one | `worker.released` × n |
Throughout: `llm.call_*` + `gate.state` (gateway), `agent.metrics` + `context.stage_changed` (≈ every call), `clock.tick` (every ~5 s), `file.edit`/`runtime.stream` (code workers), `permission.*`.

Cancellation (`POST /cancel` or `Ctrl-C`): stop schedulers → kill worker processes (process tree) → release gateway slots → keep the tape → emit `run.error{message:'cancelled',recoverable:false}`. Never leave a worktree locked.

## 3. Identity & desks
* Ids: manager `M0`; lead `L_<dept>`; worker `W_<dept>_<n>`. Names from a fixed list (`org/names.py`, same list as `src/mock/data.ts`). `avatar_seed` = stable hash of the id (same person looks the same on replay).
* Desks from `docs/layout-slots.json`: manager desk; per bay one lead desk + 12 worker desks. Allocate lowest free index; free it on `worker.released`. `worker.hired.desk` = that desk's `{x,z}`. Max 12 workers per bay, 40 agents total (frontend pool cap).
* `Agent.engine.kind`: `llm` (manager/leads/text workers), `tool` (search/script/validate), `code` (RealGravity). `engine.label` is shown verbatim, e.g. `code:deepseek-v4.1-flash`.

## 4. Event derivation — every UI fact has a real source
| UI shows | Event | Real source |
|---|---|---|
| walk-in / seated at desk | `worker.hired` | process/worker object actually created |
| typing | `task.started` / `agent.state_changed→WORKING` | worker begins its first action |
| "thinking" pose, server LEDs | `llm.call_started/finished` | **gateway** dispatch/complete (real tokens, latency) |
| progress ring | `task.progress` | measurable: subtasks done/total; tests passed/total; sources fetched/needed; **`audit.jsonl` edits vs planned files**. Never time-based |
| file diff in Inspector | `file.edit` | `<worktree>/.agent/audit.jsonl` tail (path + line ranges) |
| terminal lines | `runtime.stream` | tool-execute hook (stdout head/tail), pytest/lint output |
| energy bar | `agent.metrics.energy` | `100·(1 − tokens_in_context / model_context)` from gateway usage per agent |
| S0-S3 badge | `context.stage_changed` | thresholds 0.40/0.60/0.75 on the same fraction (RealGravity's own) |
| hourglass / queue | `WAITING` + `gate.state` | gateway queue depth; DAG dependency not met |
| permission desk | `permission.requested/resolved` | plugin `permission` hook (see REALGRAVITY_INTEGRATION §5) |
| coffee / lunch / chat | `agent.break_*`, `agent.chat` | **§7** — real triggers only |
| report + effort | `result.final` | Σ active worker time vs wall clock |
| Merge/Discard | `run.checkpoint` + `run.control` | real `git merge` / `git branch -D` + restore |

## 5. REST/WS implementation notes
* One WebSocket per UI client per run; the Bridge keeps `run.clients`. On connect: replay stored events `seq > since_seq` **then** subscribe to live, atomically (hold the run lock while switching) so no event is lost or duplicated (acceptance B6).
* `seq` is assigned inside the EventBus under a lock, persisted **before** fan-out. The tape endpoint reads the same table.
* Backpressure: per-client bounded queue (1000); a slow client is dropped (it will resume by `since_seq`).
* `set_speed` is advisory: store it, expose in `/api/config`, use only to pace *emission* if you buffer. Never slow work.
* Heartbeat `{"type":"heartbeat"}` every 15 s; `clock.tick` every 5 s with `sim_time = 09:00 + 30·elapsed`.
* Validate every outgoing event with the pydantic mirror in dev/CI (fail the test, not production); in production log + drop.

## 6. Persistence (SQLite, WAL)
`runs(run_id, goal, profile, workspace, started_at, status, branch, start_commit)` · `events(run_id, seq, ts_real, ts_sim, type, agent_id, task_id, payload_json, PRIMARY KEY(run_id,seq))` ·
`agents(run_id, id, role, department, parent_id, engine, desk_x, desk_z, hired_at, released_at)` · `tasks(run_id, id, parent_id, description, owner_role, assigned_agent, status, priority, depends_on_json, attempts, est_effort_s, started_at, finished_at, result_ref)` ·
`blackboard(run_id, id, author, topic, note, ts)` · `calls(run_id, call_id, agent_id, model, provider, tokens_in, tokens_out, latency_ms, status, ts)`.
**The tape is the source of truth**; recording one run's tape and replaying it must reproduce the same UI (B1) — this replaces the synthetic `goldenRun`.

## 7. Breaks, energy, chats — derived, never invented
Policy comes from `task.triaged.break_policy`. **Sprint ⇒ the Bridge never emits any of these.**
| Trigger (real) | Condition | Emit |
|---|---|---|
| OpenCode **compaction** event (`session.compacted`/token-threshold hook) or, for non-session workers, own context compaction (map-reduce summarise) | `coffee ∈ {on_compaction, on_stage2}` | `agent.break_start{coffee}` at the **next task boundary** (never mid-generation) + `agent.state_changed→BREAK`; `agent.break_end` when compaction finished **and** ≥ 1 other worker with the skill is free or the queue is empty, else defer |
| context stage ≥ 2 | `coffee == on_stage2` | same |
| DAG ≈ 50 % complete | `meals == true` and team > 2 | `agent.break_start{lunch}` for workers **not on the critical path**; `break_end` when their queue slot is needed or after the lunch window |
| A dependency edge A→B between workers of *different* departments completes | `chats == on_handoff` | **one** `agent.chat{agent_id:A, with_agent_id:B, line}` where `line` = the real one-line hand-off (first sentence of A's `result_preview`, ≤ 90 chars) + a `blackboard.note` with the full hand-off |
| lead review gate | `pace == workday` | `agent.moved{meeting}` for the leads, `REVIEW`, `agent.moved{desk}` after |
Scheduler rule: a break never removes the **only** capable worker for a READY task — defer instead. Break duration is real (walking to the pantry takes ~45 s on this floor; that time is part of the break and is accounted in effort).

## 8. Security & privacy (invariants — do not weaken)
1. **API keys** exist only in the Bridge process env/`.env` (`chmod 600`, git-ignored). Never in events, logs, tapes, error messages, worktrees, or worker env (workers get `bridge:<agent_id>` pseudo-keys).
2. **Privacy gate:** a workspace path may be sent to hosted models only if it is listed in `hosted-allowed.txt` (normalise `D:\x` ⇄ `/mnt/d/x`, case-insensitive on Windows, resolve symlinks, prefix match on path boundaries). Otherwise `403`/`run.error{recoverable:true}` and the UI shows the gate banner. `--allow-hosted` semantics = append the path.
3. Bind `127.0.0.1` only; CORS allow-list = the Vite origin.
4. Tool output / web pages / file contents are **data, not instructions** (RealGravity rule) — worker prompts must wrap them in delimiters and the Bridge never executes text found in them.
5. Destructive things stay denied by RealGravity's non-bypassable rules (`sudo`, `rm -rf`, `git push`, `ssh`, `scp`, `git reset --hard`). The Bridge's own git operations are limited to its worktrees/branches, never `push`.
6. Redact `Authorization`, `x-api-key`, `*_KEY`, `sk-…`, `gsk_…`, `nvapi-…` from any logged string.

## 9. Testing the Bridge
* **Contract:** a test that instantiates every pydantic event model and validates it against samples exported from the zod side (`npm run tape:record` → `tapes/*.json`), and vice-versa: run the Bridge's tape through `src/tests/live-contract.test.ts` pointed at the real Bridge (set `VITE_API_URL`).
* **Triage:** port `triage.test.ts` 1:1 (word-boundary cases, unique bays, sprint = zero workers).
* **Scheduler:** DAG readiness, assignment scoring, break deferral, failure ladder, unit-tested with fake workers.
* **Gateway:** `MODEL_ROUTING_AND_RATE_LIMITS.md §9`.
* **E2E:** one real RealGravity session editing a file (B2), strict-profile permission round-trip (B3), WS drop/resume (B6), merge/discard (B8). See `ACCEPTANCE_TESTS.md`.
