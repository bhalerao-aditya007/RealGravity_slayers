# RealGravity (PAG: Personal Antigravity)

A personal, terminal-first, autonomous coding agent that mirrors Google Antigravity's permissions, safety sandboxing, and diff visibility — powered by **free open-weight models** from Groq, NVIDIA NIM, OpenRouter, and OpenCode Go.

**Zero cost. Full privacy. Your machine, your rules.**

---

## Quick Start (5 minutes)

### 1. Get your free API keys

| Provider | Free Tier | Get Key |
|----------|-----------|---------|
| **Groq** | Fastest inference, no credit card | [console.groq.com/keys](https://console.groq.com/keys) |
| **NVIDIA NIM** | 1000 free credits | [build.nvidia.com](https://build.nvidia.com/) |
| **OpenRouter** | Free models (`:free` suffix) | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **OpenCode Go** | Dollar-window free tier | [opencode.ai/v2/docs/console/go](https://opencode.ai/v2/docs/console/go) |

You only need **one** key to start. Add more providers later.

### 2. Configure

```bash
cd /mnt/d/Realgravity
cp .env.example .env
chmod 600 .env
# Edit .env — paste your key(s)
nano .env
```

### 3. Run preflight (first time only)

```bash
./scripts/preflight.sh
```

### 4. Launch

```bash
# Recommended for everyday work:
pag /path/to/project assist

# For new/untrusted projects (asks before every edit):
pag /path/to/project strict

# Full auto-pilot on clean repos:
pag /path/to/project turbo
```

You can also use the alias `realgravity` instead of `pag`.

---

## Switching Models

### Per-session override
```bash
pag ~/myproject assist --model groq/llama-3.3-70b-versatile
pag ~/myproject assist --model nvidia/meta/llama-3.1-70b-instruct
pag ~/myproject assist --model openrouter/qwen/qwen-2.5-72b-instruct:free
pag ~/myproject assist --model go/deepseek-v4-flash
```

### See all configured models
```bash
pag --list-models
```

### Change defaults
Edit `profiles/base.json` → `agents.build.model` and `agents.plan.model`.

---

## Available Models (all free)

### Groq (fastest inference)
| Model | Best For |
|-------|----------|
| `groq/llama-3.3-70b-versatile` | **Default.** Best free all-rounder |
| `groq/llama-3.1-8b-instant` | Simple tasks, fastest response |
| `groq/gemma2-9b-it` | Balanced quality/speed |

### NVIDIA NIM (free prototyping)
| Model | Best For |
|-------|----------|
| `nvidia/meta/llama-3.1-70b-instruct` | Strong reasoning |
| `nvidia/nvidia/llama-3.1-nemotron-70b-instruct` | NVIDIA-tuned helpfulness |

### OpenRouter (free models)
| Model | Best For |
|-------|----------|
| `openrouter/qwen/qwen-2.5-72b-instruct:free` | Best free on OpenRouter |
| `openrouter/google/gemma-2-9b-it:free` | Fast Google model |
| `openrouter/meta-llama/llama-3.1-8b-instruct:free` | Quick tasks |

### OpenCode Go (free tier)
| Model | Best For |
|-------|----------|
| `go/deepseek-v4-flash` | Coding-focused, Go default |
| `go/deepseek-v4-pro` | Stronger planning |
| `go/glm-5.2` | Escalation |

---

## Terminal Layout

RealGravity opens in a 3-pane `tmux` session:

1. **Left (Agent TUI):** Interactive OpenCode session with permissions, chat, and tool execution
2. **Top-Right (Live Audit):** Real-time log of every file modified with exact line ranges
3. **Bottom-Right (Live Diff):** `git diff --stat` refreshing every 2 seconds

On exit, a full `git diff -U0` summary is printed with one-command rollback.

---

## Security Profiles

| Feature | `strict` | `assist` | `turbo` |
|---------|----------|----------|---------|
| File reads | ✅ Auto | ✅ Auto | ✅ Auto |
| File edits | ❓ Ask | ✅ Auto | ✅ Auto |
| Safe shell (`git status`, `ls`, `rg`) | ✅ Auto | ✅ Auto | ✅ Auto |
| Other shell commands | ❓ Ask | ❓ Ask | ✅ Auto |
| Web search | ❓ Ask | ✅ Auto | ✅ Auto |
| **Always denied** | `sudo`, `rm -rf`, `git push`, `ssh`, `scp`, `git reset --hard` |||

**Security is enforced by the container**, not just permission rules.

---

## Privacy & Hosted Models

- **Privacy gate:** Projects must be explicitly authorized before code is sent to any API
- **All API keys stay on your machine** — injected by the nginx proxy, never inside the container
- **Zero data retention:** All configured providers have 0-day retention policies
- **No telemetry, no tracking, no cloud deployment**

To authorize a new project:
```bash
pag /path/to/project --allow-hosted
```

Authorized projects are listed in `hosted-allowed.txt`.

---

## Project-Specific Commands

Pre-approve common shell commands for `assist`/`turbo` profiles:

1. Create `.pag/commands.txt` in your project root:
   ```text
   pytest *
   npm test *
   npm run lint *
   cargo check *
   ```
2. On launch, RealGravity shows these, asks for confirmation, then allows them without prompting.

---

## Egress Allowlist

The agent container can only reach:
- The local LLM proxy (no direct API access)
- The private search engine (SearXNG)
- Domains in `docker/allowlist.txt`

To add a documentation site:
```bash
echo ".docs.rs" >> docker/allowlist.txt
cd /mnt/d/Realgravity/docker && docker compose restart egress
```

---

## Key Rotation

```bash
# 1. Edit .env with new key(s)
nano /mnt/d/Realgravity/.env

# 2. Restart the proxy
cd /mnt/d/Realgravity/docker && docker compose up -d --force-recreate llmproxy
```

---

## Resource Usage

Optimized for low-resource PCs (total Docker overhead ~2.5 GB):

| Container | Memory Limit |
|-----------|-------------|
| Agent (OpenCode) | 2 GB |
| SearXNG (search) | 256 MB |
| nginx (proxy) | 128 MB |
| Squid (egress) | 128 MB |

---

## Safety Verification

```bash
# Run all safety escape tests (S1-S9)
/mnt/d/Realgravity/scripts/escape-tests.sh

# Run context management unit tests
cd /mnt/d/Realgravity/plugins/context && npx tsx --test lib.test.ts

# View API quota usage
/mnt/d/Realgravity/scripts/quota.sh
```

---

## Evaluation Harness

Run benchmarks on any model:
```bash
# Run evals with a specific model and profile
/mnt/d/Realgravity/evals/run.sh groq/llama-3.3-70b-versatile assist 3 1

# Compare models
/mnt/d/Realgravity/evals/run.sh nvidia/meta/llama-3.1-70b-instruct assist 3 3
```

---

## Rollback & Recovery

If an agent run produces unwanted edits:
```bash
# 1. Exit the agent (Ctrl+C or /exit)
# 2. RealGravity prints the branch name (e.g. agent/20261002-173000)

# Discard all changes:
git checkout main && git branch -D agent/<timestamp>

# Keep and merge:
git checkout main && git merge agent/<timestamp>
```

---

