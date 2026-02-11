# CLAUDE.md - Frontend

This file provides guidance to Claude Code when working with the frontend.

## Development

```bash
# Run dev server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type check
npm run typecheck

# Run tests
npm test              # Run once
npm run test:watch    # Watch mode
```

## Architecture

**Entry:** `src/main.tsx` → `src/App.tsx`

**Pages:**
- `Landing.tsx` - Marketing/login
- `Dashboard.tsx` - Course overview
- `Course.tsx` - Chapter summaries, questions
- `StudyPlan.tsx` - Study schedule
- `Quiz.tsx` - Mini exams
- `AdminSettings.tsx` - Admin dashboard

**Library (`lib/`):**
- `supabase.ts` - Supabase client (auth, DB, storage)
- `api.ts` - Backend API calls
- `stripe.ts` - Checkout integration

**Hooks (`hooks/`):**
- `useAuth.ts` - Supabase authentication
- `useCourse.ts` - Course data management

## Testing

- Framework: Vitest + React Testing Library + jsdom
- Test files: `*.test.tsx` (colocated with components)
- Examples: `App.test.tsx`, `pages/Course.test.tsx`
- Run single test: `npm test -- src/pages/Course.test.tsx`

## Environment Variables

```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...          # Public anon key (safe)
VITE_API_URL=http://localhost:8080
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Security:** Only use public keys (`VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`). Never use service role keys in frontend.

## Key Patterns

### Authentication

```typescript
import { supabase } from './lib/supabase'

// SSO login
await supabase.auth.signInWithOAuth({ provider: 'google' })

// Email signup
await supabase.auth.signUp({ email, password })

// Logout
await supabase.auth.signOut()
```

### API Calls

All backend calls include Supabase JWT token in Authorization header. See `lib/api.ts` for examples.

### Styling

- TailwindCSS 4 (configured in `tailwind.config.ts`)
- Custom styles in `src/index.css`
- Mobile-first design

## Build Output

- Production build: `dist/`
- Served by nginx in Docker container (see `Dockerfile`)
