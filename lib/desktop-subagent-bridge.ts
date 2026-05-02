import { existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";

export type DesktopSubagentRunStatus = "queued" | "running" | "completed" | "failed" | "paused";

export type DesktopSubagentRun = {
  id: string;
  status: DesktopSubagentRunStatus;
  /** The async workflow that owns this child, when the run came from workflowScript. */
  workflowId?: string;
  /** Stable workflow child key, such as "project-overview". */
  label?: string;
  agent?: string;
  agents?: string[];
  task?: string;
  mode?: "single" | "parallel" | "chain" | "workflow";
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  activity?: string;
  model?: string;
  toolCount?: number;
  turnCount?: number;
  recentTools?: string[];
  recentOutput?: string[];
  sessionFile?: string;
};

export type DesktopSubagentEvent =
  | { type: "subagent_run_started"; run: DesktopSubagentRun }
  | {
      type: "subagent_run_updated";
      run: Pick<DesktopSubagentRun, "id" | "updatedAt"> &
        Partial<Omit<DesktopSubagentRun, "id" | "updatedAt">>;
    }
  | {
      type: "subagent_run_completed";
      run: Pick<DesktopSubagentRun, "id" | "status" | "updatedAt"> &
        Partial<Omit<DesktopSubagentRun, "id" | "status" | "updatedAt">>;
    }
  | { type: "subagent_runs_reconciled"; workflowId: string; runs: DesktopSubagentRun[] };

type Emit = (event: DesktopSubagentEvent) => void;
type UnknownRecord = Record<string, unknown>;
type WorkflowSlot = { id: string; agent?: string; label?: string };

const TEMP_SUBAGENT_PREFIX = `${resolve(tmpdir())}${sep}pi-subagents-user-`;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
  return values.length > 0 ? values : undefined;
}

function asTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecordList(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is UnknownRecord => item !== null)
    : [];
}

function statusFromValue(value: unknown): DesktopSubagentRunStatus {
  if (value === "failed" || value === "error") return "failed";
  if (value === "paused" || value === "stopped" || value === "stopping") return "paused";
  if (value === "completed" || value === "complete" || value === "succeeded") return "completed";
  if (value === "running" || value === "active") return "running";
  return "queued";
}

function isTerminal(status: DesktopSubagentRunStatus): boolean {
  return status === "completed" || status === "failed" || status === "paused";
}

function latestToolNames(value: unknown): string[] | undefined {
  const names = asRecordList(value)
    .map((tool) => asString(tool.tool) ?? asString(tool.name))
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.slice(-5) : undefined;
}

function latestOutput(value: unknown): string[] | undefined {
  const output = asStringList(value);
  return output?.slice(-3);
}

function readWorkflowStatus(asyncDir: unknown, workflowId: string, fallbackNow: number): DesktopSubagentRun[] | null {
  const dir = asString(asyncDir);
  if (!dir) return null;
  const normalizedDir = resolve(dir);
  if (!normalizedDir.startsWith(TEMP_SUBAGENT_PREFIX)) return null;
  const statusPath = resolve(normalizedDir, "status.json");
  if (!statusPath.startsWith(`${normalizedDir}${sep}`) || !existsSync(statusPath)) return null;

  try {
    const status = asRecord(JSON.parse(readFileSync(statusPath, "utf8")));
    if (!status) return null;
    const workflowStartedAt = asTimestamp(status.startedAt, fallbackNow);
    const workflowEndedAt = asNumber(status.endedAt);
    const workflowUpdatedAt = asTimestamp(status.lastUpdate, fallbackNow);
    const runs = asRecordList(status.steps).map((step, index) => {
      const startedAt = asTimestamp(step.startedAt, workflowStartedAt);
      const durationMs = asNumber(step.durationMs);
      const runStatus = statusFromValue(step.status);
      const endedAt = isTerminal(runStatus)
        ? durationMs !== undefined
          ? startedAt + durationMs
          : workflowEndedAt
        : undefined;
      const recentTools = latestToolNames(step.recentTools);
      const recentOutput = latestOutput(step.recentOutput);
      const activity = recentTools?.at(-1) ?? recentOutput?.at(-1);
      const label = asString(step.workflowKey) ?? asString(step.label);
      return {
        id: asString(step.runId) ?? `${workflowId}:${label ?? index}`,
        workflowId,
        ...(label ? { label } : {}),
        status: runStatus,
        ...(asString(step.agent) ? { agent: asString(step.agent) } : {}),
        mode: "workflow" as const,
        startedAt,
        updatedAt: asTimestamp(step.lastActivityAt, workflowUpdatedAt),
        ...(endedAt !== undefined ? { endedAt } : {}),
        ...(activity ? { activity } : {}),
        ...(asString(step.model) ? { model: asString(step.model) } : {}),
        ...(asNumber(step.toolCount) !== undefined ? { toolCount: asNumber(step.toolCount) } : {}),
        ...(asNumber(step.turnCount) !== undefined ? { turnCount: asNumber(step.turnCount) } : {}),
        ...(recentTools ? { recentTools } : {}),
        ...(recentOutput ? { recentOutput } : {}),
        ...(asString(step.sessionFile) ? { sessionFile: asString(step.sessionFile) } : {}),
      } satisfies DesktopSubagentRun;
    });
    return runs.length > 0 ? runs : null;
  } catch {
    return null;
  }
}

