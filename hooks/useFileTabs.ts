"use client";

import { useState, useCallback } from "react";
import type { Tab } from "@/components/TabBar";

type ProjectFileTab = Tab & { projectCwd: string };

/**
 * 纯函数：关闭一个 tab 后，下一个 active tab id 应该是什么。
 * 不读取任何外层闭包，便于单元测试。
 *
 * - 若关闭的不是当前 active，active 不变
 * - 若关闭的是当前 active，切到剩余 tab 列表的最后一个
 * - 若剩余 tab 为空，返回 null
 */
export function computeNextActiveId(
  currentActiveId: string | null,
  closingTabId: string,
  remainingTabs: Tab[]
): string | null {
  if (currentActiveId !== closingTabId) return currentActiveId;
  return remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].id : null;
}

/**
 * Keeps every opened file tab alive, while exposing only the tabs belonging to
 * the current project. This makes a project switch restore its previous file
 * view instead of mixing it with the newly selected project's files.
 */
export function useFileTabs(projectCwd: string | null, onTabOpened?: () => void) {
  const [allFileTabs, setAllFileTabs] = useState<ProjectFileTab[]>([]);
  const [activeTabIdsByProject, setActiveTabIdsByProject] = useState<Record<string, string | null>>({});
  const projectKey = projectCwd ?? "";
  const fileTabs = projectCwd ? allFileTabs.filter((tab) => tab.projectCwd === projectCwd) : [];
  const activeFileTabId = activeTabIdsByProject[projectKey] ?? null;

  const setActiveFileTabId = useCallback((tabId: string) => {
    if (!projectCwd) return;
    setActiveTabIdsByProject((previous) => ({ ...previous, [projectCwd]: tabId }));
  }, [projectCwd]);

  const handleOpenFile = useCallback(
    (filePath: string, fileName: string) => {
      if (!projectCwd) return;
      const tabId = `file:${projectCwd}:${filePath}`;
      setAllFileTabs((previous) => {
        if (previous.some((tab) => tab.id === tabId)) return previous;
        return [...previous, { id: tabId, label: fileName, filePath, projectCwd }];
      });
      setActiveTabIdsByProject((previous) => ({ ...previous, [projectCwd]: tabId }));
      onTabOpened?.();
    },
    [onTabOpened, projectCwd]
  );

  const handleCloseFileTab = useCallback((tabId: string) => {
    const closingTab = allFileTabs.find((tab) => tab.id === tabId);
    if (!closingTab) return;
    const next = allFileTabs.filter((tab) => tab.id !== tabId);
    const remainingProjectTabs = next.filter((tab) => tab.projectCwd === closingTab.projectCwd);
    setAllFileTabs(next);
    setActiveTabIdsByProject((activeTabs) => ({
      ...activeTabs,
      [closingTab.projectCwd]: computeNextActiveId(activeTabs[closingTab.projectCwd] ?? null, tabId, remainingProjectTabs),
    }));
  }, [allFileTabs]);

  return {
    fileTabs,
    activeFileTabId,
    setActiveFileTabId,
    handleOpenFile,
    handleCloseFileTab,
  };
}
