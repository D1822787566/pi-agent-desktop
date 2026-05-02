"use client";

import { useState, useEffect } from "react";
import type { ProviderEntry } from "./types";
import { SectionTitle, Field, TextInput, SecretTextInput, Select, API_OPTIONS } from "./FormControls";

export function ProviderDetail({
  name,
  provider,
  onChange,
  onRename,
  onDelete,
  onDiscoverModels,
}: {
  name: string;
  provider: ProviderEntry;
  onChange: (p: ProviderEntry) => void;
  onRename: (n: string) => void;
  onDelete: () => void;
  onDiscoverModels: () => void;
}) {
  const [editingName, setEditingName] = useState(name);
  useEffect(() => setEditingName(name), [name]);
  const set = <K extends keyof ProviderEntry>(k: K, v: ProviderEntry[K]) => onChange({ ...provider, [k]: v });

  useEffect(() => {
    if (!provider.api) onChange({ ...provider, api: "openai-completions" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.api]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionTitle>提供商</SectionTitle>
        <button onClick={onDelete}
          style={{ padding: "3px 8px", background: "none", border: "1px solid var(--danger-border)", borderRadius: 4, color: "var(--danger)", cursor: "pointer", fontSize: 11 }}>
          删除
        </button>
      </div>

      <Field label="提供商名称">
        <TextInput value={editingName} onChange={setEditingName} placeholder="provider-name" mono />
        {editingName !== name && editingName.trim() && (
          <button onClick={() => onRename(editingName.trim())}
            style={{ marginTop: 4, padding: "3px 10px", background: "var(--accent)", border: "none", borderRadius: 4, color: "var(--accent-contrast)", cursor: "pointer", fontSize: 11, alignSelf: "flex-start" }}>
            重命名
          </button>
        )}
      </Field>

      <Field label="基础 URL">
        <TextInput value={provider.baseUrl ?? ""} onChange={(v) => set("baseUrl", v || undefined)}
          placeholder="https://api.example.com/v1" mono />
      </Field>

      <Field label="API 密钥">
        <SecretTextInput value={provider.apiKey ?? ""} onChange={(v) => set("apiKey", v || undefined)}
          placeholder="环境变量名、!shell-command 或直接填写密钥" mono />
        <span style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
          以 <code style={{ fontFamily: "var(--font-mono)" }}>!</code> 开头可运行 Shell 命令，或填写环境变量名
        </span>
      </Field>

      <Field label="API">
        <Select value={provider.api ?? "openai-completions"} onChange={(v) => set("api", v)} options={API_OPTIONS} required />
      </Field>

      <button
        type="button"
        onClick={onDiscoverModels}
        disabled={!provider.baseUrl?.trim() || !provider.apiKey?.trim()}
        title={provider.baseUrl?.trim() && provider.apiKey?.trim() ? "获取此提供商可用的模型" : "请先填写基础 URL 和 API 密钥"}
        style={{
          alignSelf: "flex-start",
          padding: "6px 10px",
          border: "1px solid var(--border)",
          borderRadius: 5,
          background: "var(--bg-panel)",
          color: provider.baseUrl?.trim() && provider.apiKey?.trim() ? "var(--text)" : "var(--text-dim)",
          cursor: provider.baseUrl?.trim() && provider.apiKey?.trim() ? "pointer" : "not-allowed",
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        获取所有可用模型
      </button>
    </div>
  );
}
