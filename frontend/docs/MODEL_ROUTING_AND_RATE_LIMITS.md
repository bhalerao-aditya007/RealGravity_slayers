# Model Routing, Provider Gateway & Rate-Limit Handling

**Problem:** many agents + free tiers = 429s, stalls and wasted runs. **Answer:** every LLM call from every component passes through
ONE local choke point — the **Provider Gateway** — which owns queueing, rate limiting, retries, fallback and accounting.
Nothing else in the system talks to a model provider directly.

> Honesty rule (for the hackathon pitch too): the gateway does **not** bypass or "multiply" any provider limit. It keeps usage *inside*
> the limits, spends them on the most valuable calls first, and degrades gracefully when they run out.

---

## 1. Architecture: the Gateway is an OpenAI-compatible local proxy

```
 Manager / Lead / LLM-worker calls ──┐
                                      ├──►  GATEWAY  127.0.0.1:8787/v1/chat/completions   (+ /v1/messages for Anthropic-protocol models)
 RealGravity sessions (opencode run) ─┘     ├─ router      alias → ordered model chain
   provider "bridge", baseURL=gateway       ├─ limiter     per-(provider,key) RPM + TPM + daily/window budgets
   apiKey = "bridge:<agent_id>"             ├─ queue       priority queue, global + per-provider concurrency
                                            ├─ resilience  Retry-After, backoff+jitter, circuit breaker, fallback
                                            ├─ accounting  tokens in/out, latency, per agent/role/provider
                                            └─ events      llm.call_started/finished, gate.state  → Event Bus → UI
                                                   │
                      groq · openrouter · nvidia · opencode-go  (real keys live ONLY here, from .env)
```
Why a proxy rather than a library: RealGravity's agent loop makes **dozens of calls per task and retries on its own**. Pointing its
provider `baseURL` at the gateway puts those calls under the *same* limiter as the manager's calls. This **replaces** the nginx `llmproxy`
of Docker mode (which only has a blunt 30 req/min `limit_req` — a 503 from it would be surfaced to the agent as a failure). In Docker mode run the gateway on the host and set `HTTP(S)_PROXY`/`NO_PROXY` so the container reaches it; keep nginx out of the path or set its limit above the gateway's.

* The Bridge writes a per-worker OpenCode config whose only provider is `bridge` with **role aliases as model ids**: `bridge/manager`, `bridge/lead`, `bridge/code`, `bridge/fast`, `bridge/text`. Swapping a real model, adding a fallback, or changing provider needs **no change to RealGravity config** — only `config/models.yaml`.
* The agent id rides in the bearer token (`bridge:<agent_id>`) → the gateway attributes every call to an office worker → correct `llm.call_started{agent_id}`, per-worker token counts, context-% → **energy**.
* **Streaming is mandatory.** OpenCode streams (SSE). The gateway must pass SSE through unbuffered. Retrying is only possible **before the first byte**; after that, an upstream failure is returned to the caller as an error (OpenCode retries by making a *new* request, which re-enters the gateway). Never switch model mid-stream.
* The gateway must also expose **`GET /v1/models`** (aliases + contexts) so OpenCode can validate config.

---

## 2. Roles → models (all free / open-weight; verify ids on build day)

Model ids below come from the owner's RealGravity docs (`reference/realgravity/`). Free tiers and catalogues change: the gateway ships
`scripts/verify-models` that lists each provider's `/models` and fails loudly on an unknown id. **Never hard-code a model id outside `models.yaml`.**

