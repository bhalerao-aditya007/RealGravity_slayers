# Triage, Complexity, Decomposition, Delegation, Aggregation

How one sentence from the user becomes a hierarchy of work and comes back as one answer. This is the **Bridge's brain**; the
frontend only renders what these stages emit.

```
user goal ─► 1 TRIAGE ─► 2 SIZING ─► 3 ORG ─► 4 PLAN (manager) ─► 5 EXPAND (leads) ─► 6 EXECUTE (workers)
                                                                                             │
                final answer ◄─ 9 SYNTHESIS (manager) ◄─ 8 LEAD REVIEW ◄─ 7 VALIDATION ◄────┘
```

Rule of thumb that drives every choice: **an LLM call is a scarce, rate-limited resource. Use it only where reasoning adds value.**
Search, parsing, git, tests, linting, schema checks and merges are deterministic code. Manager and leads are *single-shot
structured LLM calls*, **not agent sessions**. Only code-editing workers run a RealGravity (OpenCode) agent session.

---

## 1. Triage — what kind of task is this?

Two stages, both cheap, run before anything is spawned. Emits `task.triaged`.

**Stage A — heuristic (zero cost, instant, offline).** Word-boundary keyword/structure signals. The reference implementation is
`src/mock/triage.ts` (`triage()`), covered by `src/tests/triage.test.ts`. Port it verbatim to Python as `triage/heuristic.py`; it is
also the fallback when every provider is down. **Word-boundary matching is mandatory** (the first draft matched `ui` inside `build`).

**Stage B — LLM confirm.** One call to the fastest small model (default `groq/openai/gpt-oss-20b`, 8k context is plenty). Input: the goal
(≤ 2k chars), optional repo-map summary (≤ 1k tokens), the Stage-A guess. Output: strict JSON, validated by pydantic, **one repair retry**, then fall back to Stage A:

```json
{ "task_class": "hybrid", "deliverables": 3, "signals": {"code": 5, "research": 8, "verify": 6, "ambiguity": 4, "depth": 5},
  "needs_repo": true, "departments": ["research","data","backend","content"], "rationale": "one human sentence" }
```
If A and B disagree, **B wins**; A is only the tie-breaker/fallback. The `rationale` is shown verbatim in the UI banner.

### Task classes
| class | meaning | typical departments |
|---|---|---|
| `text_gen` | summary / draft / explanation, no repo, no sources | none (manager solo) |
| `research` | web-grounded comparison / report | research, content |
| `data_analysis` | benchmarks, metrics, evals | data, content |
| `code_backend` | APIs, services, CLI, core logic | backend, qa |
| `code_frontend` | UI, components, styles | frontend, qa |
| `code_fullstack` | UI **and** server code | backend, frontend, qa, content |
| `code_engine` | single-domain engineering (algorithm, bug hunt) | backend |
| `hybrid` | ≥ 3 signals, e.g. "compare models AND build a CLI" | research, data, backend, content |

---

## 2. Sizing — how complex is it? (the measurable part)

Six signals, each scored **0-10** (Stage B supplies them; Stage A uses the class defaults in the table below):

| signal | weight | 0 | 3 | 5 | 8 |
|---|---|---|---|---|---|
| `scope` — distinct deliverables | 4.0 | – | 2 | 3 | 4+ |
| `code` — code involvement | 3.5 | none | single file | multi-file module | multi-module / full-stack (add +1 if repo-map shows > 200 files) |
| `research` — sources / entities | 3.0 | none | ≤ 3 sources | 4-10 | > 10 or multi-entity comparison |
| `verify` — tests / citation checks needed | 2.0 | none | light | tests + review | tests + determinism + citations |
| `ambiguity` — how underspecified (LLM-rated) | 1.5 | clear | – | some choices | open-ended |
| `depth` — expected critical-path length | 2.0 | 1 step | 3 | 5 | 6+ |

```
raw = 4.0·scope + 3.5·code + 3.0·research + 2.0·verify + 1.5·ambiguity + 2.0·depth        (max = 160)
C   = 100 · raw / 160                                                                    (complexity, 0-100)
```

| C | intensity | workers | est. logical effort (display only) |
|---|---|---|---|
| < 15 | `light` | 0 (manager solo) | `120 + 8·C` s |
| 15 – 44.9 | `standard` | `clamp(round(C/10), 1, 12)` | `600 + 60·C` s |
| ≥ 45 | `heavy` | `clamp(round(C/10), 1, 12)` | `3600 + 160·C` s |

**Hard overrides** (applied after the formula): `text_gen` ∧ no repo ∧ `scope ≤ 3` → `light`; ≥ 3 departments → at least `standard`; ≥ 4 departments → `heavy`;
`code_fullstack` / `hybrid` → `heavy`. Workers are split across departments by the weights in `config/departments.yaml` (each department gets 1-4; cap 12/bay, 12 total unless `options.max_workers`).

**Worked examples** (computed with the formulas above):

