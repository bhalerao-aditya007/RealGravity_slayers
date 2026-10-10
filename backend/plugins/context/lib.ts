import { createHash } from "node:crypto"

export interface NormMsg {
  index: number
  role: "system" | "user" | "assistant" | "tool"
  toolName?: string
  toolCallId?: string
  argsSummary?: string
  text: string
  isError?: boolean
}

export const estTokens = (chars: number) => Math.ceil(chars / 3.5)
export const sha8 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8)

export function truncateHeadTail(text: string, head = 12000, tail = 6000): string {
  if (text.length <= head + tail) return text
  return text.slice(0, head) + `\n[... ${text.length - head - tail} chars omitted ...]\n` + text.slice(-tail)
}

export function placeholder(m: NormMsg): string {
  const lines = m.text.split("\n").length
  return (
    `[output omitted: ${m.toolName ?? "tool"} ${m.argsSummary ?? ""} → ${lines} lines, ${m.text.length} chars, sha ${sha8(m.text)}. ` +
    `Re-run the command or re-read the file/range if you need it again.]`
  )
}

export function errorTrim(m: NormMsg): string {
  const l = m.text.split("\n")
  return l.length <= 40 ? m.text : [...l.slice(0, 20), `[... ${l.length - 40} lines omitted ...]`, ...l.slice(-20)].join("\n")
}

export interface MaskCfg {
  window: number
  minChars: number
  never: Set<string>
}

export function planMask(msgs: NormMsg[], cfg: MaskCfg, alreadyMasked: Set<string>): Map<string, string> {
  const tools = msgs.filter((m) => m.role === "tool")
  const protect = new Set(tools.slice(-cfg.window).map((m) => m.toolCallId ?? String(m.index)))
  const out = new Map<string, string>()
  for (const m of tools) {
    const id = m.toolCallId ?? String(m.index)
    if (protect.has(id) || alreadyMasked.has(id)) continue
    if (cfg.never.has(m.toolName ?? "") || m.text.length < cfg.minChars) continue
    out.set(id, m.isError ? errorTrim(m) : placeholder(m))
  }
  return out
}

export const STAGES = [
  { at: 0.60, window: 10 },
  { at: 0.75, window: 5 },
]

export function stageFor(frac: number): number {
  let s = 0
  STAGES.forEach((st, i) => {
    if (frac >= st.at) s = i + 1
  })
  return s
}

export function toNorm(rawMessages: any[]): NormMsg[] {
  return rawMessages.map((msg, idx) => {
    let text = ""
    if (typeof msg.content === "string") {
      text = msg.content
    } else if (Array.isArray(msg.content)) {
      text = msg.content
        .map((p: any) => (typeof p === "string" ? p : p.text ?? JSON.stringify(p)))
        .join("\n")
    } else if (msg.content) {
      text = JSON.stringify(msg.content)
    }

    return {
      index: idx,
      role: msg.role ?? (msg.toolCallId ? "tool" : "assistant"),
      toolName: msg.toolName ?? msg.name,
      toolCallId: msg.toolCallId ?? msg.id ?? String(idx),
      argsSummary: msg.argsSummary ?? (msg.args ? JSON.stringify(msg.args) : ""),
      text,
      isError: Boolean(msg.isError || msg.error),
    }
  })
}

export function applyReplacements(rawMessages: any[], replacements: Map<string, string>): any[] {
  return rawMessages.map((msg, idx) => {
    const id = msg.toolCallId ?? msg.id ?? String(idx)
    if (replacements.has(id)) {
      const rep = replacements.get(id)!
      if (typeof msg.content === "string") {
        return { ...msg, content: rep }
      } else if (Array.isArray(msg.content)) {
        return { ...msg, content: [{ type: "text", text: rep }] }
      }
      return { ...msg, content: rep }
    }
    return msg
  })
}
