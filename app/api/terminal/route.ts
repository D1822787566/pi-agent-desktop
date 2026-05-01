import { existsSync, statSync } from "node:fs";
import { NextResponse } from "next/server.js";
import { isPathAllowedAsync } from "../../../lib/allowed-roots.ts";
import { errorMessage, getRequestId, logApiError } from "../../../lib/api-error.ts";
import { validateAgentCwd } from "../../../lib/path-policy.ts";
import { getTerminalManager, MAX_TERMINAL_INPUT_BYTES, type TerminalOutputEvent } from "../../../lib/terminal-manager.ts";

export const runtime = "nodejs";

const encoder = new TextEncoder();

function error(message: string, status: number, requestId: string) {
  return NextResponse.json({ error: message }, { status, headers: { "x-request-id": requestId } });
}

function terminalIdFromRequest(req: Request): string | null {
  const id = new URL(req.url).searchParams.get("id");
  return id?.trim() || null;
}

function toSse(event: TerminalOutputEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const body = await req.json() as { cwd?: unknown; cols?: unknown; rows?: unknown };
    const cwd = typeof body.cwd === "string" ? body.cwd : "";
    if (!cwd) return error("cwd is required", 400, requestId);
    const cwdError = validateAgentCwd(cwd);
    if (cwdError) return error(cwdError, 400, requestId);
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) return error(`Directory does not exist: ${cwd}`, 400, requestId);
    if (!(await isPathAllowedAsync(cwd))) return error("cwd not in allowed roots", 403, requestId);

    const cols = typeof body.cols === "number" ? body.cols : undefined;
    const rows = typeof body.rows === "number" ? body.rows : undefined;
    const terminal = getTerminalManager().create(cwd, { cols, rows });
    return NextResponse.json({ terminalId: terminal.id, shell: terminal.shell }, { headers: { "x-request-id": requestId } });
  } catch (cause) {
    logApiError({ route: "/api/terminal", method: "POST", requestId, error: cause });
    return error(errorMessage(cause), 500, requestId);
  }
}

export function GET(req: Request) {
  const requestId = getRequestId(req);
  const id = terminalIdFromRequest(req);
  if (!id) return error("terminal id is required", 400, requestId);
  const manager = getTerminalManager();

  let unsubscribe: (() => void) | null = null;
  let close: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      const finish = () => {
        if (!close) return;
        const currentClose = close;
        close = null;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        unsubscribe = null;
        try { controller.close(); } catch {}
        currentClose();
      };
      close = () => req.signal.removeEventListener("abort", finish);
      const send = (event: TerminalOutputEvent) => {
        try { controller.enqueue(toSse(event)); } catch { finish(); return; }
        if (event.type === "exit") finish();
      };
      unsubscribe = manager.subscribe(id, send);
      if (!unsubscribe) {
        controller.enqueue(toSse({ type: "exit", exitCode: undefined, signal: undefined }));
        finish();
        return;
      }
      heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keepalive\n\n")); } catch { finish(); }
      }, 15_000);
      req.signal.addEventListener("abort", finish, { once: true });
    },
    cancel() {
      close?.();
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "x-request-id": requestId,
    },
  });
}

export async function PATCH(req: Request) {
  const requestId = getRequestId(req);
  try {
    const id = terminalIdFromRequest(req);
    if (!id) return error("terminal id is required", 400, requestId);
    const body = await req.json() as { action?: unknown; data?: unknown; cols?: unknown; rows?: unknown };
    const manager = getTerminalManager();

    if (body.action === "input") {
      if (typeof body.data !== "string" || !body.data) return error("terminal input is required", 400, requestId);
      if (Buffer.byteLength(body.data, "utf8") > MAX_TERMINAL_INPUT_BYTES) return error("terminal input is too large", 413, requestId);
      return manager.write(id, body.data)
        ? NextResponse.json({ ok: true }, { headers: { "x-request-id": requestId } })
        : error("terminal not found", 404, requestId);
    }
    if (body.action === "resize") {
      if (typeof body.cols !== "number" || typeof body.rows !== "number") return error("terminal dimensions are required", 400, requestId);
      return manager.resize(id, body.cols, body.rows)
        ? NextResponse.json({ ok: true }, { headers: { "x-request-id": requestId } })
        : error("terminal not found", 404, requestId);
    }
    return error("unknown terminal action", 400, requestId);
  } catch (cause) {
    logApiError({ route: "/api/terminal", method: "PATCH", requestId, error: cause });
    return error(errorMessage(cause), 500, requestId);
  }
}

export function DELETE(req: Request) {
  const requestId = getRequestId(req);
  const id = terminalIdFromRequest(req);
  if (!id) return error("terminal id is required", 400, requestId);
  return getTerminalManager().close(id)
    ? NextResponse.json({ ok: true }, { headers: { "x-request-id": requestId } })
    : error("terminal not found", 404, requestId);
}
