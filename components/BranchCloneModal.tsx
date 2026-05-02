"use client";

import React, { useState, useEffect } from "react";

export type BranchCloneMode = "branch" | "clone";

export interface BranchCloneModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: BranchCloneMode;
  sessionId: string | null;
  targetEntryId?: string;
  cwd?: string;
  onSuccess?: (newSessionId: string, newSessionFile: string) => void;
}

export function BranchCloneModal({
  isOpen,
  onClose,
  mode,
  sessionId,
  targetEntryId,
  cwd,
  onSuccess,
}: BranchCloneModalProps) {
  const [name, setName] = useState("");
  const [targetCwd, setTargetCwd] = useState(cwd || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setTargetCwd(cwd || "");
      setError(null);
    }
  }, [isOpen, cwd, sessionId, targetEntryId]);
  if (!isOpen || !sessionId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "branch" && !targetEntryId) {
      setError("创建分支需要目标条目 ID。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const endpoint =
        mode === "branch"
          ? `/api/sessions/${encodeURIComponent(sessionId)}/branch`
          : `/api/sessions/${encodeURIComponent(sessionId)}/clone`;

      const payload =
        mode === "branch"
          ? { targetEntryId, name: name.trim() || undefined }
          : { targetCwd: targetCwd.trim() || undefined, name: name.trim() || undefined };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      if (onSuccess) {
        onSuccess(data.sessionId, data.sessionFile);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === "branch" ? "创建会话分支" : "复制会话";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="ui-dialog-backdrop fixed inset-0 z-[1000] flex items-center justify-center p-4"
    >
      <div className="t-modal is-open ui-dialog-surface w-full max-w-md rounded-[14px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-divider bg-bg-elevated">
          <h3 className="font-semibold text-text text-[14px]">{title}</h3>
          <button
            onClick={onClose}
            aria-label="关闭弹窗"
            className="text-text-muted hover:text-text text-[18px] leading-none px-2 py-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3.5">
          {error && (
            <div className="p-2.5 rounded-control bg-red-500/10 border border-red-500/20 text-red-400 text-[12px]">
              {error}
            </div>
          )}

          <p className="text-[12px] text-text-muted">
            {mode === "branch"
              ? "将所选条目之前的会话历史创建为一个独立的会话文件。"
              : "将完整会话复制到当前或指定的目标文件夹。"}
          </p>

          {mode === "branch" && targetEntryId && (
            <div>
              <label className="block text-[11px] font-medium text-text-muted mb-1">
                分支起点条目
              </label>
              <input
                type="text"
                value={targetEntryId}
                readOnly
                className="w-full px-2.5 py-1.5 rounded-control bg-bg-panel border border-border text-text-muted font-mono text-[11px] cursor-not-allowed opacity-80"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-1">
              {mode === "branch" ? "分支名称（可选）" : "复制后的会话名称（可选）"}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === "branch" ? "例如：功能探索" : "例如：重构副本"}
              className="w-full px-2.5 py-1.5 rounded-control bg-bg border border-border text-text text-[12px] focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>

          {mode === "clone" && (
            <div>
              <label className="block text-[11px] font-medium text-text-muted mb-1">
                目标文件夹（cwd）
              </label>
              <input
                type="text"
                value={targetCwd}
                onChange={(e) => setTargetCwd(e.target.value)}
                placeholder="留空则使用当前工作文件夹"
                className="w-full px-2.5 py-1.5 rounded-control bg-bg border border-border text-text font-mono text-[12px] focus:outline-none focus:border-accent"
              />
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-divider mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-control border border-border text-text-muted hover:text-text hover:bg-bg-hover transition-colors text-[12px] cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded-control bg-accent text-accent-contrast font-medium hover:opacity-90 transition-opacity cursor-pointer text-[12px] disabled:opacity-50"
            >
              {submitting
                ? "正在处理…"
                : mode === "branch"
                ? "创建分支"
                : "复制会话"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
