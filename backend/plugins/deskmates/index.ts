import { Plugin } from "@opencode/plugin"

const BRIDGE = process.env.DESKMATES_BRIDGE // e.g. http://127.0.0.1:8787
const AGENT = process.env.DESKMATES_AGENT_ID // W_backend_0
const post = (path: string, body: unknown) =>
  fetch(`${BRIDGE}/internal/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

export default Plugin.define({
  id: "deskmates",
  async setup(ctx) {
    if (!BRIDGE || !AGENT) return

    await ctx.permission.hook("evaluate", async (ev: any) => {
      if (ev.effect !== "ask") return
      try {
        const r = await post("permission", {
          agent_id: AGENT,
          action: ev.action,
          resource: ev.resource,
          preview: ev.preview,
        })
        const { decision } = await r.json()
        return decision === "reject"
          ? { effect: "deny" }
          : { effect: "allow", remember: decision === "always" }
      } catch (err) {
        return { effect: "deny" }
      }
    })

    await ctx.session.hook("compaction", async (ev: any) => {
      try {
        await post("compaction", { agent_id: AGENT, sessionID: ev.sessionID })
      } catch (err) {}
    })

    await ctx.tool.hook("execute.after", async (ev: any) => {
      try {
        if (ev.tool === "shell") {
          await post("tool", {
            agent_id: AGENT,
            kind: /pytest|npm test|vitest|cargo test/.test(ev.args?.command ?? "") ? "test" : "terminal",
            data: String(ev.args?.command ?? "").slice(0, 160),
          })
        }
      } catch (err) {}
    })
  },
})
