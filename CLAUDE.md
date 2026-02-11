# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**StudyFlow** - AI-powered study companion that transforms course PDFs into structured study materials using Claude AI.

## Monorepo Structure

```
studentprep/
├── backend/     # Hono API server (Node.js + TypeScript)
├── frontend/    # React PWA (Vite + TailwindCSS)
└── supabase/    # Database migrations
```

## Development Commands

```bash
# Install all dependencies
npm run install:all

# Run backend (http://localhost:8080)
npm run dev:backend

# Run frontend (http://localhost:5173)
npm run dev:frontend

# Build everything
npm run build:all

# Type check all projects
npm run typecheck
```

## Tech Stack

- Frontend: React 19 + Vite + TailwindCSS 4
- Backend: Hono + Node.js
- Database: Supabase (PostgreSQL + Auth + Storage)
- AI: Claude API
- Payments: Stripe
- Hosting: Fly.io

## Key Files

- `README.md` - Feature overview, quick start
- `PLAN.md` - Full architecture, API endpoints, database schema
- `SETUP.md` - External services setup (Supabase, Anthropic, Stripe, Fly.io)
