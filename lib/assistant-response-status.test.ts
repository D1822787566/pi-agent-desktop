import test from "node:test";
import assert from "node:assert/strict";
import {
  ABORTED_ASSISTANT_RESPONSE_MESSAGE,
  EMPTY_ASSISTANT_RESPONSE_MESSAGE,
  UNKNOWN_ASSISTANT_ERROR_MESSAGE,
  getAssistantResponseIssue,
  hasAssistantResponseContent,
  hasAssistantResponseFailure,
} from "./assistant-response-status.ts";
import type { AssistantMessage } from "./types.ts";

function assistant(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: "assistant",
    model: "test-model",
    provider: "test-provider",
    content: [],
    ...overrides,
  };
}

test("provider error is retained as a visible assistant response issue", () => {
  const message = assistant({ stopReason: "error", errorMessage: "Invalid API key" });

  assert.equal(getAssistantResponseIssue(message), "Invalid API key");
  assert.equal(hasAssistantResponseFailure(message), true);
});

test("terminal error states without details have stable fallback messages", () => {
  assert.equal(getAssistantResponseIssue(assistant({ stopReason: "error" })), UNKNOWN_ASSISTANT_ERROR_MESSAGE);
  assert.equal(getAssistantResponseIssue(assistant({ stopReason: "aborted" })), ABORTED_ASSISTANT_RESPONSE_MESSAGE);
});

test("empty terminal assistant output is never treated as a valid reply", () => {
  const message = assistant({ content: [{ type: "text", text: "   " }] });

  assert.equal(hasAssistantResponseContent(message), false);
  assert.equal(getAssistantResponseIssue(message), EMPTY_ASSISTANT_RESPONSE_MESSAGE);
  assert.equal(hasAssistantResponseFailure(message), false);
});

test("non-empty response blocks do not get an issue", () => {
  const message = assistant({ content: [{ type: "text", text: "Hello" }] });

  assert.equal(hasAssistantResponseContent(message), true);
  assert.equal(getAssistantResponseIssue(message), null);
});
