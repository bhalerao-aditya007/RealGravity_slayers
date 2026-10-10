# START HERE — handoff to the integrating engineer (Antigravity / Claude Opus)

**Mission:** connect the finished Deskmates office UI to RealGravity through a new **Bridge Server**, so that typing one task makes a
manager triage it, hire the right team, run it on RealGravity + free open-weight models, and show every real action in the 3D office —
without hitting per-minute rate limits.

You are given: a **verified frontend** (`src/`), a **contract-compliant mock backend** (`tools/mock-bridge`) that is the executable spec, a full
**specification set** (`docs/`), config templates + a **tested Gateway core** (`bridge/`), and the owner's RealGravity docs (`reference/realgravity/`).
You must build the rest of the Bridge. Read in this order: this file → `ARCHITECTURE.md` → `api-contract.md` → `BRIDGE_SPEC.md` → `TRIAGE_AND_PLANNING.md` → `MODEL_ROUTING_AND_RATE_LIMITS.md` → `REALGRAVITY_INTEGRATION.md` → `ACCEPTANCE_TESTS.md`.

---
## ⚑ A. Open items for the OWNER — ask them these before/while you build
These cannot be decided by code. **Stop and ask the owner for each one that is still open.**

### A1. API keys (this answers "do we need more APIs to avoid the per-minute limit?" — yes, more *providers*)
Rate limits are enforced **per account/key per provider**. One provider = one bucket = a bottleneck for a 6-worker run. The cure is **several independent providers**, each with its own free tier (that is exactly what RealGravity's mesh is for).

| Priority | Provider (free, open-weight models) | Needed for | Get key at |
|---|---|---|---|
| **Required (≥ 1)** | any one of the four below | the system runs, but only light/standard tasks comfortably | – |
| **Strongly recommended** | **OpenRouter** (`:free` models) | manager (Gemma 4 31B), leads, text | openrouter.ai/keys |
| | **NVIDIA NIM** | code workers, fallback manager (limited free credits) | build.nvidia.com |
| | **Groq** | triage, fast short-context roles (8k ctx) | console.groq.com/keys |
| | **OpenCode Go** | volume fallback, DeepSeek/GLM | opencode.ai/v2/docs/console/go |
| Optional (more buckets, verify free-tier terms yourself) | **Google AI Studio** (Gemma) · **Mistral** free tier · **Cerebras** free tier | extra headroom / more fallbacks | their consoles |
| Optional (no limit at all) | **Ollama local model** (e.g. Qwen 7B) | last-resort fallback for triage/text, offline demos | ollama.com |

**Target for a heavy demo: 3-4 providers → 3-4 independent buckets.** Put them in `bridge/.env` (`chmod 600`, git-ignored). **Never paste keys into chat, commits, issues or logs.**

> ⚠ **Do NOT create several accounts on the *same* provider (or extra keys on one account) to multiply a limit.** Extra keys on one account normally share the same limit, and
> farming accounts to dodge limits generally violates provider terms and can get all of them banned. Use **more providers** instead. The gateway *does* support a per-provider key pool
> (`providers.yaml: keys:[…]`) for legitimate cases only (e.g. a teammate's own account used with their consent, or separate paid projects) — default is one key per provider.

### A2. Decisions / information to collect
1. **Which keys do you have now?** (names only) → decides which single-provider playbook applies (`MODEL_ROUTING §7`).
2. **Runtime mode:** Native (recommended, ~80 MB/worker) or Docker? Machine RAM/CPU? (caps parallel code sessions: ≈ 6 native, ≈ 3 docker).
3. **Target project path(s)** to work on → add to `hosted-allowed.txt` (the privacy gate). Windows (`D:\…`) and WSL (`/mnt/d/…`) forms both.
4. **Permission Desk in v1?** Depends on discovery D4. If it can't work, ship v1 with `assist` + pre-approved commands and add it later (frontend already supports it).
5. **Deadline / demo format** (live vs recorded tape) → scales the build order and how much to polish.
6. **License:** `LICENSE` is MIT; switch to Apache-2.0 if the hackathon prefers (one file).
7. **Who is the "real" RealGravity maintainer** for questions about plugin hook shapes (`plugins/audit`, `plugins/context`)?

---
## B. Verified state of what you received (re-run to confirm)
```bash
npm install
npm run check          # tsc --noEmit  +  vitest  →  25 tests, 6 files, all green
npm run build          # production build OK
npm run bridge:mock    # contract server on :8000
npm run dev            # office UI on :5173 (mock mode); VITE_USE_MOCK=false → talks to :8000
```
| Verified automatically | How |
|---|---|
| Layout valid (no overlaps, every seat reachable, aisles ≥ 1.2 m) | `layout.test.ts` — **the app refuses to start otherwise** |
| A* never routes through obstacles; all zones reachable | `nav.test.ts` |
| 24 agents random-walk 60 s: zero collisions | `stress.test.ts` |
| tape → zod → reducer → physics for **sprint / standard / heavy** runs: no clipping, no overlap, everyone ends at own desk, 4 distinct wings, permission wait/resume | `integration.test.ts` |
| triage classes, unique bays, sprint = manager-only and zero break events, every event validates | `triage.test.ts` |
| **Frontend live path ⇄ contract server** over real HTTP/WS: triage → org → permission round-trip → report; WS resume has no gaps/dupes | `live-contract.test.ts` |

**NOT verified — no browser in the build sandbox:** how the WebGL scene *looks* (lighting, materials, animation feel, UI CSS/layout, 60 fps, PDF export, Blueprint view, fonts).
**First action: `npm run dev`, open http://localhost:5173, watch the heavy demo and report/fix anything visually wrong.** Details of every bug already fixed: `CHANGES_AND_FIXES.md`.

## C. Build plan (do in order; each phase ends with its acceptance test)
| Phase | Build | Done when |
|---|---|---|
| 0 | Run section B. Run **Step 0 discovery** (`REALGRAVITY_INTEGRATION §2`, D1-D8) → `bridge/DISCOVERIES.md`. Eyeball the UI. | all D answered; UI looks right |
| 1 | `bridge/` skeleton: config loader, `events.py` (EventBus + SQLite tape + resume), `schemas.py` (pydantic mirror), REST/WS exactly like `tools/mock-bridge/server.ts`. Serve a **recorded tape** (`tapes/heavy.json`). | `live-contract.test.ts` passes with `VITE_API_URL` → your Bridge; B6 |
| 2 | **Gateway** (`bridge/deskmates_bridge/gateway/` — core provided & tested; add FastAPI proxy + SSE streaming + providers + header learning). Point *nothing* else at providers. | `pytest bridge/tests/gateway` green; B4 fault-injection; real streaming call works |
| 3 | **One real code worker**: launch one headless RealGravity session in a worktree through the Gateway; tail `audit.jsonl`; map events. | **B2** (exact line ranges in Inspector) |
| 4 | Permission relay via the plugin (or the D4 fallback). | **B3** (approve ≤ 1 s) |
| 5 | Triage (heuristic port → scoring → LLM confirm) + budget pre-check + org + desks. | T1, T2, T4; unit tests ported from `triage.test.ts` |
| 6 | Planner (manager DAG + validator + repair + templates) and leads (expand/review). | planner unit tests; B1 |
| 7 | Scheduler (DAG resolver, assignment score, admission control, failure ladder) + worker kinds (search/llm/script/validate) + git worktree merge. | full heavy run end-to-end on a scratch repo; B7, B8 |
| 8 | Break/energy/chat derivation (`BRIDGE_SPEC §7`) — real triggers only. | **B5**, T3, T4 |
| 9 | Hardening: key redaction, cancel/cleanup, Windows process-tree kill, limit calibration, quota exhaustion path. | **T7**, S-style safety checks, 30-min soak |
| 10 | Frontend backlog (below), tape recording as the new golden run, polish. | demo script passes twice in a row |

### Frontend backlog (small, specified, not done)
1. **Replay of a real past run** (B1): a `ReplayEngine` that loads `GET /api/runs` + `/api/runs/{id}/events` and plays by `ts_real` deltas (reuse `MockEngine.seek` logic). Today Replay only works on the in-browser mock.
2. **Compute drawer v2**: free-tier quota gauges per provider from the optional `gate.state.by_provider`, cached-prefix share, per-provider breakdown.
3. `triage.override` UI (user veto of departments/intensity) — contract specified, no UI.
4. Context-stage badge next to names on 3D labels; "session panes" (terminal/audit/diff) toggle; model shorthand chips (`fast`, `coder`, `120b`, `nvidia`).
5. Merge/Discard buttons also in the Report view (today: Inspector Live tab).
6. Bundle size (one 1.7 MB chunk) — code-split three/jspdf if load time matters.

## D. Non-negotiable rules
1. The contract is additive-only. Change `docs/api-contract.md`, `src/api/types.ts`, the pydantic mirror **and** the tests together.
2. **Never invent progress, breaks or chats.** Sprint runs emit none. A break needs a real trigger (`BRIDGE_SPEC §7`).
3. Every LLM call goes through the Gateway. Workers never hold real keys. Keys never appear in events/logs/tapes/worktrees.
4. Do not edit RealGravity internals, `profiles/*`, or `AGENTS.global.md`. One new plugin only.
5. If you touch `src/config/layout.ts`, run `npm run test` — the validator guards the "no overlap / no clipping" promise.
6. Be honest in the UI and the pitch: the Gateway keeps usage *within* provider limits; it does not bypass them.
7. Anything marked **VERIFY** in the docs is an assumption — verify it, then record the answer in `bridge/DISCOVERIES.md`.

## E. If you get stuck
* Event not showing in the UI → open the browser console: invalid events are logged as `dropped invalid event` with the zod reason.
* Agent not appearing → was `task.triaged` + manager `worker.hired` emitted first? Is `desk` a real seat from `layout-slots.json`?
* Agent frozen in the cabin → an unanswered `permission.requested`.
* Walk looks wrong → `npm run dev`, press `D` (dev overlay: agents / walking / seated / stuck repaths).
* Contract doubts → `tools/mock-bridge/server.ts` is the reference; diff your output with `tapes/*.json`.
