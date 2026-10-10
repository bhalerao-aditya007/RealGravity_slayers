# Deskmates

> Hand one manager a task. Watch a whole team sit down, argue, grab coffee, and ship it.

A gamified **3D virtual office** that visualises a hierarchical multi-agent AI system **in real time**. The office is a *pure renderer*: nothing moves
unless a real event says so. It is designed to sit on top of **RealGravity** (a free, open-weight, single-agent coding runtime) through a **Bridge Server**,
so every walk, break, hand-off and file edit you see really happened.

```
user task ─► triage (what kind? how big?) ─► the right team is hired ─► work runs on RealGravity + free open-weight models ─► report
                                                  every step is a live event in the office
```

## Run it (mock mode — works today, no keys)
```bash
npm install
npm run dev            # http://localhost:5173  — pick a task chip and press "Open the office"
npm run check          # tsc + 25 tests (layout, navigation, physics, triage, live contract)
npm run build          # production build
```
Try the three behaviours from the Landing chips: *"Summarize this repo README…"* (manager works **alone**, no breaks) ·
*"Add dark mode to the dashboard"* (small team, coffee on context compaction) · *"Compare the top 3 open-weight coding models and build a tiny CLI…"* (full team, **a whole workday**: coffee, lunch, review meetings, reassignment).

### Against a (mock) backend over real HTTP/WebSocket
```bash
npm run bridge:mock                         # contract server on :8000 (the executable spec for the real Bridge)
echo "VITE_USE_MOCK=false" > .env.local     # then:  npm run dev
```
`npm run tape:record` → `tapes/*.json` · `npm run layout:export` → `docs/layout-slots.json` · `cd bridge && python -m pytest -q` → 16 gateway tests.

## What is in the office
* **People:** procedural low-poly **3D** characters (not 2D sprites) with walk / sit / type / think / drink / eat / talk / celebrate animations, A\* pathfinding, door queues, wall sliding, collision-free (tested). Unique hair/skin; **dress by rank**: workers wear their department's color, **leads** a deeper shade + lanyard & ID badge, the **manager** a charcoal suit with a brand-colored tie.
* **Work areas:** four department wings with **laptop** workstations (+ monitor, lamp, mug, nameplate); each lead sits in a **semi-enclosed glass office** at the head of the wing; the **manager has a glass-walled cabin** (executive desk, visitor chairs, plan whiteboard, meeting table). Plus reception, three meeting rooms, pantry/coffee area and cafeteria **far from the desks** (walking is real), lounge, server room that blinks with real LLM calls.
* **Click anyone** → Inspector (status, task + progress, energy, context, engine, outputs, live terminal/diff, follow camera). Left panel: org chart · task DAG · blackboard. Bottom: event log + replay scrubber. Right: Compute & Cost. Permission Desk for approvals. Company-color picker re-tints everything live; day/night; Blueprint view; minimap; keyboard: `Space` pause · `F` follow · `G` flows · `B` blueprint · `D` dev overlay · `Esc` close.
* Honest limits (no fully walled offices for leads, stylised not realistic motion, visuals not yet eyeballed): `docs/CHANGES_AND_FIXES.md §E`.

## Documentation (read in this order)
| File | What |
|---|---|
| `docs/00_START_HERE.md` | **Handoff**: what the owner must provide (API keys!), verified state, phased build plan, rules |
| `docs/ARCHITECTURE.md` | the whole system, idea→design mapping, worked example |
| `docs/api-contract.md` | REST + WebSocket + 36 event types (v3) |
| `docs/BRIDGE_SPEC.md` | the Bridge Server to build |
| `docs/TRIAGE_AND_PLANNING.md` | classification, complexity score, decomposition, delegation, aggregation |
| `docs/MODEL_ROUTING_AND_RATE_LIMITS.md` | role→model table, the Provider Gateway, rate-limit handling, single-key playbooks |
| `docs/REALGRAVITY_INTEGRATION.md` | using RealGravity as a black-box worker; discovery checklist; plugin |
| `docs/ACCEPTANCE_TESTS.md` | B/T/G/S test matrix with status |
| `docs/CHANGES_AND_FIXES.md` | every defect found in the original delivery and how it was fixed |
| `docs/layout-slots.json` | desk coordinates for the Bridge |
| `reference/realgravity/` | the owner's RealGravity documents (unmodified) |

## Layout of the repo
`src/` frontend (config/ nav/ sim/ three/ ui/ state/ api/ mock/ tests/) · `tools/mock-bridge/` contract server · `scripts/` tape + layout export · `bridge/` Gateway core + config templates · `docs/` · `tapes/` recorded runs.

## Name
The project is called **Deskmates** everywhere in code and docs (human, short, says what it is). Renaming is a find-and-replace of the string plus the `<title>` in `index.html`.

## License
MIT — see `LICENSE` (`docs/LICENSES.md` for dependencies and models).
