"use client";

import { useCallback, useEffect, useState } from "react";
import { sendAgentCommand } from "@/lib/agent-client";
import type { ThinkingLevelOption } from "./session-lifecycle-reset";

type ModelListItem = { id: string; name: string; provider: string };

export type UseSessionModelToolsOptions = {
  isNew: boolean;
  modelsRefreshKey?: number;
  sessionIdRef: React.MutableRefObject<string | null>;
  setNewSessionModelExternal?: (model: { provider: string; modelId: string } | null) => void;
};

export function useSessionModelTools(opts: UseSessionModelToolsOptions) {
  const {
    isNew,
    modelsRefreshKey,
    sessionIdRef,
    setNewSessionModelExternal,
  } = opts;

  const [modelNames, setModelNames] = useState<Record<string, string>>({});
  const [modelList, setModelList] = useState<ModelListItem[]>([]);
  const [modelThinkingLevels, setModelThinkingLevels] = useState<Record<string, string[]>>({});
  const [modelThinkingLevelMaps, setModelThinkingLevelMaps] = useState<
    Record<string, Record<string, string | null>>
  >({});
  const [newSessionModel, setNewSessionModelState] = useState<{
    provider: string;
    modelId: string;
  } | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelOption>("auto");
  const [currentModelOverride, setCurrentModelOverride] = useState<{
    provider: string;
    modelId: string;
  } | null>(null);
  const [pendingModel, setPendingModel] = useState<{
    provider: string;
    modelId: string;
  } | null>(null);

  const setNewSessionModel = setNewSessionModelExternal ?? setNewSessionModelState;

  const handleModelChange = useCallback(
    async (provider: string, modelId: string) => {
      if (isNew) {
        setNewSessionModel({ provider, modelId });
        return;
      }
      const sid = sessionIdRef.current;
      if (!sid) return;
      try {
        await sendAgentCommand(sid, { type: "set_model", provider, modelId });
        setCurrentModelOverride({ provider, modelId });
      } catch (e) {
        console.error("Failed to set model:", e);
      }
    },
    [isNew, setNewSessionModel, sessionIdRef]
  );

  const handleThinkingLevelChange = useCallback(async (level: ThinkingLevelOption) => {
    setThinkingLevel(level);
    if (level === "auto") return;
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "set_thinking_level", level });
    } catch (e) {
      console.error("Failed to set thinking level:", e);
    }
  }, [sessionIdRef]);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then(
        (d: {
          models: Record<string, string>;
          modelList?: ModelListItem[];
          defaultModel?: { provider: string; modelId: string } | null;
          thinkingLevels?: Record<string, string[]>;
          thinkingLevelMaps?: Record<string, Record<string, string | null>>;
        }) => {
          setModelNames(d.models);
          if (d.thinkingLevels) setModelThinkingLevels(d.thinkingLevels);
          if (d.thinkingLevelMaps) setModelThinkingLevelMaps(d.thinkingLevelMaps);
          if (d.modelList) {
            setModelList(d.modelList);
            if (isNew && d.modelList.length > 0) {
              const def = d.defaultModel;
              const match =
                def && d.modelList.find((m) => m.id === def.modelId && m.provider === def.provider);
              const selected = match
                ? { provider: match.provider, modelId: match.id }
                : { provider: d.modelList[0].provider, modelId: d.modelList[0].id };
              setNewSessionModel(selected);
            }
          }
        }
      )
      .catch((err) => {
        console.error("Failed to load model list:", err);
      });
  }, [isNew, modelsRefreshKey, setNewSessionModel]);

  return {
    modelNames,
    modelList,
    modelThinkingLevels,
    modelThinkingLevelMaps,
    newSessionModel,
    thinkingLevel,
    setThinkingLevel,
    currentModelOverride,
    setCurrentModelOverride,
    pendingModel,
    setPendingModel,
    setNewSessionModel,
    handleModelChange,
    handleThinkingLevelChange,
  };
}
