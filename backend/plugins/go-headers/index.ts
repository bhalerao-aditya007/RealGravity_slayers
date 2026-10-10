import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "pag.go-headers",
  async setup(ctx) {
    await ctx.session.hook("http.request", (event: any) => {
      if (event?.request?.headers) {
        event.request.headers.set("x-opencode-session", event.sessionID)
        event.request.headers.set("user-agent", "pag/1.0")
      }
    })
  },
})
