import path from "path";
import fs from "fs";
import { listAllSessions } from "./session-reader";
import { validateAgentCwd } from "./path-policy";

// Short-TTL cache for the allowed-roots set. Without this, every file list/read
// request re-scans every pi session on disk just to check access. 5s is short
// enough that newly-created cwds appear promptly; stored on globalThis so it
// survives Next.js hot-reload.
declare global {
  var __piAllowedRootsCache: { roots: Set<string>; expiresAt: number } | undefined;
  // Directories explicitly selected in the application UI. This lives for the
  // lifetime of the server process so a selected workspace remains available
  // even before its first Pi session has been created.
  var __piExplicitAllowedRoots: Set<string> | undefined;
}

const ALLOWED_ROOTS_TTL_MS = 5_000;
const WINDOWS_ABSOLUTE_RE = /^[a-zA-Z]:[\\/]/;

/**
 * Grants file-browser access to a project directory the user selected in the
 * application UI. The same cwd policy used for agent sessions still applies,
 * and resolving the path here prevents storing a symlink alias as an allowed
 * root.
 */
export async function grantAllowedRoot(cwd: string): Promise<string> {
  const realPath = await fs.promises.realpath(cwd);
  const stat = await fs.promises.stat(realPath);
  if (!stat.isDirectory()) {
    throw new Error("Workspace path must be a directory");
  }

  const cwdError = validateAgentCwd(realPath);
  if (cwdError) throw new Error(cwdError);

  const explicitRoots = globalThis.__piExplicitAllowedRoots ?? new Set<string>();
  explicitRoots.add(realPath);
  globalThis.__piExplicitAllowedRoots = explicitRoots;

  // A session lookup may have populated the short-lived cache just before the
  // folder was selected. Update it as well so the first Explorer request does
  // not wait for its TTL to expire.
  globalThis.__piAllowedRootsCache?.roots.add(realPath);
  return realPath;
}

export function normalizeSlashes(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function isWindowsAbsolutePath(filePath: string): boolean {
  return WINDOWS_ABSOLUTE_RE.test(filePath) || filePath.startsWith("\\\\") || filePath.startsWith("//");
}

export async function getAllowedRoots(): Promise<Set<string>> {
  const now = Date.now();
  const cached = globalThis.__piAllowedRootsCache;
  if (cached && cached.expiresAt > now) return cached.roots;

  const sessions = await listAllSessions();
  const roots = new Set<string>();
  for (const s of sessions) {
    // Apply the same safety policy as /api/agent/new so that tampered or
    // legacy session headers with cwd="/" or "C:\" cannot re-grant broad
    // disk access through the allowedRoots cache.
    if (s.cwd && !validateAgentCwd(s.cwd)) roots.add(s.cwd);
  }
  for (const root of globalThis.__piExplicitAllowedRoots ?? []) {
    roots.add(root);
  }
  // Also allow ~/pi-cwd-* directories created by the default-cwd endpoint
  const home = (await import("os")).homedir();
  const { readdir } = await import("fs/promises");
  try {
    const names = await readdir(home);
    for (const name of names) {
      if (/^pi-cwd-\d{8}$/.test(name)) {
        roots.add(path.join(home, name));
      }
    }
  } catch {
    // ignore if home is unreadable
  }

  globalThis.__piAllowedRootsCache = { roots, expiresAt: now + ALLOWED_ROOTS_TTL_MS };
  return roots;
}

export function isPathAllowed(target: string, allowedRoots: Set<string>): boolean {
  for (const root of allowedRoots) {
    const useWindowsRules = isWindowsAbsolutePath(target) || isWindowsAbsolutePath(root);
    const resolver = useWindowsRules ? path.win32 : path;
    const sep = useWindowsRules ? "\\" : path.sep;
    const normalized = resolver.resolve(target);
    const normalizedRoot = resolver.resolve(root);
    const comparable = useWindowsRules ? normalized.toLowerCase() : normalized;
    const comparableRoot = useWindowsRules ? normalizedRoot.toLowerCase() : normalizedRoot;
    const rootWithSep = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep;
    if (comparable === comparableRoot || comparable.startsWith(rootWithSep)) {
      return true;
    }
  }
  return false;
}

/** Convenience: get roots + check in one call. */
export async function isPathAllowedAsync(target: string): Promise<boolean> {
  const roots = await getAllowedRoots();
  return isPathAllowed(target, roots);
}
