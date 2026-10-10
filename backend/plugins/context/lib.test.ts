import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  truncateHeadTail,
  placeholder,
  errorTrim,
  planMask,
  stageFor,
  estTokens,
  sha8,
  toNorm,
  applyReplacements,
} from "./lib.ts"
import type { NormMsg, MaskCfg } from "./lib.ts"

describe("Context Management lib tests", () => {
  test("truncateHeadTail leaves short text untouched", () => {
    const text = "hello world short text"
    assert.equal(truncateHeadTail(text, 50, 50), text)
  })

  test("truncateHeadTail truncates text exceeding head+tail", () => {
    const text = "A".repeat(100)
    const res = truncateHeadTail(text, 10, 10)
    assert.ok(res.startsWith("A".repeat(10)))
    assert.ok(res.endsWith("A".repeat(10)))
    assert.ok(res.includes("chars omitted"))
    assert.equal(res.length, 10 + 10 + "\n[... 80 chars omitted ...]\n".length)
  })

  test("placeholder formats correct output with line count and hash", () => {
    const msg: NormMsg = {
      index: 1,
      role: "tool",
      toolName: "bash",
      argsSummary: "ls -la",
      text: "line1\nline2\nline3",
    }
    const res = placeholder(msg)
    assert.ok(res.includes("bash ls -la"))
    assert.ok(res.includes("3 lines"))
    assert.ok(res.includes(sha8(msg.text)))
  })

  test("errorTrim keeps up to 40 lines intact, trims >40 lines", () => {
    const shortErr: NormMsg = {
      index: 1,
      role: "tool",
      text: Array.from({ length: 30 }, (_, i) => `error ${i}`).join("\n"),
      isError: true,
    }
    assert.equal(errorTrim(shortErr), shortErr.text)

    const longErr: NormMsg = {
      index: 2,
      role: "tool",
      text: Array.from({ length: 60 }, (_, i) => `error line ${i}`).join("\n"),
      isError: true,
    }
    const trimmed = errorTrim(longErr)
    const lines = trimmed.split("\n")
    assert.equal(lines.length, 41) // 20 + 1 omitted line + 20
    assert.ok(trimmed.includes("20 lines omitted"))
  })

  test("stageFor calculates correct stages based on threshold", () => {
    assert.equal(stageFor(0.1), 0)
    assert.equal(stageFor(0.59), 0)
    assert.equal(stageFor(0.60), 1)
    assert.equal(stageFor(0.70), 1)
    assert.equal(stageFor(0.75), 2)
    assert.equal(stageFor(0.99), 2)
  })

  test("planMask protects recent N tool results and respects never-mask list", () => {
    const msgs: NormMsg[] = [
      { index: 0, role: "user", text: "do something" },
      { index: 1, role: "tool", toolCallId: "call_1", toolName: "read_file", text: "file contents ".repeat(50) },
      { index: 2, role: "tool", toolCallId: "call_2", toolName: "edit", text: "edit result ".repeat(50) },
      { index: 3, role: "tool", toolCallId: "call_3", toolName: "bash", text: "small", isError: false },
      { index: 4, role: "tool", toolCallId: "call_4", toolName: "bash", text: "large output ".repeat(50) },
    ]

    const cfg: MaskCfg = {
      window: 1, // Protect last 1 tool (call_4)
      minChars: 100,
      never: new Set(["edit", "write", "patch", "context_checkpoint"]),
    }

    const masked = planMask(msgs, cfg, new Set())
    assert.ok(masked.has("call_1"), "call_1 should be masked")
    assert.ok(!masked.has("call_2"), "call_2 is an edit tool, never mask")
    assert.ok(!masked.has("call_3"), "call_3 is under minChars")
    assert.ok(!masked.has("call_4"), "call_4 is within protected window")
  })

  test("toNorm and applyReplacements correctly replace raw messages", () => {
    const raw = [
      { role: "user", content: "hello" },
      { role: "tool", id: "t1", toolName: "grep", content: "long results" },
    ]
    const norm = toNorm(raw)
    assert.equal(norm.length, 2)
    assert.equal(norm[1].toolName, "grep")

    const repMap = new Map([["t1", "[placeholder]"]])
    const replaced = applyReplacements(raw, repMap)
    assert.equal(replaced[1].content, "[placeholder]")
  })
})

