import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./ProjectList.tsx", import.meta.url), "utf8");

test("project session lists collapse after five rows and can be expanded", () => {
  assert.match(source, /const SESSION_LIST_VISIBLE_LIMIT = 5;/);
  assert.match(source, /function takeSessionTree\(nodes: SessionTreeNode\[\], limit: number\)/);
  assert.match(source, /takeSessionTree\(sessionTree, SESSION_LIST_VISIBLE_LIMIT\)/);
  assert.match(source, /显示另外 \$\{hiddenSessionCount\} 个/);
  assert.match(source, /收起/);
});

test("session selection supports Ctrl\/Cmd, Shift ranges, Delete, and bulk context deletion", () => {
  assert.match(source, /event\?\.ctrlKey \|\| event\?\.metaKey/);
  assert.match(source, /event\?\.shiftKey && selectionAnchorId/);
  assert.match(source, /event\.key !== "Delete"/);
  assert.match(source, /onSessionContextMenu=\{handleSessionContextMenu\}/);
  assert.match(source, /删除 \{selectedSessionIds\.size\} 个会话/);
  assert.match(source, /onSessionsDeleted\(deleted\)/);
});

test("project rows open a context menu that can remove the project from the sidebar", () => {
  assert.match(source, /kind: "project"; cwd: string; x: number; y: number/);
  assert.match(source, /onContextMenu=\{\(event\) => \{/);
  assert.match(source, /setContextMenu\(\{ kind: "project", cwd: project\.cwd/);
  assert.match(source, /onRemoveProject\(cwd\)/);
  assert.match(source, /从侧边栏移除/);
});
