-- Add multilingual support for questions
-- Stores translations as JSONB: {"nl": "...", "fr": "..."}
-- The original 'question' and 'suggested_answer' columns store the source language.
-- Translations are populated on-demand when the user requests them via the translate API.

ALTER TABLE questions
    ADD COLUMN question_translations JSONB DEFAULT '{}',
    ADD COLUMN answer_translations JSONB DEFAULT '{}';
