import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./SessionTree.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("active sessions expose a labelled visual indicator in the sidebar", () => {
  assert.match(source, /isAgentActive && \(/);
  assert.match(source, /className="session-active-indicator"/);
  assert.match(source, /aria-label="智能体正在执行"/);
});

test("active-session indicator is prominent and supports reduced motion", () => {
  assert.match(styles, /\.session-active-indicator \{[\s\S]*?width: 16px;[\s\S]*?height: 16px;/);
  assert.match(styles, /animation: session-activity-drop var\(--duration-very-slow\) cubic-bezier\(0, 800, 1, 800\) infinite;/);
  assert.match(styles, /animation: session-activity-turn var\(--duration-very-slow\) var\(--ease-linear\) infinite;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.session-active-indicator::before/);
});
