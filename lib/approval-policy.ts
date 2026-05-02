/**
 * AgentMode + tool-preset → effective tools / Ask-confirm membership.
 * Pure policy — no I/O, no React.
 */

export type AgentMode = "plan" | "ask" | "full";

export const PLAN_TOOLS: readonly string[] = ["read", "grep", "find", "ls"];
export const PLAN_ALLOWED_TOOLS: readonly string[] = [...PLAN_TOOLS, "memory_recall"];
export const ASK_AUTO_APPROVE_TOOLS: readonly string[] = [...PLAN_ALLOWED_TOOLS];

export const DEFAULT_AGENT_MODE: AgentMode = "ask";

export const EXECUTE_PLAN_PROMPT =
  "请按你刚才的计划开始执行。需要写入文件或运行命令前会请求我确认。";

export function isAgentMode(value: unknown): value is AgentMode {
  return value === "plan" || value === "ask" || value === "full";
}

/**
 * All registered Pi tools stay visible to the model. These helpers decide
 * whether a call is allowed, rather than hiding tools through a preset.
 */
export function isPlanAllowed(toolName: string): boolean {
  return (PLAN_ALLOWED_TOOLS as readonly string[]).includes(toolName);
}

/** Whether Ask mode requires a confirm dialog before this tool runs. */
export function needsAskConfirm(mode: AgentMode, toolName: string): boolean {
  return mode === "ask" && !(ASK_AUTO_APPROVE_TOOLS as readonly string[]).includes(toolName);
}

export function askBlockResult(): { block: true; reason: string } {
  return { block: true, reason: "Blocked by user (Ask mode)" };
}

export function planBlockResult(): { block: true; reason: string } {
  return { block: true, reason: "Blocked in Plan mode: this action requires read-only planning" };
}

/** Short human-readable summary for confirm dialogs. */
export function summarizeToolCall(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") {
    return `${toolName}(${JSON.stringify(input ?? {})})`;
  }
  const obj = input as Record<string, unknown>;
  if ((toolName === "bash" || toolName === "powershell") && typeof obj.command === "string") {
    const cmd = obj.command.length > 200 ? `${obj.command.slice(0, 200)}…` : obj.command;
    return `${toolName}: ${cmd}`;
  }
  if ((toolName === "write" || toolName === "edit") && typeof obj.path === "string") {
    return `${toolName}: ${obj.path}`;
  }
  if (typeof obj.file_path === "string") {
    return `${toolName}: ${obj.file_path}`;
  }
  try {
    const s = JSON.stringify(obj);
    return s.length > 240 ? `${toolName}: ${s.slice(0, 240)}…` : `${toolName}: ${s}`;
  } catch {
    return toolName;
  }
}