| goal | scope | code | res | ver | amb | depth | C | intensity | workers |
|---|---|---|---|---|---|---|---|---|---|
| "Summarize this repo README in one paragraph" | 1 | 0 | 0 | 0 | 1 | 1 | 4.7 | light | 0 — manager solo |
| "Add dark mode to the dashboard" | 3 | 5 | 0 | 3 | 3 | 3 | 28.7 | standard | 3 |
| "Build a REST API with auth and tests" | 4 | 6 | 0 | 6 | 4 | 4 | 39.4 | standard | 4 |
| "Compare top 3 open-weight coding models and build a CLI that benchmarks one" | 5 | 5 | 8 | 6 | 4 | 5 | 55.9 | heavy | 6 |
| "Build a full-stack dashboard with auth" | 8 | 8 | 2 | 6 | 5 | 6 | 60.9 | heavy | 6 |

> The frontend's own `triage()` is a **preview heuristic** with fixed per-class worker counts, so its numbers can differ from the table.
> The Bridge's `task.triaged` event is authoritative; the UI banner always says "manager confirms on launch".

### 2.1 Intensity → pacing (the "does it take breaks?" rule)
Computed once at triage and emitted in `break_policy`. The Bridge only **emits** break events when the policy allows — the frontend never decides.

| | `light` — sprint | `standard` — normal | `heavy` — workday |
|---|---|---|---|
| coffee | never | on context compaction | on compaction **or** context stage ≥ 2 |
| meals | no | no | lunch at ≈ 50 % DAG completion, teams > 2 |
| chats | never | on real handoffs | on handoffs + after-rework debriefs |
| hiring stagger | all at once | 1.4 s | 2.4 s |
| feel | quiet executive, minutes | focused morning | a full workday |

### 2.2 Budget pre-check (new, important)
Before spawning anything, estimate **LLM calls** and compare with the gateway's remaining quota (`MODEL_ROUTING_AND_RATE_LIMITS.md §5`):
```
calls ≈ manager(2 + replans) + Σ leads(2) + Σ llm_workers(2) + Σ code_workers(25-60 each) + validators
```
If `calls / effective_rpm` exceeds the time budget or the daily/5-hour window cannot cover it, **degrade the plan before starting** (fewer workers → merge nodes → serialise code sessions → cheaper models → ask the user) and say so in `rationale`. Never discover quota exhaustion halfway through a heavy run.

---

## 3. Org instantiation
From `departments[]`: one lead per department, 1-4 workers each, desks from `docs/layout-slots.json`, unique `bay` per department
(preferred bays: backend NW, frontend NE, research NW, data SW, qa SW, content SE — if a bay is taken, take the first free one; reference: `allocateBays()` in `src/mock/triage.ts`).
Emit order: `task.triaged` → manager `worker.hired` → plan → leads and workers `worker.hired`. Preset departments (≤ 6 — do **not** add more; specialise *inside* a department via the worker engine label):

| id | capability | worker engine |
|---|---|---|
| `frontend` | UI code, components, styles | `code` (RealGravity session) |
| `backend` | APIs, services, CLI, core logic | `code` |
| `research` | SearXNG-grounded gathering | `tool` (+ small LLM summariser) |
| `data` | benchmark harness, metrics | `tool` (python scripts) |
| `qa` | test runs, validation gates | `tool` (pytest/lint/typecheck) |
| `content` | synthesis, README, report | `llm` |

---

## 4. Plan — the manager decomposes (ONE structured LLM call)
Model: manager model (`models.yaml: manager`). Prompt contains: goal, triage result, department list with capabilities, repo-map summary (≤ 1.5k tokens), the node schema, and the **template for the task class** as a skeleton to adapt.

```json
{ "nodes": [ { "id":"T1", "title":"…", "description":"one actionable sentence", "department":"research",
               "worker_kind":"search|llm|script|code|validate", "depends_on":[], "est_effort_s":1800,
               "deliverable":"sources.md", "verify":"≥3 verified sources" } ],
  "edges": [ {"from":"T1","to":"T2"} ] }
```
**Never trust small-model output unchecked.** `planner/validator.py` enforces: valid JSON; ≤ 24 nodes (UI stays legible); no cycles; every `depends_on` exists; every `department` is in the triaged set; every node has a `worker_kind` allowed for its department; at least one terminal node. On failure: **one repair prompt** containing the validator's error list; on second failure: **template plan** for the task class:

| class | template (→ = dependency) |
|---|---|
| `text_gen` | `write` (manager solo) |
| `research` | `gather ×k` → `verify sources` → `synthesize` → `write` |
| `data_analysis` | `collect` → `process` → `validate` → `report` |
| `code_backend` | `design` → `implement ×k` → `tests` → `review` → `docs` |
| `code_frontend` | `design components` → `implement ×k` → `tests` → `review` |
| `code_fullstack` | `API contract` → (`backend ×k` ‖ `frontend ×k`) → `integrate` → `QA` → `docs` |
| `hybrid` | (`research ×k` ‖ `design`→`implement`) → `benchmark/evaluate` → `report` |

