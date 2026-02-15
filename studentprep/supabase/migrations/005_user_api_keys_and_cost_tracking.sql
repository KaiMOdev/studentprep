-- User API keys: allow each user to bring their own Anthropic API key
-- Cost tracking: add model column to token_usage for per-model cost calculation

-- 1. User API keys table
CREATE TABLE user_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    encrypted_key TEXT NOT NULL,
    key_hint TEXT NOT NULL,  -- last 4 chars for display, e.g. "...sk4f"
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can read their own key metadata (not the encrypted key itself — that's for service role only)
CREATE POLICY "users_own_api_keys" ON user_api_keys
    FOR SELECT USING (auth.uid() = user_id);

-- 2. Add model column to token_usage for per-model cost calculation
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS model TEXT;

-- 3. Add index for admin queries: aggregate cost per user per month
CREATE INDEX IF NOT EXISTS idx_token_usage_period
    ON token_usage (period_year, period_month);
