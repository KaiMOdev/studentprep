-- StudyFlow initial schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ============================================
-- Tables
-- ============================================

CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    original_filename TEXT,
    storage_path TEXT,
    status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'ready', 'error')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    raw_text TEXT,
    summary_main JSONB,
    summary_side JSONB,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('exam', 'discussion')),
    question TEXT NOT NULL,
    suggested_answer TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE study_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
    exam_date DATE,
    plan JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE study_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    study_plan_id UUID REFERENCES study_plans(id) ON DELETE SET NULL,
    chapters_covered UUID[],
    completed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE quiz_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    session_id UUID REFERENCES study_sessions(id) ON DELETE SET NULL,
    questions JSONB NOT NULL,
    score NUMERIC(5,2),
    includes_review BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'past_due', 'cancelled')),
    plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Courses: users see only their own
CREATE POLICY "users_own_courses" ON courses
    FOR ALL USING (auth.uid() = user_id);

-- Chapters: users see chapters of their own courses
CREATE POLICY "users_own_chapters" ON chapters
    FOR ALL USING (
        course_id IN (SELECT id FROM courses WHERE user_id = auth.uid())
    );

-- Questions: users see questions of their own chapters
CREATE POLICY "users_own_questions" ON questions
    FOR ALL USING (
        chapter_id IN (
            SELECT ch.id FROM chapters ch
            JOIN courses co ON ch.course_id = co.id
            WHERE co.user_id = auth.uid()
        )
    );

-- Study plans, sessions, quiz results, subscriptions: own data only
CREATE POLICY "users_own_plans" ON study_plans
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_sessions" ON study_sessions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_quizzes" ON quiz_results
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_subs" ON subscriptions
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- Storage bucket for course PDFs
-- ============================================
-- Run this separately in SQL Editor:

INSERT INTO storage.buckets (id, name, public)
VALUES ('course-pdfs', 'course-pdfs', false);

-- Only authenticated users can upload to their own folder
CREATE POLICY "users_upload_own_pdfs" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'course-pdfs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can read their own files
CREATE POLICY "users_read_own_pdfs" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'course-pdfs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can delete their own files
CREATE POLICY "users_delete_own_pdfs" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'course-pdfs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
