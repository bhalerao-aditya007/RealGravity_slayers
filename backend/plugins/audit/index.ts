import { Plugin } from "@opencode/plugin"
import { execFileSync } from "node:child_process"
import { appendFileSync, mkdirSync } from "node:fs"

const EDIT_TOOLS = new Set(["edit", "write", "patch"])

export default Plugin.define({
  id: "pag.audit",
  async setup(ctx) {
    const cwd = ctx.location?.directory ?? process.cwd()
    try {
      mkdirSync(`${cwd}/.agent`, { recursive: true })
    } catch {}
    const seen = new Map<string, string>()
    const git = (...a: string[]) => execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8" })

    await ctx.tool.hook("execute.after", (event: any) => {
      const toolName = event.tool ?? event.name
      const status = event.status ?? "completed"
      if (status !== "completed" || !EDIT_TOOLS.has(toolName)) return

      const rows: any[] = []
      try {
        const diffOutput = git("diff", "-U0", "--no-color")
        for (const block of diffOutput.split(/^diff --git /m).slice(1)) {
          const file = /^\+\+\+ b\/(.+)$/m.exec(block)?.[1]
          if (!file || seen.get(file) === block) continue
          seen.set(file, block)
          const hunks = [...block.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)].map(m => ({
            oldStart: +m[1],
            oldLen: +(m[2] ?? 1),
            newStart: +m[3],
            newLen: +(m[4] ?? 1),
          }))
          rows.push({ file, kind: "modified", hunks })
        }

        const statusOutput = git("status", "--porcelain")
        for (const l of statusOutput.split("\n")) {
          if (l.startsWith("?? ") && !seen.has(l.slice(3))) {
            seen.set(l.slice(3), "new")
            rows.push({ file: l.slice(3), kind: "created" })
          }
        }

        for (const r of rows) {
          appendFileSync(
            `${cwd}/.agent/audit.jsonl`,
            JSON.stringify({ ts: new Date().toISOString(), tool: toolName, ...r }) + "\n"
          )
        }
      } catch (err) {
        // Git diff error handled gracefully
      }
    })
  },
})
