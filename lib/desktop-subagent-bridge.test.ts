import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DesktopSubagentBridge } from "./desktop-subagent-bridge.ts";

test("DesktopSubagentBridge forwards pi-subagents lifecycle events", () => {
  const handlers = new Map<string, (data: unknown) => void>();
  const events: unknown[] = [];
  const bridge = new DesktopSubagentBridge();
  bridge.attach((event) => events.push(event));

  const extension = bridge.inlineExtension();
  const factory = typeof extension === "function" ? extension : extension.factory;
  factory({
    events: {
      on: (name: string, handler: (data: unknown) => void) => {
        handlers.set(name, handler);
        return () => handlers.delete(name);
      },
    },
    on: () => {},
  } as never);

  handlers.get("subagent:async-started")?.({
    id: "run-1",
    agent: "reviewer",
    task: "Review the current diff",
    mode: "single",
  });
  handlers.get("subagent:control-event")?.({
    event: { runId: "run-1", currentTool: "grep", ts: 123 },
  });
  handlers.get("subagent:async-complete")?.({ id: "run-1", success: true, endedAt: 456 });

  assert.deepEqual(events, [
    {
      type: "subagent_run_started",
      run: {
        id: "run-1",
        status: "queued",
        agent: "reviewer",
        agents: ["reviewer"],
        task: "Review the current diff",
        mode: "single",
        startedAt: (events[0] as { run: { startedAt: number } }).run.startedAt,
        updatedAt: (events[0] as { run: { updatedAt: number } }).run.updatedAt,
      },
    },
    {
      type: "subagent_run_updated",
      run: { id: "run-1", updatedAt: 123, activity: "grep" },
    },
    {
      type: "subagent_run_completed",
      run: { id: "run-1", status: "completed", updatedAt: (events[2] as { run: { updatedAt: number } }).run.updatedAt, endedAt: 456 },
    },
  ]);
});

test("DesktopSubagentBridge stops forwarding after detach", () => {
  const handlers = new Map<string, (data: unknown) => void>();
  const events: unknown[] = [];
  const bridge = new DesktopSubagentBridge();
  bridge.attach((event) => events.push(event));
  const extension = bridge.inlineExtension();
  const factory = typeof extension === "function" ? extension : extension.factory;
  factory({
    events: {
      on: (name: string, handler: (data: unknown) => void) => {
        handlers.set(name, handler);
        return () => {};
      },
    },
    on: () => {},
  } as never);

  bridge.detach();
  handlers.get("subagent:async-started")?.({ id: "run-2", agent: "scout" });
  assert.deepEqual(events, []);
});

test("DesktopSubagentBridge expands completed workflows into their child runs", () => {
  const handlers = new Map<string, (data: unknown) => void>();
  const events: unknown[] = [];
  const bridge = new DesktopSubagentBridge();
  bridge.attach((event) => events.push(event));
  const extension = bridge.inlineExtension();
  const factory = typeof extension === "function" ? extension : extension.factory;
  factory({
    events: {
      on: (name: string, handler: (data: unknown) => void) => {
        handlers.set(name, handler);
        return () => handlers.delete(name);
      },
    },
    on: () => {},
  } as never);

  const asyncDir = mkdtempSync(join(tmpdir(), "pi-subagents-user-test-"));
  try {
    writeFileSync(
      join(asyncDir, "status.json"),
      JSON.stringify({
        startedAt: 1_000,
        lastUpdate: 5_000,
        endedAt: 5_000,
        steps: [
          {
            workflowKey: "main-app",
            agent: "codebase-analyzer",
            status: "completed",
            startedAt: 1_100,
            durationMs: 2_000,
            toolCount: 4,
            turnCount: 2,
            recentTools: [{ tool: "read" }, { tool: "grep" }],
            recentOutput: ["完成主应用分析"],
            runId: "child-1",
          },
          {
            workflowKey: "overview",
            agent: "scout",
            status: "completed",
            startedAt: 1_200,
            durationMs: 3_000,
            runId: "child-2",
          },
        ],
      })
    );

    handlers.get("subagent:async-started")?.({
      id: "workflow-1",
      mode: "workflow",
      agents: ["codebase-analyzer", "scout"],
      asyncDir,
      workflowGraph: {
        nodes: [
          { agent: "codebase-analyzer", label: "main-app" },
          { agent: "scout", label: "overview" },
        ],
      },
    });
    handlers.get("subagent:async-complete")?.({ runId: "workflow-1", mode: "workflow" });

    assert.equal(events.filter((event) => (event as { type: string }).type === "subagent_run_started").length, 2);
    assert.equal((events[0] as { run: { label?: string } }).run.label, "main-app");
    const completion = events.at(-1) as {
      type: string;
      workflowId: string;
      runs: Array<{ id: string; label?: string; toolCount?: number; recentTools?: string[]; endedAt?: number }>;
    };
    assert.equal(completion.type, "subagent_runs_reconciled");
    assert.equal(completion.workflowId, "workflow-1");
    assert.deepEqual(
      completion.runs.map((run) => ({ id: run.id, label: run.label, endedAt: run.endedAt })),
      [
        { id: "child-1", label: "main-app", endedAt: 3_100 },
        { id: "child-2", label: "overview", endedAt: 4_200 },
      ]
    );
    assert.equal(completion.runs[0]?.toolCount, 4);
    assert.deepEqual(completion.runs[0]?.recentTools, ["read", "grep"]);
  } finally {
    rmSync(asyncDir, { recursive: true, force: true });
  }
});

test("DesktopSubagentBridge restores a running workflow from its status file", () => {
  const events: unknown[] = [];
  const root = mkdtempSync(join(tmpdir(), "pi-subagents-user-bridge-poll-"));
  const asyncDir = join(root, "async-subagent-runs", "workflow-live");
  mkdirSync(asyncDir, { recursive: true });
  try {
    writeFileSync(
      join(asyncDir, "status.json"),
      JSON.stringify({
        runId: "workflow-live",
        sessionId: "desktop-session.jsonl",
        startedAt: 1_000,
        lastUpdate: 2_000,
        steps: [{
          runId: "child-live",
          workflowKey: "api",
          agent: "codebase-analyzer",
          status: "running",
          startedAt: 1_100,
          lastActivityAt: 1_900,
          toolCount: 3,
          recentTools: [{ tool: "read" }],
        }],
      })
    );
    const bridge = new DesktopSubagentBridge();
    bridge.attach((event) => events.push(event), "desktop-session.jsonl");

    assert.deepEqual(events, [{
      type: "subagent_runs_reconciled",
      workflowId: "workflow-live",
      runs: [{
        id: "child-live",
        workflowId: "workflow-live",
        label: "api",
        status: "running",
        agent: "codebase-analyzer",
        mode: "workflow",
        startedAt: 1_100,
        updatedAt: 1_900,
        activity: "read",
        toolCount: 3,
        recentTools: ["read"],
      }],
    }]);
    bridge.detach();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