| Alias | Role | Primary | Fallback chain | Context | Why |
|---|---|---|---|---|---|
| `triage` | task classifier (1 tiny call) | `groq/openai/gpt-oss-20b` | `openrouter/nvidia/nemotron-3.5-lightning:free` → heuristic only | 8k | goal text is tiny; lowest latency |
| `manager` | planner + final synthesis (**best general model**) | `openrouter/google/gemma-4-31b-it:free` | `nvidia/llama-3.1-nemotron-70b-instruct` → `openrouter/qwen/qwen3.8-27b:free` → `go/deepseek-v4-pro` | 128k | must hold plan + all lead summaries; **context, not IQ, is her bottleneck** |
| `manager_escalation` | hard replans / synthesis bursts only | `groq/openai/gpt-oss-120b` | `openrouter/qwen/qwen3.8-27b:free` | 8k | strongest thinker, but 8k → compress the problem to < 6k tokens first |
| `lead` | department decompose + review | `openrouter/qwen/qwen3.8-27b:free` | `nvidia/deepseek-ai/deepseek-v4.1-flash` → `go/deepseek-v4-flash` | 128k | needs repo-wide view; short prompts |
| `code` | RealGravity code sessions | `nvidia/deepseek-ai/deepseek-v4.1-flash` | `openrouter/qwen/qwen3.8-27b:free` → `go/deepseek-v4-flash` → `nvidia/mistralai/codestral-22b-instruct-v0.1` | 128k | high throughput; spreads load off OpenRouter's daily cap |
| `fast` | short-context edits, UI components, sprint text | `groq/openai/gpt-oss-20b` | `openrouter/google/gemma-4-31b-it:free` | 8k | instant latency = sprint feel |
| `research` | reasoning over search results | `openrouter/google/gemma-4-31b-it:free` | `nvidia/llama-3.1-nemotron-70b-instruct` | 128k | |
| `qa` | data / QA / eval instruction-following | `openrouter/nvidia/nemotron-3.5-lightning:free` | `nvidia/deepseek-ai/deepseek-v4.1-flash` | 128k | exactly what harness runs need |
| `text` | content / docs writer | `go/glm-5.3-flash` | `openrouter/cohere/north-mini-code:free` → `openrouter/google/gemma-4-31b-it:free` | 128k | volume fallback |

Hard rules:
1. **Groq models have 8k context.** They may only serve roles whose full prompt is provably < 80 % of 8k (`triage`, `fast`, `manager_escalation` with a compressed problem). Never give Groq a repo map, a DAG, or a synthesis draft. The gateway **refuses to route an over-budget prompt to an 8k model** and advances the chain instead.
2. OpenCode's per-model `limit.context` in the generated config must equal the **effective** window (e.g. 8000 for Groq aliases) so its own compaction triggers correctly.
3. Do not use non-open models or any provider mode that trains on prompts. DeepSeek zero-retention on OpenCode Go was stated valid to **2026-10-31** — the privacy gate prints a warning after that date.
4. Load-balance *workers*, not the manager: round-robin worker calls across the `code`/`text` chains so one team cannot drain a single free tier by mid-morning.

---

