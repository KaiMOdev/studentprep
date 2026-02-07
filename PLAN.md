# StudyFlow — Architecture & Implementation Plan

## App Concept

A web app where students upload their course material (PDF). The AI processes it and delivers:

1. **Chapter-by-chapter summaries** — with clear distinction between main topics (hoofdzaken) and side topics (bijzaken)
2. **Exam questions** — 5 potential exam questions per chapter
3. **Discussion questions** — 5 questions to ask the professor for deeper understanding
4. **Highlighted PDF export** — color-coded PDF output (fluorescent highlighting for main/side topics)
5. **Topic deep-links** — click any topic to get more info via Wikipedia (not AI-generated, for reliability)
6. **Study planning** — AI-generated realistic study schedule based on course content and exam date
7. **Mini exams after each study session** — quiz to test what you've studied so far
8. **Spaced repetition** — previously studied material gets revisited in each new mini exam

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React + Vite + TailwindCSS | Fast, PWA-capable, mobile-first |
| **Backend** | Node.js + Hono | Lightweight, fast, deploys well on Fly.io |
| **Database** | Supabase (PostgreSQL) | Auth + DB + file storage in one service |
| **Auth/SSO** | Supabase Auth | Built-in Google/GitHub/email SSO, no extra provider |
| **File Storage** | Supabase Storage | Store uploaded PDFs, generated PDFs |
| **AI** | Claude API (Anthropic) | Summarization, question generation, study planning |
| **Payments** | Stripe | Industry standard, simple integration |
| **PDF Processing** | pdf-parse (read) + @react-pdf/renderer (write) | Extract text from uploads, generate highlighted PDFs |
| **Hosting** | Fly.io | Frontend + Backend as separate apps |

### Why this stack?

- **Supabase** covers 3 needs in 1 service: auth (SSO via Google etc.), database (PostgreSQL), and file storage. This is the simplest setup.
- **Stripe** is the only mature payment provider that handles subscriptions properly. No single provider does both auth + payments well, so Supabase Auth + Stripe is the simplest combination.
- **Hono** over Express: smaller, faster, better TypeScript support, same API style. Deploys identically on Fly.io.
- **Claude API** over OpenAI: better at structured text analysis and following complex instructions for summarization tasks.

---

## Project Structure

```
studentprep/
├── frontend/                    # React PWA (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/              # Reusable UI components
│   │   │   ├── course/          # Course upload, chapter view
│   │   │   ├── quiz/            # Mini exam / quiz UI
│   │   │   └── planner/         # Study schedule view
│   │   ├── pages/
│   │   │   ├── Landing.tsx      # Marketing / login page
│   │   │   ├── Dashboard.tsx    # Course overview
│   │   │   ├── Course.tsx       # Single course view (chapters, summary, questions)
│   │   │   ├── StudyPlan.tsx    # Study schedule
│   │   │   ├── Quiz.tsx         # Mini exam page
│   │   │   └── Settings.tsx     # Account, subscription
│   │   ├── lib/
│   │   │   ├── supabase.ts      # Supabase client init
│   │   │   ├── api.ts           # Backend API calls
│   │   │   └── stripe.ts        # Stripe checkout redirect
│   │   ├── hooks/
│   │   │   ├── useAuth.ts       # Supabase auth hook
│   │   │   └── useCourse.ts     # Course data hook
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   │   └── manifest.json        # PWA manifest
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   ├── Dockerfile
│   └── fly.toml
├── backend/                     # Hono API server
│   ├── src/
│   │   ├── index.ts             # App entry, middleware
│   │   ├── routes/
│   │   │   ├── courses.ts       # CRUD courses + chapters
│   │   │   ├── ai.ts            # Claude AI endpoints (summarize, questions, plan)
│   │   │   ├── quiz.ts          # Quiz generation + scoring
│   │   │   ├── payments.ts      # Stripe webhooks + checkout
│   │   │   └── pdf.ts           # PDF generation endpoints
│   │   ├── services/
│   │   │   ├── claude.ts        # Claude API wrapper
│   │   │   ├── pdf-parser.ts    # PDF text extraction
│   │   │   ├── pdf-generator.ts # Highlighted PDF creation
│   │   │   ├── wikipedia.ts     # Wikipedia API lookup
│   │   │   ├── stripe.ts        # Stripe service
│   │   │   └── quiz.ts          # Quiz logic + spaced repetition
│   │   └── middleware/
│   │       └── auth.ts          # Supabase JWT verification
│   ├── tsconfig.json
│   ├── package.json
│   ├── Dockerfile
│   └── fly.toml
├── supabase/
│   └── migrations/              # Database migrations
│       └── 001_initial.sql
├── README.md
└── PLAN.md
```

---

