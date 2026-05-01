import { randomUUID } from "node:crypto";
import { spawn } from "node-pty";

export const MAX_TERMINAL_INPUT_BYTES = 64 * 1024;
const MAX_TRANSCRIPT_BYTES = 512 * 1024;

export type TerminalOutputEvent =
  | { type: "data"; data: string }
  | { type: "exit"; exitCode: number | undefined; signal: number | undefined };

export interface PtyProcess {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): unknown;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): unknown;
}

export type PtySpawner = (
  file: string,
  args: string[],
  options: {
    name: string;
    cols: number;
    rows: number;
    cwd: string;
    env: NodeJS.ProcessEnv;
  }
) => PtyProcess;

type TerminalSession = {
  pty: PtyProcess;
  transcript: string;
  listeners: Set<(event: TerminalOutputEvent) => void>;
  closed: boolean;
  closeTimer?: NodeJS.Timeout;
};

export interface TerminalManager {
  create(cwd: string, dimensions?: { cols?: number; rows?: number }): { id: string; shell: string };
  write(id: string, data: string): boolean;
  resize(id: string, cols: number, rows: number): boolean;
  close(id: string): boolean;
  subscribe(id: string, listener: (event: TerminalOutputEvent) => void): (() => void) | null;
  has(id: string): boolean;
}

function getShell(): { file: string; args: string[] } {
  if (process.platform === "win32") {
    return { file: process.env.PI_TERMINAL_SHELL || "powershell.exe", args: ["-NoLogo"] };
  }
  return { file: process.env.SHELL || "/bin/bash", args: ["-l"] };
}

function clampDimension(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(2, Math.floor(value)));
}

function appendTranscript(current: string, next: string): string {
  const combined = current + next;
  if (Buffer.byteLength(combined, "utf8") <= MAX_TRANSCRIPT_BYTES) return combined;
  // The terminal only replays a convenience buffer when the SSE connection is
  // established. Keep the newest portion rather than retaining an unbounded log.
  return combined.slice(Math.max(0, combined.length - MAX_TRANSCRIPT_BYTES));
}

export function createTerminalManager(ptySpawn: PtySpawner = spawn as unknown as PtySpawner): TerminalManager {
  const sessions = new Map<string, TerminalSession>();

  const emit = (session: TerminalSession, event: TerminalOutputEvent) => {
    for (const listener of session.listeners) listener(event);
  };

  const finish = (id: string, session: TerminalSession, event: Extract<TerminalOutputEvent, { type: "exit" }>) => {
    if (session.closeTimer) {
      clearTimeout(session.closeTimer);
      session.closeTimer = undefined;
    }
    if (session.closed) return;
    session.closed = true;
    emit(session, event);
    session.listeners.clear();
    sessions.delete(id);
  };

  return {
    create(cwd, dimensions) {
      const shell = getShell();
      const id = randomUUID();
      const pty = ptySpawn(shell.file, shell.args, {
        name: "xterm-256color",
        cols: clampDimension(dimensions?.cols, 80, 500),
        rows: clampDimension(dimensions?.rows, 24, 300),
        cwd,
        env: process.env,
      });
      const session: TerminalSession = {
        pty,
        transcript: "",
        listeners: new Set(),
        closed: false,
      };
      sessions.set(id, session);

      pty.onData((data) => {
        if (session.closed) return;
        session.transcript = appendTranscript(session.transcript, data);
        emit(session, { type: "data", data });
      });
      pty.onExit(({ exitCode, signal }) => {
        finish(id, session, { type: "exit", exitCode, signal });
      });

      return { id, shell: shell.file };
    },

    write(id, data) {
      const session = sessions.get(id);
      if (!session || session.closed || !data || Buffer.byteLength(data, "utf8") > MAX_TERMINAL_INPUT_BYTES) return false;
      session.pty.write(data);
      return true;
    },

    resize(id, cols, rows) {
      const session = sessions.get(id);
      if (!session || session.closed) return false;
      session.pty.resize(clampDimension(cols, 80, 500), clampDimension(rows, 24, 300));
      return true;
    },

    close(id) {
      const session = sessions.get(id);
      if (!session || session.closed) return false;
      finish(id, session, { type: "exit", exitCode: undefined, signal: undefined });
      try {
        // Asking the shell to exit avoids node-pty's Windows ConPTY kill helper,
        // which can write an AttachConsole error when the host has no console.
        session.pty.write("exit\r");
      } catch {
        try { session.pty.kill(); } catch {}
      }
      // PowerShell normally exits immediately. A bounded forced close prevents
      // abandoned terminals from surviving a panel switch if a shell ignores it.
      session.closeTimer = setTimeout(() => {
        try { session.pty.kill(); } catch {}
      }, 750);
      session.closeTimer.unref();
      return true;
    },

    subscribe(id, listener) {
      const session = sessions.get(id);
      if (!session || session.closed) return null;
      if (session.transcript) listener({ type: "data", data: session.transcript });
      session.listeners.add(listener);
      return () => session.listeners.delete(listener);
    },

    has(id) {
      return sessions.has(id);
    },
  };
}

declare global {
  var __piTerminalManager: TerminalManager | undefined;
}

export function getTerminalManager(): TerminalManager {
  if (!globalThis.__piTerminalManager) {
    globalThis.__piTerminalManager = createTerminalManager();
  }
  return globalThis.__piTerminalManager;
}