## 3. Context budgeting (prevents the other kind of error: 400 "context too long")
`gateway/estimator.py`: `tokens ≈ ceil(chars/3.5)` (same estimator RealGravity's `quota.py` uses); replace with the provider's `usage` once a response arrives (learn a per-model chars/token ratio).
* Admit a request only if `prompt_tokens + max_tokens ≤ 0.85 × context`.
* Over budget → (a) route to a larger-context model in the chain; else (b) ask the caller to compress (manager/lead calls pass a `compress()` callback that map-reduces); else (c) fail that call with a clear `run.error` — never truncate silently.
* **Energy for the UI** = `round(100·(1 − tokens_in_context/context_window))`; stage S0-S3 at 0.40 / 0.60 / 0.75 (RealGravity's own thresholds).

---

## 4. The limiter, queue and resilience — precise behaviour

### 4.1 Buckets
Limits are configured per **provider-key** and, where the provider enforces them that way, per **model**. Every request must acquire *all* applicable buckets:
```yaml
# config/providers.yaml  — NUMBERS BELOW ARE PLACEHOLDERS. They are NOT verified provider limits.
# Calibrate with `scripts/calibrate-limits` (§9) and by reading x-ratelimit-* headers at runtime.
groq:        { base_url: https://api.groq.com/openai/v1,   key_env: GROQ_API_KEY,       rpm: 25, tpm: 5000,  concurrency: 2, scope: per_model }
openrouter:  { base_url: https://openrouter.ai/api/v1,     key_env: OPENROUTER_API_KEY, rpm: 15, daily: 40,  concurrency: 2, scope: per_key,  free_suffix: ":free" }
nvidia:      { base_url: https://integrate.api.nvidia.com/v1, key_env: NVIDIA_API_KEY,  rpm: 30, credits: 1000, concurrency: 3, scope: per_key }
go:          { base_url: https://opencode.ai/zen/go/v1,    key_env: GO_API_KEY,         rpm: 30, window_usd: {five_hour: null, weekly: null}, concurrency: 3, scope: per_key }
global:      { max_concurrency: 4, queue_max: 200, max_wait_s: 180 }
```
(`30 req/min` is the only figure present in the owner's docs — it is the old nginx limit; the others are conservative guesses to start low.)
Implementation: **token bucket** (capacity = rpm, refill rpm/60 per second) + **sliding-window TPM counter** + **semaphore** per provider and one global semaphore. Use `asyncio` primitives; no external service.

### 4.2 Priority queue (what gets served first when there is not enough quota)
```
priority 0  manager / lead calls          (small, on the critical path — a stalled manager stalls everyone)
priority 1  retries of previously started calls (don't waste work already paid for)
priority 2  validators, triage
priority 3  worker calls, ordered shortest-job-first (est. tokens), then FIFO
priority 4  speculative / prefetch (never used by default)
```
Aging: a request waiting > 60 s gains one priority level per 30 s so workers are never starved. A code session's calls inherit the session's priority; sessions are admitted by the scheduler, not by the gateway (see §6).

### 4.3 Error handling matrix
| upstream result | gateway action | what the caller sees |
|---|---|---|
| **429** with `Retry-After` | pause *that bucket* for that duration (+ jitter 0-20 %), requeue at priority 1 | request just takes longer |
| **429** no header | exponential backoff 2 s, 4 s, 8 s … cap 60 s, ±25 % jitter; halve the bucket's rate for 60 s (AIMD) | longer |
| **5xx / timeout / connection reset** | retry ×2 same model (backoff), then next model in chain | longer or different model |
| **400 context too long** | do **not** retry; route to a larger-context model, else error | clear error |
| **401/403** | open the circuit for that provider for the whole run; `run.error{recoverable:true}` naming the env var (never the key) | fallback model |
| **model not found** | mark the model dead for the run, next in chain | transparent |
| **tool-call malformed** (OpenCode failure ladder) | caller-driven: same provider other model → other protocol → drop model | |
| **stream breaks after first byte** | surface error to caller (it re-requests) | OpenCode retries |
| **queue wait > `max_wait_s`** | return **429 + Retry-After** to the caller (OpenCode/our code backs off) and emit `run.error{recoverable:true}` | graceful |

**Circuit breaker** per model: open after 5 failures in 60 s, half-open probe after 30 s. **AIMD** per bucket: on success +1 %/ok toward the configured rate; on 429 ×0.5.
**Learning from headers:** if a response carries `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`, `x-ratelimit-reset-*`, `retry-after`, overwrite the configured numbers for that bucket (log the change). The placeholder numbers above only matter until the first response.

### 4.4 Events the gateway emits (this *is* the "Compute & Cost" drawer's data)
* `llm.call_started {call_id, agent_id, model, role}` when a request is **dispatched upstream** (not when queued) — so the server-room LEDs show real in-flight calls.
* `llm.call_finished {call_id, tokens_in, tokens_out, latency_ms}` with **provider-reported usage** when present.
* `gate.state {in_flight, limit, queue_depth, backoff_active}` on every change, throttled to ≤ 4/s. `limit` = effective global concurrency now; `backoff_active` = any bucket currently paused by a 429.
* Optional extras (UI ignores today, ready for Compute drawer v2): `by_provider:{groq:{rpm_used,rpm_limit,paused_until}, …}`.

---

## 5. Budget planning (never discover exhaustion mid-run)
`gateway/budget.py` keeps a live `remaining` per provider (daily count, credits, windows). Triage calls it with the estimated calls from `TRIAGE_AND_PLANNING §2.2`:
```
time_needed ≈ calls_needed / min(effective_rpm, concurrency / avg_latency_s·60)
feasible    = calls_needed ≤ 0.8·remaining  AND  time_needed ≤ time_budget (default 30 min standard, 4 h heavy)
```
Not feasible → degrade **in this order**, stopping at the first that fits, and tell the user in `task.triaged.rationale`:
1. serialise code sessions (1 at a time) · 2. fewer workers / merge adjacent nodes · 3. move non-critical roles to the cheapest model · 4. shrink validation to deterministic checks only · 5. **ask the user** (`run.error{recoverable:true, message:"needs ~N calls, ~M available — continue reduced?"}`).

## 6. Admission control for RealGravity sessions
A code session = 25-60 calls over minutes, so *sessions*, not calls, are the unit the scheduler admits:
`max_code_sessions = floor(effective_rpm / (calls_per_min_per_session ≈ 6))`, clamped to `[1, memory_cap]` where `memory_cap` = Native ≈ 6 (≈ 80-110 MB each), Docker ≈ 3 (2 GB each). At 30 rpm that is **≈ 5 sessions max**; at 15 rpm, **2**. Everything beyond waits in the scheduler as a real, visible `WAITING`.

---

## 7. Playbooks when you have only ONE provider / ONE key
Everything above still applies; what changes is the chains and the numbers. Distinct *models* on one provider often **share one rate limit per key** (`scope: per_key`), so set one bucket for the provider, `max_concurrency` 1-2, and expect long queues. The office pacing is real: workers genuinely wait.

| Only have… | manager | lead | code / text workers | triage / fast | Caveats |
|---|---|---|---|---|---|
| **OpenRouter** (`:free`) | `gemma-4-31b-it:free` | `qwen3.8-27b:free` | `qwen3.8-27b:free` (code), `nemotron-3.5-lightning:free` (qa), `north-mini-code:free` (text, 32k) | `nemotron-3.5-lightning:free` | tightest **daily** request cap → budget pre-check is essential; usually restrict to `standard`, 1 code session |
| **Groq** | `gpt-oss-120b` | `qwen3.8-27b` | `gpt-oss-20b` | `gpt-oss-20b` | **everything 8k**: manager sees only ≤ 400-token compressed worker reports; RealGravity tiers must be set to the 8k cap; refuse tasks needing repo-wide context (offer a smaller scope) |
| **NVIDIA NIM** | `llama-3.1-nemotron-70b-instruct` | `deepseek-v4.1-flash` | `deepseek-v4.1-flash` / `codestral-22b` | `deepseek-v4.1-flash` | finite free **credits** — track `credits` in the budget; stop at 10 % and ask |
| **OpenCode Go** | `deepseek-v4-pro` (escalate `glm-5.2`) | `deepseek-v4-flash` | `deepseek-v4-flash` / `glm-5.3-flash` | `glm-5.3-flash` | limits are **dollar windows** (5-hour & weekly) not RPM; DeepSeek peak hours (01-04, 06-10 UTC weekdays) cost 2× → schedule `heavy` runs off-peak; free models stay usable when the window is exhausted |

Single-key rules of thumb: manager/lead calls first (§4.2); at most 1-2 workers *running LLM calls* at any moment even if 6 are "hired"; prefer deterministic workers (search/script/validate); sprint-class tasks are essentially unaffected (1-3 calls).

---

## 8. How waiting looks in the office (so the UI never lies)
* Request queued → the owner's `task.assigned` is already emitted, `task.started` is **not** → worker sits at desk `ASSIGNED`/`WAITING` (reason `LLM gate`), `gate.state.queue_depth > 0`, server-room LEDs idle/amber.
* Dispatched → `llm.call_started` → "thinking" pose + LED activity. 429 → `backoff_active:true` → LEDs red, queue grows, nobody errors.
* **No fake coffee breaks while waiting.** A break fires only from a real trigger (`BRIDGE_SPEC §7`). Waiting is shown as waiting.

## 9. Calibrate and test (acceptance **B4** and friends)
* `scripts/calibrate-limits`: per provider, ramp requests 1→N rpm with a 5-token prompt until the first 429; record `Retry-After`/`x-ratelimit-*`; write `config/providers.local.yaml` (gitignored). Run once per key, again if behaviour changes.
* **Unit:** token bucket exactness (fake clock), priority + aging, breaker transitions, chain advance on each error class, estimator ratio learning, over-context routing.
* **Fault injection:** a fake upstream (`tests/fake_provider.py`) that returns scripted 429/5xx/slow/stream-cut → assert no caller-visible error, bounded latency, correct events.
* **Load:** 50 concurrent requests, rpm = 20 → assert `max in-flight ≤ limit`, zero upstream 429s after warm-up, total time ≈ `50/20 min`.
* **B4:** inject a 429 mid-run → `gate.state.backoff_active=true` → agents visibly wait → run completes without `run.error`.
