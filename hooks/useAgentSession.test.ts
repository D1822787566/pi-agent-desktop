import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./useAgentSession.ts", import.meta.url), "utf8");

// P2: the setMessages updater must stay pure. React StrictMode double-invokes
// updaters during render, and a nested setCanExecutePlan inside the updater is
// both a side effect in a pure function and a nested setState during render.
test("streaming append uses a pure setMessages updater (no nested setState)", () => {
  assert.match(source, /setMessages\(\(prev\) => \[\.\.\.prev, \.\.\.appended\]\);/);
  // No block-bodied messages updater may remain in the file:
  assert.doesNotMatch(source, /setMessages\(\(prev\) => \{/);
});

test("plan-mode setCanExecutePlan runs outside the messages updater", () => {
  // The plan check sits in its own block after the pure setMessages call.
  const planBlock = source.slice(source.indexOf('setEntryIds('));
  assert.match(planBlock, /if \(agentModeRef\.current === "plan"\) \{/);
  assert.match(planBlock, /if \(text\.trim\(\)\) setCanExecutePlan\(true\);/);
});

// P2: streaming appends update messages AND entryIds so the two arrays stay
// parallel (MessageList keys/fork/navigate rely on entryIds[idx] being the
// session entry id; new slots are undefined until the next reload fills them).
test("streaming append keeps entryIds parallel with messages", () => {
  assert.match(source, /setEntryIds\(\(prev\) => \[\.\.\.prev, \.\.\.appended\.map/);
});

test("canonical user SSE messages replace optimistic prompts instead of appending a duplicate", () => {
  const block = source.slice(
    source.indexOf("const handleAgentEvent"),
    source.indexOf("const commands = useSessionCommands")
  );

  assert.match(source, /const pendingPromptsRef = useRef<Array<\{ id: string; message: string \}>>\(\[\]\);/);
  assert.match(block, /pendingPromptsRef\.current\.findIndex/);
  assert.match(block, /result\.appendMessages = undefined;/);
  assert.match(block, /message\.clientMessageId !== clientMessageId/);
});

test("loading a session never clears its sidebar activity marker before server state arrives", () => {
  const activityEffect = source.slice(
    source.indexOf("useEffect(() => {\n    const activeSessionId = sessionIdRef.current;"),
    source.indexOf("  const modelTools")
  );
  assert.match(activityEffect, /if \(agentRunning && activeSessionId\) onAgentActivityChange\?\.\(activeSessionId, true\)/);
  assert.doesNotMatch(activityEffect, /onAgentActivityChange\?\.\(activeSessionId, agentRunning\)/);
});

test("terminal agent events explicitly clear their sidebar activity marker", () => {
  const block = source.slice(
    source.indexOf("const handleAgentEvent"),
    source.indexOf("const commands = useSessionCommands")
  );
  assert.match(block, /if \(!result\.agentRunning && sessionIdRef\.current\) \{\s*onAgentActivityChange\?\.\(sessionIdRef\.current, false\)/);
});

test("an abort keeps the composer locked until the server says Pi has settled", () => {
  assert.match(source, /const \[isAborting, setIsAborting\] = useState\(false\);/);
  assert.match(source, /\?includeState=1/);
  assert.match(source, /!data\.agentState\?\.state\?\.isAborting/);
});
