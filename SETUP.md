# StudyFlow — External Services Setup Guide

Follow these steps **in order**. Each service gives you keys/credentials that the next steps may need.

---

## 1. Supabase (database + auth + file storage)

### 1.1 Create project
1. Go to https://supabase.com and sign up / log in
2. Click **"New Project"**
3. Fill in:
   - **Name**: `studyflow`
   - **Database Password**: generate a strong one and **save it** somewhere safe
   - **Region**: `West EU (Ireland)` — closest to Belgium
4. Click **"Create new project"** and wait ~2 minutes

### 1.2 Get your keys
1. Go to **Settings → API** (left sidebar)
2. Copy these values:
   - **Project URL** → this is your `SUPABASE_URL`
   - **anon public** key → this is your `VITE_SUPABASE_ANON_KEY` (safe for frontend)
   - **service_role** key → this is your `SUPABASE_SERVICE_KEY` (**NEVER** expose this in frontend code!)

### 1.3 Run the database migration
1. Go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Copy the entire contents of `supabase/migrations/001_initial.sql` and paste it
4. Click **"Run"**
5. You should see "Success. No rows returned" — this is correct

### 1.4 Enable Google SSO
1. Go to **Authentication → Providers** (left sidebar)
2. Find **Google** and toggle it ON
3. You need a Google OAuth app. To create one:
   a. Go to https://console.cloud.google.com/apis/credentials
   b. Create a new project (or select existing)
   c. Click **"Create Credentials" → "OAuth client ID"**
   d. Application type: **Web application**
   e. Name: `StudyFlow`
   f. **Authorized redirect URIs**: add `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`
      (you'll find this URL in the Supabase Google provider settings page)
   g. Click **Create**
   h. Copy the **Client ID** and **Client Secret**
4. Back in Supabase: paste the Client ID and Client Secret
5. Click **Save**

### 1.5 Configure redirect URLs
1. Go to **Authentication → URL Configuration**
2. Set **Site URL** to: `http://localhost:5173` (for development)
3. Add to **Redirect URLs**:
   - `http://localhost:5173`
   - `https://studyflow-app.fly.dev` (add this when you deploy)

---

## 2. Anthropic (Claude AI)

### 2.1 Get API key
1. Go to https://console.anthropic.com
2. Sign up / log in
3. Go to **API Keys** (left sidebar or settings)
4. Click **"Create Key"**
5. Name: `studyflow`
6. Copy the key — it starts with `sk-ant-api03-...`
7. This is your `ANTHROPIC_API_KEY`

### 2.2 Add credits
1. Go to **Plans & Billing**
2. Add a payment method
3. Add credits (start with $5 — this is enough for extensive testing)

> **Cost estimate**: Summarizing a 100-page PDF costs roughly $0.10–0.30 depending on content density.

---

## 3. Stripe (payments)

### 3.1 Create account
1. Go to https://dashboard.stripe.com and sign up
2. Complete email verification

### 3.2 Get API keys
1. In the Stripe Dashboard, make sure you're in **Test mode** (toggle at top right)
2. Go to **Developers → API Keys**
3. Copy:
   - **Publishable key** (`pk_test_...`) → this is your `VITE_STRIPE_PUBLISHABLE_KEY` (safe for frontend)
   - **Secret key** (`sk_test_...`) → this is your `STRIPE_SECRET_KEY` (**backend only!**)

### 3.3 Create a product (for Pro subscription)
1. Go to **Products → Add product**
2. Fill in:
   - **Name**: `StudyFlow Pro`
   - **Description**: `Unlimited courses, full AI features, highlighted PDFs`
3. Under **Pricing**:
   - **Recurring**
   - Price: `€9.99`
   - Billing period: **Monthly**
4. Click **Save product**
5. Copy the **Price ID** (`price_...`) — you'll need this in the backend code later

### 3.4 Set up webhook (do this after deploying backend)
1. Go to **Developers → Webhooks**
2. Click **"Add endpoint"**
3. Endpoint URL: `https://studyflow-api.fly.dev/api/payments/webhook`
4. Events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Click **"Add endpoint"**
6. Copy the **Signing secret** (`whsec_...`) → this is your `STRIPE_WEBHOOK_SECRET`

---

## 4. Fly.io (hosting)

### 4.1 Install CLI
```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Windows
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

### 4.2 Sign up & log in
```bash
fly auth signup    # or: fly auth login
```

### 4.3 Deploy backend
```bash
cd backend

# Launch app (first time only)
fly launch --name studyflow-api --region ams --no-deploy

# Set secrets (NEVER put these in fly.toml or code!)
fly secrets set \
  ANTHROPIC_API_KEY="sk-ant-api03-..." \
  SUPABASE_URL="https://xxx.supabase.co" \
  SUPABASE_SERVICE_KEY="eyJ..." \
  STRIPE_SECRET_KEY="sk_test_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..." \
  FRONTEND_URL="https://studyflow-app.fly.dev"

# Deploy
fly deploy
```

### 4.4 Deploy frontend
```bash
cd frontend

# Launch app (first time only)
fly launch --name studyflow-app --region ams --no-deploy
```

Now edit `frontend/fly.toml` and fill in the build args with your **public** keys:
```toml
[build.args]
  VITE_SUPABASE_URL = "https://xxx.supabase.co"
  VITE_SUPABASE_ANON_KEY = "eyJ..."
  VITE_API_URL = "https://studyflow-api.fly.dev"
  VITE_STRIPE_PUBLISHABLE_KEY = "pk_test_..."
```

> These are all **public** keys. The anon key is designed to be exposed in frontend code.
> The Supabase service_role key and Stripe secret key are **NEVER** in frontend code.

```bash
fly deploy
```

### 4.5 Update Supabase redirect URLs
After deploying, go back to Supabase:
1. **Authentication → URL Configuration**
2. Change **Site URL** to: `https://studyflow-app.fly.dev`
3. Ensure `https://studyflow-app.fly.dev` is in the **Redirect URLs** list

---

## 5. Local Development

### 5.1 Set up environment files

**Backend:**
```bash
cd backend
cp .env.example .env
# Edit .env and fill in your real values
```

**Frontend:**
```bash
cd frontend
cp .env.example .env
# Edit .env and fill in your real values
```

### 5.2 Install dependencies
```bash
cd backend && npm install
cd ../frontend && npm install
```

### 5.3 Run locally
Open two terminals:

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
# Runs on http://localhost:8080
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# Runs on http://localhost:5173
```

---

## Security Checklist

Before going live, verify:

- [ ] `.env` files are in `.gitignore` (they are)
- [ ] `SUPABASE_SERVICE_KEY` is only in backend `.env` and Fly.io secrets
- [ ] `STRIPE_SECRET_KEY` is only in backend `.env` and Fly.io secrets
- [ ] `ANTHROPIC_API_KEY` is only in backend `.env` and Fly.io secrets
- [ ] Frontend only uses `VITE_SUPABASE_ANON_KEY` (public) and `VITE_STRIPE_PUBLISHABLE_KEY` (public)
- [ ] Row Level Security is enabled on all tables
- [ ] Supabase Storage policies restrict access to user's own files
- [ ] No `.env` file was ever committed to git (check with: `git log --all --diff-filter=A -- '*.env'`)
- [ ] Stripe webhook verifies signature before processing events
