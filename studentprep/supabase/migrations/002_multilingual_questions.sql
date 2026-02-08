-- Add multilingual support for questions
-- Stores translations as JSONB: {"nl": "...", "fr": "..."}
-- The original 'question' and 'suggested_answer' columns serve as the English version.

ALTER TABLE questions
    ADD COLUMN question_translations JSONB DEFAULT '{}',
    ADD COLUMN answer_translations JSONB DEFAULT '{}';
