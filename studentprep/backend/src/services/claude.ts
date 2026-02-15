import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/**
 * Check whether an Anthropic API key is configured (non-empty).
 * Does NOT prove the key is valid — only that one has been provided.
 */
export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing ANTHROPIC_API_KEY environment variable. " +
          "Set it in studentprep/backend/.env (see .env.example)."
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** Create a temporary Anthropic client using a user-provided API key. */
function createUserClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

export type AIModel = "claude-sonnet-4-5-20250929" | "claude-haiku-4-5-20251001";

export const AI_MODELS: { id: AIModel; label: string }[] = [
  { id: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5" },
];

export const DEFAULT_MODEL: AIModel = "claude-sonnet-4-5-20250929";

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  model: AIModel;
}

export interface ClaudeResponse {
  text: string;
  usage: ClaudeUsage;
}

/**
 * Call Claude with usage tracking. Optionally uses a user-provided API key.
 */
export async function askClaudeWithUsage(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 8192,
  model: AIModel = DEFAULT_MODEL,
  userApiKey?: string
): Promise<ClaudeResponse> {
  const anthropic = userApiKey ? createUserClient(userApiKey) : getClient();

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const block = response.content[0];
    if (block.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    return {
      text: block.text,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        model,
      },
    };
  } catch (err: unknown) {
    if (err instanceof Anthropic.AuthenticationError) {
      if (!userApiKey) client = null;
      throw new Error(
        userApiKey
          ? "Your personal Anthropic API key is invalid. Please update it in settings."
          : "Anthropic API authentication failed — the configured ANTHROPIC_API_KEY is invalid. " +
            "Check your studentprep/backend/.env file and restart the server."
      );
    }
    throw err;
  }
}

export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 8192,
  model: AIModel = DEFAULT_MODEL,
  userApiKey?: string
): Promise<string> {
  const result = await askClaudeWithUsage(systemPrompt, userMessage, maxTokens, model, userApiKey);
  return result.text;
}
