import test from "node:test";
import assert from "node:assert/strict";
import {
  WINDOWS_COMMAND_GUIDANCE,
  appendWindowsCommandGuidance,
} from "./windows-command-guidance-extension.ts";

test("Windows command guidance appends bounded-retry rules to every agent turn", () => {
  const prompt = appendWindowsCommandGuidance("base prompt");

  assert.equal(prompt, `base prompt\n\n${WINDOWS_COMMAND_GUIDANCE}`);
  assert.match(prompt, /Do not guess drive letters/);
});

test("Windows command guidance tells the agent to avoid cmd and optional Git retries", () => {
  assert.match(WINDOWS_COMMAND_GUIDANCE, /do not use cmd \/c/);
  assert.match(WINDOWS_COMMAND_GUIDANCE, /Git is optional/);
  assert.match(WINDOWS_COMMAND_GUIDANCE, /make at most one diagnostic check/);
});
