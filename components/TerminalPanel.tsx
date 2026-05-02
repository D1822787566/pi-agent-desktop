"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

type TerminalEvent =
  | { type: "data"; data: string }
  | { type: "exit"; exitCode?: number; signal?: number };

interface TerminalPanelProps {
  cwd: string | null;
  active: boolean;
}

async function destroyTerminal(id: string) {
  try {
    await fetch(`/api/terminal?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // The Next.js process may already be stopping with the desktop app.
  }
}

export function TerminalPanel({ cwd, active }: TerminalPanelProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const resizeTerminalRef = useRef<(() => void) | null>(null);
  const focusTerminalRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    activeRef.current = active;
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      resizeTerminalRef.current?.();
      focusTerminalRef.current?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !cwd) return;

    let disposed = false;
    let terminalId: string | null = null;
    let eventSource: EventSource | null = null;
    let animationFrame: number | null = null;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      convertEol: true,
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      lineHeight: 1.25,
      scrollback: 10_000,
      theme: {
        background: "#080d14",
        foreground: "#d9deea",
        cursor: "#8ab4f8",
        selectionBackground: "#3b82f666",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);

    const resizeTerminal = () => {
      if (!activeRef.current) return;
      try {
        fitAddon.fit();
        if (terminalId) {
          void fetch(`/api/terminal?id=${encodeURIComponent(terminalId)}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "resize", cols: terminal.cols, rows: terminal.rows }),
          });
        }
      } catch {
        // The panel can briefly have no measurable size while it is animating.
      }
    };
    resizeTerminalRef.current = resizeTerminal;
    focusTerminalRef.current = () => terminal.focus();
    const resizeObserver = new ResizeObserver(() => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(resizeTerminal);
    });
    resizeObserver.observe(host);
    resizeTerminal();

    const inputSubscription = terminal.onData((data) => {
      if (!terminalId) return;
      void fetch(`/api/terminal?id=${encodeURIComponent(terminalId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "input", data }),
      });
    });

    const start = async () => {
      try {
        const response = await fetch("/api/terminal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cwd, cols: terminal.cols, rows: terminal.rows }),
        });
        const payload = await response.json() as { terminalId?: string; shell?: string; error?: string };
        if (!response.ok || !payload.terminalId) {
          terminal.writeln(`\x1b[31mUnable to start terminal: ${payload.error || response.statusText}\x1b[0m`);
          return;
        }
        terminalId = payload.terminalId;
        if (disposed) {
          void destroyTerminal(terminalId);
          return;
        }
        terminal.writeln(`\x1b[90m${payload.shell || "Shell"} · ${cwd}\x1b[0m`);
        resizeTerminal();
        eventSource = new EventSource(`/api/terminal?id=${encodeURIComponent(terminalId)}`);
        eventSource.onmessage = (event) => {
          try {
            const terminalEvent = JSON.parse(event.data) as TerminalEvent;
            if (terminalEvent.type === "data") {
              terminal.write(terminalEvent.data);
            } else {
              terminal.writeln(`\r\n\x1b[90mTerminal exited${terminalEvent.exitCode === undefined ? "" : ` (${terminalEvent.exitCode})`}\x1b[0m`);
              eventSource?.close();
            }
          } catch {
            terminal.writeln("\x1b[31mReceived invalid terminal output.\x1b[0m");
          }
        };
        eventSource.onerror = () => {
          if (!disposed) terminal.writeln("\x1b[31m终端连接已断开。请关闭并重新打开此标签页以恢复连接。\x1b[0m");
          eventSource?.close();
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        terminal.writeln(`\x1b[31mUnable to start terminal: ${message}\x1b[0m`);
      }
    };
    void start();

    return () => {
      disposed = true;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      inputSubscription.dispose();
      eventSource?.close();
      terminal.dispose();
      resizeTerminalRef.current = null;
      focusTerminalRef.current = null;
      if (terminalId) void destroyTerminal(terminalId);
    };
  }, [cwd]);

  if (!cwd) {
    return <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-text-dim">请先选择一个项目，再打开终端。</div>;
  }

  return <div ref={hostRef} className={active ? "h-full min-h-0 overflow-hidden bg-[#080d14] p-2" : "hidden"} aria-label={`${cwd} 中的终端`} />;
}
