"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import type { SessionInfo } from "@/lib/types";
import { FileExplorer } from "./FileExplorer";
import { SidebarHeader } from "./session-sidebar/SidebarHeader";
import { ProjectList, type ProjectGroup } from "./session-sidebar/ProjectList";
import { getRecentCwds, authorizeWorkspacePath, pickDirectoryFromHost } from "./session-sidebar/helpers";
import { resolveCustomPathSelection } from "@/lib/custom-path-selection";
import { getFileName } from "@/lib/file-paths";

const SAVED_PROJECTS_STORAGE_KEY = "pi-agent-desktop.projects";
const HIDDEN_PROJECTS_STORAGE_KEY = "pi-agent-desktop.hidden-projects";

interface Props {
  selectedSessionId: string | null;
  onSelectSession: (session: SessionInfo, isRestore?: boolean) => void;
  onNewSession?: (sessionId: string, cwd: string) => void;
  initialSessionId?: string | null;
  onInitialRestoreDone?: () => void;
  refreshKey?: number;
  /** Sessions just created by the active chat, before they are indexed on disk. */
  optimisticSessions?: readonly SessionInfo[];
  onOptimisticSessionsReconciled?: (sessionIds: string[]) => void;
  activeSessionIds?: readonly string[];
  onActiveSessionsInactive?: (sessionIds: string[]) => void;
  /** A single session whose metadata changed after an agent response. */
  sessionUpdate?: { id: string; revision: number } | null;
  onSessionDeleted?: (sessionId: string) => void;
  onProjectRemoved?: (cwd: string) => void;
  onBranchSession?: (session: SessionInfo) => void;
  onCloneSession?: (session: SessionInfo) => void;
  onExportSession?: (session: SessionInfo) => void;
  selectedCwd?: string | null;
  onCwdChange?: (cwd: string | null) => void;
  onOpenFile?: (filePath: string, fileName: string) => void;
  activeFilePath?: string | null;
  explorerRefreshKey?: number;
  onAtMention?: (relativePath: string) => void;
}

