# CLAUDE.md - Backend

This file provides guidance to Claude Code when working with the backend.

## Development

```bash
# Run dev server with auto-reload
npm run dev

# Build TypeScript
npm run build

# Type check
npm run typecheck

# Start production
npm start
```

## Architecture

**Entry:** `src/index.ts` - Hono server with CORS, config validation, route guards

**Routes:**
- `routes/courses.ts` - Course CRUD
- `routes/ai.ts` - Claude AI endpoints (summarize, questions, study plans)
- `routes/quiz.ts` - Quiz generation/scoring
- `routes/pdf.ts` - Highlighted PDF generation
- `routes/wiki.ts` - Wikipedia lookups
- `routes/payments.ts` - Stripe webhooks
- `routes/admin.ts` - Admin dashboard

**Services:**
- `ai-pipeline.ts` - Core AI processing orchestration
- `claude.ts` - Claude API wrapper
- `pdf-parser.ts` - PDF text extraction
- `pdf-generator.ts` - Highlighted PDF creation (pdfkit)
- `wikipedia.ts` - Wikipedia API client
- `supabase.ts` - Supabase client
- `config.ts` - Environment validation

**Middleware:**
- `auth.ts` - Supabase JWT verification
- `admin.ts` - Admin role check

## Key Patterns

### AI Processing Pipeline

1. PDF uploaded → Supabase Storage
2. Text extracted with pdf-parse
3. Claude detects chapter boundaries
4. For each chapter: summarize (main/side topics) + generate questions
5. On-demand: study plan generation

### JSON Sanitization

**Critical:** Use `sanitizeJsonControlChars()` before parsing Claude responses. PDFs contain unescaped quotes and newlines that break JSON parsing.

### Configuration Guards

Server returns 503 on `/api/*` if Supabase not configured, and on `/api/ai/*` if Anthropic API key missing.

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...     # Service role (NEVER in frontend)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=http://localhost:5173
PORT=8080
```

## Database

Tables: `courses`, `chapters`, `questions`, `study_plans`, `study_sessions`, `quiz_results`, `subscriptions`

**RLS Policies:** All tables enforce user isolation at database level.
