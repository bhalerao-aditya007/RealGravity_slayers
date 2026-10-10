import { Plugin } from "@opencode/plugin"
import { createHash } from "node:crypto"
import { writeFileSync, mkdirSync, appendFileSync, readFileSync, existsSync } from "node:fs"
import {
  estTokens,
  sha8,
  truncateHeadTail,
  placeholder,
  planMask,
  stageFor,
  STAGES,
  toNorm,
  applyReplacements,
} from "./lib.js"
import type { MaskCfg } from "./lib.js"

const L = 128_000
const NEVER_MASK = new Set(["edit", "write", "patch", "context_checkpoint", "question"])

export default Plugin.define({
  id: "pag.context",
  async setup(ctx) {
    const cwd = ctx.location?.directory ?? process.cwd()
    const tier = Number(process.env.PAG_CTX_TIER ?? "3")

    // Ensure output directories exist
    try {
      mkdirSync(`${cwd}/.agent/out`, { recursive: true })
    } catch {}

    // Per-session state
    const sessionState = new Map<
      string,
      {
        stage: number
        // Store the actual replacement strings, not just IDs
        maskedReplacements: Map<string, string>
        lastMsgCount: number
        frac: number
      }
    >()

    // ─── T2: Output Truncation ────────────────────────────
    await ctx.tool.hook("execute.after", async (event: any) => {
      const toolName = event.tool ?? event.name
      const sessId = event.sessionID ?? "default"

      // Truncation (Tier >= 2)
      if (tier >= 2 && event.result) {
        let contentStr: string | null = null
        if (typeof event.result === "string") {
          contentStr = event.result
        } else if (typeof event.result?.content === "string") {
          contentStr = event.result.content
        }

        if (contentStr && contentStr.length > 24_000) {
          const hash = sha8(contentStr)
          try {
            writeFileSync(`${cwd}/.agent/out/${hash}.txt`, contentStr, "utf8")
          } catch {}
          const truncated =
            truncateHeadTail(contentStr, 12_000, 6_000) +
            `\n[full output saved to .agent/out/${hash}.txt; read it with a line range]`

          if (typeof event.result === "string") {
            event.result = truncated
          } else {
            event.result.content = truncated
          }
        }
      }

      // ─── T5: Proactive Checkpoint Compaction ────────────
      if (tier >= 3 && toolName === "context_checkpoint") {
        const state = sessionState.get(sessId)
        if (state && state.frac >= 0.4 && ctx.session?.compact) {
          try {
            await ctx.session.compact({ sessionID: sessId })
          } catch {
            // sessionID may not be available; skip silently
          }
        }
      }
    })

    // ─── T3: Observation Masking (FIXED: no double-mask) ──
    if (tier >= 3) {
      await ctx.session.hook("context", async (event: any) => {
        const sessId = event.sessionID ?? "default"
        const messages = event.messages ?? []
        const system = event.system ?? ""
        const tools = event.tools ?? []

        // Estimate token usage
        const totalChars =
          system.length +
          JSON.stringify(messages).length +
          JSON.stringify(tools).length
        const used = estTokens(totalChars)
        const frac = used / L

        let state = sessionState.get(sessId)
        if (!state) {
          state = {
            stage: 0,
            maskedReplacements: new Map<string, string>(),
            lastMsgCount: messages.length,
            frac,
          }
          sessionState.set(sessId, state)
        } else {
          state.frac = frac
          // Detect compaction (message count dropped) → reset masking state
          if (messages.length < state.lastMsgCount) {
            state.stage = 0
            state.maskedReplacements.clear()
          }
          state.lastMsgCount = messages.length
        }

        // Check if we need to advance to a new masking stage
        const targetStage = stageFor(frac)
        if (targetStage > state.stage) {
          // New stage threshold crossed — compute new masks
          state.stage = targetStage
          const stageCfg = STAGES[targetStage - 1] ?? { window: 5 }
          const normMsgs = toNorm(messages)
          const cfg: MaskCfg = {
            window: stageCfg.window,
            minChars: 400,
            never: NEVER_MASK,
          }
          // planMask returns Map<id, replacementText>
          // alreadyMasked prevents re-processing already-masked messages
          const alreadyMaskedIds = new Set(state.maskedReplacements.keys())
          const newMasks = planMask(normMsgs, cfg, alreadyMaskedIds)
          // Merge new masks into stored replacements
          for (const [id, replacement] of newMasks) {
            state.maskedReplacements.set(id, replacement)
          }
        }

        // Apply stored replacements directly (no second planMask call)
        if (state.maskedReplacements.size > 0) {
          event.messages = applyReplacements(messages, state.maskedReplacements)
        }

        // Log context metrics for C5 cache stability check
        const prefixMsgs = messages.slice(0, Math.max(0, messages.length - 10))
        const prefixHash = sha8(JSON.stringify(prefixMsgs))
        const logEntry = {
          ts: new Date().toISOString(),
          sessionID: sessId,
          frac: Number(frac.toFixed(4)),
          stage: state.stage,
          maskedCount: state.maskedReplacements.size,
          prefixHash,
        }
        try {
          appendFileSync(`${cwd}/.agent/context.jsonl`, JSON.stringify(logEntry) + "\n")
        } catch {}
      })
    }

    // ─── T4: Structured Compaction ────────────────────────
    if (ctx.session?.hook) {
      await ctx.session.hook("compaction", async (event: any) => {
        let fileIndex = "None recorded"
        const auditFile = `${cwd}/.agent/audit.jsonl`
        if (existsSync(auditFile)) {
          try {
            const lines = readFileSync(auditFile, "utf8").trim().split("\n")
            const fileMap = new Map<string, { kind: string; hunks: string[] }>()
            for (const line of lines) {
              if (!line) continue
              const entry = JSON.parse(line)
              const existing = fileMap.get(entry.file) ?? { kind: entry.kind, hunks: [] }
              if (entry.hunks) {
                for (const h of entry.hunks) {
                  existing.hunks.push(`+${h.newStart},${h.newLen}`)
                }
              }
              fileMap.set(entry.file, existing)
            }
            const rows: string[] = []
            for (const [file, info] of fileMap) {
              rows.push(`${file} — ${info.kind} — ${info.hunks.join("; ") || "all"}`)
            }
            if (rows.length > 0) fileIndex = rows.join("\n")
          } catch {}
        }

        const prompt = `
When writing the compaction summary use exactly these sections:
## Objective  (one paragraph, the user's goal in their words)
## Constraints and decisions  (bullets, each with the reason)
## Files touched  (exact relative path and exact line ranges, one per line; copy from the FILE INDEX below)
## Commands run  (command, then PASS or FAIL, then the key line of output)
## Open errors  (verbatim error text, file:line)
## Next step  (one concrete action)
Never paraphrase paths, line numbers, identifiers, or error text. Copy them verbatim.
FILE INDEX (authoritative):
${fileIndex}
`
        if (event.system) {
          event.system += `\n\n${prompt}`
        } else {
          event.prompt = `${event.prompt ?? ""}\n\n${prompt}`
        }
      })
    }

    // ─── T5: Checkpoint Tool ──────────────────────────────
    if (ctx.tool?.transform) {
      await ctx.tool.transform((editor: any) => {
        editor.add({
          id: "context_checkpoint",
          name: "context_checkpoint",
          description:
            "Record a progress checkpoint. Call this at every subtask boundary (tests pass, file done). " +
            "The system will automatically compact context if usage is high.",
          parameters: {
            type: "object",
            properties: {
              objective: { type: "string", description: "Current task objective" },
              done: { type: "array", items: { type: "string" }, description: "Completed steps" },
              next: { type: "string", description: "Next concrete action" },
              decisions: { type: "array", items: { type: "string" }, description: "Key decisions made" },
              files: { type: "array", items: { type: "string" }, description: "Files touched (path:lines)" },
              open_issues: { type: "array", items: { type: "string" }, description: "Unresolved issues" },
            },
            required: ["objective", "done", "next"],
          },
          execute: async (args: any) => {
            const content = `# Progress
Objective: ${args.objective ?? ""}
Status: done: ${(args.done ?? []).join(", ")} | next: ${args.next ?? ""}
Decisions: ${(args.decisions ?? []).join("; ")}
Files touched: ${(args.files ?? []).join(", ")}
Open issues: ${(args.open_issues ?? []).join("; ")}
`
            try {
              writeFileSync(`${cwd}/.agent/progress.md`, content, "utf8")
            } catch {}
            return "checkpoint saved"
          },
        })
      })
    }
  },
})
