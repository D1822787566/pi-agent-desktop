import test from "node:test";
import assert from "node:assert/strict";
import { applySubagentRunEvent } from "./subagent-runs.ts";

test("subagent run state follows started, update, and completion events", () => {
  const started = applySubagentRunEvent([], {
    type: "subagent_run_started",
    run: {
      id: "run-1",
      status: "queued",
      agent: "scout",
      task: "Map the repository",
      startedAt: 10,
      updatedAt: 10,
    },
  });
  assert.equal(started?.[0]?.status, "queued");

  const updated = applySubagentRunEvent(started ?? [], {
    type: "subagent_run_updated",
    run: { id: "run-1", updatedAt: 20, activity: "grep" },
  });
  assert.equal(updated?.[0]?.status, "running");
  assert.equal(updated?.[0]?.activity, "grep");

  const completed = applySubagentRunEvent(updated ?? [], {
    type: "subagent_run_completed",
    run: { id: "run-1", status: "completed", updatedAt: 30, endedAt: 30 },
  });
  assert.equal(completed?.[0]?.status, "completed");
  assert.equal(completed?.[0]?.endedAt, 30);
});

test("subagent updates without a known run are ignored", () => {
  assert.equal(
    applySubagentRunEvent([], {
      type: "subagent_run_updated",
      run: { id: "missing", updatedAt: 10 },
    }),
    null
  );
});

test("workflow reconciliation replaces the temporary workflow rows with child runs", () => {
  const reconciled = applySubagentRunEvent(
    [
      {
        id: "workflow-1:pending:0",
        workflowId: "workflow-1",
        status: "running",
        agent: "scout",
        startedAt: 10,
        updatedAt: 20,
      },
    ],
    {
      type: "subagent_runs_reconciled",
      workflowId: "workflow-1",
      runs: [
        {
          id: "child-1",
          workflowId: "workflow-1",
          label: "project-overview",
          status: "completed",
          agent: "scout",
          mode: "workflow",
          startedAt: 10,
          updatedAt: 50,
          endedAt: 50,
          toolCount: 3,
        },
      ],
    }
  );

  assert.deepEqual(reconciled, [
    {
      id: "child-1",
      workflowId: "workflow-1",
      label: "project-overview",
      status: "completed",
      agent: "scout",
      mode: "workflow",
      startedAt: 10,
      updatedAt: 50,
      endedAt: 50,
      toolCount: 3,
    },
  ]);
});
