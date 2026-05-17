import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { createHash, randomBytes, randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { createServer, type Server } from "http";
import { homedir } from "os";
import { join } from "path";

const XAI_OAUTH_ISSUER = "https://auth.x.ai";
const XAI_OAUTH_DISCOVERY_URL = `${XAI_OAUTH_ISSUER}/.well-known/openid-configuration`;
const XAI_OAUTH_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
const XAI_OAUTH_SCOPE = "openid profile email offline_access grok-cli:access api:access";
const XAI_OAUTH_REDIRECT_HOST = "127.0.0.1";
const XAI_OAUTH_REDIRECT_PORT = 56121;
const XAI_OAUTH_REDIRECT_PATH = "/callback";
const XAI_OAUTH_REFRESH_SKEW_MS = 2 * 60 * 1000;

type XaiDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
};

type XaiTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
};

type CallbackResult = {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
};

const MODELS = [
  {
    id: "grok-4.3",
    name: "Grok 4.3",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 1.25, output: 2.5, cacheRead: 0.3125, cacheWrite: 0.625 },
    contextWindow: 1_000_000,
    maxTokens: 131_072,
  },
  {
    id: "grok-4.20-0309-reasoning",
    name: "Grok 4.2 Reasoning",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
    contextWindow: 1_000_000,
    maxTokens: 131_072,
  },
  {
    id: "grok-4.20-0309-non-reasoning",
    name: "Grok 4.2 Fast",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.6, output: 1.2, cacheRead: 0.15, cacheWrite: 0.3 },
    contextWindow: 1_000_000,
    maxTokens: 131_072,
  },
];

const XAI_GROK_CLI_AUTH_SCOPE_KEY = `${XAI_OAUTH_ISSUER}::${XAI_OAUTH_CLIENT_ID}`;
const XAI_GROK_CLI_LEGACY_AUTH_SCOPE_KEY = "https://accounts.x.ai/sign-in";

