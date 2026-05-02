import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");

test("sidebar merges unindexed optimistic sessions with the server session list", () => {
  assert.match(source, /optimisticSessions\?: readonly SessionInfo\[\]/);
  assert.match(source, /const displaySessions = useMemo/);
  assert.match(source, /const unindexed = optimisticSessions\.filter\(\(session\) => !indexedIds\.has\(session\.id\)\);/);
  assert.match(source, /return unindexed\.length > 0 \? \[\.\.\.unindexed, \.\.\.allSessions\] : allSessions;/);
  assert.match(source, /for \(const session of displaySessions\)/);
});

test("sidebar retires an optimistic session only after the server list contains it", () => {
  assert.match(source, /onOptimisticSessionsReconciled\?: \(sessionIds: string\[\]\) => void/);
  assert.match(source, /filter\(\(optimistic\) => allSessions\.some\(\(session\) => session\.id === optimistic\.id\)\)/);
  assert.match(source, /onOptimisticSessionsReconciled\?\.\(indexedIds\)/);
});

test("sidebar patches the completed session without reloading all sessions", () => {
  assert.match(source, /sessionUpdate\?: \{ id: string; revision: number \} \| null/);
  assert.match(source, /fetch\(`\/api\/sessions\/\$\{encodeURIComponent\(sessionUpdate\.id\)\}`\)/);
  assert.match(source, /setAllSessions\(\(previous\) => \{/);
  assert.match(source, /return previous\.map\(\(session\) => session\.id === updated\.id \? updated : session\);/);
});