function workflowRunsFromCompletion(source: UnknownRecord, workflowId: string, fallbackNow: number): DesktopSubagentRun[] | null {
  const children = asRecordList(asRecord(source.workflowChildren)?.children);
  const trace = asRecordList(source.trace);
  if (children.length === 0 && trace.length === 0) return null;

  const traceByKey = new Map<string, UnknownRecord>();
  for (const entry of trace) {
    const key = asString(entry.key);
    if (key) traceByKey.set(key, entry);
  }

  const childRecords = children.length > 0 ? children : trace.filter((entry) => asString(entry.key) !== undefined);
  const runs = childRecords.map((child, index) => {
    const label = asString(child.childId) ?? asString(child.key);
    const traceEntry = label ? traceByKey.get(label) : undefined;
    const runId = asString(child.runId) ?? asString(traceEntry?.runId) ?? `${workflowId}:${label ?? index}`;
    const status = statusFromValue(asString(child.state) ?? asString(traceEntry?.state));
    const durationMs = asNumber(traceEntry?.durationMs);
    const startedAt = fallbackNow - (durationMs ?? 0);
    return {
      id: runId,
      workflowId,
      ...(label ? { label } : {}),
      status,
      ...(asString(child.agent) ?? asString(traceEntry?.agent)
        ? { agent: asString(child.agent) ?? asString(traceEntry?.agent) }
        : {}),
      mode: "workflow" as const,
      startedAt,
      updatedAt: fallbackNow,
      ...(isTerminal(status) ? { endedAt: fallbackNow } : {}),
      ...(asString(child.model) ? { model: asString(child.model) } : {}),
    } satisfies DesktopSubagentRun;
  });
  return runs.length > 0 ? runs : null;
}

function workflowSlotsFromGraph(value: unknown, workflowId: string, fallbackAgents: string[] | undefined): WorkflowSlot[] {
  const slots: WorkflowSlot[] = [];
  const visit = (nodes: unknown) => {
    for (const node of asRecordList(nodes)) {
      const children = asRecordList(node.children);
      const agent = asString(node.agent);
      if (agent && children.length === 0) {
        slots.push({
          id: `${workflowId}:pending:${slots.length}`,
          agent,
          label: asString(node.label),
        });
      }
      if (children.length > 0) visit(children);
    }
  };
  visit(asRecord(value)?.nodes);
  return slots.length > 0
    ? slots
    : (fallbackAgents ?? []).map((agent, index) => ({ id: `${workflowId}:pending:${index}`, agent }));
}

function completionStatus(data: UnknownRecord): DesktopSubagentRunStatus {
  if (data.status === "paused") return "paused";
  if (data.status === "failed" || data.success === false) return "failed";
  return "completed";
}

