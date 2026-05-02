import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");

test("a newly created session appears in the sidebar before its initial stream ends", () => {
  const createdBlock = source.slice(
    source.indexOf("const handleSessionCreated"),
    source.indexOf("const handleSessionForked")
  );
  const endBlock = source.slice(
    source.indexOf("const handleAgentEnd"),
    source.indexOf("const handleAtMention")
  );

  assert.match(source, /const pendingCreatedSessionRef = useRef<SessionInfo \| null>\(null\);/);
  assert.match(createdBlock, /pendingCreatedSessionRef\.current = session;/);
  assert.match(createdBlock, /setOptimisticSidebarSessions\(\(current\) => \[/);
  assert.doesNotMatch(createdBlock, /setRefreshKey/);
  assert.match(source, /optimisticSessions=\{optimisticSidebarSessions\}/);
  assert.match(source, /onOptimisticSessionsReconciled=\{handleOptimisticSessionsReconciled\}/);
  assert.match(source, /selectedSession\?\.id \?\? pendingCreatedSessionRef\.current\?\.id \?\? null/);
  assert.match(endBlock, /const createdSession = pendingCreatedSessionRef\.current;/);
  assert.match(endBlock, /handleSelectSession\(createdSession, false\);/);
  assert.doesNotMatch(source.slice(source.indexOf("const handleSelectSession"), source.indexOf("const handleNewSession")), /setOptimisticSidebarSessions/);
});

test("agent completion patches one sidebar session instead of refreshing the whole list", () => {
  const endBlock = source.slice(
    source.indexOf("const handleAgentEnd"),
    source.indexOf("const handleAtMention")
  );

  assert.match(endBlock, /const finishedSessionId = createdSession\?\.id \?\? selectedSession\?\.id;/);
  assert.match(endBlock, /setFinishedSessionUpdate\(\(previous\) => \(\{/);
  assert.doesNotMatch(endBlock, /setRefreshKey/);
  assert.match(source, /sessionUpdate=\{finishedSessionUpdate\}/);
});
