export const DISCOVERABLE_MODEL_APIS = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
] as const;

export type DiscoverableModelApi = (typeof DISCOVERABLE_MODEL_APIS)[number];

export interface DiscoveredModel {
  id: string;
  name?: string;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function modelList(response: JsonRecord): JsonRecord[] {
  const value = Array.isArray(response.data) ? response.data : Array.isArray(response.models) ? response.models : [];
  return value.filter(isRecord);
}

function appendPath(baseUrl: string, suffix: string): URL {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}/${suffix}`.replace(/\/+/g, "/");
  return url;
}

export function isDiscoverableModelApi(value: unknown): value is DiscoverableModelApi {
  return typeof value === "string" && (DISCOVERABLE_MODEL_APIS as readonly string[]).includes(value);
}

export function buildModelDiscoveryUrl(baseUrl: string, api: DiscoverableModelApi, pageToken?: string): URL {
  const url = api === "anthropic-messages" && !/\/(?:v1)\/?$/i.test(new URL(baseUrl).pathname)
    ? appendPath(baseUrl, "v1/models")
    : appendPath(baseUrl, "models");

  if (api === "anthropic-messages") {
    url.searchParams.set("limit", "100");
    if (pageToken) url.searchParams.set("after_id", pageToken);
  }
  if (api === "google-generative-ai") {
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
  }

  return url;
}

export function extractDiscoveredModels(response: unknown, api: DiscoverableModelApi): DiscoveredModel[] {
  if (!isRecord(response)) return [];

  const unique = new Map<string, DiscoveredModel>();
  for (const entry of modelList(response)) {
    const rawId = readString(entry, "id") ?? readString(entry, "name");
    if (!rawId) continue;

    const id = api === "google-generative-ai" && rawId.startsWith("models/")
      ? rawId.slice("models/".length)
      : rawId;
    if (!id || unique.has(id)) continue;

    const displayName = readString(entry, "display_name") ?? readString(entry, "displayName") ?? readString(entry, "name");
    unique.set(id, { id, ...(displayName && displayName !== id && displayName !== rawId ? { name: displayName } : {}) });
  }

  return [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getNextModelPageToken(response: unknown, api: DiscoverableModelApi): string | undefined {
  if (!isRecord(response)) return undefined;

  if (api === "google-generative-ai") return readString(response, "nextPageToken");
  if (api !== "anthropic-messages" || response.has_more !== true) return undefined;

  const entries = modelList(response);
  const lastEntry = entries.at(-1);
  return lastEntry ? readString(lastEntry, "id") : undefined;
}
