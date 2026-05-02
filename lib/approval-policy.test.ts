import test from "node:test";
import assert from "node:assert/strict";
import {
  ASK_AUTO_APPROVE_TOOLS,
  PLAN_ALLOWED_TOOLS,
  PLAN_TOOLS,
  askBlockResult,
  isAgentMode,
  isPlanAllowed,
  needsAskConfirm,
  planBlockResult,
  summarizeToolCall,
} from "./approval-policy.ts";

test("plan mode permits only read-side tools", () => {
  assert.deepEqual(PLAN_ALLOWED_TOOLS, [...PLAN_TOOLS, "memory_recall"]);
  for (const tool of PLAN_ALLOWED_TOOLS) assert.equal(isPlanAllowed(tool), true, tool);
  assert.equal(isPlanAllowed("powershell"), false);
  assert.equal(isPlanAllowed("subagent"), false);
  assert.equal(isPlanAllowed("memory_save"), false);
});

test("Ask mode confirms every tool outside the read-only allowlist", () => {
  for (const tool of ASK_AUTO_APPROVE_TOOLS) {
    assert.equal(needsAskConfirm("ask", tool), false, tool);
  }
  assert.equal(needsAskConfirm("ask", "powershell"), true);
  assert.equal(needsAskConfirm("ask", "write"), true);
  assert.equal(needsAskConfirm("ask", "subagent"), true);
  assert.equal(needsAskConfirm("ask", "todo"), true);
  assert.equal(needsAskConfirm("full", "subagent"), false);
  assert.equal(needsAskConfirm("plan", "write"), false);
});

test("mode block result shapes", () => {
  assert.match(askBlockResult().reason, /Ask mode/);
  assert.match(planBlockResult().reason, /Plan mode/);
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
