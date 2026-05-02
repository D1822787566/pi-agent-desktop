"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderIcon } from "../FileIcons";
import { getFileName } from "@/lib/file-paths";
import type { SessionInfo } from "@/lib/types";
import { SessionTreeItem } from "./SessionTree";
import { buildSessionTree, type SessionTreeNode } from "./helpers";

const SESSION_LIST_VISIBLE_LIMIT = 5;

export interface ProjectGroup {
  cwd: string;
  sessions: SessionInfo[];
}

interface Props {
  projects: ProjectGroup[];
  selectedCwd: string | null;
  selectedSessionId: string | null;
  activeSessionIds: readonly string[];
  expandedCwds: Set<string>;
  addingProject: boolean;
  addProjectError: string | null;
  onAddProject: () => void;
  onSelectProject: (cwd: string) => void;
  onToggleProject: (cwd: string) => void;
  onRemoveProject: (cwd: string) => void;
  onSelectSession: (session: SessionInfo) => void;
  onRenamed: () => void;
  onSessionsDeleted: (ids: string[]) => void;
  onBranchSession?: (session: SessionInfo) => void;
  onCloneSession?: (session: SessionInfo) => void;
  onExportSession?: (session: SessionInfo) => void;
}

function flattenSessionTree(nodes: SessionTreeNode[]): SessionInfo[] {
  const sessions: SessionInfo[] = [];
  const visit = (node: SessionTreeNode) => {
    sessions.push(node.session);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return sessions;
}

/** Keep parent/child links intact while limiting the visible session rows. */
function takeSessionTree(nodes: SessionTreeNode[], limit: number): SessionTreeNode[] {
  let remaining = limit;

  const take = (node: SessionTreeNode): SessionTreeNode | null => {
    if (remaining <= 0) return null;
    remaining -= 1;
    const children: SessionTreeNode[] = [];
    for (const child of node.children) {
      const visibleChild = take(child);
      if (!visibleChild) break;
      children.push(visibleChild);
    }
    return { ...node, children };
  };

  const visible: SessionTreeNode[] = [];
  for (const node of nodes) {
    const visibleNode = take(node);
    if (!visibleNode) break;
    visible.push(visibleNode);
  }
  return visible;
}

function sameSet(first: Set<string>, second: Set<string>): boolean {
  return first.size === second.size && [...first].every((id) => second.has(id));
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

export function ProjectList({
  projects,
  selectedCwd,
  selectedSessionId,
  activeSessionIds,
  expandedCwds,
  addingProject,
  addProjectError,
  onAddProject,
  onSelectProject,
  onToggleProject,
  onRemoveProject,
  onSelectSession,
  onRenamed,
  onSessionsDeleted,
  onBranchSession,
  onCloneSession,
  onExportSession,
}: Props) {
  const [expandedSessionLists, setExpandedSessionLists] = useState<Set<string>>(new Set());
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<
    | { kind: "sessions"; x: number; y: number }
    | { kind: "project"; cwd: string; x: number; y: number }
    | null
  >(null);
  const [confirmingDeleteIds, setConfirmingDeleteIds] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const preserveSelectionForSessionRef = useRef<string | null>(null);

  const sessionOrder = useMemo(
    () => projects.flatMap((project) => flattenSessionTree(buildSessionTree(project.sessions)).map((session) => session.id)),
    [projects]
  );
  const knownSessionIds = useMemo(() => new Set(sessionOrder), [sessionOrder]);

  // Opening a session outside the sidebar should reset to a single selection.
  // Clicks that originate here deliberately preserve Ctrl/Shift selections.
  useEffect(() => {
    setSelectedSessionIds((previous) => {
      const next = new Set([...previous].filter((id) => knownSessionIds.has(id)));
      if (!selectedSessionId) return next.size === 0 ? previous : new Set();
      if (next.has(selectedSessionId)) return sameSet(previous, next) ? previous : next;
      if (preserveSelectionForSessionRef.current === selectedSessionId) {
        preserveSelectionForSessionRef.current = null;
        return sameSet(previous, next) ? previous : next;
      }
      return new Set([selectedSessionId]);
    });
  }, [knownSessionIds, selectedSessionId]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = (event: PointerEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Delete" || deleting || confirmingDeleteIds || isEditableTarget(event.target)) return;
      if (selectedSessionIds.size === 0) return;
      event.preventDefault();
      setDeleteError(null);
      setConfirmingDeleteIds([...selectedSessionIds]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmingDeleteIds, deleting, selectedSessionIds]);

  const handleSelectSession = useCallback((session: SessionInfo, event?: React.MouseEvent) => {
    const additive = Boolean(event?.ctrlKey || event?.metaKey);
    const range = Boolean(event?.shiftKey && selectionAnchorId);
    let nextSelection: Set<string>;

    if (range) {
      const anchorIndex = sessionOrder.indexOf(selectionAnchorId!);
      const targetIndex = sessionOrder.indexOf(session.id);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
        nextSelection = new Set(additive ? selectedSessionIds : []);
        sessionOrder.slice(start, end + 1).forEach((id) => nextSelection.add(id));
      } else {
        nextSelection = new Set([session.id]);
      }
    } else if (additive) {
      nextSelection = new Set(selectedSessionIds);
      if (nextSelection.has(session.id)) nextSelection.delete(session.id); else nextSelection.add(session.id);
    } else {
      nextSelection = new Set([session.id]);
    }

    setSelectedSessionIds(nextSelection);
    setSelectionAnchorId(session.id);

    // Ctrl/Cmd is reserved for selection only. A regular or Shift click also
    // opens the clicked conversation in the main pane.
    if (!additive) {
      preserveSelectionForSessionRef.current = session.id;
      onSelectSession(session);
    }
  }, [onSelectSession, selectedSessionIds, selectionAnchorId, sessionOrder]);

  const handleSessionContextMenu = useCallback((session: SessionInfo, event: React.MouseEvent) => {
    if (!selectedSessionIds.has(session.id)) {
      setSelectedSessionIds(new Set([session.id]));
      setSelectionAnchorId(session.id);
    }
    setContextMenu({ kind: "sessions", x: event.clientX, y: event.clientY });
  }, [selectedSessionIds]);

  const requestDelete = useCallback((ids: Iterable<string>) => {
    const uniqueIds = [...new Set(ids)].filter((id) => knownSessionIds.has(id));
    if (uniqueIds.length === 0) return;
    setContextMenu(null);
    setDeleteError(null);
    setConfirmingDeleteIds(uniqueIds);
  }, [knownSessionIds]);

  const confirmDelete = useCallback(async () => {
    if (!confirmingDeleteIds || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const deleted: string[] = [];
    const failed: string[] = [];

    // Delete one at a time: deleting a parent can reparent forks, so parallel
    // requests would make this destructive operation unnecessarily racy.
    for (const id of confirmingDeleteIds) {
      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        deleted.push(id);
      } catch {
        failed.push(id);
      }
    }

    if (deleted.length > 0) {
      onSessionsDeleted(deleted);
      setSelectedSessionIds((previous) => {
        const next = new Set(previous);
        deleted.forEach((id) => next.delete(id));
        return next;
      });
    }
    setDeleting(false);

    if (failed.length > 0) {
      setConfirmingDeleteIds(failed);
      setDeleteError(`${failed.length} session${failed.length === 1 ? "" : "s"} could not be deleted. Try again.`);
    } else {
      setConfirmingDeleteIds(null);
    }
  }, [confirmingDeleteIds, deleting, onSessionsDeleted]);

  return (
    <div>
      <div className="flex items-center justify-between border-b border-divider bg-bg-subtle px-2.5 py-1.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold tracking-[0.04em] uppercase text-text-muted">Projects</span>
          <span className="text-[10px] text-text-dim">Workspaces &amp; chats</span>
        </div>
        <button
          onClick={onAddProject}
          disabled={addingProject}
          title="Add project folder"
          aria-label="Add project folder"
          className="flex items-center justify-center w-6 h-6 p-0 bg-transparent hover:bg-bg-hover border-none rounded-control text-text-dim hover:text-accent cursor-pointer disabled:cursor-wait disabled:opacity-60 transition-[background-color,color] duration-150"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />
            <path d="M12 10v6M9 13h6" />
          </svg>
        </button>
      </div>

      {addingProject && <div className="px-3 pb-2 text-[11px] text-text-dim">Opening folder picker...</div>}
      {addProjectError && <div className="px-3 pb-2 text-[11px] text-danger">{addProjectError}</div>}

      {projects.map((project) => {
        const expanded = expandedCwds.has(project.cwd);
        const active = project.cwd === selectedCwd;
        const sessionTree = buildSessionTree(project.sessions);
        const collapsedSessionTree = takeSessionTree(sessionTree, SESSION_LIST_VISIBLE_LIMIT);
        const hiddenSessionCount = flattenSessionTree(sessionTree).length - flattenSessionTree(collapsedSessionTree).length;
        const showingAllSessions = expandedSessionLists.has(project.cwd);
        const visibleSessionTree = showingAllSessions ? sessionTree : collapsedSessionTree;
        const label = getFileName(project.cwd);

        return (
          <div key={project.cwd}>
            <div
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ kind: "project", cwd: project.cwd, x: event.clientX, y: event.clientY });
              }}
              className={`flex items-center min-w-0 h-8 pr-2 border-l-2 transition-[background-color,border-color] duration-150 ${
                active ? "bg-bg-selected border-accent" : "border-transparent hover:bg-bg-hover"
              }`}
            >
              <button
                onClick={() => onToggleProject(project.cwd)}
                title={expanded ? "Collapse project" : "Expand project"}
                aria-label={expanded ? "Collapse project" : "Expand project"}
                className={`flex items-center justify-center w-7 h-7 p-0 shrink-0 bg-transparent border-none text-text-dim hover:text-text cursor-pointer transition-transform duration-150 ${
                  expanded ? "rotate-90" : ""
                }`}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 2 7 5 3 8" />
                </svg>
              </button>
              <button
                onClick={() => {
                  onSelectProject(project.cwd);
                  onToggleProject(project.cwd);
                }}
                aria-current={active ? "true" : undefined}
                title={project.cwd}
                className="flex flex-1 min-w-0 items-center gap-1.5 h-full p-0 bg-transparent border-none text-left cursor-pointer"
              >
                <span className="shrink-0 flex items-center text-text-dim"><FolderIcon size={14} open={expanded} /></span>
                <span className={`min-w-0 flex-1 truncate text-[12px] ${active ? "font-semibold text-text-strong" : "font-medium text-text"}`}>
                  {label}
                </span>
                <span className="shrink-0 text-[10px] text-text-dim" title={`${project.sessions.length} sessions`}>
                  {project.sessions.length}
                </span>
              </button>
            </div>

            {expanded && (
              <div className="pb-1" role="listbox" aria-label={`${label} sessions`} aria-multiselectable="true">
                {visibleSessionTree.map((node) => (
                  <SessionTreeItem
                    key={node.session.id}
                    node={node}
                    selectedSessionId={selectedSessionId}
                    selectedSessionIds={selectedSessionIds}
                    activeSessionIds={activeSessionIds}
                    onSelectSession={handleSelectSession}
                    onSessionContextMenu={handleSessionContextMenu}
                    onRenamed={onRenamed}
                    onSessionDeleted={(id) => onSessionsDeleted([id])}
                    onBranchSession={onBranchSession}
                    onCloneSession={onCloneSession}
                    onExportSession={onExportSession}
                    depth={1}
                  />
                ))}
                {hiddenSessionCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpandedSessionLists((previous) => {
                      const next = new Set(previous);
                      if (next.has(project.cwd)) next.delete(project.cwd); else next.add(project.cwd);
                      return next;
                    })}
                    className="ml-10 mt-0.5 rounded-control border-none bg-transparent px-2 py-1 text-[11px] font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
                  >
                    {showingAllSessions ? "Show less" : `Show ${hiddenSessionCount} more`}
                  </button>
                )}
                {sessionTree.length === 0 && (
                  <div className="h-7 pl-10 pr-3 flex items-center text-[11px] text-text-dim">No sessions yet</div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {projects.length === 0 && !addingProject && (
        <div className="px-3 py-4 text-[12px] text-text-muted">Add a project folder to get started.</div>
      )}

      {contextMenu?.kind === "sessions" && selectedSessionIds.size > 0 && (
        <div
          ref={contextMenuRef}
          style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 1000 }}
          className="t-dropdown is-open material-popover w-48 border border-divider rounded-panel shadow-popover py-1 text-[12px] text-text"
          data-origin="top-left"
        >
          <button
            type="button"
            onClick={() => requestDelete(selectedSessionIds)}
            className="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-danger transition-colors hover:bg-bg-hover"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            Delete {selectedSessionIds.size} session{selectedSessionIds.size === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {contextMenu?.kind === "project" && (
        <div
          ref={contextMenuRef}
          style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 1000 }}
          className="t-dropdown is-open material-popover w-52 border border-divider rounded-panel shadow-popover py-1 text-[12px] text-text"
          data-origin="top-left"
        >
          <div className="truncate px-3 py-1.5 text-[11px] text-text-dim" title={contextMenu.cwd}>
            {getFileName(contextMenu.cwd)}
          </div>
          <div className="my-1 border-t border-divider" />
          <button
            type="button"
            onClick={() => {
              const { cwd } = contextMenu;
              setContextMenu(null);
              onRemoveProject(cwd);
            }}
            className="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-danger transition-colors hover:bg-bg-hover"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M7 6V4h10v2" />
              <path d="M6 6l1 14h10l1-14" />
            </svg>
            Remove from sidebar
          </button>
        </div>
      )}

      {confirmingDeleteIds && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/35 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-sessions-title" className="w-full max-w-sm rounded-panel border border-divider bg-bg-elevated p-4 shadow-popover">
            <h2 id="delete-sessions-title" className="text-[14px] font-semibold text-text">Delete {confirmingDeleteIds.length} session{confirmingDeleteIds.length === 1 ? "" : "s"}?</h2>
            <p className="mt-2 text-[12px] leading-[1.55] text-text-muted">This permanently removes the selected session history. Forked sessions are kept and reparented automatically.</p>
            {deleteError && <p className="mt-2 text-[12px] text-danger">{deleteError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => { setConfirmingDeleteIds(null); setDeleteError(null); }}
                className="rounded-control border border-border bg-transparent px-3 py-1.5 text-[12px] font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text disabled:cursor-wait disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDelete()}
                className="rounded-control border-none bg-danger px-3 py-1.5 text-[12px] font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
