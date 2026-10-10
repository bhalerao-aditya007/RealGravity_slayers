import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "pag.searxng",
  async setup(ctx) {
    if (ctx.websearch?.transform) {
      await ctx.websearch.transform((editor: any) => {
        editor.add({
          id: "searxng",
          name: "SearXNG (private)",
          execute: async ({ query }: any, { signal }: any) => {
            const host = process.env.SEARXNG_HOST ?? "http://searxng:8080"
            const r = await fetch(`${host}/search?format=json&q=${encodeURIComponent(query)}`, { signal })
            const j: any = await r.json()
            return (j.results ?? []).slice(0, 8).map((x: any) => ({
              url: x.url,
              title: x.title,
              content: x.content ?? "",
              time: {},
            }))
          },
        })
        // Only override default search provider if SearXNG container is active
        if (process.env.PAG_SANDBOX === "docker") {
          editor.default?.set("searxng")
        }
      })
    }
  },
})
