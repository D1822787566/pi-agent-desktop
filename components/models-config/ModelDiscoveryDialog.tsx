"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProviderEntry } from "./types";

interface DiscoveredModel {
  id: string;
  name?: string;
}

type DiscoveryState =
  | { phase: "loading" }
  | { phase: "ready"; models: DiscoveredModel[] }
  | { phase: "error"; message: string };

export function ModelDiscoveryDialog({
  providerName,
  provider,
  existingModelIds,
  onConfirm,
  onClose,
}: {
  providerName: string;
  provider: ProviderEntry;
  existingModelIds: string[];
  onConfirm: (modelIds: string[]) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<DiscoveryState>({ phase: "loading" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const existingIds = useMemo(() => new Set(existingModelIds), [existingModelIds]);

  useEffect(() => {
    const controller = new AbortController();
    setState({ phase: "loading" });
    setSelectedIds(new Set());

    void (async () => {
      try {
        const res = await fetch("/api/models-config/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerName, provider }),
          signal: controller.signal,
        });
        const body = await res.json() as { models?: DiscoveredModel[]; error?: string };
        if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);

        const models = Array.isArray(body.models) ? body.models : [];
        if (controller.signal.aborted) return;
        setState({ phase: "ready", models });
        setSelectedIds(new Set(models.filter((model) => !existingIds.has(model.id)).map((model) => model.id)));
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ phase: "error", message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => controller.abort();
  }, [existingIds, provider, providerName]);

  const selectableModels = state.phase === "ready" ? state.models.filter((model) => !existingIds.has(model.id)) : [];
  const allSelected = selectableModels.length > 0 && selectableModels.every((model) => selectedIds.has(model.id));

  const toggleModel = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableModels.map((model) => model.id)));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="可用模型"
      style={{ position: "fixed", inset: 0, zIndex: 1100, padding: 20, background: "rgba(0,0,0,0.42)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="ui-dialog-surface" style={{ width: "100%", maxWidth: 560, maxHeight: "min(680px, calc(100vh - 40px))", display: "flex", flexDirection: "column", background: "var(--material-popover)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-popover)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ color: "var(--text)", fontSize: 14, fontWeight: 700 }}>可用模型</div>
            <div style={{ marginTop: 3, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{providerName}</div>
          </div>
          <button onClick={onClose} aria-label="关闭可用模型" style={{ padding: "2px 6px", border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ minHeight: 160, overflowY: "auto", padding: "12px 16px" }}>
          {state.phase === "loading" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 150, color: "var(--text-muted)", fontSize: 12 }}>正在获取可用模型…</div>
          )}
          {state.phase === "error" && (
            <div style={{ color: "var(--danger)", fontSize: 12, lineHeight: 1.5 }}>
              Unable to get models: {state.message}
            </div>
          )}
          {state.phase === "ready" && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--text)", cursor: selectableModels.length ? "pointer" : "default", fontSize: 12, fontWeight: 600 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!selectableModels.length} aria-label="全选可用模型" style={{ width: 14, height: 14, accentColor: "var(--accent)", cursor: selectableModels.length ? "pointer" : "default" }} />
                  全选
                </label>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>已选 {selectedIds.size} 个</span>
              </div>

              {state.models.length === 0 ? (
                <div style={{ padding: "32px 0", color: "var(--text-muted)", textAlign: "center", fontSize: 12 }}>此提供商未返回任何模型。</div>
              ) : (
                <div role="group" aria-label="已发现的模型" style={{ borderTop: "1px solid var(--border)" }}>
                  {state.models.map((model) => {
                    const alreadyAdded = existingIds.has(model.id);
                    return (
                      <label key={model.id} style={{ display: "flex", alignItems: "center", gap: 9, minHeight: 38, padding: "7px 2px", borderBottom: "1px solid var(--border)", color: alreadyAdded ? "var(--text-dim)" : "var(--text)", cursor: alreadyAdded ? "default" : "pointer" }}>
                        <input
                          type="checkbox"
                          checked={alreadyAdded || selectedIds.has(model.id)}
                          disabled={alreadyAdded}
                          onChange={() => toggleModel(model.id)}
                          aria-label={`选择 ${model.id}`}
                          style={{ width: 14, height: 14, flexShrink: 0, accentColor: "var(--accent)", cursor: alreadyAdded ? "default" : "pointer" }}
                        />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: "block", overflow: "hidden", color: "inherit", fontFamily: "var(--font-mono)", fontSize: 12, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{model.id}</span>
                          {model.name && <span style={{ display: "block", marginTop: 2, overflow: "hidden", color: "var(--text-muted)", fontSize: 11, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{model.name}</span>}
                        </span>
                        {alreadyAdded && <span style={{ color: "var(--text-dim)", fontSize: 10, flexShrink: 0 }}>已添加</span>}
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} style={{ padding: "6px 13px", border: "1px solid var(--border)", borderRadius: 6, background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}>取消</button>
          <button
            onClick={() => onConfirm([...selectedIds])}
            disabled={state.phase !== "ready" || selectedIds.size === 0}
            style={{ padding: "6px 13px", border: "none", borderRadius: 6, background: state.phase === "ready" && selectedIds.size ? "var(--accent)" : "var(--bg-panel)", color: state.phase === "ready" && selectedIds.size ? "var(--accent-contrast)" : "var(--text-dim)", cursor: state.phase === "ready" && selectedIds.size ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600 }}
          >
            添加所选模型{selectedIds.size ? `（${selectedIds.size}）` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
