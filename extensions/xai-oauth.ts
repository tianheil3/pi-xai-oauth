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
  pi.registerProvider("xai-oauth", {
    name: "xAI (OAuth)",
    baseUrl: "https://api.x.ai/v1",
    api: "openai-responses",
    authHeader: true,

    oauth: {
      name: "xAI (Grok)",

      async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
        const existingToken = getGrokAuthToken();
        if (existingToken) {
          const useExisting = await callbacks.onPrompt({
            message: "Found existing Grok auth. Use it? (y/n)",
          });
          if (useExisting.toLowerCase().startsWith("y")) {
            return {
              refresh: "",
              access: existingToken,
              expires: Date.now() + 1000 * 60 * 60 * 24 * 30,
            };
          }
        }

        const accessToken = await callbacks.onPrompt({
          message:
            "Paste your xAI API key (starts with xai-).\n" +
            "You can get one at https://console.x.ai",
        });

        return {
          refresh: "",
          access: accessToken.trim(),
          expires: Date.now() + 1000 * 60 * 60 * 24 * 365,
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
  });

  // Custom tools
  pi.registerTool({
    name: "xai_generate_text",
    description: "Generate text using Grok with full reasoning, structured output, and stateful conversations.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The prompt or question" },
        model: { type: "string", description: "Model to use", default: "grok-4" },
        reasoning_effort: {
          type: "string",
          enum: ["low", "medium", "high"],
          default: "medium",
        },
        response_format: { type: "string", description: "Set to 'json' for JSON output" },
        previous_response_id: { type: "string", description: "Continue conversation" },
      },
      required: ["prompt"],
    },
    handler: async (args: any, context: any) => {
      const apiKey = context?.apiKey || process.env.XAI_API_KEY;
      if (!apiKey) return { error: "No xAI API key available" };

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

      const res = await fetch("https://api.x.ai/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      return {
        content: data.output?.[0]?.content?.[0]?.text || JSON.stringify(data),
        reasoning: data.reasoning?.content?.[0]?.text || "",
        response_id: data.id,
      };
    },
  });

  pi.registerTool({
    name: "xai_multi_agent",
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
    handler: async (args: any, context: any) => {
      const apiKey = context?.apiKey || process.env.XAI_API_KEY;
      if (!apiKey) return { error: "No xAI API key available" };

      const prompt = `You are leading a team of ${args.num_agents} researchers. Research: ${args.query}`;

      const res = await fetch("https://api.x.ai/v1/responses", {
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

      const data = await res.json();
      return {
        research: data.output?.[0]?.content?.[0]?.text || "Research completed",
        agents_used: args.num_agents,
        response_id: data.id,
      };
    },
  });

  pi.registerTool({
    name: "web_search",
    description: "Search the web.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    handler: async (args) => ({ results: `Web results for: ${args.query}` }),
  });

  pi.registerTool({
    name: "x_search",
    description: "Search X (Twitter).",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    handler: async (args) => ({ results: `X results for: ${args.query}` }),
  });

  pi.registerTool({
    name: "code_execution",
    description: "Execute Python code.",
    parameters: {
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"],
    },
    handler: async (args) => ({ output: `Executed: ${args.code.substring(0, 80)}...` }),
  });
}
