# StudyFlow — AI-Powered Study Companion

![node](https://img.shields.io/badge/node-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![typescript](https://img.shields.io/badge/typescript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)
![react](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![hono](https://img.shields.io/badge/hono-4.6-E36002?style=flat-square&logo=hono&logoColor=white)
![supabase](https://img.shields.io/badge/supabase-PostgreSQL-3FCF8E?style=flat-square&logo=supabase&logoColor=white)
![claude](https://img.shields.io/badge/AI-Claude-cc785c?style=flat-square&logo=anthropic&logoColor=white)
![pwa](https://img.shields.io/badge/PWA-enabled-5A0FC8?style=flat-square&logo=pwa&logoColor=white)
![deploy](https://img.shields.io/badge/deploy-Fly.io-8B5CF6?style=flat-square&logo=fly.io&logoColor=white)
![status](https://img.shields.io/badge/status-active%20development-2ea44f?style=flat-square)

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
