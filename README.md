<!-- Animated Header with Walking AI Agents -->
<p align="center">
  <img src="assets/gravitydesk_header.svg" alt="GravityDesk Animated Header" width="100%">
</p>

<!-- Hero Banner -->
<p align="center">
  <img src="assets/gravitydesk_banner.jpg" alt="GravityDesk - Multi-Agent Software Engineering Floor" width="100%" style="border-radius: 12px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);">
</p>

<!-- Badges -->
<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/GravityDesk-v2.0_Production-7b2ff7?style=for-the-badge&logo=rocket&logoColor=white" alt="GravityDesk v2.0"></a>
  <a href="#"><img src="https://img.shields.io/badge/Three.js-WebGL_3D_Floor-000000?style=for-the-badge&logo=threedotjs&logoColor=white" alt="Three.js WebGL"></a>
  <a href="#"><img src="https://img.shields.io/badge/Dual_Engine-Office_%26_Swarm-00d4ff?style=for-the-badge" alt="Dual Engine"></a>
  <a href="#"><img src="https://img.shields.io/badge/Open_Weight-DeepSeek--R1_%7C_Groq_%7C_Qwen-34d399?style=for-the-badge&logo=huggingface&logoColor=white" alt="Open Weights"></a>
  <a href="#"><img src="https://img.shields.io/badge/License-MIT-ff7518?style=for-the-badge" alt="MIT License"></a>
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/React-18.3-61dafb?style=flat-square&logo=react" alt="React 18"></a>
  <a href="#"><img src="https://img.shields.io/badge/TypeScript-5.5-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="#"><img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js"></a>
  <a href="#"><img src="https://img.shields.io/badge/Vitest-Passing-green?style=flat-square&logo=vitest" alt="Vitest"></a>
</p>

---

### The world's first spatially-grounded, multi-agent autonomous engineering simulation where specialized AI agents plan, debate in swarms, cross-examine architectures, and deliver production-ready code inside an observable real-time 3D workspace.

---

## ⚡ Core Highlights

- **Dual-Engine Workflows:** Switch seamlessly between **Deskmates Virtual Office** (4 core specialized engineers) and **Swarm Hall** (10, 20, or 50 specialized agents at the grand conference table).
- **100% Dynamic & Zero-Hardcoding:** Every proposal, critique, and code deliverable is synthesized live from your prompt using **DeepSeek-R1** and **Groq Llama-3.3-70B**.
- **Visual Rate-Limit Backoff (Coffee Breaks):** On HTTP 429 rate limits, agents physically walk to the coffee station, drink coffee during the backoff window, and return to their seats once the cooldown expires.
- **Human-in-the-Loop Safety:** Granular permission modals for file writes, shell commands, and git commits, backed by an instant **Emergency Stop** killswitch.
- **Deep Reasoning Preservation:** Dedicated 65s timeout window to preserve full Chain-of-Thought (CoT) traces from DeepSeek-R1.

---

## 🏛️ Dual Working Modalities

### 1. Deskmates Office Mode (Collaborative Sprint Execution)
Designed for iterative feature development, bug fixing, and test-driven refactoring:
- 👩‍💼 **Diya (Lead Manager):** Goal deconstruction, DAG triage, and real-time operator chat.
- 👨‍💻 **Rohan (Backend Engineer):** High-throughput APIs, schemas, and system logic.
- 🎨 **Kabir (Frontend Engineer):** Component architecture, UI/UX, and styling.
- 🧪 **Nisha (QA & Test Architect):** Edge cases, unit testing, and acceptance verification.

### 2. Swarm Hall Mode (Massive Consensus Synthesis)
Designed for high-stakes architectural synthesis and system design:
- **Amphitheater Seating:** 10, 20, or 50 specialized agents seated inward around the central oval conference table.
- **Specialized Roles:** Security Auditors, Distributed Systems Architects, Latency Profilers, and Protocol Engineers.
- **Production Code Output:** Multi-file codebases generated directly into `output/<ProjectSlug>_Swarm/`.

---

## 🔄 The 6-Phase Swarm Consensus Protocol