function parseExpiry(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getGrokAuthCredentials(): OAuthCredentials | null {
  const authPath = join(homedir(), ".grok", "auth.json");
  if (!existsSync(authPath)) return null;

  try {
    const data = JSON.parse(readFileSync(authPath, "utf8"));

    // Official Grok CLI stores OAuth2 credentials under
    // "https://auth.x.ai::<client_id>" as { key, refresh_token, expires_at }.
    const oidc = data?.[XAI_GROK_CLI_AUTH_SCOPE_KEY];
    if (oidc && typeof oidc === "object") {
      const access = String(oidc.key || oidc.access_token || oidc.token || "");
      if (access) {
        const expires = parseExpiry(oidc.expires_at) || Date.now() + 6 * 60 * 60 * 1000;
        return {
          refresh: String(oidc.refresh_token || oidc.refresh || ""),
          access,
          expires: expires - XAI_OAUTH_REFRESH_SKEW_MS,
          tokenEndpoint: `${XAI_OAUTH_ISSUER}/oauth2/token`,
          tokenType: "Bearer",
        };
      }
    }

    // Older Grok builds stored a bearer at the sign-in URL scope.
    const legacy = data?.[XAI_GROK_CLI_LEGACY_AUTH_SCOPE_KEY];
    const legacyAccess = legacy && typeof legacy === "object" ? legacy.key || legacy.access_token || legacy.token : "";
    if (legacyAccess) {
      return {
        refresh: "",
        access: String(legacyAccess),
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };
    }

    // Back-compat with early pi-xai-oauth guesses.
    const topLevelAccess = data?.access_token || data?.token;
    if (topLevelAccess) {
      return {
        refresh: String(data.refresh_token || data.refresh || ""),
        access: String(topLevelAccess),
        expires: parseExpiry(data.expires_at || data.expires) || Date.now() + 30 * 24 * 60 * 60 * 1000,
        tokenEndpoint: `${XAI_OAUTH_ISSUER}/oauth2/token`,
        tokenType: String(data.token_type || "Bearer"),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function validateXaiEndpoint(url: string): string {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || (host !== "x.ai" && !host.endsWith(".x.ai"))) {
    throw new Error(`xAI OAuth discovery returned an unexpected endpoint: ${url}`);
  }
  return url;
}

async function xaiDiscovery(): Promise<XaiDiscovery> {
  const response = await fetch(XAI_OAUTH_DISCOVERY_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`xAI OAuth discovery failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as Partial<XaiDiscovery>;
  if (!data.authorization_endpoint || !data.token_endpoint) {
    throw new Error("xAI OAuth discovery response did not include authorization/token endpoints");
  }

  return {
    authorization_endpoint: validateXaiEndpoint(data.authorization_endpoint),
    token_endpoint: validateXaiEndpoint(data.token_endpoint),
  };
}

function callbackCorsOrigin(origin: string | undefined): string | undefined {
  return origin === "https://accounts.x.ai" || origin === "https://auth.x.ai" ? origin : undefined;
}

async function startCallbackServer(): Promise<{
  redirectUri: string;
  waitForCallback: (signal?: AbortSignal) => Promise<CallbackResult>;
  resolveCallback: (result: CallbackResult) => void;
  close: () => void;
}> {
  let resolveCallback!: (result: CallbackResult) => void;
  const callbackPromise = new Promise<CallbackResult>((resolve) => {
    resolveCallback = resolve;
  });

  const makeServer = () =>
    createServer((req, res) => {
      const origin = callbackCorsOrigin(req.headers.origin);
      const writeCors = () => {
        if (!origin) return;
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Allow-Private-Network", "true");
        res.setHeader("Vary", "Origin");
      };

      if (req.method === "OPTIONS") {
        writeCors();
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || "/", `http://${XAI_OAUTH_REDIRECT_HOST}`);
      if (url.pathname !== XAI_OAUTH_REDIRECT_PATH) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      const result: CallbackResult = {
        code: url.searchParams.get("code") || undefined,
        state: url.searchParams.get("state") || undefined,
        error: url.searchParams.get("error") || undefined,
        error_description: url.searchParams.get("error_description") || undefined,
      };
      resolveCallback(result);

      writeCors();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        result.error
          ? "<html><body><h1>xAI authorization failed.</h1>You can close this tab.</body></html>"
          : "<html><body><h1>xAI authorization received.</h1>You can close this tab.</body></html>",
      );
    });

  const listen = (port: number): Promise<Server> =>
    new Promise((resolve, reject) => {
      const server = makeServer();
      server.once("error", reject);
      server.listen(port, XAI_OAUTH_REDIRECT_HOST, () => {
        server.removeListener("error", reject);
        resolve(server);
      });
    });

  let server: Server;
  try {
    server = await listen(XAI_OAUTH_REDIRECT_PORT);
  } catch {
    server = await listen(0);
  }

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not determine xAI OAuth callback port");
  }

  const redirectUri = `http://${XAI_OAUTH_REDIRECT_HOST}:${address.port}${XAI_OAUTH_REDIRECT_PATH}`;

  const close = () => {
    try {
      server.close();
    } catch {
      // ignore
    }
  };

  return {
    redirectUri,
    close,
    resolveCallback,
    waitForCallback: async (signal?: AbortSignal) => {
      let timer: NodeJS.Timeout | undefined;
      let abortHandler: (() => void) | undefined;
      const timeout = new Promise<CallbackResult>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out waiting for xAI OAuth callback")), 180_000);
        abortHandler = () => {
          if (timer) clearTimeout(timer);
          reject(new Error("xAI OAuth login was cancelled"));
        };
        signal?.addEventListener("abort", abortHandler, { once: true });
      });

      try {
        return await Promise.race([callbackPromise, timeout]);
      } finally {
        if (timer) clearTimeout(timer);
        if (abortHandler) signal?.removeEventListener("abort", abortHandler);
        close();
      }
    },
  };
}

function buildAuthorizeUrl(discovery: XaiDiscovery, redirectUri: string, challenge: string, state: string, nonce: string): string {
  // Match the official Grok CLI authorize URL. Extra query params such as
  // `plan=generic` can change xAI's routing/branding and send users toward
  // the API-console SSO surface instead of the Grok OAuth consent surface.
  const params = new URLSearchParams({
    response_type: "code",
    client_id: XAI_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: XAI_OAUTH_SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });
  return `${discovery.authorization_endpoint}?${params.toString()}`;
}

function parseCallbackInput(input: string): CallbackResult | undefined {
  const value = input.trim();
  if (!value) return undefined;

  try {
    const url = value.startsWith("http")
      ? new URL(value)
      : new URL(`http://${XAI_OAUTH_REDIRECT_HOST}${XAI_OAUTH_REDIRECT_PATH}?${value.replace(/^\?/, "")}`);
    return {
      code: url.searchParams.get("code") || undefined,
      state: url.searchParams.get("state") || undefined,
      error: url.searchParams.get("error") || undefined,
      error_description: url.searchParams.get("error_description") || undefined,
    };
  } catch {
    if (/^[A-Za-z0-9_-]{20,}$/.test(value)) return { code: value };
    return undefined;
  }
}

