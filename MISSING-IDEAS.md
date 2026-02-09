# Missing Ideas Analysis — PLAN.md vs Implementation

## Summary

The implementation covers Phases 1–3 well but Phase 4 ("PDF & Polish") is almost entirely unfinished. Four planned features are completely absent, and three more are only partially implemented.

---

## Completely Missing (4 features)

### 1. Highlighted PDF Export
- **Plan**: Color-coded PDF output — yellow highlight for main topics (hoofdzaken), green for side topics (bijzaken), bold for key terms
- **Status**: `backend/src/routes/pdf.ts` returns HTTP 501. The `pdf-generator.ts` service was never created. No frontend UI to trigger or download export.

### 2. Wikipedia Topic Deep-links
- **Plan**: `GET /api/chapters/:id/wiki/:topic` endpoint querying Wikipedia API, shown in a sidebar/modal when clicking keywords in chapter summaries
- **Status**: No route, no `wikipedia.ts` service, no clickable topic links in the frontend. Completely absent.

### 3. Stripe Payment Integration
- **Plan**: Three endpoints (checkout session, webhook processing, subscription status) with full Stripe SDK integration
- **Status**: All three routes in `payments.ts` are stubs — checkout returns 501, webhook has a TODO comment and does nothing, status returns hardcoded `{"plan": "free"}`. No `stripe.ts` service exists.

### 4. Settings Page
- **Plan**: `Settings.tsx` page for account management and subscription management
- **Status**: File does not exist. No backend routes for user preferences or account settings.

---

## Partially Implemented (3 features)

### 5. Free vs Pro Subscription Gating
- **Plan**: Detailed tier restrictions — Free tier gets 1 course, basic summaries, 3 exam questions, no study planning/quizzes/PDF export/unlimited Wikipedia. Pro (€9.99/month) unlocks everything.
- **Status**: `subscriptions` database table exists with `plan` column (free/pro), but no code reads from it. No middleware checks tier. No feature gating. All users get full access.

### 6. PWA / Offline Support
- **Plan**: Manifest + service worker + offline support
- **Status**: Only `manifest.json` exists. No service worker registration, no offline caching strategy.

### 7. Exam Question Count (minor)
- **Plan**: 5 exam questions per chapter
- **Status**: Generates 8 exam questions per chapter. Arguably an improvement, but deviates from plan.

---

## Phase Completion Overview

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Foundation (monorepo, DB, auth, deploy) | ✅ Complete |
| Phase 2 | Upload & Summarize (PDF, AI, questions) | ✅ Complete |
| Phase 3 | Study Tools (planning, quizzes, spaced rep) | ~90% (missing Wikipedia) |
| Phase 4 | PDF & Polish (export, Stripe, PWA) | ~10% (manifest only) |

### Phase 4 Breakdown

| Item | Planned | Implemented |
|------|---------|-------------|
| 16. Highlighted PDF generation | Yes | No (501 stub) |
| 17. PDF download flow | Yes | No |
| 18. Stripe checkout + webhooks + gating | Yes | No (stubs only) |
| 19. PWA service worker + offline | Yes | No (manifest only) |
| 20. Mobile UI polish | Yes | Partial |
