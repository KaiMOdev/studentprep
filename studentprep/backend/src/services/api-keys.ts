import crypto from "node:crypto";
import { getSupabaseAdmin } from "./supabase.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from env. Falls back to a derived key from SUPABASE_SERVICE_KEY
 * if API_KEY_ENCRYPTION_SECRET is not set.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.SUPABASE_SERVICE_KEY;
  if (!secret) {
    throw new Error("No encryption key available. Set API_KEY_ENCRYPTION_SECRET or SUPABASE_SERVICE_KEY.");
  }
  // Derive a 32-byte key using SHA-256
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decrypt(encoded: string): string {
  const key = getEncryptionKey();
  const [ivB64, authTagB64, ciphertextB64] = encoded.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Invalid encrypted key format");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

/** Create a display hint from an API key, e.g. "sk-ant-...4f2x" */
function createKeyHint(apiKey: string): string {
  const last4 = apiKey.slice(-4);
  const prefix = apiKey.slice(0, 7);
  return `${prefix}...${last4}`;
}

/**
 * Save (or update) a user's Anthropic API key.
 */
export async function saveUserApiKey(userId: string, apiKey: string): Promise<{ hint: string }> {
  const supabase = getSupabaseAdmin();
  const encryptedKey = encrypt(apiKey);
  const hint = createKeyHint(apiKey);

  const { error } = await supabase
    .from("user_api_keys")
    .upsert(
      {
        user_id: userId,
        encrypted_key: encryptedKey,
        key_hint: hint,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    throw new Error(`Failed to save API key: ${error.message}`);
  }

  return { hint };
}

/**
 * Get the user's decrypted API key. Returns null if no key is stored.
 */
export async function getUserApiKey(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("user_api_keys")
    .select("encrypted_key")
    .eq("user_id", userId)
    .single();

  if (!data?.encrypted_key) return null;

  try {
    return decrypt(data.encrypted_key);
  } catch {
    console.error(`Failed to decrypt API key for user ${userId}`);
    return null;
  }
}

/**
 * Get the user's API key hint (for display). Returns null if no key is stored.
 */
export async function getUserApiKeyHint(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("user_api_keys")
    .select("key_hint")
    .eq("user_id", userId)
    .single();

  return data?.key_hint ?? null;
}

/**
 * Delete the user's stored API key.
 */
export async function deleteUserApiKey(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("user_api_keys")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to delete API key: ${error.message}`);
  }
}
