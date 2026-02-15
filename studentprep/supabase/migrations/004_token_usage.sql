-- Token usage tracking for freemium limits
-- Tracks per-user, per-month token consumption from Claude API calls

CREATE TABLE token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
    endpoint TEXT NOT NULL,
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast monthly aggregation per user
CREATE INDEX idx_token_usage_user_period
    ON token_usage (user_id, period_year, period_month);

ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage
CREATE POLICY "users_own_token_usage" ON token_usage
    FOR SELECT USING (auth.uid() = user_id);