Emit `plan.ready` (nodes use the frontend `Task` shape; `assigned_agent` filled in step 5). The whiteboard in the manager's cabin and the DAG panel render it.
Replans (a node permanently failed, scope changed) emit `plan.updated{reason}` — the manager gets **at most 2** replans per run.

## 5. Expand — leads decompose their branch (ONE short call per lead)
Each lead receives only *its* nodes + upstream deliverable summaries (≤ 1.5k tokens) and returns worker subtasks:
`{ "subtasks":[{ "title","instructions","worker_kind","inputs":[…], "depends_on":[…], "acceptance":"…" }] }` — 1-4 workers, never more.
Same validate → repair → fallback loop. Subtasks become additional `Task` nodes (`parent_id` = the plan node) via `plan.updated`. Leads do **not** execute; they plan, assign, review.

## 6. Execute — scheduling
`scheduler/` is plain Python (no LLM). Each tick:
1. A task is **READY** when all `depends_on` are `done` (DAG resolver). A lead whose children are all blocked is `WAITING` with `reason:"Blocked by T…"`.
2. Pick the worker by `score = 0.40·skill_match + 0.25·availability + 0.20·(1−workload) + 0.10·energy + priority_bonus`.
3. Before dispatch, ask the **Gateway** for a slot (`§ MODEL_ROUTING §4`): if none, the task waits (`task.assigned` is emitted, `task.started` is not) — the office shows the worker sitting, genuinely blocked on the LLM gate.
4. Run the worker (§6.1). Emit `task.started`, real `task.progress`, `task.completed`.

### 6.1 Worker kinds (what actually runs)
| `worker_kind` | Implementation | LLM calls | RealGravity? |
|---|---|---|---|
| `search` | SearXNG query → fetch → trafilatura extract → rank | 0-1 (summarise) | no |
| `llm` | one gateway call with a role prompt (drafts, summaries, docs) | 1-3 | no |
| `script` | python/pandas/benchmark harness in the sandbox dir | 0 | no |
| `code` | **headless RealGravity session** in its own git worktree | 25-60 (agent loop) | **yes** |
| `validate` | pytest / ruff / tsc / schema check / citation check / determinism re-run | 0 | no |

### 6.2 Failure ladder (never silently hang)
`retry (≤ 2, backoff)` → `task.failed{will_retry:true}` → **reassign** to another worker in the same department (`task.reassigned`, `task.rework`) →
**lead rewrites** the subtask → **manager replans** → mark node `failed`, continue with independent branches, and finish with an **honest partial result** ("could not verify X").
Switching models on a provider error is the Gateway's job and is invisible to this ladder.

## 7. Validation (workers' output is checked before it moves up)
| output | validator (deterministic first, LLM only if needed) |
|---|---|
| code | tests pass, lint, typecheck, `git diff` stays inside the allowed paths, no test deleted/weakened |
| research | ≥ N distinct sources, each URL fetched OK (`verified`), claims carry a source id |
| data | schema/range checks, re-run determinism, row counts |
| text | length/structure checks; optional LLM rubric pass |
`validation.passed` → promote to the lead. `validation.failed` → `task.rework` (back to the worker, max 2), then the failure ladder.

## 8. Lead review (one call per lead)
Input: its workers' validated outputs (each **compressed to ≤ 400 tokens**) + the department node acceptance criteria. Output: `{ "accept": bool, "conflicts":[…], "rework":[{"subtask","reason"}], "department_summary":"≤ 600 tokens" }`.
Conflicts between workers ("A says X, B says Y") → targeted rework/verify task — this is the review loop. The lead returns **one department result**, not N worker dumps.

## 9. Synthesis and merge — how everything comes back together
```
worker outputs ─► validators ─► LEAD review ─► department_summary ─┐
                                                                    ├─► MANAGER synthesis ─► result.final
code branches ─► lead merges in dependency order ─► QA on merged ──┘
```
* **Text/research/data:** the manager receives only the department summaries (+ source ids), never raw worker output (keeps even an 8k model workable). If the sum exceeds the model budget, **map-reduce**: summarise pairs, then synthesise.
* **Code:** each code worker commits on its own branch `agent/<run>/<worker>` (git worktree). The backend/frontend lead merges branches in DAG order with `git merge --no-ff`; a conflict becomes a rework task for the owner of the later branch; `qa` runs the full suite on the merged result; the final integration branch is `agent/<ts>` (announced by `run.checkpoint`). The UI's **Merge / Discard** buttons map to `merge_branch` / `discard_branch` on that branch (merge into the start branch / delete branch + restore start commit).
* **Provenance:** every statement in `report_markdown` carries a source id or a task id; `sources[]` flags `verified`.
* `effort_logical_s` = Σ per-worker **active** wall time; `effort_real_s` = run wall time. Both are measured, never estimated, in `result.final`.
* **Escalation:** the manager may use the escalation model (`models.yaml: manager_escalation`) only for replans/hard synthesis, with the problem compressed to fit.