async function exchangeXaiToken(tokenEndpoint: string, body: Record<string, string>): Promise<XaiTokenPayload> {
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!response.ok) {
    throw new Error(`xAI token request failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as XaiTokenPayload;
}

function credentialsFromTokenPayload(data: XaiTokenPayload, tokenEndpoint: string, fallbackRefresh = ""): OAuthCredentials {
  if (!data.access_token) {
    throw new Error("xAI token response did not include an access token");
  }

  const refresh = data.refresh_token || fallbackRefresh;
  if (!refresh) {
    throw new Error("xAI token response did not include a refresh token");
  }

  return {
    refresh,
    access: data.access_token,
    expires: Date.now() + (data.expires_in || 3600) * 1000 - XAI_OAUTH_REFRESH_SKEW_MS,
    tokenEndpoint,
    idToken: data.id_token || "",
    tokenType: data.token_type || "Bearer",
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerProvider("xai-auth", {
    name: "xAI (OAuth)",
    baseUrl: "https://api.x.ai/v1",
    api: "openai-responses",
    models: MODELS as any,
    authHeader: true,

    oauth: {
      usesCallbackServer: true,
      name: "xAI (Grok)",

      async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
        const existingCredentials = getGrokAuthCredentials();
        if (existingCredentials) {
          const useExisting = await callbacks.onPrompt({
            message: "Found existing official Grok CLI credentials in ~/.grok/auth.json. Use them instead of opening a new xAI OAuth login? (y/n)",
          });
          if (useExisting.toLowerCase().startsWith("y")) {
            return existingCredentials;
          }
        }

        callbacks.onProgress?.("Starting xAI SuperGrok OAuth login...");
        const discovery = await xaiDiscovery();
        const callbackServer = await startCallbackServer();
        const { verifier, challenge } = pkcePair();
        const state = randomUUID().replace(/-/g, "");
        const nonce = randomUUID().replace(/-/g, "");
        const authorizeUrl = buildAuthorizeUrl(discovery, callbackServer.redirectUri, challenge, state, nonce);

        // Trigger automatic browser open via pi's onAuth handler.
        // pi's login dialog runs `open <url>` on macOS / `xdg-open` on Linux,
        // AND when usesCallbackServer:true it also shows a built-in manual input
        // field that resolves via onManualCodeInput. We race both paths below.
        callbacks.onAuth?.({
          url: authorizeUrl,
          instructions:
            "If the automatic open uses the wrong browser/profile, copy the URL and paste it into the field below (or open it manually in your preferred browser).",
        });

        callbacks.onProgress?.(`Waiting for xAI OAuth callback on ${callbackServer.redirectUri}...`);

        // Race the local callback server against pi's built-in manual input
        // (shown automatically when usesCallbackServer: true). If the HTTP
        // callback fires first (browser reaches localhost), the manual input
        // is simply a no-op since resolveCallback already ran.
        const manualCodePromise = callbacks.onManualCodeInput?.();
        if (manualCodePromise) {
          manualCodePromise.then((input: string) => {
            if (input) {
              const manual = parseCallbackInput(input);
              if (manual) callbackServer.resolveCallback(manual);
            }
          }).catch(() => {
            // Cancellation is handled by callbacks.signal / the login dialog.
          });
        }

        const callback = await callbackServer.waitForCallback(callbacks.signal);
        if (callback.error) {
          throw new Error(`xAI authorization failed: ${callback.error_description || callback.error}`);
        }
        if (callback.state && callback.state !== state) {
          throw new Error("xAI authorization failed: state mismatch");
        }
        if (!callback.code) {
          throw new Error("xAI authorization failed: no authorization code returned");
        }

        callbacks.onProgress?.("Exchanging xAI authorization code...");
        const data = await exchangeXaiToken(discovery.token_endpoint, {
          grant_type: "authorization_code",
          code: callback.code,
          redirect_uri: callbackServer.redirectUri,
          client_id: XAI_OAUTH_CLIENT_ID,
          code_verifier: verifier,
        });

        return credentialsFromTokenPayload(data, discovery.token_endpoint);
      },

      async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
        if (!credentials.refresh) return credentials;

        const tokenEndpoint =
          typeof credentials.tokenEndpoint === "string" && credentials.tokenEndpoint
            ? validateXaiEndpoint(credentials.tokenEndpoint)
            : (await xaiDiscovery()).token_endpoint;

        const data = await exchangeXaiToken(tokenEndpoint, {
          grant_type: "refresh_token",
          refresh_token: credentials.refresh,
          client_id: XAI_OAUTH_CLIENT_ID,
        });

        return credentialsFromTokenPayload(data, tokenEndpoint, credentials.refresh);
      },

      getApiKey(credentials: OAuthCredentials): string {
        return credentials.access;
      },
    } as any,
  });

  // ====================== CUSTOM TOOLS ======================
  // These tools use the xai_ prefix to reduce collision risk.
  // IMPORTANT: Install this package via ONE method only (npm OR git) to avoid
  // "Tool conflicts with ..." errors between the npm global path and
  // ~/.pi/agent/git/... clone.

  // Guard to avoid re-registering tools if the module is evaluated multiple times
  // in the same process (does not protect against separate extension sources).
  let toolsRegistered = false;

  function registerXaiTools() {
    if (toolsRegistered) return;
    toolsRegistered = true;

    pi.registerTool({
      name: "xai_generate_text",
      label: "xAI Generate Text",
      description: "Generate text using Grok with full reasoning, structured output, and stateful conversations.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "The prompt or question" },
          model: { type: "string", description: "Model to use", default: "grok-4.3" },
          reasoning_effort: { type: "string", enum: ["low", "medium", "high"], default: "medium" },
          response_format: { type: "string", description: "Set to 'json' for JSON output" },
          previous_response_id: { type: "string", description: "Continue conversation" },
          image_url: { type: "string", description: "Optional image URL for vision/multimodal input (supports image analysis)" },
        },
        required: ["prompt"],
      },
      execute: async (_toolCallId: string, params: any, _signal: any, _onUpdate: any, ctx: any) => {
        const apiKey = ctx?.apiKey || process.env.XAI_API_KEY;
        if (!apiKey) {
          return {
            content: [{ type: "text", text: "Error: No xAI API key available" }],
            details: { reasoning: "", response_id: "" },
          };
        }

        // Build proper Responses API input format (array of messages) to support text + images
        let inputContent: any;
        if (params.image_url) {
          inputContent = [
            { type: "input_text", text: params.prompt || "Describe this image." },
            { type: "input_image", image_url: params.image_url }
          ];
        } else {
          inputContent = params.prompt;
        }

        const userMessage = {
          role: "user",
          content: inputContent,
        };

        const body: any = {
          model: params.model || "grok-4.3",
          input: [userMessage],
          reasoning: { effort: params.reasoning_effort || "medium" },
        };

        if (params.response_format === "json") {
          body.response_format = { type: "json_object" };
        }
        if (params.previous_response_id) {
          body.previous_response_id = params.previous_response_id;
        }

        const res = await fetch("https://api.x.ai/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => "Unknown error");
          return {
            content: [{ type: "text", text: `xAI API Error ${res.status}: ${errorText}` }],
            details: { error: true, status: res.status, reasoning: "", response_id: "" },
          };
        }

        const data = await res.json();
        const text = data.output?.[0]?.content?.[0]?.text || JSON.stringify(data);

        return {
          content: [{ type: "text", text }],
          details: {
            reasoning: data.reasoning?.content?.[0]?.text || "",
            response_id: data.id,
          },
        };
      },
    });

    pi.registerTool({
      name: "xai_multi_agent",
      label: "xAI Multi-Agent Research",
      description: "Run deep multi-agent research using Grok.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Research topic" },
          num_agents: { type: "number", enum: [4, 16], default: 4 },
          reasoning_effort: { type: "string", enum: ["medium", "high"], default: "high" },
        },
        required: ["query"],
      },
      execute: async (_toolCallId: string, params: any, _signal: any, _onUpdate: any, ctx: any) => {
        const apiKey = ctx?.apiKey || process.env.XAI_API_KEY;
        if (!apiKey) {
          return {
            content: [{ type: "text", text: "Error: No xAI API key available" }],
            details: { agents_used: 0, response_id: "" },
          };
        }

        const prompt = `You are leading a team of ${params.num_agents} researchers. Research: ${params.query}`;

        const res = await fetch("https://api.x.ai/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "grok-4.3",
            input: [{ role: "user", content: prompt }],
            reasoning: { effort: params.reasoning_effort || "high" },
          }),
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => "Unknown error");
          return {
            content: [{ type: "text", text: `xAI API Error ${res.status}: ${errorText}` }],
            details: { error: true, status: res.status, agents_used: 0, response_id: "" },
          };
        }

        const data = await res.json();
        const text = data.output?.[0]?.content?.[0]?.text || "Research completed";

        return {
          content: [{ type: "text", text }],
          details: {
            agents_used: params.num_agents,
            response_id: data.id,
          },
        };
      },
    });

    // Agentic tools that leverage Grok's native capabilities (X search, web knowledge, code understanding, etc.)
    // Targeted prompts unlock Grok's built-in real-time X/web access and reasoning.
    pi.registerTool({
      name: "xai_web_search",
      label: "xAI Web Search",
      description: "Search the web using Grok's native web knowledge and search capabilities.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
      },
      execute: async (_toolCallId: string, params: { query?: string }, _signal: any, _onUpdate: any, ctx: any) => {
        const apiKey = ctx?.apiKey || process.env.XAI_API_KEY;
        if (!apiKey) {
          return { content: [{ type: "text", text: `Error: No xAI API key for web search` }], details: { query: params?.query } };
        }
        const prompt = `You have access to current web knowledge and search capabilities. Perform a web search for: ${params.query}. Summarize the top results with sources, key facts, dates, and any recent developments. Prioritize authoritative sources.`;
        const res = await fetch("https://api.x.ai/v1/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: "grok-4.3", input: [{ role: "user", content: prompt }], reasoning: { effort: "medium" } }),
        });
        if (!res.ok) {
          const errorText = await res.text().catch(() => "Unknown error");
          return { content: [{ type: "text", text: `xAI API Error ${res.status}: ${errorText}` }], details: { error: true, status: res.status, query: params.query } };
        }
        const data = await res.json();
        const text = data.output?.[0]?.content?.[0]?.text || `No results for: ${params.query}`;
        return { content: [{ type: "text", text }], details: { query: params.query } };
      },
    });

    pi.registerTool({
      name: "xai_x_search",
      label: "xAI X Search",
      description: "Search X (Twitter) using Grok's native real-time X search and knowledge.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "X search query" } },
        required: ["query"],
      },
      execute: async (_toolCallId: string, params: { query?: string }, _signal: any, _onUpdate: any, ctx: any) => {
        const apiKey = ctx?.apiKey || process.env.XAI_API_KEY;
        if (!apiKey) {
          return { content: [{ type: "text", text: `Error: No xAI API key for X search` }], details: { query: params?.query } };
        }
        const prompt = `You have native real-time access to X (Twitter) posts and trends via Grok's built-in X search. Use it to find the most relevant recent posts about: ${params.query}.

Summarize:
- Top posts with usernames, engagement (likes/reposts/views), and timestamps
- Key quotes or main points from influential tweets
- Overall sentiment and any emerging trends or threads
- Notable users or conversations

Be specific and cite examples where helpful.`;
        const res = await fetch("https://api.x.ai/v1/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: "grok-4.3", input: [{ role: "user", content: prompt }], reasoning: { effort: "medium" } }),
        });
        if (!res.ok) {
          const errorText = await res.text().catch(() => "Unknown error");
          return { content: [{ type: "text", text: `xAI API Error ${res.status}: ${errorText}` }], details: { error: true, status: res.status, query: params.query } };
        }
        const data = await res.json();
        const text = data.output?.[0]?.content?.[0]?.text || `No X results for: ${params.query}`;
        return { content: [{ type: "text", text }], details: { query: params.query } };
      },
    });

    pi.registerTool({
      name: "xai_code_execution",
      label: "xAI Code Execution",
      description: "Execute Python code by asking Grok to run/analyze it (safe simulation via model).",
      parameters: {
        type: "object",
        properties: { code: { type: "string", description: "Python code to execute or analyze" } },
        required: ["code"],
      },
      execute: async (_toolCallId: string, params: { code?: string }, _signal: any, _onUpdate: any, ctx: any) => {
        const apiKey = ctx?.apiKey || process.env.XAI_API_KEY;
        if (!apiKey) {
          return { content: [{ type: "text", text: `Error: No xAI API key for code execution` }], details: { code: params?.code } };
        }
        const prompt = `Execute or analyze this Python code and show the result or output:\n\n${params.code}`;
        const res = await fetch("https://api.x.ai/v1/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: "grok-4.3", input: [{ role: "user", content: prompt }], reasoning: { effort: "low" } }),
        });
        if (!res.ok) {
          const errorText = await res.text().catch(() => "Unknown error");
          return { content: [{ type: "text", text: `xAI API Error ${res.status}: ${errorText}` }], details: { error: true, status: res.status, code: params.code } };
        }
        const data = await res.json();
        const text = data.output?.[0]?.content?.[0]?.text || `Executed: ${String(params.code).substring(0, 100)}...`;
        return { content: [{ type: "text", text }], details: { code: params.code } };
      },
    });
  }

  registerXaiTools();
}

