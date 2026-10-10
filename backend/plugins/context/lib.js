import { createHash } from "node:crypto";
const estTokens = (chars) => Math.ceil(chars / 3.5);
const sha8 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 8);
function truncateHeadTail(text, head = 12e3, tail = 6e3) {
  if (text.length <= head + tail) return text;
  return text.slice(0, head) + `
[... ${text.length - head - tail} chars omitted ...]
` + text.slice(-tail);
}
function placeholder(m) {
  const lines = m.text.split("\n").length;
  return `[output omitted: ${m.toolName ?? "tool"} ${m.argsSummary ?? ""} \u2192 ${lines} lines, ${m.text.length} chars, sha ${sha8(m.text)}. Re-run the command or re-read the file/range if you need it again.]`;
}
function errorTrim(m) {
  const l = m.text.split("\n");
  return l.length <= 40 ? m.text : [...l.slice(0, 20), `[... ${l.length - 40} lines omitted ...]`, ...l.slice(-20)].join("\n");
}
function planMask(msgs, cfg, alreadyMasked) {
  const tools = msgs.filter((m) => m.role === "tool");
  const protect = new Set(tools.slice(-cfg.window).map((m) => m.toolCallId ?? String(m.index)));
  const out = /* @__PURE__ */ new Map();
  for (const m of tools) {
    const id = m.toolCallId ?? String(m.index);
    if (protect.has(id) || alreadyMasked.has(id)) continue;
    if (cfg.never.has(m.toolName ?? "") || m.text.length < cfg.minChars) continue;
    out.set(id, m.isError ? errorTrim(m) : placeholder(m));
  }
  return out;
}
const STAGES = [
  { at: 0.6, window: 10 },
  { at: 0.75, window: 5 }
];
function stageFor(frac) {
  let s = 0;
  STAGES.forEach((st, i) => {
    if (frac >= st.at) s = i + 1;
  });
  return s;
}
function toNorm(rawMessages) {
  return rawMessages.map((msg, idx) => {
    let text = "";
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content.map((p) => typeof p === "string" ? p : p.text ?? JSON.stringify(p)).join("\n");
    } else if (msg.content) {
      text = JSON.stringify(msg.content);
    }
    return {
      index: idx,
      role: msg.role ?? (msg.toolCallId ? "tool" : "assistant"),
      toolName: msg.toolName ?? msg.name,
      toolCallId: msg.toolCallId ?? msg.id ?? String(idx),
      argsSummary: msg.argsSummary ?? (msg.args ? JSON.stringify(msg.args) : ""),
      text,
      isError: Boolean(msg.isError || msg.error)
    };
  });
}
function applyReplacements(rawMessages, replacements) {
  return rawMessages.map((msg, idx) => {
    const id = msg.toolCallId ?? msg.id ?? String(idx);
    if (replacements.has(id)) {
      const rep = replacements.get(id);
      if (typeof msg.content === "string") {
        return { ...msg, content: rep };
      } else if (Array.isArray(msg.content)) {
        return { ...msg, content: [{ type: "text", text: rep }] };
      }
      return { ...msg, content: rep };
    }
    return msg;
  });
}
export {
  STAGES,
  applyReplacements,
  errorTrim,
  estTokens,
  placeholder,
  planMask,
  sha8,
  stageFor,
  toNorm,
  truncateHeadTail
};
