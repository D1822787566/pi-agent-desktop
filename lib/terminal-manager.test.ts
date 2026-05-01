import test from "node:test";
import assert from "node:assert/strict";
import { createTerminalManager, MAX_TERMINAL_INPUT_BYTES, type PtyProcess } from "./terminal-manager.ts";

class FakePty implements PtyProcess {
  written: string[] = [];
  resized: Array<{ cols: number; rows: number }> = [];
  killed = false;
  private onDataListener: ((data: string) => void) | null = null;
  private onExitListener: ((event: { exitCode: number; signal?: number }) => void) | null = null;

  write(data: string) { this.written.push(data); }
  resize(cols: number, rows: number) { this.resized.push({ cols, rows }); }
  kill() { this.killed = true; }
  onData(listener: (data: string) => void) { this.onDataListener = listener; }
  onExit(listener: (event: { exitCode: number; signal?: number }) => void) { this.onExitListener = listener; }
  emitData(data: string) { this.onDataListener?.(data); }
  emitExit(exitCode: number, signal?: number) { this.onExitListener?.({ exitCode, signal }); }
}

test("terminal manager replays initial output and forwards input", () => {
  const pty = new FakePty();
  const manager = createTerminalManager(() => pty);
  const { id } = manager.create("D:\\project");
  pty.emitData("PowerShell ready\\r\\n");

  const received: string[] = [];
  const unsubscribe = manager.subscribe(id, (event) => {
    if (event.type === "data") received.push(event.data);
  });
  assert.ok(unsubscribe);
  assert.deepEqual(received, ["PowerShell ready\\r\\n"]);

  assert.equal(manager.write(id, "npm test\\r"), true);
  assert.deepEqual(pty.written, ["npm test\\r"]);
  assert.equal(manager.write(id, "x".repeat(MAX_TERMINAL_INPUT_BYTES + 1)), false);
});

test("terminal manager clamps dimensions and asks its shell to exit on close", () => {
  const pty = new FakePty();
  const manager = createTerminalManager(() => pty);
  const { id } = manager.create("D:\\project", { cols: 0, rows: 9999 });
  assert.equal(manager.resize(id, 0, 9999), true);
  assert.deepEqual(pty.resized, [{ cols: 2, rows: 300 }]);

  const events: string[] = [];
  manager.subscribe(id, (event) => events.push(event.type));
  assert.equal(manager.close(id), true);
  assert.deepEqual(pty.written, ["exit\r"]);
  assert.equal(pty.killed, false);
  assert.deepEqual(events, ["exit"]);
  assert.equal(manager.has(id), false);
});

test("terminal manager removes naturally exited terminals", () => {
  const pty = new FakePty();
  const manager = createTerminalManager(() => pty);
  const { id } = manager.create("D:\\project");
  const exits: Array<{ exitCode: number | undefined; signal: number | undefined }> = [];
  manager.subscribe(id, (event) => {
    if (event.type === "exit") exits.push({ exitCode: event.exitCode, signal: event.signal });
  });
  pty.emitExit(12, 9);

  assert.deepEqual(exits, [{ exitCode: 12, signal: 9 }]);
  assert.equal(manager.has(id), false);
  assert.equal(manager.write(id, "after exit"), false);
});
