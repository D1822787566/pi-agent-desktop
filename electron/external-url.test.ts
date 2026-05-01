import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExternalUrl } from "./external-url.ts";

test("external browser IPC only allows http and https URLs", () => {
  assert.equal(normalizeExternalUrl("https://example.com/docs"), "https://example.com/docs");
  assert.equal(normalizeExternalUrl("http://127.0.0.1:30141"), "http://127.0.0.1:30141/");
  assert.equal(normalizeExternalUrl("file:///C:/secret.txt"), null);
  assert.equal(normalizeExternalUrl("javascript:alert(1)"), null);
  assert.equal(normalizeExternalUrl("not a url"), null);
});
