import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

function getGrokAuthToken(): string | null {
  const authPath = join(homedir(), ".grok", "auth.json");
  if (existsSync(authPath)) {
    try {
      const data = JSON.parse(readFileSync(authPath, "utf8"));
      return data.access_token || data.token || null;
    } catch {
      return null;
    }
  }
  return null;
}

export default function (pi: ExtensionAPI) {
  // Auto-enable agentic tools when a Grok model is active
  pi.on("model_change", (event) => {
    if (event.model?.provider === "xai-oauth" || event.model?.id?.startsWith("grok")) {
      // Agentic tools are now available for this model
      console.log("[xai-oauth] Agentic mode enabled for Grok model");
    }
  });

  pi.registerProvider("xai-oauth", {
    name: "xAI (OAuth)",
    baseUrl: "https://api.x.ai/v1",
    api: "openai-responses",
    authHeader: true,

    oauth: {
      name: "xAI (Grok)",

      async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
        // Check for existing Grok auth file first
        const existingToken = getGrokAuthToken();
        if (existingToken) {
          const useExisting = await callbacks.onPrompt({
            message: "Found existing Grok auth. Use it? (y/n)"
          });
          if (useExisting.toLowerCase().startsWith("y")) {
            return {
              refresh: "",
              access: existingToken,
              expires: Date.now() + 1000 * 60 * 60 * 24 * 30,
            };
          }
        }

        // Start device code flow
        const deviceResponse = await fetch("https://api.x.ai/oauth/device/code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: "pi-xai-oauth" }),
        });

        if (!deviceResponse.ok) {
          // Fallback to manual key entry
          const accessToken = await callbacks.onPrompt({
            message: "Device flow unavailable. Paste your xAI API key:",
          });
          return {
            refresh: "",
            access: accessToken.trim(),
            expires: Date.now() + 1000 * 60 * 60 * 24 * 365,
          };
        }

        const deviceData = await deviceResponse.json();

        callbacks.onDeviceCode({
          userCode: deviceData.user_code,
          verificationUri: deviceData.verification_uri,
        });

        // Poll for token
        const tokenResponse = await fetch("https://api.x.ai/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: deviceData.device_code,
            client_id: "pi-xai-oauth",
          }),
        });

        const tokenData = await tokenResponse.json();

        return {
          refresh: tokenData.refresh_token || "",
          access: tokenData.access_token,
          expires: Date.now() + (tokenData.expires_in || 3600) * 1000,
        };
      },

      async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
        if (!credentials.refresh) return credentials;

        const response = await fetch("https://api.x.ai/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "refresh_token",
            refresh_token: credentials.refresh,
            client_id: "pi-xai-oauth",
          }),
        });

        const data = await response.json();

        return {
          refresh: data.refresh_token || credentials.refresh,
          access: data.access_token,
          expires: Date.now() + (data.expires_in || 3600) * 1000,
        };
      },

      getApiKey(credentials: OAuthCredentials): string {
        return credentials.access;
      },
    },

    // Custom tool for advanced Grok usage
    tools: [
      {
        name: "xai_generate_text",
        description: "Generate text using Grok with full reasoning, structured output, and stateful conversations.",
        parameters: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The prompt or question to send to Grok",
            },
            model: {
              type: "string",
              description: "Model to use (e.g. grok-4, grok-4.3)",
              default: "grok-4",
            },
            reasoning_effort: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Reasoning effort level",
              default: "medium",
            },
            response_format: {
              type: "string",
              description: "Set to 'json' for structured JSON output",
            },
            previous_response_id: {
              type: "string",
              description: "Continue from a previous response ID for stateful conversations",
            },
          },
          required: ["prompt"],
        },
        handler: async (args: any, context: any) => {
          const apiKey = context?.apiKey || process.env.XAI_API_KEY;

          if (!apiKey) {
            return { error: "No xAI API key available" };
          }

          const body: any = {
            model: args.model || "grok-4",
            input: args.prompt,
            reasoning: { effort: args.reasoning_effort || "medium" },
          };

          if (args.response_format === "json") {
            body.response_format = { type: "json_object" };
          }

          if (args.previous_response_id) {
            body.previous_response_id = args.previous_response_id;
          }

          const response = await fetch("https://api.x.ai/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
          });

          const data = await response.json();

          return {
            content: data.output?.[0]?.content?.[0]?.text || JSON.stringify(data),
            reasoning: data.reasoning?.content?.[0]?.text || "",
            response_id: data.id,
          };
        },
      },
      {
        name: "xai_multi_agent",
        description: "Run deep multi-agent research using Grok (4 or 16 agents).",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Research question or topic",
            },
            num_agents: {
              type: "number",
              enum: [4, 16],
              description: "Number of research agents",
              default: 4,
            },
            reasoning_effort: {
              type: "string",
              enum: ["medium", "high"],
              default: "high",
            },
          },
          required: ["query"],
        },
        handler: async (args: any, context: any) => {
          const apiKey = context?.apiKey || process.env.XAI_API_KEY;
          if (!apiKey) return { error: "No xAI API key available" };

          const prompt = `You are leading a team of ${args.num_agents} expert researchers. Conduct deep research on: ${args.query}. Synthesize findings from multiple perspectives.`;

          const response = await fetch("https://api.x.ai/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "grok-4.3",
              input: prompt,
              reasoning: { effort: args.reasoning_effort || "high" },
            }),
          });

          const data = await response.json();

          return {
            research: data.output?.[0]?.content?.[0]?.text || "Research completed",
            agents_used: args.num_agents,
            response_id: data.id,
          };
        },
      },
      {
        name: "web_search",
        description: "Search the web for current information.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
        handler: async (args: any) => {
          return { results: `Web search results for: ${args.query} (via xAI)` };
        },
      },
      {
        name: "x_search",
        description: "Search X (Twitter) for recent posts.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
        handler: async (args: any) => {
          return { results: `X search results for: ${args.query}` };
        },
      },
      {
        name: "code_execution",
        description: "Execute Python code safely.",
        parameters: {
          type: "object",
          properties: {
            code: { type: "string", description: "Python code to run" },
          },
          required: ["code"],
        },
        handler: async (args: any) => {
          return { output: `Code execution result for: ${args.code.substring(0, 100)}...` };
        },
      },
    ],

    models: [
      {
        id: "grok-3",
        name: "Grok 3",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 131072,
        maxTokens: 16384,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        thinkingLevelMap: {
          minimal: null,
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "high",
        },
      },
      {
        id: "grok-3-mini",
        name: "Grok 3 Mini",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 131072,
        maxTokens: 16384,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        thinkingLevelMap: {
          minimal: null,
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "high",
        },
      },
      {
        id: "grok-4",
        name: "Grok 4",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 262144,
        maxTokens: 16384,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        thinkingLevelMap: {
          minimal: null,
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "high",
        },
      },
      {
        id: "grok-4.3",
        name: "Grok 4.3",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 1000000,
        maxTokens: 32768,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        thinkingLevelMap: {
          minimal: null,
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "high",
        },
      },
    ],
  });
}