## Database Schema (Supabase / PostgreSQL)

```sql
-- Users are managed by Supabase Auth (auth.users table)
-- We reference auth.users.id as user_id everywhere

CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    original_filename TEXT,
    storage_path TEXT,          -- Supabase Storage path to original PDF
    status TEXT DEFAULT 'uploaded', -- uploaded | processing | ready | error
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    raw_text TEXT,              -- Extracted text from PDF
    summary_main JSONB,        -- Main topics (hoofdzaken)
    summary_side JSONB,        -- Side topics (bijzaken)
    sort_order INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
    type TEXT NOT NULL,         -- 'exam' or 'discussion'
    question TEXT NOT NULL,
    suggested_answer TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE study_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    exam_date DATE,
    plan JSONB NOT NULL,       -- Array of {date, chapters[], duration_minutes}
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE study_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    study_plan_id UUID REFERENCES study_plans(id) ON DELETE SET NULL,
    chapters_covered UUID[],   -- Array of chapter IDs studied
    completed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE quiz_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES study_sessions(id) ON DELETE SET NULL,
    questions JSONB NOT NULL,  -- [{question_id, user_answer, correct, from_chapter}]
    score NUMERIC(5,2),
    includes_review BOOLEAN DEFAULT false,  -- Did this quiz include spaced repetition?
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT DEFAULT 'inactive', -- active | inactive | past_due | cancelled
    plan TEXT DEFAULT 'free',       -- free | pro
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security (RLS)
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "users_own_courses" ON courses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_chapters" ON chapters FOR ALL
    USING (course_id IN (SELECT id FROM courses WHERE user_id = auth.uid()));
CREATE POLICY "users_own_questions" ON questions FOR ALL
    USING (chapter_id IN (
        SELECT c.id FROM chapters c
        JOIN courses co ON c.course_id = co.id
        WHERE co.user_id = auth.uid()
    ));
CREATE POLICY "users_own_plans" ON study_plans FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_sessions" ON study_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_quizzes" ON quiz_results FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_subs" ON subscriptions FOR ALL USING (auth.uid() = user_id);
```

---

## API Endpoints

### Auth (handled by Supabase client-side)
- `supabase.auth.signInWithOAuth({ provider: 'google' })` — SSO login
- `supabase.auth.signUp({ email, password })` — Email signup
- `supabase.auth.signOut()` — Logout

### Backend API (all require Supabase JWT in Authorization header)

```
POST   /api/courses/upload          — Upload PDF, start processing
GET    /api/courses                  — List user's courses
GET    /api/courses/:id              — Get course with chapters
DELETE /api/courses/:id              — Delete course

POST   /api/ai/summarize/:courseId   — Trigger AI summarization (async)
POST   /api/ai/questions/:chapterId — Generate exam + discussion questions
POST   /api/ai/study-plan           — Generate study plan {courseId, examDate, hoursPerDay}

GET    /api/chapters/:id/wiki/:topic — Lookup topic on Wikipedia API

POST   /api/quiz/generate            — Generate mini exam {sessionId, chapterIds[], includeReview}
POST   /api/quiz/submit              — Submit quiz answers, get score

POST   /api/pdf/highlighted/:courseId — Generate highlighted PDF

POST   /api/payments/checkout        — Create Stripe checkout session
POST   /api/payments/webhook         — Stripe webhook (subscription events)
GET    /api/payments/status          — Get current subscription status
```

---

## Key Flows

### 1. Course Upload & Processing
```
User uploads PDF
  → Frontend sends to POST /api/courses/upload
  → Backend stores PDF in Supabase Storage
  → Backend extracts text with pdf-parse
  → Backend sends text to Claude API: "Split this into chapters, identify chapter titles"
  → Claude returns chapter boundaries
  → Backend creates chapter records in DB
  → For each chapter: send to Claude for summarization (main + side topics)
  → Store summaries in chapters.summary_main / summary_side
  → Generate 5 exam + 5 discussion questions per chapter
  → Mark course status = 'ready'
```

### 2. Study Planning
```
User selects course + enters exam date + available hours/day
  → POST /api/ai/study-plan
  → Backend sends chapter info + dates to Claude
  → Claude generates day-by-day study schedule
  → Stored in study_plans table
  → Frontend shows calendar/timeline view
```

### 3. Mini Exam (with Spaced Repetition)
```
User completes a study session (marks chapters as studied)
  → POST /api/quiz/generate
  → Backend selects:
     - Questions from chapters just studied (new material)
     - Questions from previously studied chapters (spaced repetition)
  → Weighting: 60% new material, 40% review
  → Returns quiz to frontend
  → User answers questions
  → POST /api/quiz/submit → score + feedback
```