export function SessionSidebar({
  selectedSessionId,
  onSelectSession,
  onNewSession,
  initialSessionId,
  onInitialRestoreDone,
  refreshKey,
  optimisticSessions = [],
  onOptimisticSessionsReconciled,
  activeSessionIds = [],
  onActiveSessionsInactive,
  sessionUpdate,
  onSessionDeleted,
  onProjectRemoved,
  onBranchSession,
  onCloneSession,
  onExportSession,
  selectedCwd: selectedCwdProp,
  onCwdChange,
  onOpenFile,
  activeFilePath,
  explorerRefreshKey,
  onAtMention,
}: Props) {
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedCwd = selectedCwdProp ?? null;
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [explorerKey, setExplorerKey] = useState(0);
  const [sessionRefreshDone, setSessionRefreshDone] = useState(false);
  const [explorerRefreshDone, setExplorerRefreshDone] = useState(false);
  const [savedProjectCwds, setSavedProjectCwds] = useState<string[]>([]);
  const [hiddenProjectCwds, setHiddenProjectCwds] = useState<string[]>([]);
  const [expandedProjectCwds, setExpandedProjectCwds] = useState<Set<string>>(new Set());
  const [addingProject, setAddingProject] = useState(false);
  const [addProjectError, setAddProjectError] = useState<string | null>(null);
  
  const sessionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explorerRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSessions = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { sessions: SessionInfo[] };
      setAllSessions(data.sessions);
      setError(null);
      if (!showLoading) {
        setSessionRefreshDone(true);
        if (sessionRefreshTimerRef.current) clearTimeout(sessionRefreshTimerRef.current);
        sessionRefreshTimerRef.current = setTimeout(() => setSessionRefreshDone(false), 2000);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    const isFirst = !initialLoadDone.current;
    initialLoadDone.current = true;
    loadSessions(isFirst);
  }, [loadSessions, refreshKey]);

  useEffect(() => {
    const indexedIds = optimisticSessions
      .filter((optimistic) => allSessions.some((session) => session.id === optimistic.id))
      .map((session) => session.id);
    if (indexedIds.length > 0) onOptimisticSessionsReconciled?.(indexedIds);
  }, [allSessions, onOptimisticSessionsReconciled, optimisticSessions]);

  useEffect(() => {
    if (activeSessionIds.length === 0) return;
    let cancelled = false;

    const refreshActiveSessions = async () => {
      const inactive = (await Promise.all(activeSessionIds.map(async (sessionId) => {
        try {
          const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}?includeState=1`);
          if (!res.ok) return null;
          const data = (await res.json()) as {
            agentState?: { running?: boolean; state?: { isStreaming?: boolean } };
          };
          return data.agentState?.running && data.agentState.state?.isStreaming ? null : sessionId;
        } catch {
          // Keep the indicator through a transient network failure.
          return null;
        }
      }))).filter((sessionId): sessionId is string => sessionId !== null);
      if (!cancelled && inactive.length > 0) onActiveSessionsInactive?.(inactive);
    };

    const timer = setInterval(() => {
      void refreshActiveSessions();
    }, 3_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeSessionIds, onActiveSessionsInactive]);

  useEffect(() => {
    if (!sessionUpdate) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionUpdate.id)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { info?: SessionInfo | null };
        const updated = data.info;
        if (!updated || cancelled) return;

        // Patch just this session so expanded project state and every other
        // sidebar row retain their existing identity and visual state.
        setAllSessions((previous) => {
          const hasExisting = previous.some((session) => session.id === updated.id);
          if (!hasExisting) return [updated, ...previous];
          return previous.map((session) => session.id === updated.id ? updated : session);
        });
      } catch {
        // The next manual/list refresh will reconcile a transient read error.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionUpdate]);

  useEffect(() => {
    if (explorerRefreshKey !== undefined) setExplorerKey((k) => k + 1);
  }, [explorerRefreshKey]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SAVED_PROJECTS_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed) && parsed.every((cwd) => typeof cwd === "string")) {
        setSavedProjectCwds([...new Set(parsed)]);
      }
      const hidden = localStorage.getItem(HIDDEN_PROJECTS_STORAGE_KEY);
      const hiddenParsed = hidden ? JSON.parse(hidden) : [];
      if (Array.isArray(hiddenParsed) && hiddenParsed.every((cwd) => typeof cwd === "string")) {
        setHiddenProjectCwds([...new Set(hiddenParsed)]);
      }
    } catch {
      // A corrupt local preference should not block the sidebar.
    }
  }, []);

  const rememberProject = useCallback((cwd: string) => {
    setSavedProjectCwds((previous) => {
      if (previous.includes(cwd)) return previous;
      const next = [cwd, ...previous];
      try {
        localStorage.setItem(SAVED_PROJECTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // The project remains available during this app session if storage is unavailable.
      }
      return next;
    });
    setHiddenProjectCwds((previous) => {
      if (!previous.includes(cwd)) return previous;
      const next = previous.filter((item) => item !== cwd);
      try {
        localStorage.setItem(HIDDEN_PROJECTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // The project is still restored for this app session if storage is unavailable.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!selectedCwd) return;
    rememberProject(selectedCwd);
    setExpandedProjectCwds((previous) => {
      if (previous.has(selectedCwd)) return previous;
      const next = new Set(previous);
      next.add(selectedCwd);
      return next;
    });
  }, [selectedCwd, rememberProject]);

  const restoredRef = useRef(false);

  const displaySessions = useMemo(() => {
    const indexedIds = new Set(allSessions.map((session) => session.id));
    const unindexed = optimisticSessions.filter((session) => !indexedIds.has(session.id));
    return unindexed.length > 0 ? [...unindexed, ...allSessions] : allSessions;
  }, [allSessions, optimisticSessions]);

  // Auto-select cwd and restore session from URL on first load
  useEffect(() => {
    if (allSessions.length === 0) return;

    if (selectedCwd === null) {
      // If restoring a session, set cwd to match that session
      if (initialSessionId && !restoredRef.current) {
        restoredRef.current = true;
        const target = allSessions.find((s) => s.id === initialSessionId);
        if (target) {
          onSelectSession(target, true);
          return;
        }
        // Session not found — notify parent so it can show the placeholder
        onInitialRestoreDone?.();
      }
      const cwds = getRecentCwds(allSessions);
      if (cwds.length > 0) onCwdChange?.(cwds[0]);
    }
  }, [allSessions, selectedCwd, initialSessionId, onCwdChange, onSelectSession, onInitialRestoreDone]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (sessionRefreshTimerRef.current) clearTimeout(sessionRefreshTimerRef.current);
      if (explorerRefreshTimerRef.current) clearTimeout(explorerRefreshTimerRef.current);
    };
  }, []);

  const projects = useMemo<ProjectGroup[]>(() => {
    const sessionsByCwd = new Map<string, SessionInfo[]>();
    const newestByCwd = new Map<string, string>();
    for (const session of displaySessions) {
      if (!session.cwd) continue;
      const sessions = sessionsByCwd.get(session.cwd) ?? [];
      sessions.push(session);
      sessionsByCwd.set(session.cwd, sessions);
      const newest = newestByCwd.get(session.cwd);
      if (!newest || session.modified > newest) newestByCwd.set(session.cwd, session.modified);
    }
    for (const cwd of savedProjectCwds) {
      if (!sessionsByCwd.has(cwd)) sessionsByCwd.set(cwd, []);
    }
    if (selectedCwd && !sessionsByCwd.has(selectedCwd)) sessionsByCwd.set(selectedCwd, []);

    const hiddenProjects = new Set(hiddenProjectCwds);
    return [...sessionsByCwd.entries()]
      .filter(([cwd]) => !hiddenProjects.has(cwd))
      .sort(([firstCwd], [secondCwd]) => {
        const byNewestSession = (newestByCwd.get(secondCwd) ?? "").localeCompare(newestByCwd.get(firstCwd) ?? "");
        return byNewestSession || firstCwd.localeCompare(secondCwd);
      })
      .map(([cwd, sessions]) => ({ cwd, sessions }));
  }, [displaySessions, hiddenProjectCwds, savedProjectCwds, selectedCwd]);

  const handleAddProject = useCallback(async () => {
    setAddingProject(true);
    setAddProjectError(null);
    try {
      const selectedPath = await pickDirectoryFromHost();
      const { nextCwd } = resolveCustomPathSelection(selectedCwd, selectedPath);
      if (!nextCwd) return;
      const cwd = await authorizeWorkspacePath(nextCwd);
      rememberProject(cwd);
      setExpandedProjectCwds((previous) => new Set(previous).add(cwd));
      onCwdChange?.(cwd);
    } catch (error) {
      setAddProjectError(error instanceof Error ? error.message : String(error));
    } finally {
      setAddingProject(false);
    }
  }, [onCwdChange, rememberProject, selectedCwd]);

  const handleSelectProject = useCallback((cwd: string) => {
    rememberProject(cwd);
    onCwdChange?.(cwd);
  }, [onCwdChange, rememberProject]);

  const handleToggleProject = useCallback((cwd: string) => {
    setExpandedProjectCwds((previous) => {
      const next = new Set(previous);
      if (next.has(cwd)) next.delete(cwd); else next.add(cwd);
      return next;
    });
  }, []);

  const handleRemoveProject = useCallback((cwd: string) => {
    setSavedProjectCwds((previous) => {
      const next = previous.filter((item) => item !== cwd);
      try {
        localStorage.setItem(SAVED_PROJECTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // The project remains removed for this app session if storage is unavailable.
      }
      return next;
    });
    setHiddenProjectCwds((previous) => {
      if (previous.includes(cwd)) return previous;
      const next = [...previous, cwd];
      try {
        localStorage.setItem(HIDDEN_PROJECTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // The project remains hidden for this app session if storage is unavailable.
      }
      return next;
    });
    setExpandedProjectCwds((previous) => {
      if (!previous.has(cwd)) return previous;
      const next = new Set(previous);
      next.delete(cwd);
      return next;
    });
    onProjectRemoved?.(cwd);
  }, [onProjectRemoved]);

  const handleSessionsDeleted = useCallback((ids: string[]) => {
    const deleted = new Set(ids);
    setAllSessions((previous) => previous.filter((session) => !deleted.has(session.id)));
    ids.forEach((id) => onSessionDeleted?.(id));
    void loadSessions();
  }, [loadSessions, onSessionDeleted]);

  const explorerCwd = selectedCwdProp ?? selectedCwd;
  const explorerProjectName = explorerCwd ? getFileName(explorerCwd) : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <SidebarHeader
        selectedCwd={selectedCwd}
        onNewSession={onNewSession}
        loadSessions={loadSessions}
        sessionRefreshDone={sessionRefreshDone}
      />

      {/* Projects with their sessions */}
      <div
        style={{
          flex: explorerOpen && (selectedCwdProp || selectedCwd) ? "1 1 0" : "1 1 auto",
          overflowY: "auto",
          padding: "0",
          minHeight: 80,
        }}
      >
        {loading && (
          <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>
            Loading...
          </div>
        )}
        {error && (
          <div style={{ padding: "12px 14px", color: "var(--danger)", fontSize: 12 }}>
            {error}
          </div>
        )}
        {!loading && !error && (
          <ProjectList
            projects={projects}
            selectedCwd={selectedCwd}
            selectedSessionId={selectedSessionId}
            activeSessionIds={activeSessionIds}
            expandedCwds={expandedProjectCwds}
            addingProject={addingProject}
            addProjectError={addProjectError}
            onAddProject={() => void handleAddProject()}
            onSelectProject={handleSelectProject}
            onToggleProject={handleToggleProject}
            onRemoveProject={handleRemoveProject}
            onSelectSession={onSelectSession}
            onRenamed={() => void loadSessions()}
            onSessionsDeleted={handleSessionsDeleted}
            onBranchSession={onBranchSession}
            onCloneSession={onCloneSession}
            onExportSession={onExportSession}
          />
        )}
      </div>

      {/* File Explorer section */}
      {explorerCwd && (
        <div
          style={{
            borderTop: "2px solid var(--border)",
            background: "var(--bg-subtle)",
            display: "flex",
            flexDirection: "column",
            flex: explorerOpen ? "1 1 0" : "0 0 auto",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0, background: "var(--bg-panel)", borderBottom: "1px solid var(--divider)" }}>
            <button
              onClick={() => setExplorerOpen((v) => !v)}
              title={`当前项目文件：${explorerCwd}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flex: 1,
                padding: "6px 10px",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                textAlign: "left",
              }}
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: explorerOpen ? "rotate(90deg)" : "none",
                  transition: "transform 0.15s",
                  flexShrink: 0,
                }}
              >
                <polyline points="3 2 7 5 3 8" />
              </svg>
              <span>文件</span>
              <span
                title={explorerCwd}
                style={{
                  maxWidth: 108,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  padding: "1px 5px",
                  borderRadius: "4px",
                  background: "var(--bg-selected)",
                  color: "var(--text-dim)",
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: 0,
                  textTransform: "none",
                }}
              >
                {explorerProjectName}
              </span>
            </button>
            <button
              onClick={() => {
                setExplorerKey((k) => k + 1);
                setExplorerRefreshDone(true);
                if (explorerRefreshTimerRef.current) clearTimeout(explorerRefreshTimerRef.current);
                explorerRefreshTimerRef.current = setTimeout(() => setExplorerRefreshDone(false), 2000);
              }}
              title="刷新文件列表"
              aria-label="刷新文件列表"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 26,
                height: 26,
                padding: 0,
                marginRight: 6,
                background: explorerRefreshDone ? "var(--success-bg)" : "none",
                border: "none",
                color: explorerRefreshDone ? "var(--success)" : "var(--text-dim)",
                cursor: "pointer",
                borderRadius: "var(--radius-control)",
                flexShrink: 0,
                transition: "color 0.3s, background 0.3s",
              }}
              onMouseEnter={(e) => {
                if (explorerRefreshDone) return;
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (explorerRefreshDone) return;
                e.currentTarget.style.color = "var(--text-dim)";
                e.currentTarget.style.background = "none";
              }}
            >
              {explorerRefreshDone ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
            </button>
          </div>
          {explorerOpen && (
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: "var(--bg)" }}>
              <FileExplorer
                cwd={explorerCwd}
                onOpenFile={onOpenFile ?? (() => {})}
                activeFilePath={activeFilePath}
                refreshKey={explorerKey}
                onAtMention={onAtMention}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
