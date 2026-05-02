"use client";

import React, { useState } from "react";

export interface SessionExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
}

export function SessionExportModal({ isOpen, onClose, sessionId }: SessionExportModalProps) {
  const [format, setFormat] = useState<"html" | "markdown">("html");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !sessionId) return null;

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const exportUrl = `/api/sessions/${encodeURIComponent(sessionId)}/export?format=${format}&download=true`;

      // Create hidden link and click to trigger browser download payload
      const a = document.createElement("a");
      a.href = exportUrl;
      a.download = `session-${sessionId}.${format === "html" ? "html" : "md"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "导出失败");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="导出会话"
      className="ui-dialog-backdrop fixed inset-0 z-[1000] flex items-center justify-center p-4"
    >
      <div className="t-modal is-open ui-dialog-surface w-full max-w-md rounded-[14px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-divider bg-bg-elevated">
          <h3 className="font-semibold text-text text-[14px]">导出会话</h3>
          <button
            onClick={onClose}
            aria-label="关闭弹窗"
            className="text-text-muted hover:text-text text-[18px] leading-none px-2 py-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 flex flex-col gap-4">
          <p className="text-[12px] text-text-muted">
            将会话 <code className="font-mono text-[11px] text-accent">{sessionId}</code> 导出为独立 HTML 或纯 Markdown 文件。
          </p>

          {error && (
            <div className="p-2.5 rounded-control bg-red-500/10 border border-red-500/20 text-red-400 text-[12px]">
              {error}
            </div>
          )}

          {/* Format selection cards */}
          <div className="flex flex-col gap-2.5">
            <label
              onClick={() => setFormat("html")}
              className={`flex items-start gap-3 p-3 rounded-panel border cursor-pointer transition-[background-color,border-color,color] duration-150 ${
                format === "html"
                  ? "bg-accent/10 border-accent text-text"
                  : "bg-bg-panel border-border text-text-muted hover:border-border-subtle"
              }`}
            >
              <input
                type="radio"
                name="export-format"
                value="html"
                checked={format === "html"}
                onChange={() => setFormat("html")}
                className="mt-0.5 accent-accent"
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-[13px] text-text">
                  独立 HTML（.html）
                </span>
                <span className="text-[11px] text-text-muted leading-relaxed">
                  带语法高亮、智能体思考样式和可收起工具调用的交互式 HTML 文档。
                </span>
              </div>
            </label>

            <label
              onClick={() => setFormat("markdown")}
              className={`flex items-start gap-3 p-3 rounded-panel border cursor-pointer transition-[background-color,border-color,color] duration-150 ${
                format === "markdown"
                  ? "bg-accent/10 border-accent text-text"
                  : "bg-bg-panel border-border text-text-muted hover:border-border-subtle"
              }`}
            >
              <input
                type="radio"
                name="export-format"
                value="markdown"
                checked={format === "markdown"}
                onChange={() => setFormat("markdown")}
                className="mt-0.5 accent-accent"
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-[13px] text-text">
                  纯 Markdown（.md）
                </span>
                <span className="text-[11px] text-text-muted leading-relaxed">
                  包含用户消息、智能体回复与代码块的纯文本格式，适合复制或作为 LLM 上下文。
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-divider bg-bg-elevated">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-control border border-border text-text-muted hover:text-text hover:bg-bg-hover transition-colors text-[12px] cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="px-4 py-1.5 rounded-control bg-accent text-accent-contrast font-medium hover:opacity-90 transition-opacity cursor-pointer text-[12px] disabled:opacity-50 flex items-center gap-1.5"
          >
            {downloading ? "正在准备导出…" : `下载 ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