```mermaid
flowchart LR
    A[Phase 1<br/>Framing] --> B[Phase 2<br/>Divergence]
    B --> C[Phase 3<br/>Clustering]
    C --> D[Phase 4<br/>Critique]
    D --> E[Phase 5<br/>Voting]
    E --> F[Phase 6<br/>Synthesis]

    style A fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#fff
    style B fill:#064e3b,stroke:#34d399,stroke-width:2px,color:#fff
    style C fill:#3b0764,stroke:#c084fc,stroke-width:2px,color:#fff
    style D fill:#701a75,stroke:#f472b6,stroke-width:2px,color:#fff
    style E fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fff
    style F fill:#14532d,stroke:#22c55e,stroke-width:2px,color:#fff
```

1. **Framing:** Moderator Diya deconstructs user prompt into orthogonal architectural vectors.
2. **Divergence:** All agents draft independent proposals in isolation (eliminating early bias).
3. **Clustering:** Proposals are semantically clustered on the 3D Idea Board, reducing communication complexity from $O(N^2)$ to $O(N \cdot K)$.
4. **Adversarial Critique:** Agents cross-examine ideas with mandatory `SUPPORT` vs. `CHALLENGE` stances.
5. **Weighted Voting:** Quadratic / Borda voting determines quorum consensus (>70%).
6. **Synthesis:** Complete multi-file source code is generated and written directly to the host filesystem.

---

## 🏗️ System Architecture

```mermaid
flowchart TB
    User["👤 Human Operator"]

    subgraph Floor["Tier 1: 3D Presentation Floor (Three.js / React 18)"]
        Canvas["3D WebGL Canvas<br/>(Office & Swarm Hall)"]
        DAG["Task DAG & Idea Board"]
        Safety["Permission Modal & Emergency Stop"]
    end

    subgraph Bridge["Tier 2: Mediation Bridge (Node.js / Express / WS)"]
        Bus["Monotonic Event Bus (seq-tracked)"]
        SwarmEngine["6-Phase Swarm Deliberation Engine"]
        DiskWriter["Dynamic File System Delivery"]
    end

    subgraph Models["Tier 3: Multi-Model Mesh"]
        DSR1["DeepSeek-R1 (CoT Reasoning)"]
        Groq["Groq Llama-3.3-70B (Fast Classify)"]
        Backoff["Exponential Backoff & Coffee Break Trigger"]
    end

    User <--> Floor
    Floor <-->|"WebSocket & REST"| Bridge
    Bridge <--> Models
```

---

## ☕ Visual Rate-Limit Backoff (Coffee Breaks)

```mermaid
sequenceDiagram
    participant Agent as 3D Agent
    participant Bridge as Mediation Bridge
    participant API as LLM Provider

    Bridge->>API: Inference Request
    API-->>Bridge: HTTP 429 Rate Limit (Cooldown: 15s)
    Bridge-->>Agent: agent.break_start { kind: 'coffee' }
    Note over Agent: Agent stands up, walks to coffee pantry, and drinks coffee
    Bridge->>Bridge: Exponential backoff cooldown window
    Bridge-->>Agent: agent.break_end
    Note over Agent: Agent walks back to desk / conference seat
    Bridge->>API: Retry Inference Request
    API-->>Bridge: Success 200 OK
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** 20+ & **npm** 10+
- An API key for OpenRouter or Groq

### 2. Setup
```bash
git clone https://github.com/atharv1909/BenchMates.git
cd BenchMates

# Setup environment variables
cp .env.example .env
# Add your key to .env:
# OPENROUTER_API_KEY=sk-or-v1-...

# Install dependencies
cd frontend
npm install
cd ..
```

### 3. Run GravityDesk
**Terminal 1 (Mediation Bridge):**
```bash
cd frontend
npm run bridge:mock
```

**Terminal 2 (3D Virtual Floor):**
```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser, pick your mode, and start innovating!

---

## 🧪 Automated Test Suite

Run the full kinematics, navigation, and contract test suite:
```bash
cd frontend
npm test
```
```
 ✓ src/tests/swarmLayout.test.ts (10 tests)
 ✓ src/tests/nav.test.ts (3 tests)
 ✓ src/tests/triage.test.ts (10 tests)
 ✓ src/tests/swarmTape.test.ts (3 tests)
 ✓ src/tests/layout.test.ts (3 tests)
 ✓ src/tests/integration.test.ts (4 tests)
 ✓ src/tests/stress.test.ts (1 test)
 ✓ src/tests/swarmEntrance.test.ts (2 tests)

 Test Files  8 passed (8)
      Tests  36 passed (36)
```

---

<p align="center">
  <b>GravityDesk</b> · Built with 💜 for the next generation of autonomous engineering.
</p>
