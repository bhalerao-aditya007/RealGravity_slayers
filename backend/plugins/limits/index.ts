import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "pag.limits",
  async setup(ctx) {
    await ctx.shell.hook("create.before", (event: any) => {
      event.timeout = Math.min(event.timeout ?? 120_000, 120_000)
    })
  },
})
