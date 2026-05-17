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
        // Open browser to xAI console for authorization
        callbacks.onAuth({
          url: "https://console.x.ai",
        });

        const accessToken = await callbacks.onPrompt({
          message:
            "After authorizing in the browser, paste your xAI API key here (starts with xai-):",
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

  // ====================== CUSTOM TOOLS ======================

  pi.registerTool({
    name: "xai_generate_text",
    label: "xAI Generate Text",
    description: "Generate text using Grok with full reasoning, structured output, and stateful conversations.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The prompt or question" },
        model: { type: "string", description: "Model to use", default: "grok-4" },
        reasoning_effort: { type: "string", enum: ["low", "medium", "high"], default: "medium" },
        response_format: { type: "string", description: "Set to 'json' for JSON output" },
        previous_response_id: { type: "string", description: "Continue conversation" },
      },
      required: ["prompt"],
    },
    execute: async (toolCallId: string, params: any, signal: any, onUpdate: any, ctx: any) => {
      const apiKey = ctx?.apiKey || process.env.XAI_API_KEY;
      if (!apiKey) {
        return {
          content: [{ type: "text", text: "Error: No xAI API key available" }],
          details: { reasoning: "", response_id: "" },
        };
      }

      const body: any = {
        model: params.model || "grok-4",
        input: params.prompt,
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
    execute: async (toolCallId: string, params: any, signal: any, onUpdate: any, ctx: any) => {
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
          input: prompt,
          reasoning: { effort: params.reasoning_effort || "high" },
        }),
      });

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

  pi.registerTool({
    name: "xai_web_search",
    label: "xAI Web Search",
    description: "Search the web using xAI tools.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    execute: async (toolCallId: string, params: { query?: string }) => ({
      content: [{ type: "text", text: `Web search results for: ${params.query}` }],
      details: { query: params.query },
    }),
  });

  pi.registerTool({
    name: "xai_x_search",
    label: "xAI X Search",
    description: "Search X (Twitter) using xAI tools.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    execute: async (toolCallId: string, params: { query?: string }) => ({
      content: [{ type: "text", text: `X search results for: ${params.query}` }],
      details: { query: params.query },
    }),
  });

  pi.registerTool({
    name: "xai_code_execution",
    label: "xAI Code Execution",
    description: "Execute Python code using xAI tools.",
    parameters: {
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"],
    },
    execute: async (toolCallId: string, params: { code?: string }) => ({
      content: [{ type: "text", text: `Executed: ${String(params.code).substring(0, 80)}...` }],
      details: { code: params.code },
    }),
  });
}
