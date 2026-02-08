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

export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 8192
): Promise<string> {
  const anthropic = getClient();

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const block = response.content[0];
    if (block.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    return block.text;
  } catch (err: unknown) {
    // On authentication errors, reset the cached client so a corrected key
    // (e.g. set via env after a hot-reload) will be picked up on the next call.
    if (err instanceof Anthropic.AuthenticationError) {
      client = null;
      throw new Error(
        "Anthropic API authentication failed — the configured ANTHROPIC_API_KEY is invalid. " +
          "Check your studentprep/backend/.env file and restart the server."
      );
    }
    throw err;
  }
}
