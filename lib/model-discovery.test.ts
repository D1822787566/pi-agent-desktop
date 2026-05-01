import test from "node:test";
import assert from "node:assert/strict";
import {
  buildModelDiscoveryUrl,
  extractDiscoveredModels,
  getNextModelPageToken,
  isDiscoverableModelApi,
} from "./model-discovery.ts";

test("model discovery builds the API-specific list endpoints", () => {
  assert.equal(buildModelDiscoveryUrl("https://api.example.com/v1", "openai-completions").toString(), "https://api.example.com/v1/models");
  assert.equal(buildModelDiscoveryUrl("https://api.anthropic.com", "anthropic-messages", "claude-1").toString(), "https://api.anthropic.com/v1/models?limit=100&after_id=claude-1");
  assert.equal(buildModelDiscoveryUrl("https://generativelanguage.googleapis.com/v1beta", "google-generative-ai", "next").toString(), "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=next");
});

test("model discovery normalizes OpenAI, Anthropic, and Google model payloads", () => {
  assert.deepEqual(
    extractDiscoveredModels({ data: [{ id: "z" }, { id: "a" }, { id: "a" }] }, "openai-responses"),
    [{ id: "a" }, { id: "z" }]
  );
  assert.deepEqual(
    extractDiscoveredModels({ data: [{ id: "claude-1", display_name: "Claude One" }] }, "anthropic-messages"),
    [{ id: "claude-1", name: "Claude One" }]
  );
  assert.deepEqual(
    extractDiscoveredModels({ models: [{ name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro" }] }, "google-generative-ai"),
    [{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }]
  );
});

test("model discovery returns pagination tokens only for supported APIs", () => {
  assert.equal(getNextModelPageToken({ has_more: true, data: [{ id: "claude-last" }] }, "anthropic-messages"), "claude-last");
  assert.equal(getNextModelPageToken({ nextPageToken: "google-next" }, "google-generative-ai"), "google-next");
  assert.equal(getNextModelPageToken({ has_more: true, data: [{ id: "ignored" }] }, "openai-completions"), undefined);
  assert.equal(isDiscoverableModelApi("openai-completions"), true);
  assert.equal(isDiscoverableModelApi("not-supported"), false);
});
