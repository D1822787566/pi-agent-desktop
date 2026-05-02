import { NextResponse } from "next/server";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createPiRuntime } from "@/lib/pi-runtime";
import { validateProviderName } from "@/lib/auth-policy";
import { errorMessage, getRequestId, logApiError } from "@/lib/api-error";
import {
  buildModelDiscoveryUrl,
  extractDiscoveredModels,
  getNextModelPageToken,
  isDiscoverableModelApi,
  type DiscoverableModelApi,
  type DiscoveredModel,
} from "@/lib/model-discovery";

export const dynamic = "force-dynamic";

const DISCOVERY_TIMEOUT_MS = 20_000;
const MAX_DISCOVERY_PAGES = 50;
const MAX_DISCOVERED_MODELS = 5_000;
const DISCOVERY_MODEL_ID = "__pi_model_discovery__";

type JsonRecord = Record<string, unknown>;

class DiscoveryRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseError(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  const error = payload.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (isRecord(error) && typeof error.message === "string" && error.message.trim()) return error.message.trim();
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message.trim();
  return fallback;
}

function createHeaders(api: DiscoverableModelApi, apiKey: string, configuredHeaders?: Record<string, string | null>): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(configuredHeaders ?? {})) {
    if (value !== null) headers.set(name, value);
  }
  headers.set("accept", "application/json");

  if (api === "anthropic-messages") {
    if (!headers.has("x-api-key")) headers.set("x-api-key", apiKey);
    if (!headers.has("anthropic-version")) headers.set("anthropic-version", "2023-06-01");
  } else if (api === "google-generative-ai") {
    if (!headers.has("x-goog-api-key")) headers.set("x-goog-api-key", apiKey);
  } else if (!headers.has("authorization")) {
    headers.set("authorization", `Bearer ${apiKey}`);
  }

  return headers;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) throw new Error("提供商返回了无效的模型列表响应");
    return undefined;
  }
}

async function discoverModels(baseUrl: string, api: DiscoverableModelApi, apiKey: string, configuredHeaders?: Record<string, string | null>): Promise<DiscoveredModel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  const models = new Map<string, DiscoveredModel>();
  const pageTokens = new Set<string>();
  let pageToken: string | undefined;

  try {
    for (let page = 0; page < MAX_DISCOVERY_PAGES; page += 1) {
      const response = await fetch(buildModelDiscoveryUrl(baseUrl, api, pageToken), {
        headers: createHeaders(api, apiKey, configuredHeaders),
        signal: controller.signal,
        cache: "no-store",
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw new DiscoveryRequestError(responseError(payload, `Provider returned HTTP ${response.status}`), response.status);
      }

      for (const model of extractDiscoveredModels(payload, api)) {
        if (models.size >= MAX_DISCOVERED_MODELS) break;
        models.set(model.id, model);
      }
      if (models.size >= MAX_DISCOVERED_MODELS) break;

      const nextPageToken = getNextModelPageToken(payload, api);
      if (!nextPageToken || pageTokens.has(nextPageToken)) break;
      pageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("获取可用模型超时");
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  let tempDir: string | undefined;

  try {
    const body = await req.json() as { providerName?: unknown; provider?: unknown };
    const providerName = typeof body.providerName === "string" ? body.providerName.trim() : "";
    const providerNameError = validateProviderName(providerName);
    if (providerNameError) return NextResponse.json({ error: providerNameError }, { status: 400, headers: { "x-request-id": requestId } });
    if (!isRecord(body.provider)) return NextResponse.json({ error: "需要提供商配置" }, { status: 400, headers: { "x-request-id": requestId } });

    const api = body.provider.api ?? "openai-completions";
    if (!isDiscoverableModelApi(api)) {
      return NextResponse.json({ error: "此提供商 API 不支持获取模型列表" }, { status: 400, headers: { "x-request-id": requestId } });
    }

    const baseUrl = typeof body.provider.baseUrl === "string" ? body.provider.baseUrl.trim() : "";
    if (!baseUrl) return NextResponse.json({ error: "需要基础 URL" }, { status: 400, headers: { "x-request-id": requestId } });
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(baseUrl);
    } catch {
      return NextResponse.json({ error: "基础 URL 格式无效" }, { status: 400, headers: { "x-request-id": requestId } });
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return NextResponse.json({ error: "基础 URL 必须使用 HTTP 或 HTTPS" }, { status: 400, headers: { "x-request-id": requestId } });
    }

    tempDir = mkdtempSync(join(tmpdir(), "pi-web-model-discovery-"));
    const modelsPath = join(tempDir, "models.json");
    writeFileSync(modelsPath, JSON.stringify({
      providers: {
        [providerName]: {
          ...body.provider,
          api,
          models: [{ id: DISCOVERY_MODEL_ID, api }],
        },
      },
    }, null, 2), "utf8");

    const { registry } = await createPiRuntime({ modelsPath, allowModelNetwork: false });
    const loadError = registry.getError();
    if (loadError) return NextResponse.json({ error: loadError }, { status: 400, headers: { "x-request-id": requestId } });

    const discoveryModel = registry.find(providerName, DISCOVERY_MODEL_ID);
    if (!discoveryModel) return NextResponse.json({ error: `Provider could not be initialized: ${providerName}` }, { status: 400, headers: { "x-request-id": requestId } });

    const auth = await registry.getApiKeyAndHeaders(discoveryModel);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 400, headers: { "x-request-id": requestId } });
    if (!auth.apiKey) return NextResponse.json({ error: `No API key found for "${providerName}"` }, { status: 400, headers: { "x-request-id": requestId } });

    const models = await discoverModels(discoveryModel.baseUrl, api, auth.apiKey, auth.headers);
    return NextResponse.json({ models }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    const status = error instanceof DiscoveryRequestError ? error.status : 500;
    logApiError({ route: "/api/models-config/discover", method: "POST", requestId, status, error });
    return NextResponse.json(
      { error: errorMessage(error) },
      { status, headers: { "x-request-id": requestId } }
    );
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
}
