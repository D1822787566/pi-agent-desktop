import test from "node:test";
import assert from "node:assert/strict";
import {
  ASK_CONFIRM_TOOLS,
  PLAN_TOOLS,
  askBlockResult,
  effectiveToolsForMode,
  isAgentMode,
  needsAskConfirm,
  summarizeToolCall,
  toolNamesForPreset,
} from "./approval-policy.ts";

test("plan mode always returns the four read tools", () => {
  assert.deepEqual(effectiveToolsForMode("plan", "none", "win32"), [...PLAN_TOOLS]);
  assert.deepEqual(effectiveToolsForMode("plan", "default", "linux"), [...PLAN_TOOLS]);
  assert.deepEqual(effectiveToolsForMode("plan", "full", "win32"), [...PLAN_TOOLS]);
});

test("Windows presets use PowerShell and other platforms use Bash", () => {
  assert.deepEqual(effectiveToolsForMode("ask", "none", "win32"), []);
  assert.deepEqual(toolNamesForPreset("default", "win32"), ["read", "powershell", "edit", "write"]);
  assert.deepEqual(toolNamesForPreset("full", "win32"), ["powershell", "read", "edit", "write", "grep", "find", "ls"]);
  assert.deepEqual(toolNamesForPreset("default", "linux"), ["read", "bash", "edit", "write"]);
  assert.deepEqual(effectiveToolsForMode("full", "default", "linux"), toolNamesForPreset("default", "linux"));
  assert.deepEqual(effectiveToolsForMode("ask", "full", "win32"), toolNamesForPreset("full", "win32"));
});

test("needsAskConfirm covers shell commands and file writes in ask mode", () => {
  for (const t of ASK_CONFIRM_TOOLS) {
    assert.equal(needsAskConfirm("ask", t), true, t);
  }
  assert.equal(needsAskConfirm("ask", "read"), false);
  assert.equal(needsAskConfirm("ask", "grep"), false);
  assert.equal(needsAskConfirm("full", "bash"), false);
  assert.equal(needsAskConfirm("full", "powershell"), false);
  assert.equal(needsAskConfirm("plan", "write"), false);
});

test("needsAskConfirm requires confirm for memory write tools in ask mode (S2)", () => {
  assert.equal(needsAskConfirm("ask", "memory_save"), true);
  assert.equal(needsAskConfirm("ask", "memory_forget"), true);
  assert.equal(needsAskConfirm("ask", "memory_recall"), false);
});

test("askBlockResult shape", () => {
  const r = askBlockResult();
  assert.equal(r.block, true);
  assert.match(r.reason, /Ask mode/);
});

test("summarizeToolCall prefers shell commands and paths", () => {
  assert.match(summarizeToolCall("bash", { command: "ls -la" }), /ls -la/);
  assert.match(summarizeToolCall("powershell", { command: "Get-ChildItem" }), /Get-ChildItem/);
  assert.match(summarizeToolCall("write", { path: "a.ts" }), /a\.ts/);
  assert.match(summarizeToolCall("edit", { path: "b.ts" }), /b\.ts/);
});

test("isAgentMode", () => {
  assert.equal(isAgentMode("ask"), true);
  assert.equal(isAgentMode("nope"), false);
});
