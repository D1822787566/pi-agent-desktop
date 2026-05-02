import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";

export const WINDOWS_COMMAND_GUIDANCE = `## Windows command execution

- Use the PowerShell tool directly; do not use cmd /c.
- Git is optional unless the user explicitly asks about version control. If git is unavailable, say so once and continue the primary task.
- After a command is not recognized, make at most one diagnostic check (for example Get-Command). Do not guess drive letters or repeatedly try alternative executable paths.
- Reuse a command invocation that has already worked in this session instead of probing the environment again.`;

export function appendWindowsCommandGuidance(systemPrompt: string): string {
  return `${systemPrompt}\n\n${WINDOWS_COMMAND_GUIDANCE}`;
}

export function windowsCommandGuidanceInlineExtension(platform = process.platform): InlineExtension {
  return {
    name: "desktop-windows-command-guidance",
    factory: (pi: ExtensionAPI) => {
      if (platform !== "win32") return;
      pi.on("before_agent_start", (event) => ({
        systemPrompt: appendWindowsCommandGuidance(event.systemPrompt),
      }));
    },
  };
}