/**
 * Converts pi-subagents' public event-bus lifecycle events to serializable
 * events for the desktop renderer. It does nothing unless that extension is
 * installed, so sessions without it retain Pi's normal extension behavior.
 */
export class DesktopSubagentBridge {
  private emit: Emit | null = null;
  private sessionFile: string | undefined;
  private statusPollTimer: ReturnType<typeof setInterval> | null = null;
  private statusSignatures = new Map<string, string>();
  private workflowDirs = new Map<string, string>();
  private workflowSlots = new Map<string, WorkflowSlot[]>();

  /**
   * Subscribe the desktop session to the bridge.  The event bus is the normal
   * low-latency path, while the status-file poll makes the projection durable
   * across extension event ordering and SSE reconnects.
   */
  attach(emit: Emit, sessionFile?: string): void {
    this.emit = emit;
    this.sessionFile = sessionFile;
    this.refreshFromStatusFiles();
    this.statusPollTimer = setInterval(() => this.refreshFromStatusFiles(), 1_000);
    this.statusPollTimer.unref?.();
  }

  detach(): void {
    if (this.statusPollTimer) clearInterval(this.statusPollTimer);
    this.statusPollTimer = null;
    this.emit = null;
    this.sessionFile = undefined;
    this.statusSignatures.clear();
    this.workflowDirs.clear();
    this.workflowSlots.clear();
  }

  inlineExtension(): InlineExtension {
    return {
      name: "desktop-subagent-bridge",
      factory: (pi: ExtensionAPI) => {
        const dispose = [
          pi.events.on("subagent:async-started", (data: unknown) => this.handleStarted(data)),
          pi.events.on("subagent:async-complete", (data: unknown) => this.handleCompleted(data)),
          pi.events.on("subagent:control-event", (data: unknown) => this.handleControl(data)),
        ];
        pi.on("session_shutdown", () => {
          for (const unsubscribe of dispose) unsubscribe();
        });
      },
    };
  }

  private handleStarted(data: unknown): void {
    const source = asRecord(data);
    const id = asString(source?.id);
    if (!source || !id) return;
    const now = Date.now();
    const agent = asString(source.agent);
    const agents = asStringList(source.agents) ?? (agent ? [agent] : undefined);
    const mode = source.mode === "parallel" || source.mode === "chain" || source.mode === "single" || source.mode === "workflow"
      ? source.mode
      : undefined;

    if (mode === "workflow") {
      const asyncDir = asString(source.asyncDir);
      if (asyncDir) this.workflowDirs.set(id, asyncDir);
      const statusRuns = readWorkflowStatus(asyncDir, id, now);
      if (statusRuns) {
        this.workflowSlots.set(id, statusRuns.map((run) => ({ id: run.id, agent: run.agent, label: run.label })));
        for (const run of statusRuns) this.emit?.({ type: "subagent_run_started", run });
        return;
      }

      const slots = workflowSlotsFromGraph(source.workflowGraph, id, agents);
      this.workflowSlots.set(id, slots);
      for (const [index, slot] of slots.entries()) {
        this.emit?.({
          type: "subagent_run_started",
          run: {
            id: slot.id,
            workflowId: id,
            status: "queued",
            ...(slot.agent ? { agent: slot.agent } : {}),
            label: slot.label ?? `任务 ${index + 1}`,
            mode: "workflow",
            startedAt: now,
            updatedAt: now,
          },
        });
      }
      return;
    }

    this.emit?.({
      type: "subagent_run_started",
      run: {
        id,
        status: "queued",
        ...(agent ? { agent } : {}),
        ...(agents ? { agents } : {}),
        ...(asString(source.task) ? { task: asString(source.task) } : {}),
        ...(mode ? { mode } : {}),
        startedAt: now,
        updatedAt: now,
      },
    });
  }

