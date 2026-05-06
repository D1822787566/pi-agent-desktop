import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PI_CLI_RELATIVE_PATH = ["node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js"];
type Environment = Readonly<Record<string, string | undefined>>;

/**
 * pi-subagents locates an embedded Pi CLI from the parent process entrypoint.
 * The desktop server's entrypoint is Next's server.js, so expose the bundled
 * CLI there unless the user deliberately supplied a different executable.
 */
export function configureEmbeddedPiCliForSubagents(
  argv: string[] = process.argv,
  env: Environment = process.env,
  runtimeCwd = process.cwd(),
): string | undefined {
  if (env.PI_SUBAGENT_PI_BINARY?.trim()) return undefined;

  const cliPath = resolve(runtimeCwd, ...PI_CLI_RELATIVE_PATH);
  if (!existsSync(cliPath)) return undefined;

  argv[1] = cliPath;
  return cliPath;
}
