import type { DesktopSubagentRun } from "@/lib/desktop-subagent-bridge";
import type { AgentEvent } from "./agent-events-manager";

function orderRuns(runs: Iterable<DesktopSubagentRun>): DesktopSubagentRun[] {
  return [...runs].sort((a, b) => {
    const aActive = a.status === "queued" || a.status === "running";
    const bActive = b.status === "queued" || b.status === "running";
    if (aActive !== bActive) return aActive ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

/** Apply only the serializable lifecycle events emitted by pi-subagents. */
export function applySubagentRunEvent(
  runs: readonly DesktopSubagentRun[],
  event: AgentEvent
): DesktopSubagentRun[] | null {
  const byId = new Map(runs.map((run) => [run.id, run]));

  if (event.type === "subagent_run_started") {
    byId.set(event.run.id, event.run);
    return orderRuns(byId.values());
  }

  if (event.type === "subagent_run_updated") {
    const current = byId.get(event.run.id);
    if (!current) return null;
    byId.set(event.run.id, { ...current, ...event.run, status: "running" });
    return orderRuns(byId.values());
  }

  if (event.type === "subagent_runs_reconciled") {
    for (const [id, run] of byId) {
      if (run.workflowId === event.workflowId) byId.delete(id);
    }
    for (const run of event.runs) byId.set(run.id, run);
    return orderRuns(byId.values());
  }

  if (event.type === "subagent_run_completed") {
    const current = byId.get(event.run.id);
    if (!current) {
      byId.set(event.run.id, {
        startedAt: event.run.updatedAt,
        ...event.run,
      });
    } else {
      byId.set(event.run.id, { ...current, ...event.run });
    }
    return orderRuns(byId.values());
  }

  return null;
}