### 4. Highlighted PDF Export
```
User clicks "Export highlighted PDF"
  → POST /api/pdf/highlighted/:courseId
  → Backend builds PDF with:
     - Original chapter structure
     - Yellow highlight = main topics (hoofdzaken)
     - Green highlight = side topics (bijzaken)
     - Bold = key terms
  → Returns PDF file (or stores in Supabase Storage)
  → User downloads
```

### 5. Topic Lookup (Wikipedia)
```
User clicks on a topic/keyword in summary
  → GET /api/chapters/:id/wiki/:topic
  → Backend queries Wikipedia API (en.wikipedia.org/w/api.php)
  → Returns extract + link
  → Frontend shows in sidebar/modal
```

---

## Claude AI Prompt Strategy

### Summarization Prompt (per chapter)
```
Analyze the following chapter text and provide:

1. MAIN TOPICS (hoofdzaken): The core concepts a student MUST know for the exam.
   Return as a JSON array of {topic, explanation, key_terms[]}.

2. SIDE TOPICS (bijzaken): Supporting details, examples, context.
   Return as a JSON array of {topic, explanation}.

Keep language consistent with the source material.
Chapter text:
---
{chapter_text}
---
```

### Exam Question Prompt
```
Based on this chapter content, generate:

1. Five questions a university professor would ask on a written exam.
   These should test deep understanding, not just memorization.

2. Five questions a student could ask the professor during class
   to get more insight or clarification on the material.

Return as JSON: {exam_questions: [{question, suggested_answer}], discussion_questions: [{question, why_useful}]}

Chapter content:
---
{chapter_text}
---
```

### Study Plan Prompt
```
Create a study plan for this course. The student has:
- Exam date: {exam_date}
- Available study hours per day: {hours_per_day}
- {num_chapters} chapters to cover

Chapter list with difficulty estimates:
{chapters_with_summaries}

Create a day-by-day schedule. Include:
- Which chapters to study each day
- Estimated time per chapter
- Review days before the exam
- Buffer days for catching up

Return as JSON array: [{date, chapters: [{id, title}], total_minutes, type: "study"|"review"|"buffer"}]
```

---

## Subscription Tiers

| Feature | Free | Pro (€9.99/month) |
|---------|------|--------------------|
| Courses | 1 | Unlimited |
| Summaries | Basic (main topics only) | Full (main + side topics) |
| Exam questions | 3 per chapter | 5 + 5 per chapter |
| Study planning | No | Yes |
| Mini exams | No | Yes (with spaced repetition) |
| Highlighted PDF | No | Yes |
| Wikipedia lookups | 5/day | Unlimited |

---

## Environment Variables

### Backend (.env)
```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...         # Service role key (backend only)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=https://studyflow-app.fly.dev
PORT=8080
```

### Frontend (.env)
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...       # Public anon key
VITE_API_URL=https://studyflow-api.fly.dev
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

---

## Fly.io Deployment

### Backend (fly.toml)
```toml
app = "studyflow-api"
primary_region = "ams"    # Amsterdam (closest to Belgian users)

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true

[env]
  NODE_ENV = "production"
  PORT = "8080"
```

### Frontend (fly.toml)
```toml
app = "studyflow-app"
primary_region = "ams"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 80
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
```

### Frontend Dockerfile (static files served by nginx)
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### Backend Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

---

## Implementation Order

### Phase 1 — Foundation
1. Set up monorepo (frontend + backend folders, package.json, TypeScript configs)
2. Supabase project: create tables, enable auth, configure storage bucket
3. Backend: Hono server with auth middleware (verify Supabase JWT)
4. Frontend: React + Vite + Tailwind + Supabase Auth (login/signup)
5. Deploy skeleton to Fly.io

### Phase 2 — Core Feature: Upload & Summarize
6. PDF upload flow (frontend → backend → Supabase Storage)
7. PDF text extraction (pdf-parse)
8. Claude API integration: chapter detection + summarization
9. Display summaries in frontend (main vs side topics)
10. Exam + discussion question generation

### Phase 3 — Study Tools
11. Study plan generation (Claude AI)
12. Study session tracking
13. Mini exam / quiz system
14. Spaced repetition logic
15. Wikipedia topic lookup

### Phase 4 — PDF & Polish
16. Highlighted PDF generation
17. PDF download flow
18. Stripe integration (checkout, webhooks, subscription gating)
19. PWA setup (manifest, service worker, offline support)
20. Mobile UI polish

---

## External Accounts Needed

1. **Supabase** — https://supabase.com (free tier: 500MB DB, 1GB storage, 50K auth users)
2. **Anthropic** — https://console.anthropic.com (Claude API key)
3. **Stripe** — https://dashboard.stripe.com (payment processing)
4. **Fly.io** — https://fly.io (hosting, free tier available)