  private handleCompleted(data: unknown): void {
    const source = asRecord(data);
    const id = asString(source?.id) ?? asString(source?.runId);
    if (!source || !id) return;
    const now = Date.now();
    const isWorkflow = source.mode === "workflow" || asRecord(source.workflowChildren) !== null || Array.isArray(source.trace);
    if (isWorkflow) {
      const runs =
        readWorkflowStatus(asString(source.asyncDir) ?? this.workflowDirs.get(id), id, now) ??
        workflowRunsFromCompletion(source, id, now);
      if (runs) {
        this.emit?.({ type: "subagent_runs_reconciled", workflowId: id, runs });
        this.workflowDirs.delete(id);
        this.workflowSlots.delete(id);
        return;
      }
    }
    const error = asString(source.error);
    this.emit?.({
      type: "subagent_run_completed",
      run: {
        id,
        status: completionStatus(source),
        updatedAt: now,
        endedAt: asTimestamp(source.endedAt, now),
        ...(error ? { activity: error } : {}),
      },
    });
  }

  private handleControl(data: unknown): void {
    const source = asRecord(data);
    const control = asRecord(source?.event);
    const id = asString(control?.runId);
    if (!control || !id) return;
    const activity = asString(control.currentTool) ?? asString(control.message);
    const workflowId = [...this.workflowDirs.entries()].find(([, asyncDir]) => asyncDir === asString(source?.asyncDir))?.[0];
    const workflowKey = asString(control.workflowKey);
    if (workflowId) {
      const slots = this.workflowSlots.get(workflowId) ?? [];
      const agent = asString(control.agent);
      const slot = slots.find((candidate) => candidate.label === workflowKey)
        ?? slots.find((candidate) => candidate.agent === agent && !candidate.label);
      if (slot) {
        slot.label = workflowKey ?? slot.label;
        this.emit?.({
          type: "subagent_run_updated",
          run: {
            id: slot.id,
            updatedAt: asTimestamp(control.ts, Date.now()),
            status: "running",
            ...(workflowKey ? { label: workflowKey } : {}),
            ...(agent ? { agent } : {}),
            ...(activity ? { activity } : {}),
            ...(asNumber(control.toolCount) !== undefined ? { toolCount: asNumber(control.toolCount) } : {}),
            ...(asNumber(control.turns) !== undefined ? { turnCount: asNumber(control.turns) } : {}),
          },
        });
        return;
      }
    }
    this.emit?.({
      type: "subagent_run_updated",
      run: {
        id,
        updatedAt: asTimestamp(control.ts, Date.now()),
        ...(activity ? { activity } : {}),
      },
    });
  }

  /** Read only same-user temporary run status files that belong to this session. */
  private refreshFromStatusFiles(): void {
    const sessionFile = this.sessionFile;
    if (!this.emit || !sessionFile) return;

    let userRoots: string[];
    try {
      userRoots = readdirSync(tmpdir(), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("pi-subagents-user-"))
        .map((entry) => resolve(tmpdir(), entry.name, "async-subagent-runs"));
    } catch {
      return;
    }

    for (const root of userRoots) {
      let runDirs: string[];
      try {
        runDirs = readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
          .map((entry) => resolve(root, entry.name));
      } catch {
        continue;
      }

      for (const asyncDir of runDirs) {
        const statusPath = resolve(asyncDir, "status.json");
        if (!statusPath.startsWith(`${asyncDir}${sep}`) || !existsSync(statusPath)) continue;
        try {
          const status = asRecord(JSON.parse(readFileSync(statusPath, "utf8")));
          const workflowId = asString(status?.runId);
          if (!status || !workflowId || asString(status.sessionId) !== sessionFile) continue;
          const runs = readWorkflowStatus(asyncDir, workflowId, Date.now());
          if (!runs) continue;
          const signature = JSON.stringify(runs);
          if (this.statusSignatures.get(workflowId) === signature) continue;
          this.statusSignatures.set(workflowId, signature);
          this.workflowDirs.set(workflowId, asyncDir);
          this.workflowSlots.set(workflowId, runs.map((run) => ({ id: run.id, agent: run.agent, label: run.label })));
          this.emit({ type: "subagent_runs_reconciled", workflowId, runs });
        } catch {
          // A child can be writing status.json while we read it. The next poll retries.
        }
      }
    }
  }
}
