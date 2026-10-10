# What was changed relative to GLM's delivery — and why

GLM produced the frontend in two passes (original + "Triage Layer" change-set). Reading it against the code it modified, and then **running** it
(it had never been run), found real defects. Principle followed: **keep GLM's design and code; change only what was broken**, each change minimal and listed here.
Everything below is covered by the 25 frontend tests unless marked *visual*.

## A. The delivery would not have started
| # | Defect | Fix |
|---|---|---|
| F6 | **The startup layout validator (written by GLM) failed with 71 errors on GLM's own layout → the app throws "Layout validation failed" on first load.** Causes: desk/chair footprints overlapped 5.5 cm over the 5 cm tolerance; seat approach points lay inside each chair's own inflated collision box; coffee machine / fridge / cooler stood *inside* one long counter; lounge sofas were declared with width/depth swapped (seats inside the sofa; the "along z" mesh branch also drew the backrest in the middle) | `layout.ts`: chair offset 0.62→0.66, approach 1.35→1.6 (lead 1.5→1.9); pantry counter split in two, coffee machine **raised onto** the short counter (`furnitureDefs`), validator exempts that one pair; sofas redefined `2.2×0.95`, approaches moved to the open side. Validator now reports 0 errors |
| F1 | `AgentSchema.department` was `z.enum([research,engineering,data,content])` — every dynamic department (`backend`, `frontend`, `qa`…) failed validation, so **every `worker.hired` would have been dropped** | `z.string().nullable()` |
| F2 | v3 deleted `agentDef()` but `events.ts` still imported it | `defFromHire()` builds the definition from the event (`chairId` if present, else nearest free workstation to `desk`) — the real-backend path |
| F3 | v3 simulator never hired the manager, so the "manager works solo" sprint path referenced an agent that did not exist | manager hired first, seated instantly (she is already at her desk) |

## B. Wrong behaviour (found by the new end-to-end tests)
| # | Defect | Fix |
|---|---|---|
| F4 | triage matched substrings: `ui` inside `b-ui-ld` → **every "build …" task became full-stack** | word-boundary matching (+ tests) |
| F5 | several departments preferred the same wing (backend+research → NW) → two leads on one chair, workers on the same desks | unique wing per department (`allocateBays`) |
| F14 | pantry overflow agents all walked to **one point** and piled into the fridge | 12 distinct queue spots |
| F15 | the 4 "front" plants in each bay stood on the line agents walk to leave the bay; agents jammed into them | moved beside row 0 |
| F16 | separation / agent-vs-agent pushes could shove an agent into furniture | pushes into blocked cells are vetoed |
| F17 | **no wall sliding**: a step into a blocked cell was undone wholesale, so an agent clipping a waypoint corner stayed pinned to the obstacle forever | axis-separated sliding in `moveToward` |
| F18 | the coffee cup was never put down → agents walked at 0.5 m/s for the rest of the day | `carry=false` when the slot ends / break ends |
| F13d | chair slide direction was inverted (chair slid *into* the desk while the agent stepped out) | sign fixed in `Chairs.tsx` |
| F21 | **monitor screens faced away from the person at the desk** (and from the default camera) | screen moved to the user-facing side |
| F12 | chat speech bubbles were never armed | `line` armed on chat start |
| F9 | validation stamps read a window global that exists only in the workspace (stamps at the origin on the landing page) | read owner from the store |
| F8 | the 5-second clock tick set the clock to `''` (blank toolbar clock) | real HH:MM |
| F10 | server-rack LEDs never received their instance matrices (all at the origin) | applied |
| F11 | Blueprint toggle changed only the floor texture, never the furniture materials | `setBlueprint()` wired |
| F20 | whiteboard plan texture never attached (+ z-fighting) | attached, offset |
| F7 | `goldenRunEvents()` busy-waited ~4 real minutes | `MockSimulator.drain()` |
| F19 | `client.ts` could not be pointed at a server under vitest/node | also reads `process.env` (browser unchanged) |

## C. Integration of the Triage Layer (GLM's change-set, applied with the fixes above)
Dynamic departments registry (`state/departments.ts`, wing = slot, department = tenant; wing materials, chairs and carpet follow the tenant; live re-tint on accent change; vacant wings dimmed), `TriageBanner`, `PermissionPanel` (+ director cabin wait/resume), Landing profile picker + live triage preview, Toolbar badges, Inspector Live v2 (context stage, structured file edits, terminal, checkpoint Merge/Discard), model roster replaced by the **RealGravity mesh** (real context windows, Groq 8k), `LiveEngine` control channel (`permission.respond`, `run.control`).
The simulator was rewritten in full (GLM shipped an abbreviated skeleton): policy-guarded breaks/chats/lunch, failure → reassignment (workday), validation failure → rework, meeting-room review, 429 backoff moment, permission request on the first code worker, `file.edit`, `run.checkpoint`, context stages, hand-off blackboard notes, everyone released at the end. Breaks are long (~100 s) because the pantry is ~60 m from the bays — walking is real.

## D. Additions that did not exist
Contract server `tools/mock-bridge` · tape recorder · layout exporter (`docs/layout-slots.json`) · integration + live-contract tests (headless physics on real tapes; real HTTP/WS) · Gateway core + 16 tests · full documentation set · hierarchy clothing (manager suit/tie, lead lanyard & deeper shade, workers department color) · **laptops on every desk** · glass-panel lead offices · switched-on screens.

## E. Honest limits — read this
* **No browser was available while building, so nothing here has been *looked at*.** Verified by tests: layout, navigation, physics, state, contract, TypeScript, production build. **Not verified:** the rendered look (lighting, shadows, materials, animation feel, UI CSS), 60 fps, PDF export, Blueprint view, fonts. Expect to tune visuals in the first `npm run dev` session.
* The people are **procedural low-poly 3D figures** (capsules/spheres, walk/sit/type/drink/talk animations driven by math) — *not* 2D sprites and *not* motion-captured. They read as friendly stylised characters, not realistic humans.
* Hierarchy is visible by clothing (manager suit + tie, lead lanyard + deeper shirt) and furniture (manager glass cabin; lead semi-enclosed glass desk; workers' open desks). **Leads do not have fully walled offices** — only the manager does. Meeting rooms exist for reviews.
* Monitor screens are a static "switched-on" blue (no per-desk animated content).
* The Bridge (everything between the UI and RealGravity) is **not built**; only the Gateway core is. `ReplayEngine` for real past runs, Compute drawer v2, `triage.override` UI: see `00_START_HERE.md` backlog.
* Provider limit numbers in `bridge/config/providers.yaml` are **placeholders**; model ids must be verified on the day.
