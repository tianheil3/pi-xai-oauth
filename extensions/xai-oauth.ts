import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"; 
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("xai-oauth", {
    name: "xAI (OAuth)",
    baseUrl: "https://api.x.ai/v1",
    api: "openai-completions",
    authHeader: true,

    oauth: {
      name: "xAI (Grok)",

      async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
        const accessToken = await callbacks.onPrompt({
          message:
            "Paste your xAI API key (starts with xai-).\n" +
            "You can get one at https://console.x.ai"
        });

        return {
          refresh: "",
          access: accessToken.trim(),
          expires: Date.now() + 1000 * 60 * 60 * 24 * 365,
        };
      },

      async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
        // xAI currently doesn't require token refresh for API keys.
        // Return the same credentials.
        return credentials;
      },

      getApiKey(credentials: OAuthCredentials): string {
        return credentials.access;
      },
    },

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
