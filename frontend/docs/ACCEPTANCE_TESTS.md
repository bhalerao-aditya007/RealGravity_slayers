# Acceptance tests

✅ = automated and passing today · 🟡 = frontend half automated, needs the real Bridge · ⬜ = needs the real Bridge/RealGravity.
Run: `npm run check` (frontend, 25 tests) · `cd bridge && python -m pytest -q` (gateway, 16 tests).

## Integration (B-series, from the original plan)
| ID | Test | Status | How / where |
|---|---|---|---|
| B1 | `POST /api/tasks` → the recorded tape replays identically in Replay mode | ⬜ | needs real tape + frontend `ReplayEngine` (backlog #1). Tapes: `npm run tape:record` |
| B2 | One engineering worker does a real edit; Inspector Live tab shows the exact line ranges from `audit.jsonl` | 🟡 | UI renders `file.edit` (✅ integration test); Bridge must tail audit |
| B3 | strict profile: edit → `permission.requested`; approving in the UI unblocks the agent ≤ 1 s | 🟡 | UI + WS round-trip ✅ (`live-contract.test.ts`); needs plugin hook (**D4**) |
| B4 | injected 429 → `gate.state.backoff_active=true` → agents visibly wait → run completes without `run.error` | 🟡 | Gateway fault-injection ✅ (`test_429_*`); needs the wired Bridge |
| B5 | context stage 3 → energy ≤ 25 → coffee break on the next compaction | ⬜ | `BRIDGE_SPEC §7` |
| B6 | WS drop + reconnect resumes with zero duplicate/missing seq | ✅ server side (`live-contract.test.ts`) · ⬜ real Bridge | the real Bridge must pass the same test |
| B7 | `result.final` carries measured `effort_logical_s` (Σ worker active time) vs `effort_real_s` | ⬜ | |
| B8 | Report/Inspector Merge & Discard actually merge/delete `agent/<ts>` | 🟡 | buttons + `run.control` ✅; git actions ⬜ |

## Triage-layer tests (T-series)
| ID | Test | Status |
|---|---|---|
| T1 | "Summarize this README" → `task.triaged{text_gen,light}`, **zero** `worker.hired` except the manager, **zero** break/chat events; manager types at her desk | ✅ `triage.test.ts`, `integration.test.ts` |
| T2 | "Build a full-stack dashboard" → 4 departments in 4 distinct wings; others "Vacant wing" | ✅ tape/registry · 🟡 vacant-wing look (visual) |
| T3 | Sprint wall-clock ≤ 2× the LLM call time; no break events in the tape (assert on the tape) | ✅ tape part · ⬜ timing |
| T4 | Heavy run at 50 % DAG → lunch for teams > 2; standard run → none | ✅ `triage.test.ts` |
| T5 | Changing the company color mid-run re-tints active departments (shirts/carpet/signage) | 🟡 code path done (`departments.ts` subscribes to accent) · visual unverified |
| T6 | Groq-backed workers show an 8k context meter; manager shows 128k | ✅ mock tape carries per-model `context_max` · ⬜ real |
| T7 | Provider quota exhaustion → traffic shifts to other providers; workers visibly re-route; no `run.error` | ⬜ (Gateway chain ✅ tested) |

## Gateway tests (G-series, `bridge/tests/gateway`)
G1 token-bucket pacing · G2 safety margin · G3 priority order · G4 aging/no starvation · G5 TPM window · G6 breaker open/half-open/close · G7 429 + Retry-After absorbed · G8 429 backoff + AIMD · G9 5xx retry→fallback · G10 context error → next model · G11 auth → provider dead, key never echoed · G12 over-context never routed to 8k model · G13 `ContextTooLong` when nothing fits · G14 `GatewayBusy` + retry_after · **G15 load: 50 concurrent @ 20 rpm → 0 provider 429s, concurrency ≤ cap, ≈ 167 s** · G16 estimator learns. All ✅.

## Safety (S-series, RealGravity's existing `scripts/escape-tests.sh` S1-S9 must still pass untouched)
Plus Bridge-specific: no key in any event/log/tape (grep the tape for `sk-`, `gsk_`, `nvapi-`, `Bearer `); privacy gate 403 for unlisted paths (both `D:\x` and `/mnt/d/x` forms); cancel leaves no orphan process and no locked worktree; `turbo` refused on a dirty tree.

## Definition of done
Heavy demo run end-to-end on a scratch repo, twice in a row, on free keys only; B1-B8, T1-T7, G1-G16 green; S1-S9 green; no secret in any artefact; the office never shows a break/chat that the tape cannot justify.
