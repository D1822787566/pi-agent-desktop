import type { AssistantMessage } from "./types.ts";

export const EMPTY_ASSISTANT_RESPONSE_MESSAGE =
  "模型未返回任何内容。请检查模型配置或服务端日志后重试。";

export const UNKNOWN_ASSISTANT_ERROR_MESSAGE =
  "模型调用失败，但提供商未返回具体错误信息。";

export const ABORTED_ASSISTANT_RESPONSE_MESSAGE = "模型响应已中止。";

/**
 * Whether an assistant message has a block that represents a real response.
 * Empty text/thinking blocks are omitted so a terminal empty response never
 * renders as a model label followed by a blank area.
 */
export function hasAssistantResponseContent(message: AssistantMessage): boolean {
  return message.content.some((block) => {
    if (block.type === "text") return block.text.trim().length > 0;
    if (block.type === "thinking") return block.thinking.trim().length > 0;
    return true;
  });
}

/**
 * Convert Pi's terminal assistant state into a user-visible explanation.
 * Pi reports many provider failures as a completed assistant message instead
 * of the wrapper-level `agent_error` event, so both live SSE and saved
 * sessions use this shared interpretation.
 */
export function getAssistantResponseIssue(message: AssistantMessage): string | null {
  const providerError = message.errorMessage?.trim();
  if (providerError) return providerError;
  if (message.stopReason === "error") return UNKNOWN_ASSISTANT_ERROR_MESSAGE;
  if (message.stopReason === "aborted") return ABORTED_ASSISTANT_RESPONSE_MESSAGE;
  if (!hasAssistantResponseContent(message)) return EMPTY_ASSISTANT_RESPONSE_MESSAGE;
  return null;
}

export function hasAssistantResponseFailure(message: AssistantMessage): boolean {
  return Boolean(message.errorMessage?.trim()) ||
    message.stopReason === "error" ||
    message.stopReason === "aborted";
}
