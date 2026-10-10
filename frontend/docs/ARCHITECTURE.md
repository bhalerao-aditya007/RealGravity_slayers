# Architecture — how the pieces fit

## 1. The idea in one picture
```
 YOU type one task
      │
      ▼
┌─────────────────────────────  DESKMATES OFFICE (frontend, DONE)  ─────────────────────────────┐
│ React + three.js + zustand.  A PURE RENDERER of an event stream: nothing moves unless an event  │
│ says so.  Landing (task, profile, model) → 3D office → Inspector, Permission Desk, DAG, report.  │
└───────────────▲──────────────────────────────────────────────────────────┬───────────────────┘
   events (WS)  │  contract v3 (docs/api-contract.md)                       │ REST + WS control messages
┌───────────────┴──────────────────────  BRIDGE SERVER (to build)  ─────────▼───────────────────┐
│ 1 TRIAGE   classify (code? text? research?) → size (complexity C) → intensity → break policy    │
│ 2 ORG      departments (frontend / backend / research / data / qa / content) + leads + workers  │
│ 3 PLAN     manager LLM → validated task DAG;  leads expand their branch                          │
│ 4 SCHEDULE DAG resolver · assignment score · admission control · failure ladder                  │
│ 5 WORKERS  search · llm · script · validate (no agent)        code → RealGravity session         │
│ 6 REVIEW   validators → lead review → manager synthesis → git merge → result.final              │
│ + EventBus/Tape · Privacy gate · Permission relay · Break/energy derivation                      │
└───────────────┬──────────────────────────────────────────────────────────┬───────────────────┘
                │ every LLM call                                            │ headless sessions
                ▼                                                           ▼
┌──────────────────────────  PROVIDER GATEWAY (core DONE: bridge/)  ─────┐   ┌────────  RealGravity (UNTOUCHED)  ────────┐
│ OpenAI-compatible local proxy 127.0.0.1:8787/v1                          │◄──┤ opencode run, provider "bridge",          │
│ router · limiter · priority queue · 429/5xx/ctx handling · fallback ·   │   │ plugins, permissions, context tiers,      │
│ breaker · budget · accounting → llm.call_*, gate.state                   │   │ audit.jsonl, git branch, walkthrough.md   │
└──────────────┬──────────────────────────────────────────────────────────┘   └───────────────────────────────────────────┘
               ▼
   groq · openrouter · nvidia · opencode-go (+ optional extra providers, local Ollama)   ← keys live ONLY here
```

## 2. Who does what (and why)
| Layer | Responsibility | Status |
|---|---|---|
| Office UI | render events; user controls (task, profile, permission answers, merge/discard, speed) | **done & tested** |
| Mock bridge | executable spec of the contract; lets UI + Bridge be developed independently | **done & tested** |
| Bridge | the *company*: triage, org, plan, schedule, aggregate, derive human moments from real signals | **specified** (`BRIDGE_SPEC.md`) |
| Gateway | the *only* path to any model; keeps usage inside limits; emits compute events | **core done & tested (16 tests)**; HTTP/SSE layer to build |
| RealGravity | an excellent single-agent coding worker with safety, context discipline, rollback | **existing, untouched** |

**Only code workers use RealGravity.** Manager/leads are single-shot structured calls; research/data/QA/content are mostly deterministic code. That is why a 15-person office costs ~100 LLM calls, not ~1000.

## 3. Mapping of the owner's ideas to the design
| Idea | Where it lives |
|---|---|
| A triage layer that checks what kind of task it is | `TRIAGE_AND_PLANNING §1-2` → `task.triaged` (shown as the "Manager's call" banner) |
| Separate leads: frontend / backend / text-generation… each with their own workers | dynamic departments (`§3` of that doc); bays are slots, departments are tenants |
| Simple fast work: no breaks, workers just finish; very heavy project: breaks, coffee, lunch | `intensity → break_policy` (`§2.1`); sprint tape contains **zero** break events — enforced by tests |
| Manager works alone for tiny text tasks | `text_gen`+`light` → `departments:[]`, manager types at her own desk |
| Different models for different leads; manager = the best free model | `MODEL_ROUTING §2` role→model table + fallback chains |
| Coffee/lunch/chat must mean something | `BRIDGE_SPEC §7`: coffee = real context compaction, chat = real hand-off, energy = real context fraction |
| Click an employee → live status (progress, energy, context, engine) | Inspector (done) fed by `agent.metrics`, `task.progress`, `file.edit` |
| RealGravity gets a GUI (permissions, diffs, rollback) | Permission Desk, Inspector Live tab, Merge/Discard (frontend done; Bridge relay specified) |
| One API/account hits the per-minute limit | Gateway (`MODEL_ROUTING`): limiter, queue, backoff, fallback, budget pre-check, **more providers** (`00_START_HERE A1`) |

## 4. Ports & processes (local only)
| Process | Port | Notes |
|---|---|---|
| Vite dev server (UI) | 5173 | `npm run dev` |
| Bridge (REST + `/ws/events`) | 8000 | `VITE_API_URL` points here; `npm run bridge:mock` is the stand-in |
| Gateway (`/v1/chat/completions`) | 8787 | mounted in the Bridge process or separate; bound to 127.0.0.1 |
| RealGravity sessions | – | child processes of the Bridge, one worktree each |
| Search backend | – | SearXNG (RealGravity docker) or the `ddgs` python lib as a keyless fallback |

## 5. Data flow of one heavy run (worked example, placeholder limits)
Goal: *"Compare the top 3 open-weight coding models and build a tiny CLI that benchmarks one"*.
1. Triage → `hybrid`, C≈56 → **heavy / workday**, departments research · data · backend · content (4 wings), 6 workers.
2. Budget pre-check: calls ≈ triage 1 + manager 2 + leads 8 + llm workers ~8 + **2 code sessions × ~40 = 80** ≈ **~100 calls**.
   With the *placeholder* limits (OpenRouter 15 rpm / 40 per day) an OpenRouter-only setup is **infeasible** (100 > 0.8·40) → the Bridge degrades the plan *before* starting (1 code session, merged nodes, cheaper roles) or asks the owner. With NVIDIA (≈27 rpm effective) carrying the code sessions and OpenRouter carrying manager/leads, it fits (~5-8 min of API time) — this is the concrete reason for getting several providers.
3. Office: manager at her desk; 10 people walk in from reception over ~25 s; DAG on the whiteboard.
4. Research workers: search + one summarising call each; data worker runs the benchmark script; backend lead expands "implement CLI" → 2 code workers, each in its own git worktree through the Gateway.
5. Real events: file edits tail from `audit.jsonl`; a compaction in one session → that worker walks to the pantry (a real break); the research→backend hand-off → a real chat + blackboard note; strict profile → Permission Desk.
6. Validators (pytest, citations) → lead reviews → manager synthesises → branches merged → `result.final` with measured effort.
7. Everyone walks out; Merge/Discard decide the fate of branch `agent/<ts>`.

## 6. Failure containment
Provider 429/5xx/context errors never reach the UI as errors (Gateway). A dead session restarts once, then the task is reassigned. A broken plan is repaired once, then replaced by a template. Quota exhaustion is predicted before the run, not discovered during it. The UI shows only what really happened — if something fails, it shows `FAILED`, not a fake success.
