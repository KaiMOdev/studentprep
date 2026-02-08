# StudyFlow — AI-Powered Study Companion

A mobile-first PWA that transforms course PDFs into structured study materials using Claude AI.

Upload your course → get chapter summaries, exam questions, a study schedule, and mini exams with spaced repetition.

## Features

| Feature | Description |
|---------|-------------|
| **PDF Upload & AI Summary** | Upload a course PDF, get chapter-by-chapter summaries with clear main topics vs side topics |
| **Exam Questions** | 5 potential exam questions + 5 discussion questions per chapter |
| **Highlighted PDF Export** | Color-coded PDF with fluorescent highlighting (yellow = main, green = side topics) |
| **Topic Deep-links** | Click any topic to get reliable info from Wikipedia |
| **Study Planning** | AI-generated realistic study schedule based on exam date and available time |
| **Mini Exams** | Quiz after each study session to test what you've learned |
| **Spaced Repetition** | Previously studied material gets revisited in each new quiz |

## Tech Stack

- **Frontend**: React + Vite (PWA), TailwindCSS, TypeScript
- **Backend**: Node.js + Hono, TypeScript
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Auth/SSO**: Supabase Auth (Google, GitHub, email)
- **AI**: Claude API (Anthropic)
- **Payments**: Stripe
- **PDF**: pdf-parse (read) + @react-pdf/renderer (write)
- **Hosting**: Fly.io (Amsterdam region)

## Project Structure

```
repo-root/
├── studentprep/
│   ├── frontend/          # React PWA (Vite + TailwindCSS)
│   │   ├── src/
│   │   │   ├── components/  # UI, course, quiz, planner components
│   │   │   ├── pages/       # Landing, Dashboard, Course, Quiz, StudyPlan, Settings
│   │   │   ├── lib/         # Supabase client, API calls, Stripe
│   │   │   └── hooks/       # useAuth, useCourse
│   │   ├── Dockerfile
│   │   └── fly.toml
│   ├── backend/           # Hono API server
│   │   ├── src/
│   │   │   ├── routes/      # courses, ai, quiz, payments, pdf
│   │   │   ├── services/    # claude, pdf-parser, pdf-generator, wikipedia, stripe, quiz
│   │   │   └── middleware/  # Supabase JWT auth
│   │   ├── Dockerfile
│   │   └── fly.toml
│   └── supabase/
│       └── migrations/    # SQL schema
├── PLAN.md            # Full architecture & implementation plan
└── README.md
```

## Quick Start (Local Dev)

### Prerequisites
- Node.js 20+
- Supabase project (free tier)
- Anthropic API key

### Backend
```bash
cd studentprep/backend
npm install
cp .env.example .env  # Add ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
npm run dev
```

### Frontend
```bash
cd studentprep/frontend
npm install
cp .env.example .env  # Add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
npm run dev
```

## Deploy to Fly.io

### Backend
```bash
cd studentprep/backend
fly launch --name studyflow-api --region ams
fly secrets set ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... STRIPE_SECRET_KEY=...
fly deploy
```

### Frontend
```bash
cd studentprep/frontend
fly launch --name studyflow-app --region ams
fly deploy
```

## Documentation

See [PLAN.md](./PLAN.md) for the full architecture plan including:
- Database schema with RLS policies
- API endpoints
- Claude AI prompt strategy
- Key user flows
- Subscription tiers
- Deployment configuration
- Implementation phases
