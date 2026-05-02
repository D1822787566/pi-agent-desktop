"use client";

import { useEffect, useMemo, useState } from "react";
import type { DesktopSubagentRun } from "@/lib/desktop-subagent-bridge";

interface Props {
  runs: readonly DesktopSubagentRun[];
}

const STATUS_LABEL: Record<DesktopSubagentRun["status"], string> = {
  queued: "排队中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  paused: "已暂停",
};

function isActive(status: DesktopSubagentRun["status"]): boolean {
  return status === "queued" || status === "running";
}

function formatElapsed(startedAt: number, endedAt: number | undefined, now: number): string {
  const seconds = Math.max(0, Math.floor(((endedAt ?? now) - startedAt) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes} 分 ${remainder} 秒`;
}

function statusClass(status: DesktopSubagentRun["status"]): string {
  if (status === "failed") return "bg-danger";
  if (status === "completed") return "bg-success";
  if (status === "paused") return "bg-warning";
  if (status === "queued") return "bg-text-dim";
  return "bg-accent";
}

export function SubagentPanel({ runs }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [expandedRuns, setExpandedRuns] = useState<ReadonlySet<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const activeCount = runs.filter((run) => isActive(run.status)).length;
  const detailRunIds = useMemo(
    () => new Set(runs.filter((run) => run.activity || run.toolCount || run.turnCount || run.recentTools?.length || run.recentOutput?.length).map((run) => run.id)),
    [runs]
  );

  useEffect(() => {
    if (activeCount === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activeCount]);

  if (runs.length === 0) return null;

  const toggleRun = (id: string) => {
    setExpandedRuns((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="mb-3 overflow-hidden rounded-panel border border-border bg-bg-panel" aria-label="子 Agent 运行状态">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-[12px] text-text hover:bg-bg-hover"
      >
        <span className={`h-2 w-2 rounded-full ${activeCount > 0 ? "bg-accent" : "bg-text-dim"}`} aria-hidden="true" />
        <span className="font-medium">子 Agent</span>
        <span className="text-text-dim">{activeCount > 0 ? `${activeCount} 个运行中` : `${runs.length} 个任务`}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`ml-auto text-text-dim transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M4 6.5 8 10.5 12 6.5" />
        </svg>
      </button>

      {expanded && (
        <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto border-t border-border p-2">
          {runs.map((run) => {
            const title = run.label ?? run.task ?? run.agent ?? "子 Agent";
            const agent = run.agent ?? run.agents?.join(" · ");
            const canExpand = detailRunIds.has(run.id);
            const runExpanded = expandedRuns.has(run.id);
            return (
              <div key={run.id} className="rounded-control border border-border bg-bg">
                <button
                  type="button"
                  disabled={!canExpand}
                  onClick={() => toggleRun(run.id)}
                  className={`w-full px-2.5 py-2 text-left ${canExpand ? "cursor-pointer hover:bg-bg-hover" : "cursor-default"}`}
                  aria-expanded={canExpand ? runExpanded : undefined}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusClass(run.status)}`} aria-hidden="true" />
                    <span className="min-w-0 truncate font-mono text-[11px] font-medium text-text">{title}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-text-dim">{STATUS_LABEL[run.status]}</span>
                    {canExpand && (
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`shrink-0 text-text-dim transition-transform duration-150 ${runExpanded ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      >
                        <path d="M4 6.5 8 10.5 12 6.5" />
                      </svg>
                    )}
                  </div>
                  {agent && <div className="mt-1 truncate pl-3.5 text-[10px] text-text-muted">{agent}</div>}
                  <div className="mt-1 pl-3.5 text-[10px] tabular-nums text-text-dim">
                    {run.mode === "parallel" ? "并行" : run.mode === "chain" ? "串行" : run.mode === "workflow" ? "工作流" : "单任务"} · {formatElapsed(run.startedAt, run.endedAt, now)}
                  </div>
                </button>
                {canExpand && runExpanded && (
                  <div className="border-t border-border px-3.5 py-2 text-[10px] text-text-muted">
                    {run.activity && <div className="truncate" title={run.activity}>当前活动：{run.activity}</div>}
                    {(run.toolCount !== undefined || run.turnCount !== undefined) && (
                      <div className="mt-1 tabular-nums">{run.toolCount ?? 0} 次工具调用 · {run.turnCount ?? 0} 轮</div>
                    )}
                    {run.recentTools?.length ? <div className="mt-1 truncate" title={run.recentTools.join(" · ")}>最近工具：{run.recentTools.join(" · ")}</div> : null}
                    {run.recentOutput?.length ? (
                      <div className="mt-1 space-y-1 border-l border-border pl-2 text-text-dim">
                        {run.recentOutput.map((line, index) => <div key={`${run.id}:output:${index}`} className="line-clamp-2">{line}</div>)}
                      </div>
                    ) : null}
                    {run.sessionFile && <div className="mt-1 text-text-dim">完整会话记录已保存</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
