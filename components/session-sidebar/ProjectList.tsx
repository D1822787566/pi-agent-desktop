"use client";

import { FolderIcon } from "../FileIcons";
import { getFileName } from "@/lib/file-paths";
import type { SessionInfo } from "@/lib/types";
import { SessionTreeItem } from "./SessionTree";
import { buildSessionTree } from "./helpers";

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
  onSelectSession: (session: SessionInfo) => void;
  onRenamed: () => void;
  onSessionDeleted: (id: string) => void;
  onBranchSession?: (session: SessionInfo) => void;
  onCloneSession?: (session: SessionInfo) => void;
  onExportSession?: (session: SessionInfo) => void;
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
  onSelectSession,
  onRenamed,
  onSessionDeleted,
  onBranchSession,
  onCloneSession,
  onExportSession,
}: Props) {
  return (
    <div>
      <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
        <span className="text-[11px] font-semibold tracking-[0.04em] uppercase text-text-muted">Projects</span>
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
        const label = getFileName(project.cwd);

        return (
          <div key={project.cwd}>
            <div
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
              <div className="pb-1">
                {sessionTree.map((node) => (
                  <SessionTreeItem
                    key={node.session.id}
                    node={node}
                    selectedSessionId={selectedSessionId}
                    activeSessionIds={activeSessionIds}
                    onSelectSession={onSelectSession}
                    onRenamed={onRenamed}
                    onSessionDeleted={onSessionDeleted}
                    onBranchSession={onBranchSession}
                    onCloneSession={onCloneSession}
                    onExportSession={onExportSession}
                    depth={1}
                  />
                ))}
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
    </div>
  );
}
