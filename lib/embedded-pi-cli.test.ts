import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { configureEmbeddedPiCliForSubagents } from "./embedded-pi-cli.ts";

test("configures pi-subagents to resolve the desktop-bundled Pi CLI", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-desktop-cli-"));
  try {
    const cliPath = join(root, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js");
    mkdirSync(join(cliPath, ".."), { recursive: true });
    writeFileSync(cliPath, "// fixture");
    const argv = ["node", "server.js"];

    assert.equal(configureEmbeddedPiCliForSubagents(argv, {}, root), cliPath);
    assert.equal(argv[1], cliPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preserves an explicit pi-subagents executable override", () => {
  const argv = ["node", "server.js"];

  assert.equal(
    configureEmbeddedPiCliForSubagents(argv, { PI_SUBAGENT_PI_BINARY: "C:\\tools\\pi.exe" }),
    undefined,
  );
  assert.equal(argv[1], "server.js");
});
