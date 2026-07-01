import OpenAI from "openai";

/**
 * Shared chat-model client. The agent brain is provider-swappable: an OpenAI
 * platform key (OPENAI_API_KEY → api.openai.com) wins when present, otherwise we
 * fall back to the Azure deployment (AZURE_OPENAI_*). Returns BOTH the client and
 * the model id so every call site (agent, planner, research, onboarding) stays in
 * lock-step. Model id is env-overridable — OPENAI_MODEL for the platform,
 * AZURE_OPENAI_DEPLOYMENT for Azure.
 */
export function chatClient(): { client: OpenAI; model: string } {
  if (process.env.OPENAI_API_KEY) {
    return {
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      model: process.env.OPENAI_MODEL ?? "gpt-5.5",
    };
  }
  return {
    client: new OpenAI({ apiKey: process.env.AZURE_OPENAI_API_KEY, baseURL: process.env.AZURE_OPENAI_ENDPOINT }),
    model: process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-5.5-1",
  };
}
